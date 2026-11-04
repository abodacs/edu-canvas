import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";

import { parseActorId, parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { syntheticSeed } from "@/server/seed-data";
import { createMetaAdvisoryReviewAgent } from "./advisory-review-agent";
import {
  AdvisoryReviewError,
  createAdvisoryReviewService,
} from "./advisory-review";
import { createDeterministicLessonDraftProvider } from "./provider";
import { createGenerationService } from "./service";

import type { AdvisoryReviewAgent } from "./advisory-review-contract";
import type { GenerationPersistence, LessonGenerationRecord } from "./types";
import type {
  SemanticAgentRecommendation,
  SemanticValidationInput,
} from "./semantic-validation-contract";
import type { TeacherActor } from "@/server/identity/types";

const tenantId = syntheticSeed.tenant.id;

const teacher = syntheticTeacherActor({ tenantId: parseTenantId(tenantId) });

const otherTeacher: TeacherActor = syntheticTeacherActor({
  actorId: parseActorId("actor_other_teacher"),
  tenantId: parseTenantId(tenantId),
});

interface ReadyFixture {
  persistence: GenerationPersistence;
  record: LessonGenerationRecord;
}

/**
A real `ready-for-review` record from the deterministic drafting path, so the
advisory service meets the stored shape the route meets.
*/
const createReadyFixture = async (): Promise<ReadyFixture> => {
  const persistence = createSeededPersistence();
  const service = createGenerationService({
    limits: createSeededGenerationLimitStore(),
    persistence,
    provider: createDeterministicLessonDraftProvider("valid"),
    requestIdFactory: () => "draft_req_advisory_review",
  });
  const { record } = await service.generate({
    actor: teacher,
    input: {
      prompt: "Equivalent fractions matching practice",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "advisory-review-fixture",
    },
  });

  if (record.state !== "ready-for-review") {
    throw new Error(
      `The fixture draft must be ready-for-review, not ${record.state}.`
    );
  }

  return { persistence, record };
};

const fakeAgent = (
  recommendations:
    | readonly SemanticAgentRecommendation[]
    | ((signal: AbortSignal) => Promise<readonly SemanticAgentRecommendation[]>)
): AdvisoryReviewAgent & { calls: number; answerPairsSeen: number } => {
  const agent = {
    provider: "fake",
    model: "fake-advisory-model",
    version: "advisory-reviewer-test-v1",
    calls: 0,
    answerPairsSeen: -1,
    async review(input: SemanticValidationInput, signal: AbortSignal) {
      agent.calls += 1;
      agent.answerPairsSeen = input.draft.variants.reduce(
        (count, variant) => count + variant.relationships.length,
        0
      );
      return typeof recommendations === "function"
        ? await recommendations(signal)
        : recommendations;
    },
  };
  return agent;
};

const warning = (
  overrides: Partial<SemanticAgentRecommendation> = {}
): SemanticAgentRecommendation => {
  return {
    verdict: "warning",
    code: "AGENT_RECOMMENDATION",
    field: "title",
    reason: "The title may be hard to read at a glance.",
    ...overrides,
  };
};

const serviceFor = (
  fixture: ReadyFixture,
  agent: AdvisoryReviewAgent,
  options: Partial<{
    timeoutMs: number;
    now: () => string;
    hasContext: boolean;
    persistence: GenerationPersistence;
  }> = {}
) => {
  return createAdvisoryReviewService({
    generation: options.persistence ?? fixture.persistence,
    agent,
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
    ...(options.now && { now: options.now }),
    curriculumContext: options.hasContext === false ? () => {} : undefined,
  });
};

const snapshotOf = (record: LessonGenerationRecord) => {
  return {
    state: record.state,
    diagnostics: record.diagnostics,
    draft: record.draft,
    gate: record.gate,
  };
};

describe("advisory review: warning-only result", () => {
  it("appends warnings without changing state, diagnostics, draft, or gate", async () => {
    const fixture = await createReadyFixture();
    const before = snapshotOf(fixture.record);
    const agent = fakeAgent([
      warning({ variantId: "variant-standard" }),
      { ...warning(), verdict: "pass", reason: "Nothing to change." },
      {
        ...warning(),
        verdict: "hard_block",
        reason: "This should be a block.",
      },
    ]);

    const outcome = await serviceFor(fixture, agent, {
      now: () => "2026-11-04T10:00:00.000Z",
    }).review(teacher, fixture.record.requestId);

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") {
      throw new Error("expected a complete review");
    }

    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );

    expect(stored?.advisoryReview).toStrictEqual(outcome.review);
    expect({
      advisory: stored?.advisoryReview,
      snapshot: stored && snapshotOf(stored),
      answerPairsSeen: agent.answerPairsSeen,
    }).toStrictEqual({
      advisory: {
        schemaVersion: "advisory-review-v1",
        agent: {
          provider: "fake",
          model: "fake-advisory-model",
          validatorVersion: "advisory-reviewer-test-v1",
        },
        reviewedAt: "2026-11-04T10:00:00.000Z",
        latencyMs: expect.any(Number) as unknown as number,
        findings: [
          {
            code: "AGENT_RECOMMENDATION",
            field: "title",
            reason: "The title may be hard to read at a glance.",
            variantId: "variant-standard",
          },
          {
            code: "AGENT_RECOMMENDATION",
            field: "title",
            reason: "This should be a block.",
          },
        ],
      },
      snapshot: before,
      // The reviewer never sees the private answer pairs.
      answerPairsSeen: 0,
    });
  });

  it("stores a complete review with no findings when the agent passes", async () => {
    const fixture = await createReadyFixture();
    const before = snapshotOf(fixture.record);

    const outcome = await serviceFor(fixture, fakeAgent([])).review(
      teacher,
      fixture.record.requestId
    );

    expect(outcome).toMatchObject({
      status: "complete",
      review: { findings: [] },
    });
    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );
    expect(stored && snapshotOf(stored)).toStrictEqual(before);
  });

  it("replaces unsafe agent text and drops an unsafe variant id", async () => {
    const fixture = await createReadyFixture();
    const outcome = await serviceFor(
      fixture,
      fakeAgent([
        warning({
          reason: "The answer key is 2/3 for the student.",
          variantId: "student_variant",
        }),
      ])
    ).review(teacher, fixture.record.requestId);

    expect(outcome).toStrictEqual({
      status: "complete",
      review: {
        schemaVersion: "advisory-review-v1",
        agent: {
          provider: "fake",
          model: "fake-advisory-model",
          validatorVersion: "advisory-reviewer-test-v1",
        },
        reviewedAt: expect.any(String) as unknown as string,
        latencyMs: expect.any(Number) as unknown as number,
        findings: [
          {
            code: "AGENT_RECOMMENDATION",
            field: "title",
            reason: "A validator recommendation needs teacher review.",
          },
        ],
      },
    });
  });
});

