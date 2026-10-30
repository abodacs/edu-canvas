import { z } from "zod";

import { IdentityError } from "./errors";
import {
  actorIdSchema,
  classIdSchema,
  learnerIdSchema,
  membershipIdSchema,
  tenantIdSchema,
} from "./identifiers";

import type {
  ActorId,
  ClassId,
  LearnerId,
  MembershipId,
  TenantId,
} from "./identifiers";
import type { IdentityPersistence } from "./persistence-port";
import type { IdentityRole } from "./types";

/**
 * Trusted provisioning principal. A deployment-managed principal or explicit test/local tooling invokes these; teacher and student web principals cannot.
 */
export interface ProvisioningPrincipal {
  readonly principal: string;
  readonly requestId: string;
}

export interface BindIdentityInput extends ProvisioningPrincipal {
  readonly providerIssuer: string;
  readonly providerSubject: string;
  readonly actorId: ActorId;
  readonly displayName: string;
}

export interface GrantMembershipInput extends ProvisioningPrincipal {
  readonly membershipId: MembershipId;
  readonly actorId: ActorId;
  readonly tenantId: TenantId;
  readonly tenantName: string;
  readonly role: IdentityRole;
  readonly learnerId?: LearnerId;
}

export interface AssignClassInput extends ProvisioningPrincipal {
  readonly membershipId: MembershipId;
  readonly classId: ClassId;
  readonly tenantId: TenantId;
}

export interface RevokeMembershipInput extends ProvisioningPrincipal {
  readonly membershipId: MembershipId;
}

export interface DisableActorInput extends ProvisioningPrincipal {
  readonly actorId: ActorId;
}

export interface ProvisioningResult<T> {
  readonly value: T;
  readonly idempotent: boolean;
}

const bindIdentitySchema = z.strictObject({
  providerIssuer: z.string().trim().min(1).max(200),
  providerSubject: z.string().trim().min(1).max(200),
  actorId: actorIdSchema,
  displayName: z.string().trim().min(1).max(200),
  principal: z.string().trim().min(1).max(200),
  requestId: z.string().trim().min(1).max(200),
});

const grantMembershipSchema = z.strictObject({
  membershipId: membershipIdSchema,
  actorId: actorIdSchema,
  tenantId: tenantIdSchema,
  tenantName: z.string().trim().min(1).max(200),
  role: z.enum(["teacher", "student"]),
  learnerId: learnerIdSchema.optional(),
  principal: z.string().trim().min(1).max(200),
  requestId: z.string().trim().min(1).max(200),
});

export interface IdentityProvisioning {
  readonly bindIdentity: (
    input: BindIdentityInput
  ) => Promise<ProvisioningResult<{ actorId: ActorId }>>;
  readonly grantMembership: (
    input: GrantMembershipInput
  ) => Promise<ProvisioningResult<{ membershipId: MembershipId }>>;
  readonly assignClass: (
    input: AssignClassInput
  ) => Promise<ProvisioningResult<{ assignment: string }>>;
  readonly revokeMembership: (
    input: RevokeMembershipInput
  ) => Promise<ProvisioningResult<{ membershipId: MembershipId }>>;
  readonly disableActor: (
    input: DisableActorInput
  ) => Promise<ProvisioningResult<{ actorId: ActorId }>>;
}

export interface IdentityProvisioningOptions {
  readonly persistence: IdentityPersistence;
  readonly clock?: () => string;
}

const nowIso = (): string => {
  const now = new Date();
  return now.toISOString();
};

