import { describe, expect, it } from "vitest";

import {
  fractionEquivalencePack,
  multistepWordProblemsPack,
} from "@/server/curriculum/built-in-packs";

import {
  buildLessonPrompt,
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
  createMetaLessonDraftProvider,
  LessonProviderError,
} from "./provider";
import { createSyntheticCurriculumContext } from "./semantic-validation";
import { validateProviderDraft } from "./validation";
import type {
  NormalizedGenerationRequest,
  ProviderGenerationContext,
} from "./provider";
import type { ProviderLessonDraft } from "./types";

const captureRejection = async (
  promise: Promise<unknown>
): Promise<unknown> => {
  try {
    return await promise;
  } catch (error) {
    return error;
  }
};

const request: NormalizedGenerationRequest = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: "standard_ccss_4_nf_a_01",
  language: "en",
  difficulty: "on-level",
};

/**
 * The provider context a resolved pack produces: the acceptance path maps a
 * `VersionedCurriculumContext` into this shape. Building it from
 * `createSyntheticCurriculumContext` keeps the test on the real pack data, so a
 * frame change in `built-in-packs.ts` reaches these assertions.
 */
const packProviderContext = (
  standardId: string,
  language: "en" | "ar" = "en"
): ProviderGenerationContext => {
  const curriculum = createSyntheticCurriculumContext({
    grade: 4,
    language,
    standardId,
  });
  const { reference } = curriculum;

  return {
    correctionAttempt: false,
    diagnostics: [],
    ...(curriculum.promptFrame && { promptFrame: curriculum.promptFrame }),
    curriculumContext: {
      nodes: curriculum.nodes.map((node) => {
        return { id: node.id, screenPurposeId: node.screenPurposeId };
      }),
      edges: curriculum.edges.map((edge) => {
        return {
          prerequisiteId: edge.prerequisiteId,
          successorId: edge.successorId,
        };
      }),
      targetNodeId: curriculum.targetNodeId,
    },
    ...(reference && {
      referenceContext: {
        id: reference.id,
        version: reference.version,
        graphVersion: curriculum.graphVersion,
        standardCode: curriculum.standardCode,
        source: reference.source,
        targets: reference.targets,
        prompt: reference.prompt,
      },
    }),
  };
};

const buildPackDraft = async (
  standardId: string
): Promise<ProviderLessonDraft> => {
  const provider = createDeterministicLessonDraftProvider();
  const response = await provider.generate(
    { ...request, standardId },
    packProviderContext(standardId)
  );
  const result = validateProviderDraft(response.draft);

  if (!result.ok) {
    throw new Error(
      `Expected the deterministic draft for ${standardId} to validate.`
    );
  }

  return result.draft;
};

const expectCanonicalRequestBody = (body: {
  model: string;
  input: string;
  text: { format: { name: string; type: string } };
}) => {
  expect(body.model).toBe("muse-spark-1.2-contributor");
  expect(body.text.format).toMatchObject({
    type: "json_schema",
    name: "edu_canvas_lesson_draft",
  });
  expect(body.input).toContain("Return only the canonical JSON contract.");
};

