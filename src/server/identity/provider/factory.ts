import {
  syntheticAccounts,
  syntheticProviderIssuer,
} from "../synthetic-fixture";
import { createDeterministicIdentityProvider } from "./deterministic";
import { createSupabaseIdentityProvider } from "./supabase";

import type { IdentityProvider } from "./port";
import type { ServerConfig } from "../../config";

export const createConfiguredIdentityProvider = (
  config: ServerConfig
): IdentityProvider => {
  if (config.auth.provider === "supabase") {
    const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey } =
      config.auth;
    if (
      supabaseUrl === undefined ||
      supabaseAnonKey === undefined ||
      supabaseServiceRoleKey === undefined
    ) {
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
