import { afterEach, describe, expect, it, vi } from "vitest";

import { demoSeed } from "@/server/seed-data";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";

import { createSeededPersistence } from "../persistence/seeded";
import {
  allowedSafetyResult,
  blockedSafetyResult,
} from "../moderation/content-safety";
import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
  LessonProviderError,
} from "./provider";
import { createGenerationService, normalizeGenerationInput } from "./service";
import { GenerationRequestError } from "./generation-request-error";
import {
  createGenerationRequestHash,
  generationClaimLeaseMs,
  generationDuplicateWaitMs,
  generationPerCallBudgetMs,
  generationTotalBudgetMs,
} from "./types";
import type {
  LessonDraftProvider,
  NormalizedGenerationRequest,
  ProviderGenerationContext,
  ProviderResponse,
} from "./provider";
import type { GenerationServiceResult, LessonGenerationRecord } from "./types";

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(demoSeed.tenant.id),
});

const baseInput = (overrides: Record<string, unknown> = {}) => {
  return {
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: demoSeed.standard.id,
    language: "en" as const,
    difficulty: "on-level" as const,
    idempotencyKey: "conformance-request-1",
    ...overrides,
  };
};

const recordInput = (): NormalizedGenerationRequest => {
  return {
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: demoSeed.standard.id,
    language: "en",
    difficulty: "on-level",
  };
};

const teacherCommand = (overrides: Record<string, unknown> = {}) => {
  return {
    actor: teacherActor,
    input: baseInput(overrides),
  };
};

const invalidDraft = (request: NormalizedGenerationRequest): unknown => {
  const draft = createEquivalentFractionsDraft(request);
  draft.variants[0].relationships[0].targetId = "missing-target";
  return draft;
};

interface ControlledCall {
  request: NormalizedGenerationRequest;
  context: ProviderGenerationContext;
  signal?: AbortSignal;
  resolve: (response: ProviderResponse) => void;
  reject: (error: unknown) => void;
}

const createControlledProvider = (
  behavior: "ignore-abort" | "respect-abort" = "ignore-abort"
): LessonDraftProvider & { readonly calls: ControlledCall[] } => {
  const calls: ControlledCall[] = [];

  return {
    provenance: {
      provider: "controlled-fixture",
      model: "controlled-fixture-v1",
      promptTemplateVersion: "lesson-prompt-v1",
      validatorVersion: "lesson-validator-v2",
    },
    calls,
    generate: (request, context, options) => {
      const deferred = Promise.withResolvers<ProviderResponse>();
      calls.push({
        request,
        context,
        signal: options?.signal,
        resolve: deferred.resolve,
        reject: deferred.reject,
      });
      if (behavior === "respect-abort") {
        options?.signal?.addEventListener(
          "abort",
          () => {
            deferred.reject(
              new LessonProviderError(
                "timeout",
                "The lesson provider timed out. Try again."
              )
            );
          },
          { once: true }
        );
      }
      return deferred.promise;
    },
  };
};

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

const expectRetryableFailure = (
  result: GenerationServiceResult,
  code: string
): void => {
  expect(result.record.state).toBe("failed-retryable");
  expect(result.record.draft).toBeNull();
  expect(result.record.diagnostics).toContainEqual(
    expect.objectContaining({ code })
  );
};

const expectCancelledRecord = (record: LessonGenerationRecord): void => {
  expect(record.state).toBe("failed-retryable");
  expect(record.draft).toBeNull();
  expect(record.diagnostics).toContainEqual(
    expect.objectContaining({ code: "GENERATION_CANCELLED" })
  );
};

const expectWriteRejected = async (
  persistence: ReturnType<typeof createSeededPersistence>,
  record: LessonGenerationRecord,
  expected: Parameters<typeof persistence.saveGeneration>[1]
): Promise<void> => {
  await expect(
    persistence.saveGeneration(record, expected)
  ).resolves.toBeFalsy();
};

