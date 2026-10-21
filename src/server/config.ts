import { z } from "zod";

const environmentValues = ["development", "preview", "production"] as const;

export type ServerEnvironment = (typeof environmentValues)[number];
export type PersistenceMode = "seeded-demo" | "postgres";
export type PostgresPersistenceAdapter = "postgres" | "drizzle";

interface ConfigIssueCodes {
  INVALID_APP_ENV: true;
  INVALID_DEMO_MODE: true;
  INVALID_SYNTHETIC_DATA_ONLY: true;
  INVALID_DATABASE_URL: true;
  INVALID_PERSISTENCE_ADAPTER: true;
  INVALID_SENTRY_DSN: true;
  DATABASE_REQUIRED: true;
  OPENAI_API_KEY_REQUIRED: true;
  INVALID_OPENAI_BASE_URL: true;
  REAL_DATA_DISABLED: true;
}

export type ConfigIssueCode = keyof ConfigIssueCodes;

export interface ConfigIssue {
  code: ConfigIssueCode;
  field: string;
  message: string;
}

export interface ServerConfig {
  appEnv: ServerEnvironment;
  demoMode: boolean;
  syntheticDataOnly: true;
  mode: PersistenceMode;
  persistenceAdapter: PostgresPersistenceAdapter;
  databaseUrl?: string;
  sentryDsn?: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiBaseUrl: string;
  issues: readonly ConfigIssue[];
}

export interface DatabaseBootstrapConfig {
  syntheticDataOnly: true;
  databaseUrl?: string;
  issues: readonly ConfigIssue[];
}

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const postgresProtocols = new Set(["postgres:", "postgresql:"]);

const databaseUrlSchema = z.string().refine((value) => {
  const url = parseUrl(value);
  return url !== null && postgresProtocols.has(url.protocol);
}, "DATABASE_URL must be a postgres:// or postgresql:// URL.");

const persistenceAdapterSchema = z.enum(["postgres", "drizzle"]);

export const isValidSentryDsn = (value: string): boolean => {
  const url = parseUrl(value);
  return (
    url !== null &&
    [
      url.protocol === "https:",
      url.username.length > 0,
      url.hostname.length > 0,
      url.pathname.length > 1,
    ].every(Boolean)
  );
};

const loopbackHosts = new Set(["localhost", "127.0.0.1"]);

const isAllowedOpenAiBaseUrl = (url: URL): boolean => {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && loopbackHosts.has(url.hostname))
  );
};

const openAiBaseUrlSchema = z.string().refine((value) => {
  const url = parseUrl(value);
  return url !== null && isAllowedOpenAiBaseUrl(url);
}, "OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server.");

const parseBoolean = (
  value: string | undefined,
  isFallback: boolean
): { value: boolean; invalid: boolean } => {
  if (value === undefined) {
    return { value: isFallback, invalid: false };
  }
  if (value === "true") {
    return { value: true, invalid: false };
  }
  return value === "false"
    ? { value: false, invalid: false }
    : { value: isFallback, invalid: true };
};

export const readDatabaseBootstrapConfig = (
  environment: Record<string, string | undefined> = process.env
): DatabaseBootstrapConfig => {
  const issues: ConfigIssue[] = [];
  const syntheticDataOnlyResult = parseBoolean(
    environment.SYNTHETIC_DATA_ONLY,
    true
  );
  const syntheticDataOnly = syntheticDataOnlyResult.value;

  if (syntheticDataOnlyResult.invalid) {
    issues.push({
      code: "INVALID_SYNTHETIC_DATA_ONLY",
      field: "SYNTHETIC_DATA_ONLY",
      message: "SYNTHETIC_DATA_ONLY must be true or false.",
    });
  }
  if (!syntheticDataOnly) {
    issues.push({
      code: "REAL_DATA_DISABLED",
      field: "SYNTHETIC_DATA_ONLY",
      message:
        "Real-student mode is disabled until the compliance launch gate is approved.",
    });
  }

  const databaseUrl = environment.DATABASE_URL?.trim() || undefined;
  if (databaseUrl && !databaseUrlSchema.safeParse(databaseUrl).success) {
    issues.push({
      code: "INVALID_DATABASE_URL",
      field: "DATABASE_URL",
      message: "DATABASE_URL must be a postgres:// or postgresql:// URL.",
    });
  }

  return {
    syntheticDataOnly: true,
    ...(databaseUrl && { databaseUrl }),
    issues,
  };
};

const pushIssue = (
  issues: ConfigIssue[],
  code: ConfigIssueCode,
  field: string,
  message: string
): void => {
  issues.push({ code, field, message });
};

const readAppEnvironment = (
  environment: Record<string, string | undefined>,
  issues: ConfigIssue[]
): ServerEnvironment => {
  const requested =
    environment.APP_ENV ??
    (environment.NODE_ENV === "production" ? "production" : "development");
  if (environmentValues.includes(requested as ServerEnvironment)) {
    return requested as ServerEnvironment;
  }
  pushIssue(
    issues,
    "INVALID_APP_ENV",
    "APP_ENV",
    "APP_ENV must be development, preview, or production."
  );
  return "development";
};

