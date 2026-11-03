import { describe, expect, it } from "vitest";

import { generationLimitPolicy, limitWindowMs } from "./config";

describe("generation limit policy", () => {
  it("records the milestone defaults from AgDR-0007", () => {
    expect(generationLimitPolicy).toStrictEqual({
      teacherGenerationAttemptsPerHour: 10,
      tenantGenerationAttemptsPerDay: 100,
      tenantProviderCallsPerDay: 200,
      sessionAuthoringRequestsPerMinute: 30,
      activeGenerationsPerTeacher: 1,
    });
  });

  it("uses the named UTC-aligned windows", () => {
    expect(limitWindowMs).toStrictEqual({
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
    });
  });
});
