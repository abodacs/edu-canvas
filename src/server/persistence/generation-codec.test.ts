import { describe, expect, it } from "vitest";

import { syntheticSeed } from "@/server/seed-data";
import {
  artifactGatePolicyVersion,
  snapshotArtifactGateResult,
  gateArtifact,
} from "@/server/safety/artifact-gate";
import { createEquivalentFractionsDraft } from "../generation/provider";

import {
  hydrateGenerationRecord,
  storedGenerationDraft,
} from "./generation-codec";
import type {
  StoredGenerationRequestRow,
  StoredGenerationAttemptRow,
} from "./generation-codec";
import type { LessonGenerationRecord } from "../generation/types";

const passingSnapshot = () => {
  const draft = createEquivalentFractionsDraft({
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: syntheticSeed.standard.id,
    language: "en",
    difficulty: "on-level",
  });

  return snapshotArtifactGateResult(
    gateArtifact({
      kind: "lesson",
      draft: { variants: draft.variants },
      learningPath: {
        direction: "forward",
        steps: [
          {
            nodeId: "graph_node_equal_parts",
            label: "Understand equal parts",
            role: "prerequisite",
            screenPurposeId: "screen_purpose_equal_parts",
            screenPurpose: "Show equal parts.",
          },
          {
            nodeId: "graph_node_equivalent_fractions",
            label: "Recognize equivalent fractions",
            role: "target",
            screenPurposeId: "screen_purpose_equivalent_fractions",
            screenPurpose: "Match equivalent names.",
          },
        ],
        rationale: "Build on equal parts before matching equivalent names.",
        nextScreenRationale: "The target screen closes the prerequisite walk.",
        versionPins: {
          draftId: "draft_req_codec_fixture",
          graphVersion: syntheticSeed.activityVersion.graphVersion,
          catalogVersion: "matching-v1",
          modelVersion: "equivalent-fractions-fixture-v1",
          validatorVersion: "semantic-validation-runner-v1",
        },
      },
    })
  );
};

const readyRecord = (): LessonGenerationRecord => {
  return {
    requestId: "draft_req_codec_fixture",
    tenantId: syntheticSeed.tenant.id,
    teacherId: "actor_teacher_fixture",
    input: {
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: syntheticSeed.standard.id,
      language: "en",
      difficulty: "on-level",
    },
    state: "ready-for-review",
    attempt: 1,
    diagnostics: [],
    provenance: {
      provider: "deterministic-fixture",
      model: "equivalent-fractions-fixture-v1",
      promptTemplateVersion: "lesson-prompt-v1",
      validatorVersion: "lesson-validator-v2",
    },
    draft: {
      variants: createEquivalentFractionsDraft({
        prompt: "equivalent fractions for grade 4",
        grade: 4,
        standardId: syntheticSeed.standard.id,
        language: "en",
        difficulty: "on-level",
      }).variants,
      learningPath: {
        direction: "forward",
        steps: [
          {
            nodeId: "graph_node_equal_parts",
            label: "Understand equal parts",
            role: "prerequisite",
            screenPurposeId: "screen_purpose_equal_parts",
            screenPurpose: "Show equal parts.",
          },
          {
            nodeId: "graph_node_equivalent_fractions",
            label: "Recognize equivalent fractions",
            role: "target",
            screenPurposeId: "screen_purpose_equivalent_fractions",
            screenPurpose: "Match equivalent names.",
          },
        ],
        rationale: "Build on equal parts before matching equivalent names.",
        nextScreenRationale: "The target screen closes the prerequisite walk.",
        versionPins: {
          draftId: "draft_req_codec_fixture",
          graphVersion: syntheticSeed.activityVersion.graphVersion,
          catalogVersion: "matching-v1",
          modelVersion: "equivalent-fractions-fixture-v1",
          validatorVersion: "semantic-validation-runner-v1",
        },
      },
      requestId: "draft_req_codec_fixture",
      input: {
        prompt: "equivalent fractions for grade 4",
        grade: 4,
        standardId: syntheticSeed.standard.id,
        language: "en",
        difficulty: "on-level",
      },
      provenance: {
        provider: "deterministic-fixture",
        model: "equivalent-fractions-fixture-v1",
        promptTemplateVersion: "lesson-prompt-v1",
        validatorVersion: "lesson-validator-v2",
      },
      createdAt: "2026-10-31T00:00:00.000Z",
    },
    gate: passingSnapshot(),
    attempts: [],
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
  };
};