const isDemoModeEnabled = (
  environment: Record<string, string | undefined>,
  appEnvironment: ServerEnvironment,
  issues: ConfigIssue[]
): boolean => {
  const result = parseBoolean(
    environment.DEMO_MODE,
    appEnvironment !== "production"
  );
  if (result.invalid) {
    pushIssue(
      issues,
      "INVALID_DEMO_MODE",
      "DEMO_MODE",
      "DEMO_MODE must be true or false."
    );
  }
  return result.value;
};

const readPersistenceAdapter = (
  environment: Record<string, string | undefined>,
  issues: ConfigIssue[]
): PostgresPersistenceAdapter => {
  const requested = environment.PERSISTENCE_ADAPTER?.trim() || "postgres";
  const result = persistenceAdapterSchema.safeParse(requested);
  if (result.success) {
    return result.data;
  }
  pushIssue(
    issues,
    "INVALID_PERSISTENCE_ADAPTER",
    "PERSISTENCE_ADAPTER",
    "PERSISTENCE_ADAPTER must be postgres or drizzle."
  );
  return "postgres";
};

const readSentryDsn = (
  environment: Record<string, string | undefined>,
  issues: ConfigIssue[]
): string | undefined => {
  const requested = environment.SENTRY_DSN?.trim() || undefined;
  if (!requested) {
    return undefined;
  }
  if (isValidSentryDsn(requested)) {
    return requested;
  }
  pushIssue(
    issues,
    "INVALID_SENTRY_DSN",
    "SENTRY_DSN",
    "SENTRY_DSN must be a valid Sentry DSN URL."
  );
  return undefined;
};

const defaultOpenAiBaseUrl = "https://api.openai.com/v1";

const readOpenAiSettings = (
  environment: Record<string, string | undefined>,
  isDemoMode: boolean,
  issues: ConfigIssue[]
) => {
  const apiKey = environment.OPENAI_API_KEY?.trim() || undefined;
  const model = environment.OPENAI_MODEL?.trim() || "gpt-5.6";
  const requestedBaseUrl =
    environment.OPENAI_BASE_URL?.trim() || defaultOpenAiBaseUrl;
  const baseUrlIsValid =
    openAiBaseUrlSchema.safeParse(requestedBaseUrl).success;

  if (!baseUrlIsValid) {
    pushIssue(
      issues,
      "INVALID_OPENAI_BASE_URL",
      "OPENAI_BASE_URL",
      "OPENAI_BASE_URL must use HTTPS, or HTTP for a local loopback test server."
    );
  }
  if (!isDemoMode && !apiKey) {
    pushIssue(
      issues,
      "OPENAI_API_KEY_REQUIRED",
      "OPENAI_API_KEY",
      "Set OPENAI_API_KEY for server-side lesson generation."
    );
  }

  return {
    apiKey,
    model,
    baseUrl: baseUrlIsValid ? requestedBaseUrl : defaultOpenAiBaseUrl,
  };
};

export const readServerConfig = (
  environment: Record<string, string | undefined> = process.env
): ServerConfig => {
  const databaseConfig = readDatabaseBootstrapConfig(environment);
  const issues: ConfigIssue[] = [...databaseConfig.issues];
  const appEnvironment = readAppEnvironment(environment, issues);
  const isDemoMode = isDemoModeEnabled(environment, appEnvironment, issues);
  const persistenceAdapter = readPersistenceAdapter(environment, issues);
  const sentryDsn = readSentryDsn(environment, issues);
  const openAi = readOpenAiSettings(environment, isDemoMode, issues);
  const { syntheticDataOnly, databaseUrl } = databaseConfig;

  if (!isDemoMode && !databaseUrl) {
    pushIssue(
      issues,
      "DATABASE_REQUIRED",
      "DATABASE_URL",
      "Set DATABASE_URL when DEMO_MODE is false."
    );
  }

  return {
    appEnv: appEnvironment,
    demoMode: isDemoMode,
    syntheticDataOnly,
    mode: databaseUrl ? "postgres" : "seeded-demo",
    persistenceAdapter,
    ...(databaseUrl && { databaseUrl }),
    ...(sentryDsn && { sentryDsn }),
    ...(openAi.apiKey && { openAiApiKey: openAi.apiKey }),
    openAiModel: openAi.model,
    openAiBaseUrl: openAi.baseUrl,
    issues,
  };
};

export const safeConfigSummary = (config: ServerConfig) => {
  return {
    appEnv: config.appEnv,
    demoMode: config.demoMode,
    syntheticDataOnly: config.syntheticDataOnly,
    persistence: config.mode,
    observability: {
      sentry: config.sentryDsn ? "configured" : "structured-log-only",
    },
    issues: config.issues,
  };
};
