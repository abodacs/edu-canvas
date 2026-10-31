import { describe, expect, it } from "vitest";

import { createEquivalentFractionsDraft } from "@/server/generation/provider";
import { buildValidatedLearningPath } from "@/server/generation/learning-path";
import { createSyntheticCurriculumContext } from "@/server/generation/semantic-validation";
import { gateArtifact } from "@/server/safety/artifact-gate";

import { validateA2UIMessage } from "@/shared/a2ui-contract";
import {
  compileLessonPreview,
  compileRawLessonPreview,
  LessonPreviewCompileError,
} from "./compiler";
import type { A2UIComponent } from "@/shared/a2ui-contract";
import type {
  CompiledLessonPreview,
  LessonPreviewCompileInput,
} from "./compiler";

/**
 * The production seam accepts only the branded artifact that `gateArtifact`
 * mints, so every preview test enters through that gate.
 */
const compileGatedPreview = (input: LessonPreviewCompileInput) => {
  const gate = gateArtifact({
    kind: "lesson",
    draft: { variants: input.draft.variants },
    learningPath: input.learningPath,
  });

  if (gate.renderable?.kind !== "lesson") {
    throw new Error("The fixture gate must mint a renderable lesson.");
  }

  return compileLessonPreview(gate.renderable, {
    requestId: input.requestId,
    grade: input.grade,
    standardId: input.standardId,
    language: input.language,
  });
};

const textById = (
  byId: ReadonlyMap<string, A2UIComponent>,
  ids: readonly string[]
): (string | undefined)[] => {
  return ids.map((id) => {
    const component = byId.get(id);
    return component?.component === "Text" ? component.text : undefined;
  });
};

const collectStoryText = (
  byId: ReadonlyMap<string, A2UIComponent>,
  ids: readonly string[]
): string[] => {
  return ids.flatMap((id) => {
    const component = byId.get(id);
    if (component?.component === "Text") {
      return [component.text];
    }
    return component?.component === "Column"
      ? collectStoryText(byId, component.children)
      : [];
  });
};

interface StorySurface {
  readonly rootChildren: readonly string[];
  readonly storyChildren: readonly string[];
  readonly beatChildren: readonly (readonly string[])[];
  readonly labels: readonly (string | undefined)[];
  readonly roleLines: readonly (string | undefined)[];
  readonly transitions: readonly (string | undefined)[];
  readonly action: readonly (string | undefined)[];
  readonly lines: readonly string[];
}

const toStorySurface = (components: readonly A2UIComponent[]): StorySurface => {
  const byId = new Map<string, A2UIComponent>(
    components.map((component) => [component.id, component])
  );
  const root = byId.get("root");
  const story = byId.get("story-plan");
  if (root?.component !== "Column" || story?.component !== "Column") {
    throw new Error("Expected a root column and a story column.");
  }

  return {
    rootChildren: root.children,
    storyChildren: story.children,
    beatChildren: ["story-beat-1", "story-beat-2", "story-beat-3"].map((id) => {
      const beat = byId.get(id);
      return beat?.component === "Column" ? beat.children : [];
    }),
    labels: textById(byId, [
      "story-beat-1-label",
      "story-beat-2-label",
      "story-beat-3-label",
    ]),
    roleLines: textById(byId, [
      "story-beat-1-role",
      "story-beat-2-role",
      "story-beat-3-role",
    ]),
    transitions: textById(byId, [
      "story-beat-1-transition",
      "story-beat-2-transition",
      "story-beat-3-transition",
    ]),
    action: textById(byId, ["story-action"]),
    lines: collectStoryText(byId, ["story-plan"]),
  };
};

const storySurfaces = (preview: CompiledLessonPreview): StorySurface[] => {
  const surfaces: StorySurface[] = [];

  for (const message of preview.messages) {
    if (!("updateComponents" in message)) {
      continue;
    }
    surfaces.push(toStorySurface(message.updateComponents.components));
  }

  return surfaces;
};

const requireLearningPath = <T extends { learningPath?: unknown }>(
  draft: T
): NonNullable<T["learningPath"]> => {
  if (!draft.learningPath) {
    throw new Error("Expected the fixture draft to include a learning path.");
  }
  return draft.learningPath as NonNullable<T["learningPath"]>;
};

const baseRequest = {
  requestId: "draft_req_preview_test",
  grade: 4,
  standardId: "standard_ccss_4_nf_a_01",
  language: "en" as const,
  draft: createEquivalentFractionsDraft({
    prompt: "equivalent fractions for grade 4",
    grade: 4,
    standardId: "standard_ccss_4_nf_a_01",
    language: "en",
    difficulty: "on-level",
  }),
};

