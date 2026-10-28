import { z } from "zod";

const idPattern = /^[A-Za-z0-9_-]{1,80}$/u;
const idMessage = "This identifier is malformed.";

/**
 * Semantic identifiers are distinct types. Brands stop a `TenantId` from being
 * passed where an `ActorId` is expected, so accidental substitution fails to
 * compile while deliberate tampering still fails the runtime ownership checks.
 */
export const actorIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"ActorId">();
export type ActorId = z.infer<typeof actorIdSchema>;

export const tenantIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"TenantId">();
export type TenantId = z.infer<typeof tenantIdSchema>;

export const membershipIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"MembershipId">();
export type MembershipId = z.infer<typeof membershipIdSchema>;

export const classIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"ClassId">();
export type ClassId = z.infer<typeof classIdSchema>;

export const learnerIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"LearnerId">();
export type LearnerId = z.infer<typeof learnerIdSchema>;

export const sessionIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"SessionId">();
export type SessionId = z.infer<typeof sessionIdSchema>;

export const draftIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"DraftId">();
export type DraftId = z.infer<typeof draftIdSchema>;

export const publicationIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"PublicationId">();
export type PublicationId = z.infer<typeof publicationIdSchema>;

export const activityVersionIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"ActivityVersionId">();
export type ActivityVersionId = z.infer<typeof activityVersionIdSchema>;

export const attemptIdSchema = z
  .string()
  .trim()
  .regex(idPattern, idMessage)
  .brand<"AttemptId">();
export type AttemptId = z.infer<typeof attemptIdSchema>;

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

export const providerIssuerSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .brand<"ProviderIssuer">();
export type ProviderIssuer = z.infer<typeof providerIssuerSchema>;

/**
Parse a persisted or external value into an `ActorId`, or throw a ZodError.
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
export const parseSessionId = (value: string): SessionId =>
  sessionIdSchema.parse(value);
export const parseProviderSubject = (value: string): ProviderSubject =>
  providerSubjectSchema.parse(value);
