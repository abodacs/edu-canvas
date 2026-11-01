import {
  A2UI_CATALOG_ID,
  A2UI_CATALOG_VERSION,
  A2UI_PROTOCOL_VERSION,
  validateA2UIMessage,
  variantPurposeLabels as purposeLabels,
} from "@/shared/a2ui-contract";
import { buildStoryPlan, StoryPlanBuildError } from "@/shared/story-plan";
import { displayStandardCode } from "@/shared/standard-display";
import { isRenderableArtifact } from "@/server/safety/artifact-gate";
import type { LessonLanguage } from "@/shared/generation-contract";
import type { StoryPlan } from "@/shared/story-plan";
import type { RenderableArtifact } from "@/server/safety/artifact-gate";
import type {
  A2UIComponent,
  A2UIMessage,
  A2UIPreviewDataModel,
} from "@/shared/a2ui-contract";

import type {
  ProviderLessonDraft,
  ProviderVariant,
  ValidatedLearningPath,
} from "../generation/types";

const scaffoldLabels = {
  standard: "Core matching scaffold",
  scaffold: "Extra guided support",
  challenge: "Higher reasoning demand",
} as const;

export interface LessonPreviewCompileInput {
  requestId: string;
  grade: number;
  standardId: string;
  language: LessonLanguage;
  draft: ProviderLessonDraft;
  learningPath: ValidatedLearningPath;
}

export interface LessonPreviewMetadata {
  requestId: string;
  grade: number;
  standardId: string;
  language: LessonLanguage;
}

export interface CompiledLessonPreview {
  protocolVersion: typeof A2UI_PROTOCOL_VERSION;
  catalogId: typeof A2UI_CATALOG_ID;
  catalogVersion: typeof A2UI_CATALOG_VERSION;
  messages: A2UIMessage[];
}

export interface LessonPreviewCompileErrorOptions extends ErrorOptions {
  /**
   * The artifact field the teacher can correct. The refusal names it instead
   * of a generic `preview` field.
   */
  field?: string;
  /**
   * The screen that produced the rejection, when the throw site knows it.
   */
  variantId?: string;
}

export class LessonPreviewCompileError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly variantId?: string;

  constructor(
    code: string,
    message: string,
    options: LessonPreviewCompileErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "LessonPreviewCompileError";
    this.code = code;
    this.field = options.field;
    this.variantId = options.variantId;
  }
}

interface CompileFindingLocation {
  field: string;
  variantId?: string;
}

const assertComponentId = (
  value: string,
  label: string,
  location: CompileFindingLocation
): string => {
  if (!/^[A-Za-z0-9:_./-]{1,120}$/u.test(value)) {
    throw new LessonPreviewCompileError(
      "INVALID_COMPONENT_ID",
      `The lesson preview contains an invalid ${label}.`,
      location
    );
  }

  return value;
};

const text = (
  id: string,
  value: string,
  variant: Extract<A2UIComponent, { component: "Text" }>["variant"]
): Extract<A2UIComponent, { component: "Text" }> => {
  return {
    id,
    component: "Text",
    text: value,
    ...(variant && { variant }),
  };
};

const action = (
  name: Extract<
    Extract<A2UIComponent, { component: "MatchCard" }>["action"],
    { event: unknown }
  >["event"]["name"],
  surfaceId: string,
  itemId?: string
) => {
  return {
    event: {
      name,
      context: {
        surfaceId,
        ...(itemId && { itemId }),
      },
    },
  };
};

// #19: the story is compiled into the existing catalog components. The action
// sentence restates the matching surface's approved action set (selectSource,
// selectTarget); no new component or action is added. Every other story string
// comes from the plan, so this table holds no role or beat copy.
const storySurfaceCopy = {
  en: {
    learnerAction: "Select a source card, then a target card.",
    actionPrefix: "What the learner does",
    transitionPrefix: "Next",
  },
  ar: {
    learnerAction: "اختر بطاقة مصدر ثم بطاقة هدف.",
    actionPrefix: "ما يفعله المتعلم",
    transitionPrefix: "التالي",
  },
} as const satisfies Record<
  LessonLanguage,
  { learnerAction: string; actionPrefix: string; transitionPrefix: string }
>;

