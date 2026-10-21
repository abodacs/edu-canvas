import { captureException, init, withIsolationScope } from "@sentry/node";

import { isValidSentryDsn } from "./config";
import type { ServerEnvironment } from "./config";

const REDACTED_VALUE = "[REDACTED]";

const serverEnvironments = new Set<ServerEnvironment>([
  "development",
  "preview",
  "production",
]);

const safeContextKeys = new Set([
  "reason",
  "issueCodes",
  "dependency",
  "code",
  "safeCode",
  "route",
  "statusCode",
]);

const safeReasons = new Set([
  "access_denied",
  "contract_violation",
  "invalid_configuration",
  "missing_database_url",
  "persistence_read_failed",
  "persistence_unavailable",
  "seed_integrity_failed",
]);
const safeDependencies = new Set(["postgres", "seeded-demo"]);
const safeRoutes = new Set([
  "/api/health",
  "/api/readiness",
  "/demo/student",
  "/demo/teacher",
]);
const safeIssueCodePattern = /^[A-Z][A-Z0-9_]+$/u;

const sensitiveStringPatterns: readonly [RegExp, string][] = [
  [/(?:postgres(?:ql)?|https?):\/\/[^\s]+/giu, "[REDACTED_URL]"],
  [/bearer\s+[^\s]+/giu, "Bearer [REDACTED]"],
  [/[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,255}/giu, "[REDACTED_EMAIL]"],
  [/\b(?:student|child|identity)[_-][0-9a-z_-]+\b/giu, "[REDACTED_ID]"],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
    "[REDACTED_ID]",
  ],
];

export type ServerObservabilityContext = Readonly<Record<string, unknown>>;

export interface StructuredServerError {
  schema: "edu-canvas.server-error.v1";
  timestamp: string;
  level: "error";
  service: "edu-canvas";
  environment: ServerEnvironment;
  operation: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context: Record<string, unknown>;
  delivery: "sentry" | "structured-log";
}

export interface SentryReporter {
  captureException: (error: Error, event: StructuredServerError) => void;
}

export interface ServerObservability {
  captureError: (
    error: unknown,
    context?: ServerObservabilityContext
  ) => StructuredServerError;
}

export interface CreateServerObservabilityOptions {
  env?: Record<string, string | undefined>;
  logger?: (event: StructuredServerError) => void;
  sentry?: SentryReporter | null;
  now?: () => Date;
}

const getEnvironment = (
  environment: Record<string, string | undefined>
): ServerEnvironment => {
  const requested = environment.APP_ENV;
  if (requested && serverEnvironments.has(requested as ServerEnvironment)) {
    return requested as ServerEnvironment;
  }

  return environment.NODE_ENV === "production" ? "production" : "development";
};

const scrubString = (value: string): string => {
  let result = value;
  for (const [pattern, replacement] of sensitiveStringPatterns) {
    result = result.replaceAll(pattern, () => replacement);
  }
  return result;
};

const normalizeError = (error: unknown): StructuredServerError["error"] => {
  if (Error.isError(error)) {
    return {
      name: scrubString(error.name || "Error"),
      message: scrubString(error.message || "Unknown server error."),
      ...(error.stack && { stack: scrubString(error.stack) }),
    };
  }

  return {
    name: "UnknownError",
    message: scrubString(String(error)),
  };
};

const isHttpStatusCode = (value: unknown): value is number => {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 100 &&
    value <= 599
  );
};

const scrubAllowedValue = (
  allowed: ReadonlySet<string>,
  value: unknown
): unknown => {
  return typeof value === "string" && allowed.has(value)
    ? value
    : REDACTED_VALUE;
};

const scrubIssueCode = (value: unknown): unknown => {
  return typeof value === "string" && safeIssueCodePattern.test(value)
    ? value
    : REDACTED_VALUE;
};

const scrubIssueCodes = (value: unknown): unknown => {
  return Array.isArray(value)
    ? value.map((code) => scrubIssueCode(code))
    : REDACTED_VALUE;
};