export const createIdentityProvisioning = (
  options: IdentityProvisioningOptions
): IdentityProvisioning => {
  const clock = options.clock ?? nowIso;

  const audit = async (input: {
    operation: string;
    principal: string;
    targetId: string;
    result: string;
    requestId: string;
  }): Promise<void> => {
    await options.persistence.appendProvisioningAudit({
      ...input,
      at: clock(),
    });
  };

  return {
    bindIdentity: async (input) => {
      const parsed = bindIdentitySchema.parse(input);
      const existing = await options.persistence.findProviderBinding(
        parsed.providerIssuer,
        parsed.providerSubject
      );
      if (existing) {
        if (existing.actorId !== parsed.actorId) {
          await audit({
            operation: "bindIdentity",
            principal: parsed.principal,
            targetId: parsed.actorId,
            result: "conflict",
            requestId: parsed.requestId,
          });
          throw new IdentityError("CONFLICT");
        }
        return { value: { actorId: parsed.actorId }, idempotent: true };
      }

      await options.persistence.createActor({
        actorId: parsed.actorId,
        displayName: parsed.displayName,
      });
      await options.persistence.createProviderBinding({
        providerIssuer: parsed.providerIssuer,
        providerSubject: parsed.providerSubject,
        actorId: parsed.actorId,
        createdAt: clock(),
      });
      await audit({
        operation: "bindIdentity",
        principal: parsed.principal,
        targetId: parsed.actorId,
        result: "created",
        requestId: parsed.requestId,
      });
      return { value: { actorId: parsed.actorId }, idempotent: false };
    },

    grantMembership: async (input) => {
      const parsed = grantMembershipSchema.parse(input);
      await options.persistence.grantMembership({
        membershipId: parsed.membershipId,
        actorId: parsed.actorId,
        tenantId: parsed.tenantId,
        tenantName: parsed.tenantName,
        role: parsed.role,
        ...(parsed.learnerId && { learnerId: parsed.learnerId }),
      });
      await audit({
        operation: "grantMembership",
        principal: parsed.principal,
        targetId: parsed.membershipId,
        result: "created",
        requestId: parsed.requestId,
      });
      return {
        value: { membershipId: parsed.membershipId },
        idempotent: false,
      };
    },

    assignClass: async (input) => {
      const parsed = z
        .strictObject({
          membershipId: membershipIdSchema,
          classId: classIdSchema,
          tenantId: tenantIdSchema,
          principal: z.string().trim().min(1).max(200),
          requestId: z.string().trim().min(1).max(200),
        })
        .parse(input);
      await options.persistence.assignClass({
        membershipId: parsed.membershipId,
        classId: parsed.classId,
        tenantId: parsed.tenantId,
      });
      await audit({
        operation: "assignClass",
        principal: parsed.principal,
        targetId: `${parsed.membershipId}:${parsed.classId}`,
        result: "created",
        requestId: parsed.requestId,
      });
      return {
        value: { assignment: `${parsed.membershipId}:${parsed.classId}` },
        idempotent: false,
      };
    },

    revokeMembership: async (input) => {
      const parsed = z
        .strictObject({
          membershipId: membershipIdSchema,
          principal: z.string().trim().min(1).max(200),
          requestId: z.string().trim().min(1).max(200),
        })
        .parse(input);
      const revoked = await options.persistence.revokeMembership(
        parsed.membershipId
      );
      await audit({
        operation: "revokeMembership",
        principal: parsed.principal,
        targetId: parsed.membershipId,
        result: revoked ? "revoked" : "noop",
        requestId: parsed.requestId,
      });
      return {
        value: { membershipId: parsed.membershipId },
        idempotent: !revoked,
      };
    },

    disableActor: async (input) => {
      const parsed = z
        .strictObject({
          actorId: actorIdSchema,
          principal: z.string().trim().min(1).max(200),
          requestId: z.string().trim().min(1).max(200),
        })
        .parse(input);
      const disabled = await options.persistence.disableActor(parsed.actorId);
      await audit({
        operation: "disableActor",
        principal: parsed.principal,
        targetId: parsed.actorId,
        result: disabled ? "disabled" : "noop",
        requestId: parsed.requestId,
      });
      return { value: { actorId: parsed.actorId }, idempotent: !disabled };
    },
  };
};