const expectStoredRecord = async (
  persistence: ReturnType<typeof createSeededPersistence>,
  record: LessonGenerationRecord,
  expected: LessonGenerationRecord | undefined
): Promise<void> => {
  await expect(
    persistence.readGeneration(record.tenantId, record.requestId)
  ).resolves.toStrictEqual(expected);
};

describe("generation service conformance: idempotency and ownership", () => {
  it("reuses one operation and one provider call for identical concurrent requests and replay", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_duplicate",
    });

    const [first, second] = await Promise.all([
      service.generate(teacherCommand()),
      service.generate(teacherCommand()),
    ]);
    const replay = await service.generate(teacherCommand());

    expect(provider.calls).toBe(1);
    expect(second.record.requestId).toBe(first.record.requestId);
    expect(replay.record.requestId).toBe(first.record.requestId);
    expect(replay.record.attempts).toHaveLength(1);
  });

  it("counts at most two calls across concurrent correction requests", async () => {
    const provider =
      createDeterministicLessonDraftProvider("invalid-then-valid");
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_correction_duplicate",
      semanticValidation: () => {
        return Promise.resolve({
          status: "complete",
          verdict: "pass",
          recovery: null,
          reviews: [],
          findings: [],
          retry: { available: false, message: "No retry needed." },
        });
      },
    });

    const [first, second] = await Promise.all([
      service.generate(teacherCommand()),
      service.generate(teacherCommand()),
    ]);

    expect(first.record.state).toBe("ready-for-review");
    expect(second.record.requestId).toBe(first.record.requestId);
    expect(provider.calls).toBe(2);
    expect(first.record.attempts).toHaveLength(1);
  });

  it("rejects changed input under the same key after completion without a call or mutation", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const persistence = createSeededPersistence();
    const service = createGenerationService({
      persistence,
      provider,
      requestIdFactory: () => "draft_req_conformance_conflict_done",
    });

    const first = await service.generate(teacherCommand());
    const storedBefore = await persistence.readGeneration(
      first.record.tenantId,
      first.record.requestId
    );

    await expect(
      service.generate(teacherCommand({ prompt: "a different lesson request" }))
    ).rejects.toMatchObject({
      name: "GenerationRequestError",
      code: "IDEMPOTENCY_CONFLICT",
    });

    expect(provider.calls).toBe(1);
    await expect(
      persistence.readGeneration(first.record.tenantId, first.record.requestId)
    ).resolves.toStrictEqual(storedBefore);
  });

  it("rejects changed input under the same key while the first request is in flight", async () => {
    const provider = createControlledProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_conflict_inflight",
    });

    const pending = service.generate(teacherCommand());
    await vi.waitFor(() => {
      expect(provider.calls).toHaveLength(1);
    });

    await expect(
      service.generate(teacherCommand({ prompt: "a different lesson request" }))
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(provider.calls).toHaveLength(1);

    provider.calls[0].resolve({
      draft: createEquivalentFractionsDraft(provider.calls[0].request),
    });

    await expect(pending).resolves.toMatchObject({
      record: { state: "ready-for-review" },
    });
  });

  it("hashes the normalized request canonically", () => {
    const left = normalizeGenerationInput(baseInput());
    const right = normalizeGenerationInput({
      difficulty: "on-level",
      language: "en",
      standardId: demoSeed.standard.id,
      grade: 4,
      prompt: "equivalent fractions for grade 4",
      idempotencyKey: "a-different-key",
    });
    const changed = normalizeGenerationInput(
      baseInput({ prompt: "a different lesson request" })
    );

    expect(left.requestHash).toBe(right.requestHash);
    expect(changed.requestHash).not.toBe(left.requestHash);
  });

  it("rejects a stale owner write before and after a replacement claim", async () => {
    const persistence = createSeededPersistence();
    const { provenance } = createDeterministicLessonDraftProvider();
    const claimed: LessonGenerationRecord = {
      requestId: "draft_req_conformance_owner",
      tenantId: demoSeed.tenant.id,
      teacherId: teacherActor.actorId,
      input: {
        prompt: "equivalent fractions for grade 4",
        grade: 4,
        standardId: demoSeed.standard.id,
        language: "en",
        difficulty: "on-level",
      },
      state: "generating",
      attempt: 1,
      diagnostics: [],
      provenance,
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: "owner-attempt-1",
          requestHash: createGenerationRequestHash({
            prompt: "equivalent fractions for grade 4",
            grade: 4,
            standardId: demoSeed.standard.id,
            language: "en",
            difficulty: "on-level",
          }),
          state: "generating",
          correctionAttempted: false,
          diagnostics: [],
          provenance,
          createdAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };

    await expect(persistence.claimGeneration(claimed)).resolves.toMatchObject({
      claimed: true,
    });

    const replaced = await persistence.expireGenerationClaim(
      claimed.tenantId,
      claimed.requestId,
      claimed.updatedAt,
      "2026-07-18T00:01:00.000Z"
    );

    expect(replaced?.state).toBe("failed-retryable");

    if (!replaced) {
      throw new Error("Expected the claim to expire before replacement.");
    }

    const retryRecord: LessonGenerationRecord = {
      ...claimed,
      attempt: 2,
      state: "generating",
      diagnostics: [],
      updatedAt: "2026-07-18T00:01:10.000Z",
      attempts: [
        { ...replaced.attempts[0], state: "failed-retryable" },
        {
          ...claimed.attempts[0],
          attemptNumber: 2,
          idempotencyKey: "owner-attempt-2",
        },
      ],
    };

    await expect(
      persistence.claimGeneration(retryRecord)
    ).resolves.toMatchObject({ claimed: true });

    const staleWrite: LessonGenerationRecord = {
      ...claimed,
      state: "ready-for-review",
      updatedAt: "2026-07-18T00:00:10.000Z",
      diagnostics: [
        { severity: "error", code: "LATE_WRITE", message: "Late write." },
      ],
    };
    const staleExpectation = {
      attempt: 1,
      updatedAt: claimed.updatedAt,
      leaseValidAfter: "2026-07-17T23:59:00.000Z",
    };
    const recordBeforeStaleWrite = await persistence.readGeneration(
      claimed.tenantId,
      claimed.requestId
    );

    await expectWriteRejected(persistence, staleWrite, staleExpectation);
    await expectStoredRecord(persistence, claimed, recordBeforeStaleWrite);

    const completedRetry: LessonGenerationRecord = {
      ...retryRecord,
      state: "ready-for-review",
      draft: null,
      updatedAt: "2026-07-18T00:02:00.000Z",
    };

    await expect(
      persistence.saveGeneration(completedRetry, {
        attempt: 2,
        updatedAt: retryRecord.updatedAt,
        leaseValidAfter: "2026-07-18T00:00:00.000Z",
      })
    ).resolves.toBeTruthy();

    await expectWriteRejected(persistence, staleWrite, staleExpectation);
    await expectStoredRecord(persistence, claimed, completedRetry);
  });

  it("stops after one invalid correction and keeps the diagnostics", async () => {
    const provider = createDeterministicLessonDraftProvider(
      "invalid-then-invalid"
    );
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_invalid_correction",
    });

    const result = await service.generate(teacherCommand());

    expect(provider.calls).toBe(2);
    expect(result.record.state).toBe("blocked-by-validation");
    expect(result.record.draft).toBeNull();
    expect(
      result.record.diagnostics.some((entry) => entry.code === "UNKNOWN_TARGET")
    ).toBeTruthy();
  });

  it("accepts exactly one valid correction and never calls a third time", async () => {
    const provider =
      createDeterministicLessonDraftProvider("invalid-then-valid");
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_valid_correction",
      semanticValidation: () => {
        return Promise.resolve({
          status: "complete",
          verdict: "pass",
          recovery: null,
          reviews: [],
          findings: [],
          retry: { available: false, message: "No retry needed." },
        });
      },
    });

    const result = await service.generate(teacherCommand());

    expect(provider.calls).toBe(2);
    expect(result.record.state).toBe("ready-for-review");
    expect(result.record.attempts[0].correctionAttempted).toBeTruthy();
  });

  it("rejects a write paused across lease expiry without a replacement owner", async () => {
    const persistence = createSeededPersistence();
    const provider = createDeterministicLessonDraftProvider();
    const record: LessonGenerationRecord = {
      requestId: "draft_req_conformance_lease",
      tenantId: demoSeed.tenant.id,
      teacherId: teacherActor.actorId,
      input: {
        prompt: "equivalent fractions for grade 4",
        grade: 4,
        standardId: demoSeed.standard.id,
        language: "en",
        difficulty: "on-level",
      },
      state: "generating",
      attempt: 1,
      diagnostics: [],
      provenance: provider.provenance,
      attempts: [
        {
          attemptNumber: 1,
          idempotencyKey: "lease-attempt-1",
          requestHash: createGenerationRequestHash(recordInput()),
          state: "generating",
          correctionAttempted: false,
          diagnostics: [],
          provenance: provider.provenance,
          createdAt: "2026-07-18T00:00:00.000Z",
        },
      ],
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    await persistence.claimGeneration(record);

    await expect(
      persistence.saveGeneration(
        { ...record, state: "ready-for-review" },
        {
          attempt: 1,
          updatedAt: record.updatedAt,
          leaseValidAfter: "2026-07-18T00:00:00.000Z",
        }
      )
    ).resolves.toBeFalsy();

    const stored = await persistence.readGeneration(
      record.tenantId,
      record.requestId
    );

    expect(stored).toMatchObject({ state: "generating" });
    expect(stored?.draft).toBeUndefined();

    await expect(
      persistence.saveGeneration(
        { ...record, state: "ready-for-review" },
        {
          attempt: 1,
          updatedAt: record.updatedAt,
          leaseValidAfter: "2026-07-17T23:59:59.999Z",
        }
      )
    ).resolves.toBeTruthy();
  });
});