describe("advisory review: failure leaves the record untouched", () => {
  it("times out inside one bound and writes nothing", async () => {
    const fixture = await createReadyFixture();
    const before = snapshotOf(fixture.record);
    // The agent would answer long after the service's own bound.
    const agent = fakeAgent(async () => {
      await delay(200);
      return [];
    });

    const outcome = await serviceFor(fixture, agent, {
      timeoutMs: 20,
    }).review(teacher, fixture.record.requestId);

    expect(outcome).toStrictEqual({
      status: "failed",
      failure: {
        class: "timeout",
        message: "The advisory review timed out. The draft is unchanged.",
      },
    });
    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );
    expect(stored && snapshotOf(stored)).toStrictEqual(before);
    expect(stored?.advisoryReview).toBeUndefined();
  });

  it("reports an agent failure and writes nothing", async () => {
    const fixture = await createReadyFixture();
    const before = snapshotOf(fixture.record);
    const agent = fakeAgent(() => {
      return Promise.reject(new Error("provider rejected the request"));
    });

    const outcome = await serviceFor(fixture, agent).review(
      teacher,
      fixture.record.requestId
    );

    expect(outcome).toStrictEqual({
      status: "failed",
      failure: {
        class: "agent-failure",
        message:
          "The advisory review could not complete. The draft is unchanged.",
      },
    });
    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );
    expect(stored && snapshotOf(stored)).toStrictEqual(before);
  });

  it("refuses to store a result for a draft that changed underneath it", async () => {
    const fixture = await createReadyFixture();
    const stalePersistence: GenerationPersistence = {
      ...fixture.persistence,
      writeAdvisoryReview: () => Promise.resolve(false),
    };

    await expect(
      serviceFor(fixture, fakeAgent([warning()]), {
        persistence: stalePersistence,
      }).review(teacher, fixture.record.requestId)
    ).rejects.toMatchObject({
      code: "ADVISORY_REVIEW_STALE",
      status: 409,
    });

    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );
    expect(stored?.advisoryReview).toBeUndefined();
  });
});

