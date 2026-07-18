import type { DemoSession } from '@/server/demo/policy'
import type { PublicGenerationResult } from '@/shared/generation-contract'

import type {
  NormalizedGenerationRequest,
  ProviderProvenance,
} from './provider'

export const variantKindValues = ['standard', 'scaffold', 'challenge'] as const

export type VariantKind = (typeof variantKindValues)[number]

export interface ProviderItem {
  id: string
  label: string
}

export interface ProviderRelationship {
  id: string
  sourceId: string
  targetId: string
}

export interface ProviderVariant {
  id: string
  kind: VariantKind
  title: string
  instructions: string
  sourceItems: ProviderItem[]
  targetItems: ProviderItem[]
  distractorItems: ProviderItem[]
  relationships: ProviderRelationship[]
  hints: string[]
  feedback: {
    correct: string
    incorrect: string
  }
  languageMetadata: {
    language: 'en' | 'ar'
    direction: 'ltr' | 'rtl'
    locale: string
  }
  accessibilityMetadata: {
    instructions: string
    sourceGroupLabel: string
    targetGroupLabel: string
  }
}

export interface ProviderLessonDraft {
  variants: ProviderVariant[]
}

export interface LessonDraft extends ProviderLessonDraft {
  requestId: string
  input: NormalizedGenerationRequest
  provenance: ProviderProvenance
  createdAt: string
}

export type DiagnosticSeverity = 'warning' | 'error'

export interface GenerationDiagnostic {
  severity: DiagnosticSeverity
  code: string
  message: string
  variantId?: string
  field?: string
}

export interface ValidationSuccess {
  ok: true
  draft: ProviderLessonDraft
  diagnostics: GenerationDiagnostic[]
}

export interface ValidationFailure {
  ok: false
  diagnostics: GenerationDiagnostic[]
}

export type ValidationResult = ValidationSuccess | ValidationFailure

export type GenerationState =
  | 'requested'
  | 'generating'
  | 'ready-for-review'
  | 'blocked-by-validation'
  | 'blocked-by-moderation'
  | 'failed-retryable'
  | 'failed-terminal'

export interface GenerationAttemptRecord {
  attemptNumber: number
  idempotencyKey: string
  state: GenerationState
  correctionAttempted: boolean
  diagnostics: GenerationDiagnostic[]
  provenance?: ProviderProvenance
  createdAt: string
}

export interface LessonGenerationRecord {
  requestId: string
  tenantId: string
  teacherId: string
  input: NormalizedGenerationRequest
  state: GenerationState
  attempt: number
  diagnostics: GenerationDiagnostic[]
  provenance?: ProviderProvenance
  draft?: LessonDraft
  attempts: GenerationAttemptRecord[]
  createdAt: string
  updatedAt: string
}

export interface GenerationClaim {
  claimed: boolean
  record: LessonGenerationRecord
}

export interface GenerationWriteExpectation {
  attempt: number
  updatedAt: string
}

export const generationClaimLeaseMs = 30_000
export const generationDuplicateWaitMs = 5_000

export function isGenerationClaimExpired(
  record: LessonGenerationRecord,
  now = Date.now(),
): boolean {
  if (record.state !== 'generating') return false
  const updatedAt = Date.parse(record.updatedAt)
  return Number.isFinite(updatedAt) && now - updatedAt >= generationClaimLeaseMs
}

export function generationClaimExpiredDiagnostic(): GenerationDiagnostic {
  return {
    severity: 'error',
    code: 'GENERATION_CLAIM_EXPIRED',
    message:
      'The previous generation attempt expired before completion. Try this draft again.',
  }
}

export interface GenerationPersistence {
  saveGeneration: (
    record: LessonGenerationRecord,
    expected: GenerationWriteExpectation,
  ) => Promise<boolean>
  claimGeneration: (record: LessonGenerationRecord) => Promise<GenerationClaim>
  expireGenerationClaim: (
    tenantId: string,
    requestId: string,
    expectedUpdatedAt: string,
    updatedAt: string,
  ) => Promise<LessonGenerationRecord | undefined>
  findGenerationByIdempotencyKey: (
    tenantId: string,
    idempotencyKey: string,
  ) => Promise<LessonGenerationRecord | undefined>
  readGeneration: (
    tenantId: string,
    requestId: string,
  ) => Promise<LessonGenerationRecord | undefined>
}

export interface GenerationCommand {
  session: DemoSession
  input: unknown
}

export interface GenerationServiceResult {
  record: LessonGenerationRecord
  publicResult: PublicGenerationResult
}
