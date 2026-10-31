import { describe, expect, it } from "vitest";

import { createEquivalentFractionsDraft } from "@/server/generation/provider";
import { buildValidatedLearningPath } from "@/server/generation/learning-path";
import { createDemoCurriculumContext } from "@/server/generation/semantic-validation";

import { validateA2UIMessage } from "@/shared/a2ui-contract";
import { compileLessonPreview, LessonPreviewCompileError } from "./compiler";

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
    context: createDemoCurriculumContext(baseRequest),
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
    const preview = compileLessonPreview(request);

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
    const preview = compileLessonPreview(request);

    for (const message of preview.messages) {
      expect(validateA2UIMessage(message)).toMatchObject({ ok: true });
    }
  });

  it("keeps private relationship data out of the serialized preview", () => {
    const preview = compileLessonPreview(request);
    const serialized = JSON.stringify(preview.messages);

    expect(serialized).not.toContain("relationship-");
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("answerKey");
  });

  it("orders the purposes and marks every model ready for review", () => {
    const preview = compileLessonPreview(request);
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

    expect(() => compileLessonPreview(unsafeRequest)).toThrow(
      LessonPreviewCompileError
    );
  });

  it("blocks duplicate variant identifiers before creating duplicate surfaces", () => {
    const duplicateRequest = structuredClone(request);
    duplicateRequest.draft.variants[1].id =
      duplicateRequest.draft.variants[0].id;

    expect(() => compileLessonPreview(duplicateRequest)).toThrow(
      "duplicate variant identifiers"
    );
  });

  it("compiles the accepted prerequisite path into every semantic preview surface", () => {
    const preview = compileLessonPreview(request);
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
    const preview = compileLessonPreview(request);
    const surfaces = preview.messages.flatMap((message) => {
      return "updateComponents" in message
        ? [message.updateComponents.components]
        : [];
    });

    const stories = surfaces.map((components) => {
      const byId = new Map(
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
        labels: [
          "story-beat-1-label",
          "story-beat-2-label",
          "story-beat-3-label",
        ].map((id) => {
          const component = byId.get(id);
          return component?.component === "Text" ? component.text : undefined;
        }),
      };
    });

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
          "Connection reveal",
          "Recognize equivalent fractions",
        ];
      })
    );

    const storyOffsets = stories.map((story) => {
      return (
        story.rootChildren.indexOf("story-plan") -
        story.rootChildren.indexOf("learning-path")
      );
    });

    expect(storyOffsets).toStrictEqual([1, 1, 1, 1]);
  });

  it("keeps the story inside the pinned catalog component set", () => {
    const preview = compileLessonPreview(request);
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
      context: createDemoCurriculumContext(arabicRequest),
      draftId: arabicRequest.requestId,
      provenance: {
        provider: "deterministic-fixture",
        model: "equivalent-fractions-fixture-v1",
        promptTemplateVersion: "lesson-prompt-v1",
        validatorVersion: "lesson-validator-v2",
      },
      validatorVersion: "semantic-validation-runner-v1",
    });
    const preview = compileLessonPreview({
      ...arabicRequest,
      learningPath: arabicPath,
    });
    const serialized = JSON.stringify(preview.messages);

    expect(serialized).toContain("كشف الارتباط");
    expect(serialized).toContain("قصة المتعلم");
  });
});