describe("generation service conformance: deadlines and cancellation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes the agreed 100/200/220 second contract", () => {
    expect(generationPerCallBudgetMs).toBe(100_000);
    expect(generationTotalBudgetMs).toBe(200_000);
    expect(generationClaimLeaseMs).toBe(220_000);
  });

  it("aborts a hanging initial call exactly at the 100-second per-call deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00.000Z"));
    const provider = createControlledProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_per_call",
    });

    const pending = service.generate(teacherCommand());
    await flush();

    expect(provider.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(generationPerCallBudgetMs - 1);

    expect(provider.calls[0].signal?.aborted).toBeFalsy();

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(provider.calls[0].signal?.aborted).toBeTruthy();
    expect(provider.calls).toHaveLength(1);

    expectRetryableFailure(result, "PROVIDER_TIMEOUT");

    expect(result.publicResult.retry.available).toBeTruthy();
  });

  it("aborts a hanging correction at the per-call deadline and never calls a third time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00.000Z"));
    const provider = createControlledProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_correction_deadline",
    });

    const pending = service.generate(teacherCommand());
    await flush();
    provider.calls[0].resolve({
      draft: invalidDraft(provider.calls[0].request),
    });
    await flush();

    expect(provider.calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(generationPerCallBudgetMs);
    const result = await pending;

    expect(provider.calls).toHaveLength(2);

    expectRetryableFailure(result, "PROVIDER_TIMEOUT");

    expect(
      result.record.attempts[0].diagnostics.some(
        (entry) => entry.code === "UNKNOWN_TARGET"
      )
    ).toBeTruthy();
  });

  it("aborts a hanging correction at the cumulative 200-second deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00.000Z"));
    const provider = createControlledProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      deadlines: { perCallMs: 150_000 },
      requestIdFactory: () => "draft_req_conformance_total_deadline",
    });

    const pending = service.generate(teacherCommand());
    await flush();
    setTimeout(() => {
      provider.calls[0].resolve({
        draft: invalidDraft(provider.calls[0].request),
      });
    }, 120_000);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(provider.calls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(79_999);

    expect(provider.calls[1].signal?.aborted).toBeFalsy();

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].signal?.aborted).toBeTruthy();

    expectRetryableFailure(result, "GENERATION_DEADLINE_EXCEEDED");
  });

  it.each(["ignore-abort", "respect-abort"] as const)(
    "cancels in flight, ignores a late %s response, and keeps the cancelled record",
    async (behavior) => {
      const provider = createControlledProvider(behavior);
      const persistence = createSeededPersistence();
      const service = createGenerationService({
        persistence,
        provider,
        requestIdFactory: () => "draft_req_conformance_cancel",
      });

      const pending = service.generate(teacherCommand());
      await vi.waitFor(() => {
        expect(provider.calls).toHaveLength(1);
      });

      const cancelled = await service.cancel({
        actor: teacherActor,
        requestId: "draft_req_conformance_cancel",
      });

      expect(provider.calls[0].signal?.aborted).toBeTruthy();

      expectCancelledRecord(cancelled.record);

      provider.calls[0].resolve({
        draft: createEquivalentFractionsDraft(provider.calls[0].request),
      });
      const late = await pending;

      expectCancelledRecord(late.record);

      expect(provider.calls).toHaveLength(1);
      await expect(
        persistence.readGeneration(
          cancelled.record.tenantId,
          cancelled.record.requestId
        )
      ).resolves.toMatchObject({
        state: "failed-retryable",
        draft: null,
      });
    }
  );

  it("does not add a call when cancelling an already completed request", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      requestIdFactory: () => "draft_req_conformance_cancel_done",
    });

    const generated = await service.generate(teacherCommand());
    const cancelled = await service.cancel({
      actor: teacherActor,
      requestId: generated.record.requestId,
    });

    expect(cancelled.record.state).toBe("ready-for-review");
    expect(provider.calls).toBe(1);
  });
});