const contextScrubbers = new Map<string, (value: unknown) => unknown>([
  ["reason", (value) => scrubAllowedValue(safeReasons, value)],
  ["dependency", (value) => scrubAllowedValue(safeDependencies, value)],
  ["route", (value) => scrubAllowedValue(safeRoutes, value)],
  ["statusCode", (value) => (isHttpStatusCode(value) ? value : REDACTED_VALUE)],
  ["issueCodes", scrubIssueCodes],
  ["code", scrubIssueCode],
  ["safeCode", scrubIssueCode],
]);

const scrubContextValue = (key: string, value: unknown): unknown => {
  const scrubber = contextScrubbers.get(key);
  return scrubber ? scrubber(value) : REDACTED_VALUE;
};

const scrubContext = (context: ServerObservabilityContext) => {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      return [
        key,
        safeContextKeys.has(key)
          ? scrubContextValue(key, value)
          : REDACTED_VALUE,
      ];
    })
  );
};

const toSentryError = (error: StructuredServerError["error"]): Error => {
  const sanitized = new Error(error.message);
  Object.defineProperty(sanitized, "name", {
    value: error.name,
    configurable: true,
    writable: true,
  });
  if (error.stack) {
    Object.defineProperty(sanitized, "stack", {
      value: error.stack,
      configurable: true,
      writable: true,
    });
  }
  return sanitized;
};

const createDefaultSentryReporter = (
  environment: Record<string, string | undefined>
): SentryReporter | undefined => {
  const dsn = environment.SENTRY_DSN?.trim();
  if (!dsn || !isValidSentryDsn(dsn)) {
    return undefined;
  }

  try {
    init({
      dsn,
      environment: getEnvironment(environment),
      defaultIntegrations: false,
      sendDefaultPii: false,
      beforeSend(event) {
        delete event.user;
        delete event.request;
        delete event.extra;
        delete event.breadcrumbs;
        const context = event.contexts?.["edu-canvas"];
        if (context && typeof context === "object" && !Array.isArray(context)) {
          event.contexts = {
            "edu-canvas": scrubContext(context),
          };
        } else {
          delete event.contexts;
        }
        return event;
      },
    });
  } catch {
    return undefined;
  }

  return {
    captureException(error, event) {
      withIsolationScope((scope) => {
        scope.clear();
        scope.setTag("operation", event.operation);
        scope.setContext("edu-canvas", event.context);
        captureException(error);
      });
    },
  };
};

export const createServerObservability = (
  options: CreateServerObservabilityOptions = {}
): ServerObservability => {
  const sourceEnvironment = options.env ?? process.env;
  const environment = getEnvironment(sourceEnvironment);
  const logger =
    options.logger ?? ((event) => console.error(JSON.stringify(event)));
  const sentryOverride = options.sentry;
  let defaultSentry: SentryReporter | undefined;
  let isDefaultSentryInitialized = sentryOverride !== undefined;
  const now = options.now ?? (() => new Date());

  const getDefaultSentry = () => {
    if (!isDefaultSentryInitialized) {
      isDefaultSentryInitialized = true;
      defaultSentry = createDefaultSentryReporter(sourceEnvironment);
    }

    return defaultSentry;
  };

  return {
    captureError(error, context = {}) {
      const { operation: requestedOperation, ...rawContext } = context;
      const operation =
        typeof requestedOperation === "string"
          ? scrubString(requestedOperation)
          : "unknown";
      const normalizedError = normalizeError(error);
      const safeContext = scrubContext(rawContext);
      const sentryEvent: StructuredServerError = {
        schema: "edu-canvas.server-error.v1",
        timestamp: now().toISOString(),
        level: "error",
        service: "edu-canvas",
        environment,
        operation,
        error: normalizedError,
        context: safeContext,
        delivery: "sentry",
      };

      let delivery: StructuredServerError["delivery"] = "structured-log";
      const sentry =
        sentryOverride === undefined
          ? getDefaultSentry()
          : (sentryOverride ?? undefined);
      if (sentry) {
        try {
          sentry.captureException(toSentryError(normalizedError), sentryEvent);
          delivery = "sentry";
        } catch {
          delivery = "structured-log";
        }
      }

      const event = { ...sentryEvent, delivery };
      logger(event);
      return event;
    },
  };
};

export const serverObservability = createServerObservability();
