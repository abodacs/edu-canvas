export interface GenerationLimitPolicy {
  readonly teacherGenerationAttemptsPerHour: number;
  readonly tenantGenerationAttemptsPerDay: number;
  readonly tenantProviderCallsPerDay: number;
  readonly sessionAuthoringRequestsPerMinute: number;
  readonly activeGenerationsPerTeacher: number;
}

export const generationLimitPolicy: GenerationLimitPolicy = Object.freeze({
  teacherGenerationAttemptsPerHour: 10,
  tenantGenerationAttemptsPerDay: 100,
  tenantProviderCallsPerDay: 200,
  sessionAuthoringRequestsPerMinute: 30,
  activeGenerationsPerTeacher: 1,
});

export const limitWindowMs = Object.freeze({
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
});

export type LimitWindow = keyof typeof limitWindowMs;

export const limitsUnavailableRetryMs = 30_000;

export const minimumRetryAfterMs = 1000;
