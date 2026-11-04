import { describe, expect, it } from "vitest";

import { createSeededStandardGroundingPersistence } from "../../persistence/standard-grounding-seeded";
import { createLearningCommonsAdapter } from "./learning-commons-rest";
import { createStandardGroundingService } from "./standard-grounding-service";
import { StandardGroundingError } from "./types";
import { createRecordedLearningCommonsTransport } from "./fixtures/learning-commons-replay";

import type { LearningCommonsTransport } from "./learning-commons-rest";

const TENANT = "tenant_issue_218";
const OTHER_TENANT = "tenant_issue_218_other";

const createService = (
  transport: LearningCommonsTransport = createRecordedLearningCommonsTransport(),
  options: { deadlineMs?: number } = {}
) => {
  let clock = Date.parse("2026-11-04T12:00:00.000Z");
  let sequence = 0;
  return createStandardGroundingService({
    persistence: createSeededStandardGroundingPersistence(),
    adapter: createLearningCommonsAdapter({
      transport,
      now: () => new Date(clock).toISOString(),
    }),
    now: () => {
      clock += 1000;
      return new Date(clock).toISOString();
    },
    createGroundingId: () => {
      sequence += 1;
      return `grounding_test_${sequence}`;
    },
    ...options,
  });
};

const command = (overrides: Record<string, unknown> = {}) => {
  return {
    tenantId: TENANT,
    jurisdiction: "Multi-State",
    statementCode: "4.NF.A.1",
    requestKey: "request-1",
    ...overrides,
  };
};

