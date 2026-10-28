import {
  syntheticAccounts,
  syntheticProviderIssuer,
} from "../synthetic-fixture";
import { createDeterministicIdentityProvider } from "./deterministic";
import { createSupabaseIdentityProvider } from "./supabase";

import type { IdentityProvider } from "./port";
import type { ServerConfig } from "../../config";

/**
 * Selects the provider behind the application-owned contract. The deterministic
 * provider is only reachable in development (config enforces the hosted
 * provider in preview and production), so it can never back a deployed request.
 */
export const createConfiguredIdentityProvider = (
  config: ServerConfig
): IdentityProvider => {
  if (config.auth.provider === "supabase") {
    const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } =
      config.auth;
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error(
        "The Supabase provider is selected without complete configuration."
      );
    }
    return createSupabaseIdentityProvider({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
    });
  }

  return createDeterministicIdentityProvider({
    issuer: syntheticProviderIssuer,
    accounts: syntheticAccounts,
  });
};
