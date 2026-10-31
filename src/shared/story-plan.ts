import { z } from "zod";

/**
 * A story plan is the forward learner narrative of one accepted prerequisite path. It is a pure projection: every beat is assembled from approved path or curriculum copy. The builder never calls a model, never reads the clock, and never invents a sentence. See issue #19.
 */
export const STORY_PLAN_VERSION = "story-v1" as const;

export const storyLanguageSchema = z.enum(["en", "ar"]);

export type StoryLanguage = z.infer<typeof storyLanguageSchema>;

export const storyBeatRoleSchema = z.enum(["prerequisite", "hinge", "target"]);

export type StoryBeatRole = z.infer<typeof storyBeatRoleSchema>;

const MAXIMUM_STORY_BEATS = 16;

const storyBeatSchema = z.strictObject({
  id: z.string().trim().min(1).max(120),
  position: z.number().int().min(1).max(MAXIMUM_STORY_BEATS),
  role: storyBeatRoleSchema,
  label: z.string().trim().min(1).max(240),
  narrative: z.string().trim().min(1).max(500),
  screenPurposeId: z.string().trim().min(1).max(120),
  screenPurpose: z.string().trim().min(1).max(500),
  learnerAction: z.string().trim().min(1).max(240),
  transition: z.string().trim().min(1).max(500),
  reveal: z.boolean(),
  accessibility: z.strictObject({
    announcement: z.string().trim().min(1).max(500),
    reducedMotionSafe: z.literal(true),
  }),
});

export const storyPlanSchema = z.strictObject({
  version: z.literal(STORY_PLAN_VERSION),
  language: storyLanguageSchema,
  direction: z.enum(["ltr", "rtl"]),
  heading: z.string().trim().min(1).max(120),
  connectionExplanation: z.string().trim().min(1).max(240),
  beats: z.array(storyBeatSchema).min(2).max(MAXIMUM_STORY_BEATS),
  versionPins: z.strictObject({
    draftId: z.string().trim().min(1).max(120),
    graphVersion: z.string().trim().min(1).max(120),
    catalogVersion: z.string().trim().min(1).max(120),
    modelVersion: z.string().trim().min(1).max(120),
    validatorVersion: z.string().trim().min(1).max(120),
    storyPlanVersion: z.literal(STORY_PLAN_VERSION),
  }),
});

export type StoryBeat = z.infer<typeof storyBeatSchema>;
export type StoryPlan = z.infer<typeof storyPlanSchema>;

/**
The accepted path that a story plan retells.
*/
export interface StoryPlanSource {
  readonly direction: "forward";
  readonly steps: readonly {
    readonly nodeId: string;
    readonly label: string;
    readonly role: "prerequisite" | "target";
    readonly screenPurposeId: string;
    readonly screenPurpose: string;
  }[];
  readonly rationale: string;
  readonly nextScreenRationale: string;
  readonly versionPins: {
    readonly draftId: string;
    readonly graphVersion: string;
    readonly catalogVersion: string;
    readonly modelVersion: string;
    readonly validatorVersion: string;
  };
}

export interface StoryPlanBuildInput {
  readonly path: StoryPlanSource;
  readonly language: StoryLanguage;
  readonly learnerAction: string;
}

export type StoryPlanBuildErrorCode =
  "STORY_PATH_TOO_SHORT" | "STORY_SOURCE_COPY_EMPTY";

export class StoryPlanBuildError extends Error {
  readonly code: StoryPlanBuildErrorCode;

  constructor(
    code: StoryPlanBuildErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.code = code;
    this.name = "StoryPlanBuildError";
  }
}

const storyCopy = {
  en: {
    direction: "ltr",
    heading: "Forward learner story",
    connection: "Connection reveal",
  },
  ar: {
    direction: "rtl",
    heading: "قصة المتعلم",
    connection: "كشف الارتباط",
  },
} as const satisfies Record<
  StoryLanguage,
  { direction: "ltr" | "rtl"; heading: string; connection: string }
>;

// The connection explanation is one clause of the approved path rationale. The
// split keeps every word and only drops the leading premise, because beat one
// already states it. When no connective is present the whole rationale is used.
const connectionConnectives = {
  en: ["in order to", "so that", "because", "so"],
  ar: ["حتى", "لكي"],
} as const satisfies Record<StoryLanguage, readonly string[]>;

const sentenceCase = (value: string, language: StoryLanguage): string =>
  language === "ar" ? value : value.charAt(0).toUpperCase() + value.slice(1);

const collapseWhitespace = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ");

interface ConnectiveMatch {
  readonly start: number;
  readonly end: number;
}

