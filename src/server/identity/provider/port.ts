import type { ProviderSubject } from "../identifiers";

export interface ProviderAuthResult {
  readonly subject: ProviderSubject;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly providerSessionId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
}

export type ProviderSignInOutcome =
  | { readonly status: "authenticated"; readonly auth: ProviderAuthResult }
  | { readonly status: "rejected" }
  | { readonly status: "email-unverified" }
  | { readonly status: "unavailable" };

export type ProviderSignUpOutcome =
  | { readonly status: "verification-pending"; readonly email: string }
  | { readonly status: "unavailable" };

export type ProviderRefreshOutcome =
  | { readonly status: "refreshed"; readonly auth: ProviderAuthResult }
  | { readonly status: "invalid" }
  | { readonly status: "unavailable" };

export type ProviderSessionStatus =
  | {
      readonly status: "active";
      readonly subject: ProviderSubject;
      readonly emailVerified: boolean;
    }
  | { readonly status: "unauthorized" }
  | { readonly status: "unavailable" };

export interface IdentityProvider {
  readonly issuer: string;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<ProviderSignInOutcome>;
  signUpTeacher: (
    email: string,
    password: string
  ) => Promise<ProviderSignUpOutcome>;
  refresh: (refreshToken: string) => Promise<ProviderRefreshOutcome>;
  signOut: (accessToken: string) => Promise<void>;
  verifySession: (accessToken: string) => Promise<ProviderSessionStatus>;
}
