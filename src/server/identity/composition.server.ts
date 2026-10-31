import { readServerConfig } from "../config";
import { createIdentityPersistence } from "../persistence";
import { createCredentialCipher } from "./cipher";
import { createConfiguredIdentityProvider } from "./provider/factory";
import { createRateLimiter } from "./rate-limit";
import { createIdentityService } from "./service";
import { ensureSyntheticIdentityFixture } from "./synthetic-fixture";

import type { ServerConfig } from "../config";
import type { IdentityPersistence } from "./persistence-port";
import type { IdentityService } from "./service";

const sharedRateLimiter = createRateLimiter();

export interface ConfiguredIdentity {
  readonly service: IdentityService;
  readonly sessionSecret: string;
  readonly publicOrigin: string;
}

/**
 * The composition root is memoized per configuration identity. The deterministic provider keeps provider sessions in memory, so a fresh instance per request would forget them; the hosted adapter is stateless but memoizing it keeps one client.
 */
const configuredCache = new Map<string, Promise<ConfiguredIdentity>>();
const injectedCache = new WeakMap<
  IdentityPersistence,
  Promise<ConfiguredIdentity>
>();

const cacheKey = (config: ServerConfig): string => {
  return [config.auth.provider, config.appEnv, config.databaseUrl ?? ""].join(
    ":"
  );
};

export interface ConfiguredIdentityOptions {
  readonly identityPersistence?: IdentityPersistence;
}

const build = async (
  config: ServerConfig,
  options: ConfiguredIdentityOptions = {}
): Promise<ConfiguredIdentity> => {
  if (config.issues.length > 0) {
    throw new Error("Authentication configuration is invalid.");
  }

  const { auth } = config;
  if (!auth.sessionSecret || !auth.credentialKey || !auth.publicOrigin) {
    throw new Error("Authentication secrets and public origin are required.");
  }

  const persistence =
    options.identityPersistence ?? createIdentityPersistence(config);
  if (auth.provider === "deterministic") {
    await ensureSyntheticIdentityFixture(persistence);
  }

  const cipher = createCredentialCipher({
    keyVersion: auth.credentialKeyVersion,
    keys: { [auth.credentialKeyVersion]: auth.credentialKey },
  });

  const service = createIdentityService({
    persistence,
    provider: createConfiguredIdentityProvider(config),
    cipher,
    rateLimiter: sharedRateLimiter,
    correlationSecret: auth.sessionSecret,
  });

  return {
    service,
    sessionSecret: auth.sessionSecret,
    publicOrigin: auth.publicOrigin,
  };
};

export const createConfiguredIdentity = (
  config: ServerConfig = readServerConfig(),
  options: ConfiguredIdentityOptions = {}
): Promise<ConfiguredIdentity> => {
  if (options.identityPersistence) {
    const existing = injectedCache.get(options.identityPersistence);
    if (existing) {
      return existing;
    }
    const created = build(config, options);
    injectedCache.set(options.identityPersistence, created);
    return created;
  }
  const key = cacheKey(config);
  const existing = configuredCache.get(key);
  if (existing) {
    return existing;
  }
  const created = build(config);
  configuredCache.set(key, created);
  return created;
};

/**
Test-only: drop memoized instances so fixtures can be rebuilt.
*/
export const resetConfiguredIdentityCache = (): void => {
  configuredCache.clear();
  sharedRateLimiter.reset();
};
