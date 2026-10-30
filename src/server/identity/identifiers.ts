import { z } from "zod";

const idPattern = /^[A-Za-z0-9_-]{1,80}$/u;
const idMessage = "This identifier is malformed.";

const baseId = () => z.string().trim().regex(idPattern, idMessage);

/**
 * Semantic identifiers are distinct types. Brands stop a `TenantId` from being
 * passed where an `ActorId` is expected, so accidental substitution fails to
 * compile while deliberate tampering still fails the runtime ownership checks.
 */
export const actorIdSchema = baseId().brand<"ActorId">();
export type ActorId = z.infer<typeof actorIdSchema>;

export const tenantIdSchema = baseId().brand<"TenantId">();
export type TenantId = z.infer<typeof tenantIdSchema>;

export const membershipIdSchema = baseId().brand<"MembershipId">();
export type MembershipId = z.infer<typeof membershipIdSchema>;

export const classIdSchema = baseId().brand<"ClassId">();
export type ClassId = z.infer<typeof classIdSchema>;

export const learnerIdSchema = baseId().brand<"LearnerId">();
export type LearnerId = z.infer<typeof learnerIdSchema>;

/**
 * A provider subject is the identity the provider issues for a user. It is not
 * an application actor: a parsed subject proves nothing until a provider
 * binding maps it to a server-owned `ActorId`.
 */
export const providerSubjectSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .brand<"ProviderSubject">();
export type ProviderSubject = z.infer<typeof providerSubjectSchema>;

/**
Parse a persisted or external value into a branded identifier, or throw.
*/
export const parseActorId = (value: string): ActorId =>
  actorIdSchema.parse(value);
export const parseTenantId = (value: string): TenantId =>
  tenantIdSchema.parse(value);
export const parseMembershipId = (value: string): MembershipId =>
  membershipIdSchema.parse(value);
export const parseClassId = (value: string): ClassId =>
  classIdSchema.parse(value);
export const parseLearnerId = (value: string): LearnerId =>
  learnerIdSchema.parse(value);
export const parseProviderSubject = (value: string): ProviderSubject =>
  providerSubjectSchema.parse(value);
