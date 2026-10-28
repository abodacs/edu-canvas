import { capabilitiesForRole } from "./types";

import type { PendingMembershipOption } from "./types";
import type { SessionProjection } from "@/shared/identity-contract";

export const idleWindowMs = 30 * 60 * 1000;
export const absoluteWindowMs = 8 * 60 * 60 * 1000;
export const pendingWindowMs = 5 * 60 * 1000;

export const idleExpiryFrom = (lastActivityAt: string): number =>
  Date.parse(lastActivityAt) + idleWindowMs;

export const projectActiveSession = (input: {
  readonly role: "teacher" | "student";
  readonly displayName: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly sessionGeneration: string;
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
}): SessionProjection => {
  return {
    status: "active",
    actor: {
      role: input.role,
      displayName: input.displayName,
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      capabilities: capabilitiesForRole(input.role),
    },
    session: {
      generation: input.sessionGeneration,
      idleExpiresAt: input.idleExpiresAt,
      absoluteExpiresAt: input.absoluteExpiresAt,
    },
  };
};

export const projectMembershipRequired = (
  memberships: readonly PendingMembershipOption[],
  expiresAt: string
): SessionProjection => {
  return {
    status: "membership-required",
    memberships: memberships.map((membership) => {
      return {
        membershipId: membership.membershipId,
        tenantName: membership.tenantName,
        role: membership.role,
      };
    }),
    expiresAt,
  };
};

export const projectVerificationPending = (
  email: string
): SessionProjection => ({ status: "verification-pending", email });