describe("advisory review: ownership and readiness refusals", () => {
  it("refuses a non-owner before any work and names no other draft", async () => {
    const fixture = await createReadyFixture();
    const agent = fakeAgent([warning()]);

    await expect(
      serviceFor(fixture, agent).review(otherTeacher, fixture.record.requestId)
    ).rejects.toMatchObject({
      code: "ADVISORY_REVIEW_FORBIDDEN",
      status: 403,
      message: "You do not have access to this resource.",
    });
    expect(agent.calls).toBe(0);
  });

  it("refuses an unknown draft id with the same typed refusal", async () => {
    const fixture = await createReadyFixture();

    await expect(
      serviceFor(fixture, fakeAgent([warning()])).review(
        teacher,
        "draft_does_not_exist"
      )
    ).rejects.toBeInstanceOf(AdvisoryReviewError);
  });

  it("refuses a record that is not ready-for-review", async () => {
    const fixture = await createReadyFixture();
    const blocked: LessonGenerationRecord = {
      ...fixture.record,
      state: "blocked-by-validation",
    };
    const persistence: GenerationPersistence = {
      ...fixture.persistence,
      readGeneration: () => Promise.resolve(blocked),
    };
    const agent = fakeAgent([warning()]);

    await expect(
      serviceFor(fixture, agent, { persistence }).review(
        teacher,
        fixture.record.requestId
      )
    ).rejects.toMatchObject({
      code: "ADVISORY_REVIEW_NOT_READY",
      status: 409,
    });
    expect(agent.calls).toBe(0);
  });

  it("refuses a draft with no approved standards pack", async () => {
    const fixture = await createReadyFixture();
    const agent = fakeAgent([warning()]);

    await expect(
      serviceFor(fixture, agent, { hasContext: false }).review(
        teacher,
        fixture.record.requestId
      )
    ).rejects.toMatchObject({
      code: "ADVISORY_REVIEW_NOT_READY",
      status: 409,
    });
    expect(agent.calls).toBe(0);
  });
});

describe("advisory review: read", () => {
  it("returns the stored review to its owner and null before a run", async () => {
    const fixture = await createReadyFixture();
    const service = serviceFor(fixture, fakeAgent([warning()]));

    await expect(
      service.read(teacher, fixture.record.requestId)
    ).resolves.toStrictEqual({ review: null });

    await service.review(teacher, fixture.record.requestId);

    const read = await service.read(teacher, fixture.record.requestId);
    expect(read.review?.findings).toHaveLength(1);
  });

  it("refuses a non-owner read", async () => {
    const fixture = await createReadyFixture();

    await expect(
      serviceFor(fixture, fakeAgent([warning()])).read(
        otherTeacher,
        fixture.record.requestId
      )
    ).rejects.toMatchObject({ code: "ADVISORY_REVIEW_FORBIDDEN" });
  });
});

describe("advisory review: the Meta adapter", () => {
  it("downgrades a provider `hard_block` and keeps the result warning-only", async () => {
    const fixture = await createReadyFixture();
    const bodies: unknown[] = [];
    const agent = createMetaAdvisoryReviewAgent({
      apiKey: "test-key-not-a-credential",
      model: "test-model",
      version: "advisory-reviewer-test-v1",
      timeoutMs: 5000,
      fetchImplementation: (url, init) => {
        expect(url).toBe("https://api.meta.ai/v1/responses");
        bodies.push(JSON.parse(String(init.body)) as unknown);
        return Promise.resolve(
          Response.json({
            output_text: JSON.stringify({
              recommendations: [
                {
                  verdict: "hard_block",
                  field: "title",
                  reason: "The screens repeat one interaction.",
                },
              ],
            }),
          })
        );
      },
    });

    const outcome = await serviceFor(fixture, agent).review(
      teacher,
      fixture.record.requestId
    );

    expect(outcome).toMatchObject({
      status: "complete",
      review: {
        agent: { provider: "meta", model: "test-model" },
        findings: [
          {
            code: "AGENT_RECOMMENDATION",
            field: "title",
            reason: "The screens repeat one interaction.",
          },
        ],
      },
    });
    expect(bodies).toHaveLength(1);
    expect(JSON.stringify(bodies[0])).not.toContain("answer_key");
    expect(JSON.stringify(bodies[0])).not.toContain(
      "test-key-not-a-credential"
    );
  });

  it("reports malformed provider content as an agent failure", async () => {
    const fixture = await createReadyFixture();
    const before = snapshotOf(fixture.record);
    const agent = createMetaAdvisoryReviewAgent({
      apiKey: "test-key-not-a-credential",
      model: "test-model",
      version: "advisory-reviewer-test-v1",
      timeoutMs: 5000,
      fetchImplementation: () =>
        Promise.resolve(Response.json({ output_text: "not json" })),
    });

    const outcome = await serviceFor(fixture, agent).review(
      teacher,
      fixture.record.requestId
    );

    expect(outcome).toStrictEqual({
      status: "failed",
      failure: {
        class: "agent-failure",
        message:
          "The advisory review could not complete. The draft is unchanged.",
      },
    });
    const stored = await fixture.persistence.readGeneration(
      tenantId,
      fixture.record.requestId
    );
    expect(stored && snapshotOf(stored)).toStrictEqual(before);
  });
});