const createHangingFetch = () => {
  const state: { attempts: number; signal?: AbortSignal | null } = {
    attempts: 0,
  };
  const fetchImplementation: typeof fetch = (_input, init) => {
    state.attempts += 1;
    state.signal = init?.signal;
    const deferred = Promise.withResolvers<Response>();
    init?.signal?.addEventListener(
      "abort",
      () => {
        deferred.reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
    return deferred.promise;
  };

  return { state, fetchImplementation };
};

describe("lesson draft providers", () => {
  it("records the validator version with language compatibility rules", async () => {
    const provider = createDeterministicLessonDraftProvider();
    await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
    });

    expect(provider.provenance.validatorVersion).toBe("lesson-validator-v2");
  });

  it("generates a deterministic Arabic fixture with RTL metadata", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const response = await provider.generate(
      { ...request, language: "ar" },
      { correctionAttempt: false, diagnostics: [] }
    );

    const result = validateProviderDraft(response.draft);

    expect(result.ok).toBeTruthy();

    if (!result.ok) {
      throw new Error("Expected the Arabic fixture draft to validate.");
    }

    expect(result.draft.variants[0]?.languageMetadata).toMatchObject({
      language: "ar",
      direction: "rtl",
    });

    expect(provider.provenance).toMatchObject({
      provider: "deterministic-fixture",
      model: "equivalent-fractions-fixture-v1",
      promptTemplateVersion: "lesson-prompt-v2",
    });
  });

  it("sends the canonical contract to the server-only Meta adapter", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const provider = createMetaLessonDraftProvider({
      apiKey: "server-only-test-key",
      model: "muse-spark-1.2-contributor",
      fetchImplementation: (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return Promise.resolve(
          Response.json(
            {
              output_text: JSON.stringify(
                createEquivalentFractionsDraft(request)
              ),
            },
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      },
    });

    const response = await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
    });

    const body = JSON.parse(String(requestInit?.body)) as {
      model: string;
      input: string;
      text: { format: { name: string; type: string } };
    };
    const headers = new Headers(requestInit?.headers);

    expect(requestUrl).toBe("https://api.meta.ai/v1/responses");
    expect(headers.get("authorization")).toBe("Bearer server-only-test-key");

    expectCanonicalRequestBody(body);

    expect(validateProviderDraft(response.draft).ok).toBeTruthy();
  });

  it("maps provider rate limits to a safe retryable error", async () => {
    const provider = createMetaLessonDraftProvider({
      apiKey: "server-only-test-key",
      model: "muse-spark-1.2-contributor",
      fetchImplementation: () => {
        return Promise.resolve(
          new Response("provider details must stay server-side", {
            status: 429,
          })
        );
      },
    });

    await expect(
      provider.generate(request, { correctionAttempt: false, diagnostics: [] })
    ).rejects.toMatchObject({
      kind: "rate-limit",
      safeMessage: "The lesson provider is busy. Try again in a moment.",
    });

    const error = await captureRejection(
      provider.generate(request, {
        correctionAttempt: false,
        diagnostics: [],
      })
    );

    expect(error).toBeInstanceOf(LessonProviderError);
    expect(String(error)).not.toContain("provider details");
  });

  it.each([429, 500])(
    "sends exactly one outbound attempt for a %s response",
    async (status) => {
      let attempts = 0;
      const provider = createMetaLessonDraftProvider({
        apiKey: "server-only-test-key",
        model: "muse-spark-1.2-contributor",
        fetchImplementation: () => {
          attempts += 1;
          return Promise.resolve(new Response("provider details", { status }));
        },
      });

      await expect(
        provider.generate(request, {
          correctionAttempt: false,
          diagnostics: [],
        })
      ).rejects.toBeInstanceOf(LessonProviderError);
      expect(attempts).toBe(1);
    }
  );

  it("propagates the caller signal to the outbound transport", async () => {
    const controller = new AbortController();
    const { state, fetchImplementation } = createHangingFetch();
    const provider = createMetaLessonDraftProvider({
      apiKey: "server-only-test-key",
      model: "muse-spark-1.2-contributor",
      fetchImplementation,
    });

    const pending = provider.generate(
      request,
      { correctionAttempt: false, diagnostics: [] },
      { signal: controller.signal }
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ kind: "timeout" });
    expect(state.attempts).toBe(1);
    expect(state.signal?.aborted).toBeTruthy();
  });

  it("aborts a hanging transport at the configured timeout with one attempt", async () => {
    const { state, fetchImplementation } = createHangingFetch();
    const provider = createMetaLessonDraftProvider({
      apiKey: "server-only-test-key",
      model: "muse-spark-1.2-contributor",
      timeoutMs: 5,
      fetchImplementation,
    });

    await expect(
      provider.generate(request, { correctionAttempt: false, diagnostics: [] })
    ).rejects.toMatchObject({
      kind: "timeout",
      safeMessage: "The lesson provider could not be reached. Try again.",
    });
    expect(state.attempts).toBe(1);
  });

  it("proposes the seeded prerequisite path with approved screen-purpose ids", async () => {
    const provider = createDeterministicLessonDraftProvider();
    const response = await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
    });

    expect(response.draft).toMatchObject({
      learningPath: {
        direction: "forward",
        steps: [
          {
            nodeId: "graph_node_equal_parts",
            screenPurposeId: "screen_purpose_equal_parts",
          },
          {
            nodeId: "graph_node_equivalent_fractions",
            screenPurposeId: "screen_purpose_equivalent_fractions",
          },
        ],
      },
    });
  });

  it("sends approved curriculum and reference context to the adapter", async () => {
    let requestInit: RequestInit | undefined;
    const provider = createMetaLessonDraftProvider({
      apiKey: "server-only-test-key",
      model: "muse-spark-1.2-contributor",
      fetchImplementation: (_input, init) => {
        requestInit = init;
        return Promise.resolve(
          Response.json(
            {
              output_text: JSON.stringify(
                createEquivalentFractionsDraft(request)
              ),
            },
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      },
    });

    await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
      curriculumContext: {
        nodes: [
          {
            id: "graph_node_equal_parts",
            screenPurposeId: "screen_purpose_equal_parts",
          },
          {
            id: "graph_node_equivalent_fractions",
            screenPurposeId: "screen_purpose_equivalent_fractions",
          },
        ],
        edges: [
          {
            prerequisiteId: "graph_node_equal_parts",
            successorId: "graph_node_equivalent_fractions",
          },
        ],
        targetNodeId: "graph_node_equivalent_fractions",
      },
      referenceContext: {
        id: "activity_version_demo_equivalent_fractions_v1",
        version: "1",
        graphVersion: "equivalent-fractions-v1",
        standardCode: "4.NF.A.1",
        source: "1/2",
        targets: ["2/4", "3/6", "4/8"],
        prompt: "Choose the fractions that name the same part of a whole.",
      },
    });

    const body = JSON.parse(String(requestInit?.body)) as { input: string };

    expect(body.input).toContain("graph_node_equal_parts");
    expect(body.input).toContain("screen_purpose_equal_parts");
    expect(body.input).toContain(
      "activity_version_demo_equivalent_fractions_v1"
    );
    expect(body.input).toContain("Do not use any other node");
    expect(body.input).not.toContain("answerKey");
  });
});

