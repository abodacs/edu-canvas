import { syntheticSeed } from "../seed-data";

/**
The deterministic safety seam every provider-boundary check goes through
(#114; #132 owns the upgrade to `{ allowed, category, code }`). Generation
screens prompts and generated content; grounding screens extracted and
corrected source text before anything is persisted or sent onward.
*/

export interface ContentSafetyResult {
  allowed: boolean;
}

export interface ContentSafety {
  checkPrompt: (prompt: string) => ContentSafetyResult;
  checkGeneratedContent: (content: unknown) => ContentSafetyResult;
  /**
  Source material (uploaded extraction or corrected text) is untrusted data,
  never authority. Screening also catches synthetic personal data so a blocked
  source never persists text and never reaches preview (UC5).
  */
  checkSourceText: (text: string) => ContentSafetyResult;
}

const unsafeContentPatterns = [
  /<\s*\/?(?:script|iframe|object|embed)/iu,
  /javascript\s*:/iu,
  /ignore\s+(?:all|any|the|previous)\s+instructions/iu,
  /\b(?:api|secret|access)\s+key\b/iu,
];

const hasUnsafeContent = (value: string): boolean =>
  unsafeContentPatterns.some((pattern) => pattern.test(value));

const emailPattern = /\b[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+\b/u;

const escapeRegExp = (value: string): string => RegExp.escape(value);

/**
Synthetic personal data is only detectable deterministically against the known synthetic roster: student display names, demo handles, and any email shape.
Real-people detection is #132 scope; this stays honest about what it screens.
*/
const personalDataPatterns: readonly RegExp[] = [
  emailPattern,
  ...syntheticSeed.identities
    .flatMap((identity) => {
      return identity.role === "student"
        ? [identity.displayName, identity.demoHandle]
        : [];
    })
    .map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "iu")),
];

const hasPersonalData = (value: string): boolean =>
  personalDataPatterns.some((pattern) => pattern.test(value));

export const createDefaultContentSafety = (): ContentSafety => {
  return {
    checkPrompt: (prompt) => {
      return {
        allowed: !hasUnsafeContent(prompt) && !hasPersonalData(prompt),
      };
    },
    checkGeneratedContent(content) {
      let text: string;
      try {
        text = JSON.stringify(content);
      } catch {
        return { allowed: false };
      }
      return { allowed: !hasUnsafeContent(text) };
    },
    checkSourceText: (text) => {
      return {
        allowed: !hasUnsafeContent(text) && !hasPersonalData(text),
      };
    },
  };
};
