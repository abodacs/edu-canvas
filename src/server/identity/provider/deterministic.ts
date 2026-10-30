import { randomBytes, randomUUID } from "node:crypto";

import { parseProviderSubject } from "../identifiers";
import type {
  IdentityProvider,
  ProviderAuthResult,
  ProviderRefreshOutcome,
  ProviderSessionStatus,
  ProviderSignInOutcome,
  ProviderSignUpOutcome,
} from "./port";

export interface DeterministicAccount {
  readonly email: string;
  readonly password: string;
  readonly subject: string;
  readonly emailVerified: boolean;
}

export interface DeterministicProviderOptions {
  readonly issuer?: string;
  readonly accounts?: readonly DeterministicAccount[];
  /**
  When false every call reports `unavailable`, for outage tests.
  */
  readonly available?: boolean;
}

interface StoredSession {
  subject: string;
  accessToken: string;
  refreshToken: string;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const encodeToken = (bytes: Uint8Array): string =>
  bytes.toBase64({ alphabet: "base64url", omitPadding: true });

export interface DeterministicIdentityProvider extends IdentityProvider {
  /**
   * Expire every access token issued so far while leaving the refresh tokens usable, so a test can drive the bounded internal refresh path. Test-only.
   */
  readonly expireAccessTokens: () => void;
}

/**
 * In-memory provider used by tests and explicit local development tooling. It implements the same contract as the hosted adapter, so application behavior is exercised without a live vendor. It can never supply authority to a deployed request: it is constructed only where the caller chooses it.
 */
export const createDeterministicIdentityProvider = (
  options: DeterministicProviderOptions = {}
): DeterministicIdentityProvider => {
  const issuer = options.issuer ?? "deterministic-local";
  const accounts = new Map<string, DeterministicAccount>();
  if (options.accounts !== undefined) {
    for (const account of options.accounts) {
      accounts.set(normalizeEmail(account.email), account);
    }
  }
  const sessions = new Map<string, StoredSession>();
  const expiredAccessTokens = new Set<string>();
  const available = options.available ?? true;

  const mint = (account: DeterministicAccount): ProviderAuthResult => {
    const accessToken = `dt.access.${encodeToken(randomBytes(12))}`;
    const refreshToken = `dt.refresh.${encodeToken(randomBytes(12))}`;
    sessions.set(accessToken, {
      subject: account.subject,
      accessToken,
      refreshToken,
    });
    return {
      subject: parseProviderSubject(account.subject),
      email: account.email,
      emailVerified: account.emailVerified,
      providerSessionId: randomUUID(),
      accessToken,
      refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
  };

  return {
    issuer,
    signInWithPassword: (email, password): Promise<ProviderSignInOutcome> => {
      if (!available) {
        return Promise.resolve({ status: "unavailable" });
      }
      const account = accounts.get(normalizeEmail(email));
      if (!account || account.password !== password) {
        return Promise.resolve({ status: "rejected" });
      }
      return Promise.resolve(
        account.emailVerified
          ? { status: "authenticated", auth: mint(account) }
          : { status: "email-unverified" }
      );
    },
    signUpTeacher: (email): Promise<ProviderSignUpOutcome> => {
      // New and duplicate addresses return the same verification-pending state.
      return Promise.resolve(
        available
          ? { status: "verification-pending", email }
          : { status: "unavailable" }
      );
    },
    refresh: (refreshToken): Promise<ProviderRefreshOutcome> => {
      if (!available) {
        return Promise.resolve({ status: "unavailable" });
      }
      const match = sessions
        .values()
        .find((session) => session.refreshToken === refreshToken);
      const account = match
        ? accounts
            .values()
            .find((candidate) => candidate.subject === match.subject)
        : undefined;
      return Promise.resolve(
        match && account
          ? { status: "refreshed", auth: mint(account) }
          : { status: "invalid" }
      );
    },
    signOut: (accessToken): Promise<void> => {
      sessions.delete(accessToken);
      return Promise.resolve();
    },
    verifySession: (accessToken): Promise<ProviderSessionStatus> => {
      if (!available) {
        return Promise.resolve({ status: "unavailable" });
      }
      const session = sessions.get(accessToken);
      if (!session || expiredAccessTokens.has(accessToken)) {
        return Promise.resolve({ status: "unauthorized" });
      }
      const account = accounts
        .values()
        .find((candidate) => candidate.subject === session.subject);
      return Promise.resolve({
        status: "active",
        subject: parseProviderSubject(session.subject),
        emailVerified: account?.emailVerified ?? false,
      });
    },
    expireAccessTokens: () => {
      for (const accessToken of sessions.keys()) {
        expiredAccessTokens.add(accessToken);
      }
    },
  };
};