const findConnectiveEnd = (
  value: string,
  language: StoryLanguage
): number | undefined => {
  const haystack = language === "ar" ? value : value.toLowerCase();
  const connectives = connectionConnectives[language];
  let best: ConnectiveMatch | undefined;

  for (const connective of connectives) {
    const needle =
      language === "ar" ? ` ${connective} ` : ` ${connective.toLowerCase()} `;
    const start = haystack.indexOf(needle);
    const found =
      start === -1 ? undefined : { start, end: start + needle.length };
    const isEarlier =
      found !== undefined && (!best || found.start < best.start);
    const isSameStartButLonger =
      found !== undefined &&
      best !== undefined &&
      found.start === best.start &&
      found.end > best.end;

    if (found && (isEarlier || isSameStartButLonger)) {
      best = found;
    }
  }

  return best?.end;
};

export const extractConnectionExplanation = (
  rationale: string,
  language: StoryLanguage
): string => {
  const normalized = collapseWhitespace(rationale);
  const end = findConnectiveEnd(normalized, language);
  if (end === undefined) {
    return normalized;
  }

  const clause = normalized.slice(end).trim();
  return clause ? sentenceCase(clause, language) : normalized;
};

interface BeatDraft {
  readonly role: StoryBeatRole;
  readonly label: string;
  readonly narrative: string;
  readonly screenPurposeId: string;
  readonly screenPurpose: string;
}

const MINIMUM_STORY_STEPS = 2;

const assertStorySourceCopy = (path: StoryPlanSource): void => {
  const hasEmptyCopy =
    !path.rationale.trim() ||
    !path.nextScreenRationale.trim() ||
    path.steps.some((step) => {
      return (
        !step.label.trim() ||
        !step.screenPurpose.trim() ||
        !step.screenPurposeId.trim()
      );
    });

  if (hasEmptyCopy) {
    throw new StoryPlanBuildError(
      "STORY_SOURCE_COPY_EMPTY",
      "The accepted path is missing copy that a story beat needs."
    );
  }
};

const buildBeatDrafts = (
  path: StoryPlanSource,
  connectionLabel: string,
  connectionExplanation: string
): BeatDraft[] => {
  const screenDrafts: BeatDraft[] = path.steps.map((step) => {
    return {
      role: step.role,
      label: step.label,
      narrative: step.screenPurpose,
      screenPurposeId: step.screenPurposeId,
      screenPurpose: step.screenPurpose,
    };
  });

  const targetStep = screenDrafts.at(-1);
  if (!targetStep) {
    throw new StoryPlanBuildError(
      "STORY_PATH_TOO_SHORT",
      "A story plan needs at least one approved prerequisite step."
    );
  }

  // The hinge carries the approved connection clause. It happens on the target
  // screen, so it shares that screen's purpose instead of inventing one.
  const hinge: BeatDraft = {
    role: "hinge",
    label: connectionLabel,
    narrative: connectionExplanation,
    screenPurposeId: targetStep.screenPurposeId,
    screenPurpose: targetStep.screenPurpose,
  };

  return [...screenDrafts.slice(0, -1), hinge, targetStep];
};

export const buildStoryPlan = ({
  path,
  language,
  learnerAction,
}: StoryPlanBuildInput): StoryPlan => {
  if (path.steps.length < MINIMUM_STORY_STEPS) {
    throw new StoryPlanBuildError(
      "STORY_PATH_TOO_SHORT",
      "A story plan needs at least one approved prerequisite step."
    );
  }

  assertStorySourceCopy(path);

  const copy = storyCopy[language];
  const connectionExplanation = extractConnectionExplanation(
    path.rationale,
    language
  );
  const nextScreenRationale = collapseWhitespace(path.nextScreenRationale);
  const drafts = buildBeatDrafts(path, copy.connection, connectionExplanation);

  const beats: StoryBeat[] = drafts.map((draft, index) => {
    const next = drafts[index + 1];
    const transition = next?.label ?? nextScreenRationale;

    return {
      id: `story-beat-${index + 1}`,
      position: index + 1,
      ...draft,
      learnerAction,
      transition,
      reveal: draft.role === "hinge",
      accessibility: {
        announcement: `${index + 1}. ${draft.label}. ${draft.narrative}`,
        reducedMotionSafe: true,
      },
    };
  });

  return {
    version: STORY_PLAN_VERSION,
    language,
    direction: copy.direction,
    heading: copy.heading,
    connectionExplanation,
    beats,
    versionPins: {
      ...path.versionPins,
      storyPlanVersion: STORY_PLAN_VERSION,
    },
  };
};
