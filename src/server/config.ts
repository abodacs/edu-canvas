import { z } from "zod";

import type { PersistenceKind } from "./persistence/kinds";

const environmentValues = ["development", "preview", "production"] as const;

export type ServerEnvironment = (typeof environmentValues)[number];
export type PostgresPersistenceAdapter = "postgres" | "drizzle";
export type AuthProviderKind = "deterministic" | "supabase";

interface ConfigIssueCodes {
  INVALID_APP_ENV: true;
  INVALID_SYNTHETIC_DATA_ONLY: true;
  INVALID_DATABASE_URL: true;
  INVALID_PERSISTENCE_ADAPTER: true;
  INVALID_SENTRY_DSN: true;
  DATABASE_REQUIRED: true;
  OPENAI_API_KEY_REQUIRED: true;
  INVALID_OPENAI_BASE_URL: true;
  INVALID_OPENAI_TIMEOUT_MS: true;
  REAL_DATA_DISABLED: true;
  INVALID_AUTH_PROVIDER: true;
  INVALID_PUBLIC_ORIGIN: true;
  INVALID_SESSION_SECRET: true;
  INVALID_CREDENTIAL_KEY: true;
  INVALID_SUPABASE_URL: true;
  AUTH_CONFIG_REQUIRED: true;
}

export type ConfigIssueCode = keyof ConfigIssueCodes;

export interface ConfigIssue {
  code: ConfigIssueCode;
  field: string;
  message: string;
}

export interface AuthConfig {
  provider: AuthProviderKind;
  publicOrigin?: string;
  sessionSecret?: string;
  credentialKey?: string;
  credentialKeyVersion: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
}