const request = {
  ...baseRequest,
  learningPath: buildValidatedLearningPath({
    proposal: requireLearningPath(baseRequest.draft),
    context: createSyntheticCurriculumContext(baseRequest),
    draftId: baseRequest.requestId,
    provenance: {
      provider: "deterministic-fixture",
      model: "equivalent-fractions-fixture-v1",
      promptTemplateVersion: "lesson-prompt-v1",
      validatorVersion: "lesson-validator-v2",
    },
    validatorVersion: "semantic-validation-runner-v1",
  }),
};

describe("lesson preview compiler", () => {
  it("creates a surface, components, and data model for each variant", () => {
    const preview = compileRawLessonPreview(request);

    expect(
      preview.messages.filter((message) => "createSurface" in message)
    ).toHaveLength(4);
    expect(
      preview.messages.filter((message) => "updateComponents" in message)
    ).toHaveLength(4);
    expect(
      preview.messages.filter((message) => "updateDataModel" in message)
    ).toHaveLength(4);
  });

  it("emits only valid A2UI messages", () => {
    const preview = compileRawLessonPreview(request);

    for (const message of preview.messages) {
      expect(validateA2UIMessage(message)).toMatchObject({ ok: true });
    }
  });

  it("keeps private relationship data out of the serialized preview", () => {
    const preview = compileRawLessonPreview(request);
    const serialized = JSON.stringify(preview.messages);

    expect(serialized).not.toContain("relationship-");
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("answerKey");
  });

  it("orders the purposes and marks every model ready for review", () => {
    const preview = compileRawLessonPreview(request);
    const dataModels = preview.messages.flatMap((message) =>
      "updateDataModel" in message ? [message.updateDataModel.value] : []
    );

    expect(dataModels.map((model) => model.purpose)).toStrictEqual([
      "Teach the model",
      "Independent practice",
      "Guided practice",
      "Review and challenge",
    ]);
    expect(
      new Set(dataModels.map((model) => model.validationState))
    ).toStrictEqual(new Set(["ready-for-review"]));
  });

  it("blocks executable content before it can enter an A2UI surface", () => {
    const unsafeRequest = structuredClone(request);
    unsafeRequest.draft.variants[0].sourceItems[0].label =
      "<script>alert(1)</script>";

    expect(() => compileRawLessonPreview(unsafeRequest)).toThrow(
      LessonPreviewCompileError
    );
  });

  it("blocks duplicate variant identifiers before creating duplicate surfaces", () => {
    const duplicateRequest = structuredClone(request);
    duplicateRequest.draft.variants[1].id =
      duplicateRequest.draft.variants[0].id;

    expect(() => compileRawLessonPreview(duplicateRequest)).toThrow(
      expect.objectContaining({
        code: "DUPLICATE_VARIANT_ID",
      })
    );
  });

  it("reports a story that cannot be built as a compile rejection", () => {
    const singleStepRequest = structuredClone(request);
    singleStepRequest.learningPath.steps =
      singleStepRequest.learningPath.steps.slice(0, 1);

    expect(() => compileRawLessonPreview(singleStepRequest)).toThrow(
      expect.objectContaining({
        code: "STORY_PATH_TOO_SHORT",
        field: "learningPath",
        name: "LessonPreviewCompileError",
      })
    );
  });

  it("names the unsupported grade as an edit target", () => {
    const unsupportedGrade = { ...request, grade: 9 };

    expect(() => compileRawLessonPreview(unsupportedGrade)).toThrow(
      expect.objectContaining({
        code: "UNSUPPORTED_GRADE",
        field: "grade",
      })
    );
  });

  it("names the variant when a component id is invalid", () => {
    const invalidId = structuredClone(request);
    invalidId.draft.variants[1].sourceItems[0].id = "bad id!";

    expect(() => compileRawLessonPreview(invalidId)).toThrow(
      expect.objectContaining({
        code: "INVALID_COMPONENT_ID",
        variantId: invalidId.draft.variants[1].id,
      })
    );
  });

  it("compiles only a gate-accepted renderable artifact", () => {
    const preview = compileGatedPreview(request);

    expect(preview.messages).toHaveLength(12);
  });

  it("refuses an unbranded draft at the production seam", () => {
    expect(() => {
      return compileLessonPreview(request as never, {
        requestId: request.requestId,
        grade: request.grade,
        standardId: request.standardId,
        language: request.language,
      });
    }).toThrow(/gate-accepted/iu);
  });

  it("compiles the accepted prerequisite path into every semantic preview surface", () => {
    const preview = compileRawLessonPreview(request);
    const pathComponents = preview.messages.flatMap((message) => {
      return "updateComponents" in message
        ? message.updateComponents.components.filter(
            (component) => component.component === "LearningPath"
          )
        : [];
    });
    const dataModels = preview.messages.flatMap((message) =>
      "updateDataModel" in message ? [message.updateDataModel.value] : []
    );

    expect(pathComponents).toHaveLength(4);

    const [firstDataModel] = dataModels;

    expect(
      firstDataModel && "learningPath" in firstDataModel
        ? firstDataModel.learningPath
        : undefined
    ).toMatchObject({
      direction: "forward",
      steps: [
        { role: "prerequisite", nodeId: "graph_node_equal_parts" },
        {
          role: "target",
          nodeId: "graph_node_equivalent_fractions",
        },
      ],
      versionPins: {
        draftId: "draft_req_preview_test",
        graphVersion: "equivalent-fractions-v1",
        catalogVersion: "matching-v1",
        modelVersion: "equivalent-fractions-fixture-v1",
      },
    });
  });

  it("renders the forward story in path order inside every surface", () => {
    const stories = storySurfaces(compileGatedPreview(request));

    expect(stories).toHaveLength(4);
    expect(stories[0]?.storyChildren).toStrictEqual([
      "story-title",
      "story-action",
      "story-beat-1",
      "story-beat-2",
      "story-beat-3",
    ]);
    expect(stories.map((story) => story.labels)).toStrictEqual(
      stories.map(() => {
        return [
          "Understand equal parts",
          undefined,
          "Recognize equivalent fractions",
        ];
      })
    );
    expect(stories.map((story) => story.roleLines)).toStrictEqual(
      stories.map(() => {
        return [
          "1 · Prerequisite",
          "2 · Connection reveal",
          "3 · Target concept",
        ];
      })
    );
    expect(stories.map((story) => story.transitions)).toStrictEqual(
      stories.map(() => {
        return [
          "Next: Connection reveal",
          "Next: Recognize equivalent fractions",
          "Next: The matching screen makes that connection visible before teacher review.",
        ];
      })
    );
  });

  it("states the learner action once and never repeats a story line", () => {
    const stories = storySurfaces(compileGatedPreview(request));

    expect(stories.map((story) => story.action)).toStrictEqual(
      stories.map(() => {
        return [
          "What the learner does: Select a source card, then a target card.",
        ];
      })
    );
    expect(stories[0]?.beatChildren[1]).toStrictEqual([
      "story-beat-2-role",
      "story-beat-2-narrative",
      "story-beat-2-transition",
    ]);

    for (const story of stories) {
      const uniqueLines = new Set(story.lines);

      expect(uniqueLines.size).toBe(story.lines.length);
    }
  });

  it("places the story directly after the accepted path section", () => {
    const stories = storySurfaces(compileGatedPreview(request));

    expect(
      stories.map((story) => {
        return (
          story.rootChildren.indexOf("story-plan") -
          story.rootChildren.indexOf("learning-path")
        );
      })
    ).toStrictEqual([1, 1, 1, 1]);
  });

  it("keeps the story inside the pinned catalog component set", () => {
    const preview = compileGatedPreview(request);
    const allowed = new Set([
      "Column",
      "Row",
      "Card",
      "Text",
      "MatchCard",
      "Button",
      "Status",
      "LearningPath",
    ]);

    for (const message of preview.messages) {
      if (!("updateComponents" in message)) {
        continue;
      }
      for (const component of message.updateComponents.components) {
        expect(allowed.has(component.component)).toBeTruthy();
      }
    }
  });

  it("renders the story copy in Arabic on an Arabic surface", () => {
    const arabicDraft = createEquivalentFractionsDraft({
      prompt: "equivalent fractions for grade 4",
      grade: 4,
      standardId: "standard_ccss_4_nf_a_01",
      language: "ar",
      difficulty: "on-level",
    });
    const arabicRequest = {
      ...baseRequest,
      language: "ar" as const,
      draft: arabicDraft,
    };
    const arabicPath = buildValidatedLearningPath({
      proposal: requireLearningPath(arabicDraft),
      context: createSyntheticCurriculumContext(arabicRequest),
      draftId: arabicRequest.requestId,
      provenance: {
        provider: "deterministic-fixture",
        model: "equivalent-fractions-fixture-v1",
        promptTemplateVersion: "lesson-prompt-v1",
        validatorVersion: "lesson-validator-v2",
      },
      validatorVersion: "semantic-validation-runner-v1",
    });
    const preview = compileGatedPreview({
      ...arabicRequest,
      learningPath: arabicPath,
    });
    const serialized = JSON.stringify(preview.messages);

    expect(serialized).toContain("كشف الارتباط");
    expect(serialized).toContain("قصة المتعلم");
    expect(serialized).toContain("ما يفعله المتعلم");
  });
});
