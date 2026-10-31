import { z } from "zod";

import {
  difficultyValues,
  generationStateValues,
  languageValues,
  publicGenerationDiagnosticSchema,
} from "@/shared/generation-contract";
import { FRACTIONS_CATALOG_VERSION } from "@/shared/a2ui-contract";
import { fractionLessonDraftSchema } from "@/shared/fractions-contract";

import {
  providerDraftSchema,
  validatedLearningPathSchema,
} from "../generation/validation";
import { createGenerationRequestHash } from "../generation/types";
import type { FractionLessonDraft } from "@/shared/fractions-contract";
import type {
  GenerationAttemptRecord,
  GenerationDiagnostic,
  LessonDraft,
  LessonGenerationRecord,
} from "../generation/types";
import type {
  NormalizedGenerationRequest,
  ProviderProvenance,
} from "../generation/provider";

const normalizedGenerationRequestSchema: z.ZodType<NormalizedGenerationRequest> =
  z.object({
    prompt: z.string(),
    grade: z.number().int().min(3).max(6),
    standardId: z.string(),
    language: z.enum(languageValues),
    difficulty: z.enum(difficultyValues),
    sourceSnapshotId: z.string().optional(),
  });

const provenanceSchema: z.ZodType<ProviderProvenance> = z
  .object({
    provider: z.string(),
    model: z.string(),
    promptTemplateVersion: z.string(),
    validatorVersion: z.string(),
    catalogVersion: z.string().optional(),
  })
  .strict();

const lessonDraftSchema: z.ZodType<LessonDraft> = providerDraftSchema
  .extend({
    learningPath: validatedLearningPathSchema,
    requestId: z.string(),
    input: normalizedGenerationRequestSchema,
    provenance: provenanceSchema,
    createdAt: z.string(),
  })
  .strict();

const diagnosticsSchema = publicGenerationDiagnosticSchema.array();
const stateSchema = z.enum(generationStateValues);

// #116: a fraction-pinned record stores a fractions-v2 draft; every other
// record keeps the matching draft contract. One boundary, catalog-aware.
const parseStoredDrafts = (
  value: unknown,
  catalogVersion: string | undefined
): {
  draft: LessonDraft | undefined;
  fractionDraft: FractionLessonDraft | undefined;
} => {
  if (catalogVersion === FRACTIONS_CATALOG_VERSION) {
    const fractionDraft = parseStoredJson<FractionLessonDraft>(
      value,
      fractionLessonDraftSchema,
      "lesson draft"
    );
    return { draft: undefined, fractionDraft };
  }
  return {
    draft: parseStoredJson<LessonDraft>(
      value,
      lessonDraftSchema,
      "lesson draft"
    ),
    fractionDraft: undefined,
  };
};

export interface StoredGenerationRequestRow {
  requestId: string;
  tenantId: string;
  teacherId: string;
  prompt: string;
  grade: number;
  standardId: string;
  language: string;
  difficulty: string;
  state: string;
  attempt: number;
  diagnostics: unknown;
  draft: unknown;
  provenance: unknown;
  sourceSnapshotId: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface StoredGenerationAttemptRow {
  attemptNumber: number;
  idempotencyKey: string;
  requestHash?: unknown;
  state: string;
  correctionAttempted: boolean;
  diagnostics: unknown;
  provenance: unknown;
  createdAt: string | Date;
}

const decodeJson = (value: unknown, field: string): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Stored ${field} contains invalid JSON.`);
  }
};

const parseStoredJson = <T>(
  value: unknown,
  schema: z.ZodType<T>,
  field: string
): T | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = schema.safeParse(decodeJson(value, field));
  if (!parsed.success) {
    throw new Error(`Stored ${field} does not match its contract.`);
  }

  return parsed.data;
};

const timestamp = (value: string | Date, field: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`Stored ${field} is not a valid timestamp.`);
  }
  return parsed.toISOString();
};

export const hydrateGenerationRecord = (
  row: StoredGenerationRequestRow,
  attempts: StoredGenerationAttemptRow[]
): LessonGenerationRecord => {
  const diagnostics =
    parseStoredJson<GenerationDiagnostic[]>(
      row.diagnostics,
      diagnosticsSchema,
      "request diagnostics"
    ) ?? [];
  const provenance = parseStoredJson<ProviderProvenance>(
    row.provenance,
    provenanceSchema,
    "request provenance"
  );
  const { draft, fractionDraft } = parseStoredDrafts(
    row.draft,
    provenance?.catalogVersion
  );
  const input = normalizedGenerationRequestSchema.parse({
    prompt: row.prompt,
    grade: row.grade,
    standardId: row.standardId,
    language: row.language,
    difficulty: row.difficulty,
    ...(row.sourceSnapshotId && { sourceSnapshotId: row.sourceSnapshotId }),
  });
  const state = stateSchema.parse(row.state);

  return {
    requestId: row.requestId,
    tenantId: row.tenantId,
    teacherId: row.teacherId,
    input,
    state,
    attempt: row.attempt,
    diagnostics,
    ...(draft && { draft }),
    ...(fractionDraft && { fractionDraft }),
    ...(provenance && { provenance }),
    attempts: attempts.map<GenerationAttemptRecord>((attempt) => {
      const attemptProvenance = parseStoredJson<ProviderProvenance>(
        attempt.provenance,
        provenanceSchema,
        "attempt provenance"
      );

      return {
        attemptNumber: attempt.attemptNumber,
        idempotencyKey: attempt.idempotencyKey,
        requestHash:
          typeof attempt.requestHash === "string"
            ? attempt.requestHash
            : createGenerationRequestHash(input),
        state: stateSchema.parse(attempt.state),
        correctionAttempted: attempt.correctionAttempted,
        diagnostics:
          parseStoredJson<GenerationDiagnostic[]>(
            attempt.diagnostics,
            diagnosticsSchema,
            "attempt diagnostics"
          ) ?? [],
        ...(attemptProvenance && { provenance: attemptProvenance }),
        createdAt: timestamp(attempt.createdAt, "attempt created_at"),
      };
    }),
    createdAt: timestamp(row.createdAt, "request created_at"),
    updatedAt: timestamp(row.updatedAt, "request updated_at"),
  };
};
