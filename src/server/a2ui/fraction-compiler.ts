import {
  A2UI_PROTOCOL_VERSION,
  FRACTIONS_CATALOG_ID,
  FRACTIONS_CATALOG_VERSION,
  validateA2UIMessage,
} from "@/shared/a2ui-contract";
import type {
  A2UIComponent,
  A2UIDataModel,
  A2UIMessage,
} from "@/shared/a2ui-contract";
import type { FractionLessonDraft } from "@/shared/fractions-contract";
import { fractionLessonDraftSchema } from "@/shared/fractions-contract";
import { parseLatexToMathML } from "@/shared/latex-mathml";

import { LessonPreviewCompileError } from "./compiler";
import { decideFractionValue } from "./fraction-stage";

export interface CompiledFractionPreview {
  protocolVersion: typeof A2UI_PROTOCOL_VERSION;
  catalogId: typeof FRACTIONS_CATALOG_ID;
  catalogVersion: typeof FRACTIONS_CATALOG_VERSION;
  messages: A2UIMessage[];
}

export interface FractionPreviewCompileInput {
  // The raw record draft. The trusted contract parses it here so a foreign
  // or stale payload fails closed at the preview boundary.
  draft: unknown;
}

const assertComponentId = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9:_./-]{1,120}$/u.test(value)) {
    throw new LessonPreviewCompileError(
      `The lesson preview contains an invalid ${label}.`
    );
  }

  return value;
};

const sectionDataModel = (
  draft: FractionLessonDraft,
  section: FractionLessonDraft["sections"][number]
): A2UIDataModel => {
  return {
    sectionId: assertComponentId(section.sectionId, "section id"),
    purpose: section.purpose,
    standardId: draft.standardId,
    grade: draft.grade,
    language: draft.language,
    direction: draft.direction,
    validationState: "ready-for-review",
  };
};

const sectionMessages = (
  draft: FractionLessonDraft,
  section: FractionLessonDraft["sections"][number],
  index: number
): A2UIMessage[] => {
  const surfaceId = assertComponentId(
    `fraction-${draft.requestId}-${section.sectionId}`,
    "surface id"
  );
  const stemId = assertComponentId(`${section.sectionId}-stem`, "component id");
  const diagramId = assertComponentId(
    `${section.sectionId}-diagram`,
    "component id"
  );
  const hasNextSection = index < draft.sections.length - 1;
  const diagramTextEquivalent = `${section.numerator} of ${section.denominator} equal parts shaded`;

  const components: A2UIComponent[] = [
    {
      id: "root",
      component: "Column",
      children: [
        "purpose",
        stemId,
        diagramId,
        ...(hasNextSection ? ["advance"] : []),
        "preview-status",
      ],
    },
    {
      id: "purpose",
      component: "Text",
      text: section.purpose,
      variant: "subheading",
    },
    {
      id: stemId,
      component: "MathText",
      latex: section.stem,
      ...(section.stemTextEquivalent && {
        textEquivalent: section.stemTextEquivalent,
      }),
    },
    {
      id: diagramId,
      component: "FractionDiagram",
      denominator: section.denominator,
      numerator: section.numerator,
      label: section.diagramLabel,
      textEquivalent: diagramTextEquivalent,
      action: {
        event: {
          name: "setFractionValue",
          context: { surfaceId, itemId: diagramId },
        },
      },
    },
    ...(hasNextSection
      ? [
          {
            id: "advance",
            component: "Button",
            label: section.advanceLabel ?? "Next stage",
            variant: "secondary",
            action: {
              event: {
                name: "advanceStage",
                context: { surfaceId, sectionId: section.sectionId },
              },
            },
          } satisfies A2UIComponent,
        ]
      : []),
    {
      id: "preview-status",
      component: "Status",
      text: "Teacher preview only. Nothing is published or submitted.",
      kind: "info",
    },
  ];

  const messages: A2UIMessage[] = [
    {
      version: A2UI_PROTOCOL_VERSION,
      createSurface: {
        surfaceId,
        catalogId: FRACTIONS_CATALOG_ID,
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
        value: sectionDataModel(draft, section),
      },
    },
  ];

  for (const message of messages) {
    const validation = validateA2UIMessage(message, {
      catalogVersion: FRACTIONS_CATALOG_VERSION,
    });
    if (!validation.ok) {
      throw new LessonPreviewCompileError(validation.message);
    }
  }

  return messages;
};

export const compileFractionPreview = (
  input: FractionPreviewCompileInput
): CompiledFractionPreview => {
  const parsed = fractionLessonDraftSchema.safeParse(input.draft);
  if (!parsed.success) {
    throw new LessonPreviewCompileError(
      "The fraction draft does not match the trusted contract."
    );
  }
  const draft = parsed.data;

  for (const section of draft.sections) {
    // The teacher-facing diagnostic names the section so the blocking state
    // is repairable; publication stays blocked until the math is corrected.
    const math = parseLatexToMathML(section.stem);
    if (!math.ok) {
      throw new LessonPreviewCompileError(
        `The math in section ${section.sectionId} does not parse: ${math.message}`
      );
    }

    const range = decideFractionValue({
      numerator: section.numerator,
      denominator: section.denominator,
    });
    if (!range.ok) {
      throw new LessonPreviewCompileError(
        `The fraction in section ${section.sectionId} is outside the trusted bounds.`
      );
    }
  }

  const messages = draft.sections.flatMap((section, index) =>
    sectionMessages(draft, section, index)
  );

  return {
    protocolVersion: A2UI_PROTOCOL_VERSION,
    catalogId: FRACTIONS_CATALOG_ID,
    catalogVersion: FRACTIONS_CATALOG_VERSION,
    messages,
  };
};
