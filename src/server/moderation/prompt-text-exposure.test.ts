import { describe, expect, it } from "vitest";

import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createServerObservability } from "@/server/observability.server";
import { demoSeed } from "@/server/seed-data";

import { createDeterministicLessonDraftProvider } from "../generation/provider";
import { createGenerationService } from "../generation/service";
import { createSeededPersistence } from "../persistence/seeded";

import { createDefaultContentSafety } from "./content-safety";

/**
A canary that is not personal data. If any log, diagnostic, or public payload echoes prompt text, this token appears there.
*/
const CANARY = "CANARY132TOKEN9F3C";

const CANARY_EMAIL = "canary132@example.test";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const buildService = () => {
  const persistence = createSeededPersistence();
  const provider = createDeterministicLessonDraftProvider();
  const service = createGenerationService({
    persistence,
    provider,
    safety: createDefaultContentSafety(),
  });
  return { service, provider };
};

const generateBlocked = async () => {
  const { service, provider } = buildService();
  const { record, publicResult } = await service.generate({
    actor: teacherActor,
    input: {
      prompt: `Grade 4 equivalent fractions for ${CANARY}. My student Amara needs practice. Contact ${CANARY_EMAIL}.`,
      grade: 4,
      standardId: demoSeed.standard.id,
      language: "en",
      difficulty: "on-level",
      idempotencyKey: "canary-132-key",
    },
  });
  return { record, publicResult, provider };
};

describe("prompt text exposure", () => {
  it("blocks the canary prompt before any provider call", async () => {
    const { record, provider } = await generateBlocked();

    expect(record.state).toBe("blocked-by-moderation");
    expect(provider.calls).toBe(0);
  });

  it("never compiles a preview for a blocked request", async () => {
    const { record } = await generateBlocked();

    expect(record.draft).toBeNull();
  });

  it("keeps the canary out of every persisted diagnostic", async () => {
    const { record } = await generateBlocked();
    const diagnostics = JSON.stringify([
      record.diagnostics,
      record.attempts.map((attempt) => attempt.diagnostics),
    ]);

    expect(diagnostics).not.toContain(CANARY);
    expect(diagnostics).not.toContain(CANARY_EMAIL);
    expect(diagnostics).not.toContain("Amara");
  });

  it("keeps the canary out of the public result payload", async () => {
    const { publicResult } = await generateBlocked();
    const payload = JSON.stringify(publicResult);

    expect(payload).not.toContain(CANARY);
    expect(payload).not.toContain(CANARY_EMAIL);
    expect(payload).not.toContain("Amara");
  });

  it("names the moderation category in the public diagnostic", async () => {
    const { publicResult } = await generateBlocked();
    const finding = publicResult.diagnostics.at(0);

    expect(finding?.moderationCategory).toBe("personal-data");
    expect(finding?.code).toBe("MODERATION_BLOCKED");
  });

  /**
  Deliberate product behavior, recorded so it cannot change silently: the
  teacher's own prompt stays in their own request row so the revise flow can
  show it (#119). Retention of a blocked prompt is a #101 governance question.
  */
  it("retains the teacher's own prompt in the request row", async () => {
    const { record } = await generateBlocked();

    expect(record.input.prompt).toContain(CANARY);
  });

  it("scrubs personal data if a prompt ever reaches an error message", () => {
    const events: unknown[] = [];
    const observability = createServerObservability({
      env: { APP_ENV: "production", NODE_ENV: "production" },
      logger: (event) => {
        events.push(event);
      },
      sentry: null,
    });

    observability.captureError(
      new Error(`Provider call failed for ${CANARY_EMAIL}`),
      {
        operation: "generation",
        prompt: `Contact ${CANARY_EMAIL}`,
        route: "/api/lessons/generate",
      }
    );

    const serialized = JSON.stringify(events);

    expect(serialized).not.toContain(CANARY_EMAIL);
    expect(serialized).toContain("[REDACTED_EMAIL]");

    const event = events.at(0) as { context: Record<string, unknown> };

    expect(event.context["prompt"]).toBe("[REDACTED]");
  });
});
