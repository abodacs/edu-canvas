import { z } from "zod";

// The forgery-token header, defined once for the client and the server guard.
export const csrfHeaderName = "x-edu-canvas-csrf";

export const identityRoleSchema = z.enum(["teacher", "student"]);
export type IdentityRoleValue = z.infer<typeof identityRoleSchema>;

const emailSchema = z.email().trim().max(254);
const passwordSchema = z.string().min(8).max(200);

export const signInInputSchema = z
  .strictObject({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const signUpInputSchema = z
  .strictObject({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const membershipSelectionInputSchema = z
  .strictObject({
    membershipId: z.string().trim().min(1).max(80),
  })
  .strict();

export type SignInInput = z.infer<typeof signInInputSchema>;
export type SignUpInput = z.infer<typeof signUpInputSchema>;

const activeSessionProjectionSchema = z.strictObject({
  status: z.literal("active"),
  actor: z.strictObject({
    role: identityRoleSchema,
    displayName: z.string(),
    tenantId: z.string(),
    tenantName: z.string(),
    capabilities: z.array(z.string()).readonly(),
  }),
  session: z.strictObject({
    generation: z.string(),
    idleExpiresAt: z.string(),
    absoluteExpiresAt: z.string(),
  }),
});

const membershipOptionSchema = z.strictObject({
  membershipId: z.string(),
  tenantName: z.string(),
  role: identityRoleSchema,
});

const membershipRequiredProjectionSchema = z.strictObject({
  status: z.literal("membership-required"),
  memberships: z.array(membershipOptionSchema).readonly(),
  expiresAt: z.string(),
});

const verificationPendingProjectionSchema = z.strictObject({
  status: z.literal("verification-pending"),
  email: z.string(),
});

export const sessionProjectionSchema = z.discriminatedUnion("status", [
  activeSessionProjectionSchema,
  membershipRequiredProjectionSchema,
  verificationPendingProjectionSchema,
]);

export type SessionProjection = z.infer<typeof sessionProjectionSchema>;

export const continueSessionProjectionSchema = z.strictObject({
  status: z.literal("active"),
  idleExpiresAt: z.string(),
  absoluteExpiresAt: z.string(),
});

export type ContinueSessionProjection = z.infer<
  typeof continueSessionProjectionSchema
>;
