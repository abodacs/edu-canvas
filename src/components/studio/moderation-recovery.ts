import type { ModerationCategory } from "@/shared/generation-contract";

/**
#119: the teacher-facing copy for a moderation block. One source of truth for the panel; the reason names the category, never the matched phrase, a provider reason, or an internal diagnostic code.

The copy never says "try again", "retry", "resubmit", or "same request": moderation copy must not offer the unchanged request a second time.
*/

export const MODERATION_RECOVERY_TITLE = "Let’s reshape that request.";

export const REVISE_REQUEST_LABEL = "Revise request";

export const GENERIC_MODERATION_REASON =
  "This request was blocked by safety review. Describe the fraction goal in different words.";

interface CategoryCopy {
  readonly label: string;
  readonly reason: string;
}

const CATEGORY_COPY: Readonly<Record<ModerationCategory, CategoryCopy>> = {
  "personal-data": {
    label: "Information about a real person",
    reason:
      "This request seems to include information about a real person, such as a name, email address, or student identifier. Lesson requests use made-up examples. Describe the fraction goal instead.",
  },
  "harmful-content": {
    label: "Content that could harm students",
    reason:
      "This request seems to ask for content that could harm students. Describe the Grade 4 fraction goal and a safe classroom example instead.",
  },
  "prompt-injection": {
    label: "Instructions aimed at the system",
    reason:
      "This request seems to include instructions aimed at the lesson system rather than a classroom goal. Describe the fraction goal and how students should practice it.",
  },
  "unsafe-markup": {
    label: "Embedded markup or code",
    reason:
      "This request seems to include markup or code. Lesson requests use plain classroom language. Describe the fraction goal in plain words.",
  },
  unserializable: {
    label: "Content that could not be checked",
    reason: GENERIC_MODERATION_REASON,
  },
};

export interface ModerationRecoveryInput {
  readonly category?: ModerationCategory | null;
  readonly requestId?: string | null;
}

export interface ModerationRecovery {
  readonly title: string;
  readonly reason: string;
  readonly category: ModerationCategory | null;
  readonly categoryLabel: string | null;
  readonly categoryReference: string | null;
  readonly requestReference: string | null;
  readonly actionLabel: string;
}

/**
Build the panel model. A missing category keeps the generic sentence and hides the category reference, so an older server or the same-prompt error path still renders a complete panel.
*/
export const resolveModerationRecovery = (
  input: ModerationRecoveryInput = {}
): ModerationRecovery => {
  const category = input.category ?? null;
  const copy = category ? CATEGORY_COPY[category] : null;
  const requestId = input.requestId ?? null;

  return {
    title: MODERATION_RECOVERY_TITLE,
    reason: copy?.reason ?? GENERIC_MODERATION_REASON,
    category,
    categoryLabel: copy?.label ?? null,
    categoryReference:
      copy && category ? `Category: ${copy.label} (${category}).` : null,
    requestReference: requestId ? `Request ${requestId}.` : null,
    actionLabel: REVISE_REQUEST_LABEL,
  };
};