const storyComponents = (
  storyPlan: StoryPlan,
  language: LessonLanguage
): A2UIComponent[] => {
  const copy = storySurfaceCopy[language];

  const beatComponents = storyPlan.beats.flatMap((beat) => {
    const roleId = `${beat.id}-role`;
    const labelId = `${beat.id}-label`;
    const narrativeId = `${beat.id}-narrative`;
    const transitionId = `${beat.id}-transition`;
    // The hinge has no approved path label, so its label is its role name and a
    // second line would only repeat the role. Every other beat names its node.
    const isRoleRepeated = beat.label === beat.roleLabel;

    return [
      {
        id: beat.id,
        component: "Column",
        children: [
          roleId,
          ...(isRoleRepeated ? [] : [labelId]),
          narrativeId,
          transitionId,
        ],
      },
      text(roleId, `${beat.position} · ${beat.roleLabel}`, "label"),
      ...(isRoleRepeated ? [] : [text(labelId, beat.label, "subheading")]),
      text(narrativeId, beat.narrative, "body"),
      text(
        transitionId,
        `${copy.transitionPrefix}: ${beat.transition}`,
        "caption"
      ),
    ] satisfies A2UIComponent[];
  });

  return [
    {
      id: "story-plan",
      component: "Column",
      children: [
        "story-title",
        "story-action",
        ...storyPlan.beats.map((beat) => beat.id),
      ],
    },
    text("story-title", storyPlan.heading, "label"),
    text(
      "story-action",
      `${copy.actionPrefix}: ${copy.learnerAction}`,
      "caption"
    ),
    ...beatComponents,
  ] satisfies A2UIComponent[];
};

const matchCard = (
  surfaceId: string,
  item: { id: string; label: string },
  group: "source" | "target",
  description: string,
  variantId: string
): Extract<A2UIComponent, { component: "MatchCard" }> => {
  const location = { field: "items", variantId };
  return {
    id: `${group}-card-${assertComponentId(item.id, "item id", location)}`,
    component: "MatchCard",
    itemId: assertComponentId(item.id, "item id", location),
    label: item.label,
    group,
    description,
    action: action(
      group === "source" ? "selectSource" : "selectTarget",
      surfaceId,
      item.id
    ),
  };
};