describe("generation service conformance: retries and moderation", () => {
  it.each(["timeout", "rate-limit"] as const)(
    "links an explicit teacher retry after %s to a new key without extra calls on replay",
    async (kind) => {
      let calls = 0;
      const provider: LessonDraftProvider = {
        provenance: createDeterministicLessonDraftProvider().provenance,
        generate(request) {
          calls += 1;
          if (calls === 1) {
            throw new LessonProviderError(
              kind,
              "The lesson provider failed. Try again."
            );
          }
          return Promise.resolve({
            draft: createEquivalentFractionsDraft(request),
          });
        },
      };
      const service = createGenerationService({
        persistence: createSeededPersistence(),
        provider,
        requestIdFactory: () => "draft_req_conformance_retry",
      });

      const failed = await service.generate(teacherCommand());

      expect(failed.record.state).toBe("failed-retryable");

      const retried = await service.generate(
        teacherCommand({
          idempotencyKey: "conformance-retry-key",
          retryOfRequestId: failed.record.requestId,
        })
      );

      expect(retried.record.state).toBe("ready-for-review");
      expect(retried.record.attempt).toBe(2);
      expect(retried.record.attempts[0].diagnostics).toContainEqual(
        expect.objectContaining({
          code: kind === "timeout" ? "PROVIDER_TIMEOUT" : "PROVIDER_RATE_LIMIT",
        })
      );

      await service.generate(teacherCommand());
      await service.generate(
        teacherCommand({
          idempotencyKey: "conformance-retry-key",
          retryOfRequestId: failed.record.requestId,
        })
      );

      expect(calls).toBe(2);
    }
  );

  it("requires revised input after a prompt moderation block", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const persistence = createSeededPersistence();
    let requestNumber = 0;
    const service = createGenerationService({
      persistence,
      provider,
      safety: {
        checkPrompt: (prompt) => {
          return prompt.includes("unsafe")
            ? blockedSafetyResult("personal-data")
            : allowedSafetyResult();
        },
        checkGeneratedContent: () => allowedSafetyResult(),
        checkSourceText: () => allowedSafetyResult(),
      },
      requestIdFactory: () => {
        requestNumber += 1;
        return `draft_req_conformance_moderated_prompt_${requestNumber}`;
      },
    });

    const blocked = await service.generate(
      teacherCommand({ prompt: "unsafe prompt content" })
    );

    expect(blocked.record.state).toBe("blocked-by-moderation");
    expect(provider.calls).toBe(0);

    await expect(
      service.generate(
        teacherCommand({
          prompt: "unsafe prompt content",
          idempotencyKey: "conformance-moderated-new-key",
        })
      )
    ).rejects.toMatchObject({ code: "MODERATION_REVISION_REQUIRED" });
    expect(provider.calls).toBe(0);

    const original = await persistence.readGeneration(
      blocked.record.tenantId,
      blocked.record.requestId
    );

    expect(original?.state).toBe("blocked-by-moderation");
  });

  it("accepts revised input after a prompt moderation block", async () => {
    const provider = createDeterministicLessonDraftProvider();
    let requestNumber = 0;
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      safety: {
        checkPrompt: (prompt) => {
          return prompt.includes("unsafe")
            ? blockedSafetyResult("personal-data")
            : allowedSafetyResult();
        },
        checkGeneratedContent: () => allowedSafetyResult(),
        checkSourceText: () => allowedSafetyResult(),
      },
      requestIdFactory: () => {
        requestNumber += 1;
        return `draft_req_conformance_revised_${requestNumber}`;
      },
    });

    await service.generate(teacherCommand({ prompt: "unsafe prompt content" }));
    const revised = await service.generate(
      teacherCommand({
        prompt: "a revised safe prompt",
        idempotencyKey: "conformance-moderated-revised-key",
      })
    );

    expect(revised.record.state).toBe("ready-for-review");
    expect(provider.calls).toBe(1);
  });

  it("does not correct or re-call for an unchanged request after output moderation", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider,
      safety: {
        checkPrompt: () => allowedSafetyResult(),
        checkGeneratedContent: () => blockedSafetyResult("harmful-content"),
        checkSourceText: () => allowedSafetyResult(),
      },
      requestIdFactory: () => "draft_req_conformance_moderated_output",
    });

    const blocked = await service.generate(teacherCommand());

    expect(blocked.record.state).toBe("blocked-by-moderation");
    expect(provider.calls).toBe(1);

    await expect(
      service.generate(
        teacherCommand({ idempotencyKey: "conformance-output-new-key" })
      )
    ).rejects.toMatchObject({ code: "MODERATION_REVISION_REQUIRED" });
    expect(provider.calls).toBe(1);
  });

  it("refuses a retry of a moderation-blocked request", async () => {
    const service = createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      safety: {
        checkPrompt: () => blockedSafetyResult("personal-data"),
        checkGeneratedContent: () => allowedSafetyResult(),
        checkSourceText: () => allowedSafetyResult(),
      },
      requestIdFactory: () => "draft_req_conformance_moderated_retry",
    });

    const blocked = await service.generate(teacherCommand());

    await expect(
      service.generate(
        teacherCommand({
          idempotencyKey: "conformance-moderation-retry-key",
          retryOfRequestId: blocked.record.requestId,
        })
      )
    ).rejects.toMatchObject({ code: "MODERATION_REVISION_REQUIRED" });
  });
});

describe("generation service conformance: constants and errors", () => {
  it("keeps the duplicate wait bounded and the conflict error typed", () => {
    expect(generationDuplicateWaitMs).toBe(5000);
    expect(
      new GenerationRequestError("conflict", { code: "IDEMPOTENCY_CONFLICT" })
    ).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
});
