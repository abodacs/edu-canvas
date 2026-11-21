import { syntheticSeed } from "../seed-data";
import type { ModerationCategory } from "@/shared/generation-contract";

export const MODERATION_BLOCKED_CODE = "MODERATION_BLOCKED";

export type ReportedModerationCategory = ModerationCategory | "none";

export interface ContentSafetyResult {
  allowed: boolean;
  category: ReportedModerationCategory;
  code: typeof MODERATION_BLOCKED_CODE | null;
  ruleSetVersion: string;
}

export interface ContentSafety {
  checkPrompt: (prompt: string) => ContentSafetyResult;
  checkGeneratedContent: (content: unknown) => ContentSafetyResult;
  checkSourceText: (text: string) => ContentSafetyResult;
}

const unsafeMarkupPatterns: readonly RegExp[] = [
  /<\s*\/?(?:script|iframe|object|embed|svg|form|style|link|meta)\b/iu,
  /\bon(?:error|load|click|focus|submit|mouse\w+)\s*=/iu,
  /javascript\s*:/iu,
  /data\s*:\s*text\/html/iu,
];

const injectionVerbs = "ignore|disregard|forget|override|bypass";
const injectionTargets =
  "instructions?|rules?|prompts?|guidelines?|guardrails?|restrictions?";

const injectionPattern = (qualifiers: string): RegExp => {
  return new RegExp(
    `\\b(?:${injectionVerbs})\\s+${qualifiers}(?:${injectionTargets})\\b`,
    "iu"
  );
};

const promptInjectionPatterns: readonly RegExp[] = [
  injectionPattern(""),
  injectionPattern("\\w+\\s+"),
  injectionPattern("\\w+\\s+\\w+\\s+"),
  /\bsystem\s+(?:prompt|message|instructions?)\b/iu,
  /\b(?:api|secret|access)\s+key\b/iu,
  /\b(?:jailbreak|do\s+anything\s+now|dan\s+mode|developer\s+mode)\b/iu,
  /\b(?:act|behave|respond)\s+as\s+(?:an?\s+)?(?:unrestricted|unfiltered|uncensored)\b/iu,
  /\b(?:reveal|print|show|repeat)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)\b/iu,
];

const harmfulContentPatterns: readonly RegExp[] = [
  /\b(?:child|minor|underage)\s+(?:porn(?:ography)?|sex(?:ual)?\s+(?:content|images?|acts?))\b/iu,
  /\bcsam\b/iu,
  /\b(?:porn(?:ography)?|hentai)\b/iu,
  /\bhow\s+to\s+(?:kill|murder|poison)\b/iu,
  /\b(?:make|build|assemble)\s+(?:a|an)\s+(?:bomb|explosive|gun|silencer)\b/iu,
  /\b(?:pipe|nail|car|suicide)\s+bomb\b/iu,
  /\b(?:mass\s+shooting|school\s+shooting|ethnic\s+cleansing)\b/iu,
  /\b(?:kill|hurt|harm)\s+(?:myself|herself|himself|themselves)\b/iu,
  /\b(?:suicide|self-harm)\s+(?:method|note|plan|how)\b/iu,
  /\bhow\s+to\s+(?:self-harm|cut\s+myself|end\s+my\s+life)\b/iu,
  /\b(?:make|synthesi[sz]e|cook)\s+(?:meth|methamphetamine|fentanyl|heroin)\b/iu,
  /\b(?:sexual|explicit)\s+(?:content|material|images?)\s+(?:involving|with|of)\s+(?:a\s+)?(?:minor|child|student)\b/iu,
  /\bhit\s*list\b/iu,
  /\b(?:sexual|romantic)\s+(?:relationship|contact|messages?)\s+with\s+(?:a\s+)?(?:student|child|minor)\b/iu,
  /\b(?:hit|beat|punch|slap)\s+(?:a\s+)?(?:student|child|pupil)\b/iu,
];