const previewMessagesForVariant = (
  input: LessonPreviewCompileInput,
  variant: ProviderVariant,
  index: number,
  storyPlan: StoryPlan
): A2UIMessage[] => {
  const variantId = assertComponentId(variant.id, "variant id", {
    field: "variants",
  });
  const surfaceId = assertComponentId(
    `preview-${input.requestId}-${variantId}`,
    "surface id",
    { field: "surfaces", variantId }
  );
  const purpose = purposeLabels[index] ?? "Lesson practice";
  const sourceLabel = variant.accessibilityMetadata.sourceGroupLabel;
  const targetLabel = variant.accessibilityMetadata.targetGroupLabel;
  const sourceCards = variant.sourceItems.map((item) =>
    matchCard(surfaceId, item, "source", sourceLabel, variantId)
  );
  const targetCards = [...variant.targetItems, ...variant.distractorItems].map(
    (item) => matchCard(surfaceId, item, "target", targetLabel, variantId)
  );
  const sourceCardIds = sourceCards.map((card) => card.id);
  const targetCardIds = targetCards.map((card) => card.id);

  const components: A2UIComponent[] = [
    {
      id: "root",
      component: "Column",
      children: [
        "title",
        "purpose",
        "metadata",
        "instructions",
        "learning-path",
        "story-plan",
        "matching-board",
        "preview-actions",
        "preview-status",
      ],
    },
    text("title", variant.title, "heading"),
    text("purpose", purpose, "subheading"),
    text(
      "metadata",
      `Grade ${input.grade} · ${displayStandardCode(input.standardId)} · ${variant.languageMetadata.language.toUpperCase()} · ${scaffoldLabels[variant.kind]}`,
      "label"
    ),
    text("instructions", variant.accessibilityMetadata.instructions, "body"),
    {
      id: "learning-path",
      component: "LearningPath",
    },
    ...storyComponents(storyPlan, input.language),
    {
      id: "matching-board",
      component: "Row",
      children: ["source-panel", "target-panel"],
    },
    {
      id: "source-panel",
      component: "Card",
      child: "source-column",
      tone: "surface",
    },
    {
      id: "source-column",
      component: "Column",
      children: ["source-label", ...sourceCardIds],
    },
    text("source-label", sourceLabel, "label"),
    ...sourceCards,
    {
      id: "target-panel",
      component: "Card",
      child: "target-column",
      tone: "accent",
    },
    {
      id: "target-column",
      component: "Column",
      children: ["target-label", ...targetCardIds],
    },
    text("target-label", targetLabel, "label"),
    ...targetCards,
    {
      id: "preview-actions",
      component: "Row",
      children: ["clear-selection"],
    },
    {
      id: "clear-selection",
      component: "Button",
      label: "Clear selection",
      variant: "quiet",
      action: action("clearSelection", surfaceId),
    },
    {
      id: "preview-status",
      component: "Status",
      text: "Teacher preview only. Nothing is published or submitted.",
      kind: "info",
    },
  ];

  const dataModel: A2UIPreviewDataModel = {
    variantId,
    purpose,
    accessibilityDescription: variant.accessibilityMetadata.instructions,
    scaffold: scaffoldLabels[variant.kind],
    standardId: input.standardId,
    grade: input.grade,
    language: variant.languageMetadata.language,
    direction: variant.languageMetadata.direction,
    validationState: "ready-for-review",
    selectedItemIds: [],
    learningPath: input.learningPath,
  };

  const messages: A2UIMessage[] = [
    {
      version: A2UI_PROTOCOL_VERSION,
      createSurface: {
        surfaceId,
        catalogId: A2UI_CATALOG_ID,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateComponents: {
        surfaceId,
        components,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateDataModel: {
        surfaceId,
        path: "/",
        value: dataModel,
      },
    },
  ];

  for (const message of messages) {
    const validation = validateA2UIMessage(message);
    if (!validation.ok) {
      throw new LessonPreviewCompileError(validation.code, validation.message, {
        field: "preview",
        variantId,
      });
    }
  }

  return messages;
};

/**
 * The compile seam owns one error contract: the preview server feeds every
 * `LessonPreviewCompileError` back into the gate as a pre-render refusal. A
 * story that cannot be built is therefore translated here, so it reaches the
 * teacher as a named refusal instead of an unhandled failure.
 */
const buildStoryForInput = (input: LessonPreviewCompileInput): StoryPlan => {
  try {
    return buildStoryPlan({
      path: input.learningPath,
      language: input.language,
      learnerAction: storySurfaceCopy[input.language].learnerAction,
    });
  } catch (error) {
    if (error instanceof StoryPlanBuildError) {
      throw new LessonPreviewCompileError(error.code, error.message, {
        cause: error,
        field: "learningPath",
      });
    }
    throw error;
  }
};

/**
 * The raw compiler is the test and differential-oracle seam. It accepts an
 * unattested draft, so production code must call `compileLessonPreview`.
 */
export const compileRawLessonPreview = (
  input: LessonPreviewCompileInput
): CompiledLessonPreview => {
  if (input.draft.variants.length !== 4) {
    throw new LessonPreviewCompileError(
      "INCOMPLETE_VARIANT_SET",
      "Only a complete four-variant lesson can enter the preview.",
      { field: "variants" }
    );
  }

  const variantIds = new Set(input.draft.variants.map((variant) => variant.id));
  if (variantIds.size !== input.draft.variants.length) {
    throw new LessonPreviewCompileError(
      "DUPLICATE_VARIANT_ID",
      "The lesson preview contains duplicate variant identifiers.",
      { field: "variants" }
    );
  }

  if (
    !Number.isSafeInteger(input.grade) ||
    input.grade < 3 ||
    input.grade > 6
  ) {
    throw new LessonPreviewCompileError(
      "UNSUPPORTED_GRADE",
      "The lesson grade is not supported.",
      { field: "grade" }
    );
  }

  const storyPlan = buildStoryForInput(input);
  const messages = input.draft.variants.flatMap((variant, index) =>
    previewMessagesForVariant(input, variant, index, storyPlan)
  );

  return {
    protocolVersion: A2UI_PROTOCOL_VERSION,
    catalogId: A2UI_CATALOG_ID,
    catalogVersion: A2UI_CATALOG_VERSION,
    messages,
  };
};

/**
 * The production compile seam. It accepts only the branded renderable
 * artifact that `gateArtifact` mints, so preview can never compile a draft the
 * safety gate refused.
 */
export const compileLessonPreview = (
  artifact: RenderableArtifact,
  metadata: LessonPreviewMetadata
): CompiledLessonPreview => {
  if (!isRenderableArtifact(artifact) || artifact.kind !== "lesson") {
    throw new TypeError(
      "compileLessonPreview requires a gate-accepted lesson artifact."
    );
  }

  return compileRawLessonPreview({
    requestId: metadata.requestId,
    grade: metadata.grade,
    standardId: metadata.standardId,
    language: metadata.language,
    draft: artifact.draft,
    learningPath: artifact.learningPath,
  });
};