export interface ServerConfig {
  appEnv: ServerEnvironment;
  syntheticDataOnly: true;
  persistenceAdapter: PostgresPersistenceAdapter;
  databaseUrl?: string;
  sentryDsn?: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiBaseUrl: string;
  openAiTimeoutMs: number;
  auth: AuthConfig;
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

// The provider receives a password and a service-role key, so a cleartext URL
// would expose both to an on-path observer and could point at any host.
const supabaseUrlSchema = z.string().refine((value) => {
  const url = parseUrl(value);
  return url !== null && isAllowedOpenAiBaseUrl(url);
}, "SUPABASE_URL must use HTTPS, or HTTP for a local loopback development stack.");

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
const defaultOpenAiTimeoutMs = 100_000;
const minOpenAiTimeoutMs = 1000;
const maxOpenAiTimeoutMs = 120_000;

const readOpenAiTimeoutMs = (
  value: string | undefined,
  issues: ConfigIssue[]
): number => {
  if (value === undefined || value.trim() === "") {
    return defaultOpenAiTimeoutMs;
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minOpenAiTimeoutMs ||
    parsed > maxOpenAiTimeoutMs
  ) {
    pushIssue(
      issues,
      "INVALID_OPENAI_TIMEOUT_MS",
      "OPENAI_TIMEOUT_MS",
      "OPENAI_TIMEOUT_MS must be an integer from 1000 to 120000 milliseconds."
    );
    return defaultOpenAiTimeoutMs;
  }

  return parsed;
};

const readOpenAiSettings = (
  environment: Record<string, string | undefined>,
  issues: ConfigIssue[]
) => {
  const apiKey = environment.OPENAI_API_KEY?.trim() || undefined;
  const model = environment.OPENAI_MODEL?.trim() || "gpt-5.6";
  const timeoutMs = readOpenAiTimeoutMs(environment.OPENAI_TIMEOUT_MS, issues);
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
  if (!apiKey) {
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
    timeoutMs,
  };
};

const authProviderValues = ["deterministic", "supabase"] as const;
const developmentPublicOrigin = "http://localhost:3000";
const developmentSessionSecret =
  "edu-canvas-development-only-session-secret-0000";
const developmentCredentialKey = "ZWR1LWNhbnZhcy1kZXYta2V5LTAwMDAwMDAwMDAwMDA=";

const readAuthProvider = (
  environment: Record<string, string | undefined>,
  appEnvironment: ServerEnvironment,
  issues: ConfigIssue[]
): AuthProviderKind => {
  const isDevelopment = appEnvironment === "development";
  const requested = environment.AUTH_PROVIDER?.trim();
  if (requested === undefined || requested === "") {
    return isDevelopment ? "deterministic" : "supabase";
  }
  if (!(authProviderValues as readonly string[]).includes(requested)) {
    pushIssue(
      issues,
      "INVALID_AUTH_PROVIDER",
      "AUTH_PROVIDER",
      "AUTH_PROVIDER must be deterministic or supabase."
    );
    return "supabase";
  }
  // The deterministic provider accepts credentials committed to this repository.
  // It must never authenticate a deployed request, so the gate lives here rather
  // than in a comment on the factory.
  if (requested === "deterministic" && !isDevelopment) {
    pushIssue(
      issues,
      "INVALID_AUTH_PROVIDER",
      "AUTH_PROVIDER",
      "AUTH_PROVIDER=deterministic is available only when APP_ENV=development."
    );
    return "supabase";
  }
  return requested as AuthProviderKind;
};

const readPublicOrigin = (
  environment: Record<string, string | undefined>,
  isDevelopment: boolean,
  issues: ConfigIssue[]
): string | undefined => {
  const publicOrigin =
    environment.AUTH_PUBLIC_ORIGIN?.trim() ||
    (isDevelopment ? developmentPublicOrigin : undefined);
  if (publicOrigin !== undefined && parseUrl(publicOrigin) === null) {
    pushIssue(
      issues,
      "INVALID_PUBLIC_ORIGIN",
      "AUTH_PUBLIC_ORIGIN",
      "AUTH_PUBLIC_ORIGIN must be an absolute URL."
    );
  }
  return publicOrigin;
};

const readSessionSecret = (
  environment: Record<string, string | undefined>,
  isDevelopment: boolean,
  issues: ConfigIssue[]
): string | undefined => {
  const sessionSecret =
    environment.AUTH_SESSION_SECRET?.trim() ||
    (isDevelopment ? developmentSessionSecret : undefined);
  if (sessionSecret !== undefined && sessionSecret.length < 32) {
    pushIssue(
      issues,
      "INVALID_SESSION_SECRET",
      "AUTH_SESSION_SECRET",
      "AUTH_SESSION_SECRET must be at least 32 characters."
    );
  }
  return sessionSecret;
};

const base64ByteLength = (value: string): number => {
  try {
    return Uint8Array.fromBase64(value).length;
  } catch {
    return 0;
  }
};

const readCredentialKey = (
  environment: Record<string, string | undefined>,
  isDevelopment: boolean,
  issues: ConfigIssue[]
): string | undefined => {
  const credentialKey =
    environment.AUTH_CREDENTIAL_KEY?.trim() ||
    (isDevelopment ? developmentCredentialKey : undefined);
  if (credentialKey !== undefined && base64ByteLength(credentialKey) !== 32) {
    pushIssue(
      issues,
      "INVALID_CREDENTIAL_KEY",
      "AUTH_CREDENTIAL_KEY",
      "AUTH_CREDENTIAL_KEY must be a base64-encoded 32-byte key."
    );
  }
  return credentialKey;
};

interface SupabaseSettings {
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly supabaseServiceRoleKey: string | undefined;
}

const readSupabaseSettings = (
  environment: Record<string, string | undefined>,
  issues: ConfigIssue[]
): SupabaseSettings => {
  const supabaseUrl = environment.SUPABASE_URL?.trim() || undefined;
  const supabaseAnonKey = environment.SUPABASE_ANON_KEY?.trim() || undefined;
  const supabaseServiceRoleKey =
    environment.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
  if (
    supabaseUrl !== undefined &&
    !supabaseUrlSchema.safeParse(supabaseUrl).success
  ) {
    pushIssue(
      issues,
      "INVALID_SUPABASE_URL",
      "SUPABASE_URL",
      "SUPABASE_URL must be an absolute HTTPS URL, or loopback HTTP."
    );
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
};

const readAuthConfig = (
  environment: Record<string, string | undefined>,
  appEnvironment: ServerEnvironment,
  issues: ConfigIssue[]
): AuthConfig => {
  const isDevelopment = appEnvironment === "development";
  const provider = readAuthProvider(environment, appEnvironment, issues);
  const publicOrigin = readPublicOrigin(environment, isDevelopment, issues);
  const sessionSecret = readSessionSecret(environment, isDevelopment, issues);
  const credentialKey = readCredentialKey(environment, isDevelopment, issues);
  // The cipher frames a payload as `${version}:${iv}:${tag}:${body}`, so a
  // version containing the separator would make every session unreadable.
  const credentialKeyVersion =
    environment.AUTH_CREDENTIAL_KEY_VERSION?.trim() || "1";
  if (!/^[A-Za-z0-9_-]{1,32}$/u.test(credentialKeyVersion)) {
    pushIssue(
      issues,
      "INVALID_CREDENTIAL_KEY",
      "AUTH_CREDENTIAL_KEY_VERSION",
      "AUTH_CREDENTIAL_KEY_VERSION must be 1-32 letters, digits, hyphens, or underscores."
    );
  }
  const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } =
    readSupabaseSettings(environment, issues);

  if (!isDevelopment && (!publicOrigin || !sessionSecret || !credentialKey)) {
    pushIssue(
      issues,
      "AUTH_CONFIG_REQUIRED",
      "AUTH_PROVIDER",
      "Set AUTH_PUBLIC_ORIGIN, AUTH_SESSION_SECRET, and AUTH_CREDENTIAL_KEY outside development."
    );
  }

  if (
    provider === "supabase" &&
    (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey)
  ) {
    pushIssue(
      issues,
      "AUTH_CONFIG_REQUIRED",
      "SUPABASE_URL",
      "Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY for the Supabase provider."
    );
  }

  return {
    provider,
    credentialKeyVersion,
    ...(publicOrigin && { publicOrigin }),
    ...(sessionSecret && { sessionSecret }),
    ...(credentialKey && { credentialKey }),
    ...(supabaseUrl && { supabaseUrl }),
    ...(supabaseAnonKey && { supabaseAnonKey }),
    ...(supabaseServiceRoleKey && { supabaseServiceRoleKey }),
  };
};

export const readServerConfig = (
  environment: Record<string, string | undefined> = process.env
): ServerConfig => {
  const databaseConfig = readDatabaseBootstrapConfig(environment);
  const issues: ConfigIssue[] = [...databaseConfig.issues];
  const appEnvironment = readAppEnvironment(environment, issues);
  const persistenceAdapter = readPersistenceAdapter(environment, issues);
  const sentryDsn = readSentryDsn(environment, issues);
  const openAi = readOpenAiSettings(environment, issues);
  const auth = readAuthConfig(environment, appEnvironment, issues);
  const { syntheticDataOnly, databaseUrl } = databaseConfig;

  if (!databaseUrl) {
    pushIssue(
      issues,
      "DATABASE_REQUIRED",
      "DATABASE_URL",
      "Set DATABASE_URL for PostgreSQL persistence."
    );
  }

  return {
    appEnv: appEnvironment,
    syntheticDataOnly,
    persistenceAdapter,
    ...(databaseUrl && { databaseUrl }),
    ...(sentryDsn && { sentryDsn }),
    ...(openAi.apiKey && { openAiApiKey: openAi.apiKey }),
    openAiModel: openAi.model,
    openAiBaseUrl: openAi.baseUrl,
    openAiTimeoutMs: openAi.timeoutMs,
    auth,
    issues,
  };
};

export const safeConfigSummary = (config: ServerConfig) => {
  return {
    appEnv: config.appEnv,
    syntheticDataOnly: config.syntheticDataOnly,
    persistence: config.databaseUrl
      ? ("postgres" satisfies PersistenceKind)
      : "unconfigured",
    provider: { timeoutMs: config.openAiTimeoutMs },
    auth: {
      provider: config.auth.provider,
      publicOrigin: config.auth.publicOrigin ? "configured" : "missing",
      sessionSecret: config.auth.sessionSecret ? "configured" : "missing",
      credentialKey: config.auth.credentialKey ? "configured" : "missing",
    },
    observability: {
      sentry: config.sentryDsn ? "configured" : "structured-log-only",
    },
    issues: config.issues,
  };
};