const emailPattern =
  /\b[\w.!#$%&'*+/=?^`{|}~-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+\b/u;

const phonePattern = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/u;

const studentIdentifierPattern =
  /\b(?:student|pupil|learner|child)[\s_-]{0,3}(?:id|number|no\.?|#)[\s:=#-]{0,3}(?=[a-z0-9-]*\d)[a-z0-9-]{2,}\b/iu;

const bareIdentifierPattern = /\bID[\s:=#]{0,3}\d{3,}\b/u;

const reviewedFirstNames: readonly string[] = [
  "Aaliyah",
  "Abigail",
  "Adeline",
  "Aisha",
  "Alexa",
  "Alice",
  "Allison",
  "Amara",
  "Amelia",
  "Anna",
  "Aria",
  "Ariana",
  "Ayesha",
  "Bella",
  "Bilal",
  "Camila",
  "Caroline",
  "Charlotte",
  "Chloe",
  "Clara",
  "Cora",
  "Dina",
  "Eleanor",
  "Elena",
  "Eliana",
  "Elizabeth",
  "Ella",
  "Ellie",
  "Emily",
  "Emma",
  "Eva",
  "Evelyn",
  "Farah",
  "Fatima",
  "Gabriella",
  "Gianna",
  "Hamza",
  "Hana",
  "Hannah",
  "Harper",
  "Hassan",
  "Hazel",
  "Ibrahim",
  "Isabella",
  "Isabelle",
  "Jamil",
  "Julia",
  "Karim",
  "Kaylee",
  "Khalid",
  "Layla",
  "Leah",
  "Leila",
  "Lillian",
  "Lily",
  "Luna",
  "Lydia",
  "Madelyn",
  "Maya",
  "Mia",
  "Mila",
  "Nabil",
  "Nadia",
  "Naomi",
  "Natalie",
  "Nevaeh",
  "Noor",
  "Nora",
  "Olivia",
  "Omar",
  "Penelope",
  "Peyton",
  "Quinn",
  "Rania",
  "Rashid",
  "Riley",
  "Sadie",
  "Sami",
  "Samir",
  "Sarah",
  "Savannah",
  "Scarlett",
  "Serenity",
  "Skylar",
  "Sofia",
  "Sophia",
  "Stella",
  "Tariq",
  "Valentina",
  "Victoria",
  "Vivian",
  "Yusuf",
  "Zainab",
  "Zara",
  "Zoe",
  "Zoey",
];

const escapeRegExp = (value: string): string => RegExp.escape(value);

const rosterNamePatterns: readonly RegExp[] = syntheticSeed.identities
  .flatMap((identity) => {
    return identity.role === "student"
      ? [identity.displayName, identity.demoHandle]
      : [];
  })
  .map((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "iu"));

const reviewedNamePatterns: readonly RegExp[] = reviewedFirstNames.map(
  (name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "iu")
);

const structuralPersonalDataPatterns: readonly RegExp[] = [
  emailPattern,
  phonePattern,
  studentIdentifierPattern,
  bareIdentifierPattern,
];

const namedPersonalDataPatterns: readonly RegExp[] = [
  ...structuralPersonalDataPatterns,
  ...rosterNamePatterns,
  ...reviewedNamePatterns,
];

interface CategoryRules {
  category: ModerationCategory;
  patterns: readonly RegExp[];
}

const categoryRules: readonly CategoryRules[] = [
  { category: "personal-data", patterns: namedPersonalDataPatterns },
  { category: "harmful-content", patterns: harmfulContentPatterns },
  { category: "prompt-injection", patterns: promptInjectionPatterns },
  { category: "unsafe-markup", patterns: unsafeMarkupPatterns },
];

const HASH_MODULUS = 2_147_483_647;
const HASH_MULTIPLIER = 31;
const HASH_WIDTH = 16;
const RULE_SET_VERSION_PREFIX = "moderation-rules-v1";

const fingerprint = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash =
      (hash * HASH_MULTIPLIER + (value.codePointAt(index) ?? 0)) % HASH_MODULUS;
  }
  return hash.toString(HASH_WIDTH);
};

const ruleSetParts: string[] = [];
for (const rule of categoryRules) {
  for (const pattern of rule.patterns) {
    ruleSetParts.push(`${rule.category}:${pattern.source}:${pattern.flags}`);
  }
}

const ruleSetSignature = ruleSetParts.join("\0");

export const MODERATION_RULE_SET_VERSION = `${RULE_SET_VERSION_PREFIX}+${fingerprint(
  ruleSetSignature
)}`;

export const allowedSafetyResult = (): ContentSafetyResult => {
  return {
    allowed: true,
    category: "none",
    code: null,
    ruleSetVersion: MODERATION_RULE_SET_VERSION,
  };
};

export const blockedSafetyResult = (
  category: ModerationCategory
): ContentSafetyResult => {
  return {
    allowed: false,
    category,
    code: MODERATION_BLOCKED_CODE,
    ruleSetVersion: MODERATION_RULE_SET_VERSION,
  };
};

const patternsFor = (
  rule: CategoryRules,
  shouldScreenNames: boolean
): readonly RegExp[] => {
  return shouldScreenNames || rule.category !== "personal-data"
    ? rule.patterns
    : structuralPersonalDataPatterns;
};

const classify = (
  value: string,
  shouldScreenNames: boolean
): ReportedModerationCategory => {
  for (const rule of categoryRules) {
    const patterns = patternsFor(rule, shouldScreenNames);
    if (patterns.some((pattern) => pattern.test(value))) {
      return rule.category;
    }
  }

  return "none";
};

const asText = (value: string | undefined = ""): string => value;

const serialize = (content: unknown): string | null => {
  try {
    return asText(JSON.stringify(content));
  } catch {
    return null;
  }
};

const screen = (
  value: string,
  shouldScreenNames: boolean
): ContentSafetyResult => {
  const category = classify(value, shouldScreenNames);
  return category === "none"
    ? allowedSafetyResult()
    : blockedSafetyResult(category);
};

export const createDefaultContentSafety = (): ContentSafety => {
  return {
    checkPrompt: (prompt) => screen(prompt, true),
    checkGeneratedContent(content) {
      const text = serialize(content);
      return text === null
        ? blockedSafetyResult("unserializable")
        : screen(text, false);
    },
    checkSourceText: (text) => screen(text, true),
  };
};

export { moderationCategoryValues } from "@/shared/generation-contract";
