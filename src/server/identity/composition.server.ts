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

const configuredCache = new Map<string, Promise<ConfiguredIdentity>>();

const cacheKey = (config: ServerConfig): string => {
  return [config.auth.provider, config.appEnv, config.databaseUrl ?? ""].join(
    ":"
  );
};

export const buildConfiguredIdentity = async (
  config: ServerConfig,
  persistence: IdentityPersistence
): Promise<ConfiguredIdentity> => {
  if (config.issues.length > 0) {
    throw new Error("Authentication configuration is invalid.");
  }

  const { auth } = config;
  if (
    auth.sessionSecret === undefined ||
    auth.credentialKey === undefined ||
    auth.publicOrigin === undefined
  ) {
    throw new Error("Authentication secrets and public origin are required.");
  }

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

export const createConfiguredIdentity = async (
  config: ServerConfig = readServerConfig()
): Promise<ConfiguredIdentity> => {
  const key = cacheKey(config);
  const existing = configuredCache.get(key);
  if (existing) {
    return await existing;
  }
  const created = buildConfiguredIdentity(
    config,
    createIdentityPersistence(config)
  );
  configuredCache.set(key, created);
  return await created;
};

export const resetConfiguredIdentityCache = (): void => {
  configuredCache.clear();
  sharedRateLimiter.reset();
};

export const resetSharedRateLimiter = (): void => {
  sharedRateLimiter.reset();
};
