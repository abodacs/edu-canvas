/**
The single source of the milestone request limits (#104). The numbers come from
AgDR-0007 and the implementation document; every counter, test, and drift check
reads them from here so prose and code cannot disagree silently.
*/
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

/**
Fail-closed retry hint when the shared limit store is unavailable. The request is rejected, never allowed, and the teacher gets a bounded wait.
*/
export const limitsUnavailableRetryMs = 30_000;

/**
Never promise a retry sooner than this; a sub-second hint reads as "try again immediately" and invites a hot retry loop.
*/
export const minimumRetryAfterMs = 1000;