const storedRow = (
  record: LessonGenerationRecord
): StoredGenerationRequestRow => {
  return {
    requestId: record.requestId,
    tenantId: record.tenantId,
    teacherId: record.teacherId,
    prompt: record.input.prompt,
    grade: record.input.grade,
    standardId: record.input.standardId,
    language: record.input.language,
    difficulty: record.input.difficulty,
    state: record.state,
    attempt: record.attempt,
    diagnostics: record.diagnostics,
    draft: storedGenerationDraft(record),
    provenance: record.provenance,
    sourceSnapshotId: null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

const storedAttemptRow = (): StoredGenerationAttemptRow => {
  return {
    attemptNumber: 1,
    idempotencyKey: "codec-legacy-attempt",
    state: "blocked-by-validation",
    correctionAttempted: false,
    diagnostics: [],
    provenance: null,
    createdAt: "2026-10-31T00:00:00.000Z",
  };
};

describe("generation codec gate snapshot", () => {
  it("round-trips the acceptance snapshot beside the stored draft", () => {
    const record = readyRecord();
    const hydrated = hydrateGenerationRecord(storedRow(record), []);

    expect(hydrated.gate).toStrictEqual(record.gate);
    expect(hydrated.draft).toStrictEqual(record.draft);
    expect(hydrated.gate?.policyVersion).toBe(artifactGatePolicyVersion);
  });

  it("hydrates a legacy bare draft without a snapshot", () => {
    const record = readyRecord();
    const row = storedRow(record);
    const legacy = hydrateGenerationRecord({ ...row, draft: record.draft }, []);

    expect(legacy.draft).toStrictEqual(record.draft);
    expect(legacy.gate).toBeUndefined();
  });

  it("rejects a stored snapshot that breaks its contract", () => {
    const record = readyRecord();
    const row = storedRow(record);

    expect(() => {
      return hydrateGenerationRecord(
        {
          ...row,
          draft: { artifact: record.draft, gate: { verdict: "hard_block" } },
        },
        []
      );
    }).toThrow(/does not match its contract/u);
  });

  it("maps a legacy block verdict to hard_block on read", () => {
    const record = readyRecord();
    const row = storedRow(record);
    const legacyDiagnostic = {
      severity: "error",
      code: "ANSWER_MISMATCH",
      message: "A relationship does not match the expected answer.",
      field: "relationships",
      verdict: "block",
    };

    const hydrated = hydrateGenerationRecord(
      { ...row, diagnostics: [legacyDiagnostic] },
      [{ ...storedAttemptRow(), diagnostics: [legacyDiagnostic] }]
    );

    expect(hydrated.diagnostics[0]).toStrictEqual({
      ...legacyDiagnostic,
      verdict: "hard_block",
    });
    expect(hydrated.attempts[0]?.diagnostics[0]?.verdict).toBe("hard_block");
  });

  it("still rejects a verdict outside the legacy alias", () => {
    const record = readyRecord();
    const row = storedRow(record);

    expect(() => {
      return hydrateGenerationRecord(
        {
          ...row,
          diagnostics: [
            {
              severity: "error",
              code: "ANSWER_MISMATCH",
              message: "A relationship does not match the expected answer.",
              verdict: "explode",
            },
          ],
        },
        []
      );
    }).toThrow(/does not match its contract/u);
  });

  it("still rejects an extra field on a legacy row", () => {
    const record = readyRecord();
    const row = storedRow(record);

    expect(() => {
      return hydrateGenerationRecord(
        {
          ...row,
          diagnostics: [
            {
              severity: "error",
              code: "ANSWER_MISMATCH",
              message: "A relationship does not match the expected answer.",
              verdict: "block",
              rawProviderPayload: "secret",
            },
          ],
        },
        []
      );
    }).toThrow(/does not match its contract/u);
  });
});