describe("standard grounding service (issue 218)", () => {
  it("persists one immutable record with provenance and hashes", async () => {
    const service = createService();
    const record = await service.resolve(command());

    expect(record).toMatchObject({
      tenantId: TENANT,
      requestKey: "request-1",
      registryVersion: "pilot-registry-v2",
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
      standardId: "6b9c09e2-d7cc-11e8-824f-0242ac160002",
      prerequisiteResolution: "direct",
      gaps: [],
      provenance: { sourceLink: "https://www.learningcommons.org/" },
    });
    expect(record.components).toHaveLength(5);
    expect(record.prerequisites).toHaveLength(2);
    expect({
      contentHash: record.contentHash,
      inputHash: record.inputHash,
    }).toStrictEqual({
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it("appends a re-retrieval and links it to its predecessor without mutating the old row", async () => {
    const service = createService();
    const first = await service.resolve(command());
    const second = await service.resolve(command({ requestKey: "request-2" }));

    expect(second.id).not.toBe(first.id);
    expect(second.predecessorGroundingId).toBe(first.id);
    expect(second.retrievalAttempt).toBe(1);

    const history = await service.history(TENANT, {
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });
    expect(history.map((record) => record.id)).toStrictEqual([
      second.id,
      first.id,
    ]);
    expect(history[1]).toStrictEqual(first);
  });

  it("keeps tenant scope on read and history", async () => {
    const service = createService();
    const record = await service.resolve(command());

    await expect(
      service.read(OTHER_TENANT, record.id)
    ).resolves.toBeUndefined();
    await expect(
      service.history(OTHER_TENANT, {
        jurisdiction: "Multi-State",
        statementCode: "4.NF.A.1",
      })
    ).resolves.toStrictEqual([]);
  });

  it("treats a duplicate request key as the same retrieval", async () => {
    const service = createService();
    const first = await service.resolve(command());
    const duplicate = await service.resolve(command());

    expect(duplicate).toStrictEqual(first);
    const history = await service.history(TENANT, {
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });
    expect(history).toHaveLength(1);
  });

  it("rejects a request key reused for a different standard", async () => {
    const service = createService();
    await service.resolve(command());

    await expect(
      service.resolve(
        command({
          statementCode: "4.NF.A.2",
        })
      )
    ).rejects.toMatchObject({
      code: "idempotency-key-reused",
      retryable: false,
      recovery: "correct-request",
    });
  });

  it("retries a retryable provider failure once and records two attempts", async () => {
    const recorded = createRecordedLearningCommonsTransport();
    let frameworkAttempts = 0;
    const flakyTransport: LearningCommonsTransport = {
      ...recorded,
      findFrameworks: (input, context) => {
        frameworkAttempts += 1;
        if (frameworkAttempts === 1) {
          return Promise.reject(new Error("connection reset"));
        }
        return recorded.findFrameworks(input, context);
      },
    };
    const service = createService(flakyTransport);

    const record = await service.resolve(command());

    expect(frameworkAttempts).toBe(2);
    expect(record.retrievalAttempt).toBe(2);
  });

  it("stops at two attempts and surfaces the final provider failure", async () => {
    let frameworkAttempts = 0;
    const failingTransport: LearningCommonsTransport = {
      findFrameworks: () => {
        frameworkAttempts += 1;
        return Promise.reject(new Error("provider down"));
      },
      findStandardsPage: () => Promise.race([]),
      findComponentsPage: () => Promise.race([]),
      findPrerequisitesPage: () => Promise.race([]),
      findCrosswalks: () => Promise.race([]),
    };
    const service = createService(failingTransport);

    await expect(service.resolve(command())).rejects.toMatchObject({
      code: "provider-unavailable",
      retryable: true,
    });
    expect(frameworkAttempts).toBe(2);
  });

  it("persists the final gap from the retry instead of hiding it", async () => {
    const recorded = createRecordedLearningCommonsTransport();
    let frameworkAttempts = 0;
    const flakyTransport: LearningCommonsTransport = {
      ...recorded,
      findFrameworks: () => {
        frameworkAttempts += 1;
        if (frameworkAttempts === 1) {
          return Promise.reject(new Error("connection reset"));
        }
        return Promise.resolve({
          status: 200,
          body: {
            data: [],
            pagination: { hasMore: false, nextCursor: null },
          },
        });
      },
    };
    const service = createService(flakyTransport);

    const record = await service.resolve(command());

    expect(record.retrievalAttempt).toBe(2);
    expect(record.gaps.map((gap) => gap.code)).toStrictEqual([
      "standard-absent",
    ]);
  });

  it("bounds the whole pipeline with the ten-second deadline", async () => {
    const hangingTransport: LearningCommonsTransport = {
      findFrameworks: () => Promise.race([]),
      findStandardsPage: () => Promise.race([]),
      findComponentsPage: () => Promise.race([]),
      findPrerequisitesPage: () => Promise.race([]),
      findCrosswalks: () => Promise.race([]),
    };
    const service = createService(hangingTransport, { deadlineMs: 10 });

    await expect(service.resolve(command())).rejects.toMatchObject({
      code: "resolution-timeout",
      retryable: true,
      recovery: "retry",
    });
  });

  it("keeps a malformed request on the same actionable error contract", async () => {
    const service = createService();

    await expect(
      service.resolve(command({ tenantId: "" }))
    ).rejects.toMatchObject({
      code: "invalid-request",
      retryable: false,
      recovery: "correct-request",
    });
  });

  it("maps a provider server failure to a retryable provider-unavailable error", async () => {
    const failingTransport: LearningCommonsTransport = {
      findFrameworks: () => Promise.resolve({ status: 503, body: null }),
      findStandardsPage: () => Promise.resolve({ status: 503, body: null }),
      findComponentsPage: () => Promise.resolve({ status: 503, body: null }),
      findPrerequisitesPage: () => Promise.resolve({ status: 503, body: null }),
      findCrosswalks: () => Promise.resolve({ status: 503, body: null }),
    };
    const service = createService(failingTransport);

    const failure = service.resolve(command());
    await expect(failure).rejects.toBeInstanceOf(StandardGroundingError);
    await expect(failure).rejects.toMatchObject({
      code: "provider-unavailable",
      retryable: true,
      recovery: "retry",
    });
  });

  it("persists an unsupported envelope with the fixed gap vocabulary", async () => {
    const service = createService();
    const record = await service.resolve(
      command({
        jurisdiction: "Atlantis",
        requestKey: "request-atlantis",
      })
    );

    expect(record.standardId).toBeNull();
    expect(record.gaps.map((gap) => gap.code)).toStrictEqual([
      "unsupported-envelope",
    ]);
    expect(record.components).toStrictEqual([]);
    expect(record.prerequisites).toStrictEqual([]);
  });

  it("exports the ten-second default deadline", async () => {
    const { DEFAULT_RESOLUTION_DEADLINE_MS } = await import("./types");
    expect(DEFAULT_RESOLUTION_DEADLINE_MS).toBe(10_000);
  });
});