describe("pack-framed provider prompt (#221)", () => {
  it("asks for word-problem to equation matching on a 4.OA.A.3 pack", () => {
    const frame = multistepWordProblemsPack.promptFrame;
    const prompt = buildLessonPrompt(
      {
        ...request,
        prompt: "multistep word problems for grade 4",
        standardId: multistepWordProblemsPack.standardId,
      },
      packProviderContext(multistepWordProblemsPack.standardId)
    );

    expect(prompt).toContain(`Task: ${frame.taskLine}`);
    expect(prompt).toContain(`source items from "${frame.sourceGroupLabel}"`);
    expect(prompt).toContain(
      `matching target items from "${frame.targetGroupLabel}"`
    );
    expect(prompt).toContain(`${frame.sourceItemCount} source items`);
    expect(prompt).not.toMatch(/equivalent[- ]fractions?|1\/2/iu);
  });

  it("keeps a 4.NF.A.1 prompt on equivalent-fraction matching", () => {
    const frame = fractionEquivalencePack.promptFrame;
    const prompt = buildLessonPrompt(
      request,
      packProviderContext(fractionEquivalencePack.standardId)
    );

    expect(prompt).toContain(`Task: ${frame.taskLine}`);
    expect(prompt).toContain(`source items from "${frame.sourceGroupLabel}"`);
    expect(prompt).toContain(`${frame.targetItemCount} matching target items`);
    expect(prompt).toMatch(/fractions?/iu);
    expect(prompt).not.toMatch(/word problems?|equations?/iu);
  });
});

describe("pack-framed deterministic fixture (#221)", () => {
  it.each([
    { label: "4.NF.A.1", pack: fractionEquivalencePack },
    { label: "4.OA.A.3", pack: multistepWordProblemsPack },
  ])("builds the $label draft from the pack frame", async ({ pack }) => {
    const draft = await buildPackDraft(pack.standardId);
    const frame = pack.promptFrame;
    const [practice] = draft.variants;

    expect(draft.variants.map((variant) => variant.kind)).toStrictEqual([
      "standard",
      "standard",
      "scaffold",
      "challenge",
    ]);
    expect(practice?.instructions).toBe(frame.taskLine);
    expect(practice?.sourceItems).toHaveLength(frame.sourceItemCount);
    expect(practice?.targetItems).toHaveLength(frame.targetItemCount);
    expect(
      draft.variants.map((variant) => {
        return {
          source: variant.accessibilityMetadata.sourceGroupLabel,
          target: variant.accessibilityMetadata.targetGroupLabel,
          paired: variant.relationships.length === variant.sourceItems.length,
        };
      })
    ).toStrictEqual(
      draft.variants.map(() => {
        return {
          source: frame.sourceGroupLabel,
          target: frame.targetGroupLabel,
          paired: true,
        };
      })
    );
  });

  it("walks the resolved pack graph instead of the seeded path", async () => {
    const draft = await buildPackDraft(multistepWordProblemsPack.standardId);

    expect(draft.learningPath?.steps.map((step) => step.nodeId)).toStrictEqual(
      multistepWordProblemsPack.graph.nodes.map((node) => node.id)
    );
  });

  it("keeps equivalent-fraction wording out of a 4.OA.A.3 draft", async () => {
    const draft = await buildPackDraft(multistepWordProblemsPack.standardId);
    const copy = draft.variants.map((variant) => {
      return [variant.title, variant.instructions];
    });

    expect(JSON.stringify(copy)).not.toMatch(/equivalent[- ]fractions?/iu);
  });

  it("keeps the 4.NF.A.1 draft shape and its fraction item labels", async () => {
    const draft = await buildPackDraft(fractionEquivalencePack.standardId);

    expect(
      draft.variants[0]?.sourceItems.map((item) => item.label)
    ).toStrictEqual(["1/2", "2/3", "3/4"]);
    expect(
      draft.variants[0]?.targetItems.map((item) => item.label)
    ).toStrictEqual(["2/4", "4/6", "6/8"]);
    expect(draft.variants[0]?.relationships).toHaveLength(3);
  });
});
