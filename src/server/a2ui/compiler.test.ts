import { describe, expect, it } from "vitest";

import { createEquivalentFractionsDraft } from "@/server/generation/provider";
import { buildValidatedLearningPath } from "@/server/generation/learning-path";
import { createDemoCurriculumContext } from "@/server/generation/semantic-validation";
import { gateArtifact } from "@/server/safety/artifact-gate";

import { validateA2UIMessage } from "@/shared/a2ui-contract";
import {
  compileLessonPreview,
  compileRawLessonPreview,
  LessonPreviewCompileError,
} from "./compiler";

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
    const gate = gateArtifact({
      kind: "lesson",
      draft: { variants: request.draft.variants },
      learningPath: request.learningPath,
    });

    if (gate.renderable?.kind !== "lesson") {
      throw new Error("The fixture gate must mint a renderable lesson.");
    }

    const preview = compileLessonPreview(gate.renderable, {
      requestId: request.requestId,
      grade: request.grade,
      standardId: request.standardId,
      language: request.language,
    });

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
});
