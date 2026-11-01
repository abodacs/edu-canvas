import { readServerConfig, safeConfigSummary } from "./config";
import { serverObservability } from "./observability.server";
import { createFoundationPersistence } from "./persistence";
import type { ServerObservability } from "./observability.server";

export interface ReadinessOptions {
  observability?: ServerObservability;
}

const getCurrentTimestamp = (): string => {
  const date = new Date();
  return date.toISOString();
};

export const getHealthPayload = () => {
  return {
    status: "ok" as const,
    service: "edu-canvas",
    check: "liveness",
    timestamp: getCurrentTimestamp(),
  };
};

export const getReadinessPayload = async (
  environment: Record<string, string | undefined> = process.env,
  options: ReadinessOptions = {}
) => {
  const config = readServerConfig(environment);
  const observability = options.observability ?? serverObservability;

  if (config.issues.length > 0) {
    observability.captureError(new Error("Readiness check failed."), {
      operation: "health.readiness",
      reason: "invalid_configuration",
      issueCodes: config.issues.map((issue) => issue.code),
    });

    return {
      status: "not_ready" as const,
      check: "readiness",
      config: safeConfigSummary(config),
      persistence: {
        status: "failed" as const,
        code: "CONFIG_INVALID" as const,
        message:
          "Server configuration is invalid. Correct the listed fields before redeploying.",
      },
    };
  }

  const persistence = await createFoundationPersistence(config, {
    observability,
  }).check();
  return {
    status:
      persistence.status === "ready"
        ? ("ready" as const)
        : ("not_ready" as const),
    check: "readiness",
    config: safeConfigSummary(config),
    persistence,
  };
};
