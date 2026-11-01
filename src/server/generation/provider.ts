import { validatorVersion } from "./validation";
import type { LessonLanguage } from "@/shared/generation-contract";

import type {
  GenerationDiagnostic,
  NormalizedGenerationRequest,
  ProviderLessonDraft,
  ProviderProvenance,
  ProviderVariant,
  VariantKind,
} from "./types";

const ITEM_SCHEMA_REFERENCE = "#/$defs/item";

const variantKindTitles: Record<
  VariantKind,
  { readonly en: string; readonly ar: string }
> = {
  standard: { en: "Practice", ar: "تدريب على الكسور المكافئة" },
  scaffold: { en: "Guided", ar: "كسور مكافئة مع إرشاد" },
  challenge: { en: "Review", ar: "مراجعة الكسور المكافئة" },
};
export const RATE_LIMIT_KIND = "rate-limit";

export const promptTemplateVersion = "lesson-prompt-v1";
export const defaultProviderTimeoutMs = 100_000;

export interface ProviderCurriculumContext {
  nodes: readonly { id: string; screenPurposeId: string }[];
  edges: readonly { prerequisiteId: string; successorId: string }[];
  targetNodeId: string;
}

export interface ProviderReferenceContext {
  id: string;
  version: string;
  graphVersion: string;
  standardCode: string;
  source: string;
  targets: readonly string[];
  prompt: string;
}

export interface ProviderGenerationContext {
  correctionAttempt: boolean;
  diagnostics: readonly GenerationDiagnostic[];
  curriculumContext?: ProviderCurriculumContext;
  referenceContext?: ProviderReferenceContext;
}

export interface ProviderResponse {
  draft: unknown;
}

export interface ProviderCallOptions {
  signal?: AbortSignal;
}

export type ProviderFailureKind =
  "timeout" | typeof RATE_LIMIT_KIND | "transient" | "terminal";

export class LessonProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly safeMessage: string;

  constructor(
    kind: ProviderFailureKind,
    safeMessage: string,
    options?: ErrorOptions
  ) {
    super(safeMessage, options);
    this.name = "LessonProviderError";
    this.kind = kind;
    this.safeMessage = safeMessage;
  }
}

export interface LessonDraftProvider {
  readonly provenance: ProviderProvenance;
  generate: (
    request: NormalizedGenerationRequest,
    context: ProviderGenerationContext,
    options?: ProviderCallOptions
  ) => Promise<ProviderResponse>;
}

export interface OpenAILessonDraftProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

const localizedText = (
  language: LessonLanguage,
  english: string,
  arabic: string
) => (language === "ar" ? arabic : english);

const createLearningPath = (
  request: NormalizedGenerationRequest
): NonNullable<ProviderLessonDraft["learningPath"]> => {
  return {
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
    rationale: localizedText(
      request.language,
      "Start with equal parts so the lesson can connect the same whole to different fraction names.",
      "نبدأ بالأجزاء المتساوية حتى يربط الدرس بين الكل نفسه وأسماء الكسور المختلفة."
    ),
    nextScreenRationale: localizedText(
      request.language,
      "The matching screen makes that connection visible before teacher review.",
      "تجعل شاشة المطابقة هذا الارتباط واضحًا قبل مراجعة المعلم."
    ),
  };
};

const createVariant = (
  request: NormalizedGenerationRequest,
  kind: VariantKind,
  index: number
): ProviderVariant => {
  const sourceLabels = ["1/2", "2/3", "3/4", "1/3", "2/5", "3/5"];
  const targetLabels = ["2/4", "4/6", "6/8", "2/6", "4/10", "6/10"];
  const sourceItems = sourceLabels.map((label, itemIndex) => {
    return {
      id: `source-${index}-${itemIndex + 1}`,
      label,
    };
  });
  const targetItems = targetLabels.map((label, itemIndex) => {
    return {
      id: `target-${index}-${itemIndex + 1}`,
      label,
    };
  });
  const { language } = request;

  return {
    id: `variant-${index}`,
    kind,
    title: localizedText(
      language,
      `${variantKindTitles[kind].en} equivalent fractions`,
      variantKindTitles[kind].ar
    ),
    instructions: localizedText(
      language,
      "Match each fraction with another name for the same part of a whole.",
      "طابق كل كسر مع اسم آخر للجزء نفسه من الكل."
    ),
    sourceItems,
    targetItems,
    distractorItems: [{ id: `distractor-${index}`, label: "2/3" }],
    relationships: sourceItems.map((source, itemIndex) => {
      return {
        id: `relationship-${index}-${itemIndex + 1}`,
        sourceId: source.id,
        targetId: targetItems[itemIndex].id,
      };
    }),
    hints: [
      localizedText(
        language,
        "Compare how many equal parts are shaded in each fraction.",
        "قارن عدد الأجزاء المتساوية في كل كسر."
      ),
    ],
    feedback: {
      correct: localizedText(
        language,
        "These fractions name the same part of a whole.",
        "هذه الكسور تسمي الجزء نفسه من الكل."
      ),
      incorrect: localizedText(
        language,
        "Try comparing the equal parts in each fraction.",
        "حاول مقارنة الأجزاء المتساوية في كل كسر."
      ),
    },
    languageMetadata: {
      language,
      direction: language === "ar" ? "rtl" : "ltr",
      locale: language === "ar" ? "ar" : "en-US",
    },
    accessibilityMetadata: {
      instructions: localizedText(
        language,
        "Instructions for matching equivalent fractions",
        "تعليمات لمطابقة الكسور المكافئة"
      ),
      sourceGroupLabel: localizedText(
        language,
        "Fractions to match",
        "الكسور المطلوب مطابقتها"
      ),
      targetGroupLabel: localizedText(
        language,
        "Possible equivalent fractions",
        "الكسور المكافئة المحتملة"
      ),
    },
  };
};

export const createEquivalentFractionsDraft = (
  request: NormalizedGenerationRequest
): ProviderLessonDraft => {
  const [practice, explore, scaffold, review] = [
    createVariant(request, "standard", 1),
    createVariant(request, "standard", 2),
    createVariant(request, "scaffold", 3),
    createVariant(request, "challenge", 4),
  ];

  // The studio asks a teacher to choose between the two standard cards, so the
  // fixture must give them different interaction structures, titles, and copy —
  // otherwise the draft notes correctly flag them as duplicates (#168 P1-3).
  // Item-count caps from the structural validator steer the shapes: a 3-item
  // set carries no decoys (floor(3/4) = 0) and an 8-item set may carry two.
  explore.title = localizedText(
    request.language,
    "Explore equivalent fractions",
    "استكشاف الكسور المكافئة"
  );
  explore.instructions = localizedText(
    request.language,
    "Match the eight pairs, and watch for decoys whose numerators match but wholes differ.",
    "طابق الأزواج الثمانية، وانتبه للأفخاخ التي الأعداد الأبْعَدها طابقية لكن الكلَّ مختلفة."
  );
  const exploreSources = ["1/6", "1/8"];
  const exploreTargets = ["2/12", "2/16"];
  explore.sourceItems = [
    ...explore.sourceItems,
    ...exploreSources.map((label, itemIndex) => {
      return {
        id: `source-2-${7 + itemIndex}`,
        label,
      };
    }),
  ];
  explore.targetItems = [
    ...explore.targetItems,
    ...exploreTargets.map((label, itemIndex) => {
      return {
        id: `target-2-${7 + itemIndex}`,
        label,
      };
    }),
  ];
  explore.distractorItems = [
    { id: "distractor-2", label: "2/3" },
    { id: "distractor-2-near", label: "3/8" },
  ];
  explore.relationships = explore.sourceItems.map((source, itemIndex) => {
    return {
      id: `relationship-2-${itemIndex + 1}`,
      sourceId: source.id,
      targetId: explore.targetItems[itemIndex].id,
    };
  });

  // The guided card carries the gentlest load: three pairs, no decoys, and an
  // extra support move, so its structure visibly differs from practice.
  scaffold.title = localizedText(
    request.language,
    "Step up to equivalents",
    "الخطوة إلى الكسور المكافئة"
  );
  scaffold.instructions = localizedText(
    request.language,
    "Three pairs at a time, with a hint before your first match.",
    "ثلاثة أزواج في كل مرة، مع إرشاد قبل أول مطابقة."
  );
  scaffold.sourceItems = scaffold.sourceItems.slice(0, 3);
  scaffold.targetItems = scaffold.targetItems.slice(0, 3);
  scaffold.relationships = scaffold.relationships.slice(0, 3);
  scaffold.distractorItems = [];
  scaffold.hints = [
    scaffold.hints[0],
    localizedText(
      request.language,
      "Take one pair at a time: find the whole with the same number of equal parts first.",
      "زوج واحد فقط في كل مرة: حدد الكل الذي يحمل العدد نفسه من الأجزاء المتساوية أولاً."
    ),
  ];

  // The review card adds the reasoning demand: two decoys and a check-the-whole
  // instruction, while the equivalent pairs stay canonical.
  review.title = localizedText(
    request.language,
    "Reason with equivalents",
    "استدلّ على الكسور المكافئة"
  );
  review.instructions = localizedText(
    request.language,
    "Match the eight pairs, then decide which decoy is close but not equal once you check the whole.",
    "طابق الأزواج الثمانية، ثم قرر أي فخٍّ قريب من الصواب لكنه ليس متساويًا بعد فحص الكل."
  );
  const reviewSources = ["1/6", "1/8"];
  const reviewTargets = ["2/12", "2/16"];
  review.sourceItems = [
    ...review.sourceItems,
    ...reviewSources.map((label, itemIndex) => {
      return {
        id: `source-4-${7 + itemIndex}`,
        label,
      };
    }),
  ];
  review.targetItems = [
    ...review.targetItems,
    ...reviewTargets.map((label, itemIndex) => {
      return {
        id: `target-4-${7 + itemIndex}`,
        label,
      };
    }),
  ];
  review.distractorItems = [
    { id: "distractor-4", label: "2/3" },
    { id: "distractor-4-near", label: "3/8" },
  ];
  review.relationships = review.sourceItems.map((source, itemIndex) => {
    return {
      id: `relationship-4-${itemIndex + 1}`,
      sourceId: source.id,
      targetId: review.targetItems[itemIndex].id,
    };
  });
  review.hints = [
    review.hints[0],
    localizedText(
      request.language,
      "Before you match, say which whole each fraction belongs to.",
      "قبل أن تطابق، قل إلى أي كلٍّ ينتمي كل كسر."
    ),
  ];

  return {
    learningPath: createLearningPath(request),
    variants: [practice, explore, scaffold, review],
  };
};

export type DeterministicProviderScenario =
  | "valid"
  | "invalid"
  | "invalid-then-valid"
  | "invalid-then-invalid"
  | "timeout"
  | typeof RATE_LIMIT_KIND;

export const createDeterministicLessonDraftProvider = (
  scenario: DeterministicProviderScenario = "valid"
): LessonDraftProvider & { readonly calls: number } => {
  let calls = 0;
  const provenance: ProviderProvenance = {
    provider: "deterministic-fixture",
    model: "equivalent-fractions-fixture-v1",
    promptTemplateVersion,
    validatorVersion,
  };

  return {
    provenance,
    get calls() {
      return calls;
    },

    generate(request) {
      calls += 1;

      if (scenario === "timeout") {
        throw new LessonProviderError(
          "timeout",
          "The lesson provider timed out. Try again."
        );
      }

      if (scenario === RATE_LIMIT_KIND) {
        throw new LessonProviderError(
          RATE_LIMIT_KIND,
          "The lesson provider is busy. Try again in a moment."
        );
      }

      const shouldBeInvalid =
        scenario === "invalid" ||
        (scenario === "invalid-then-valid" && calls === 1) ||
        scenario === "invalid-then-invalid";

      const draft = createEquivalentFractionsDraft(request);
      if (shouldBeInvalid) {
        draft.variants[0].relationships[0].targetId = "missing-target";
      }

      return Promise.resolve({
        draft,
      });
    },
  };
};

const buildPrompt = (
  request: NormalizedGenerationRequest,
  context: ProviderGenerationContext
): string => {
  const curriculum = context.curriculumContext;
  const reference = context.referenceContext;
  const approvedNodes = curriculum?.nodes
    .map((node) => `${node.id} (${node.screenPurposeId})`)
    .join(", ");
  const approvedEdges = curriculum?.edges
    .map((edge) => `${edge.prerequisiteId} -> ${edge.successorId}`)
    .join(", ");
  const pathInstruction = curriculum
    ? `Include one forward learningPath with exactly ${curriculum.nodes.length} steps in this order: ${curriculum.nodes
        .map((node) => `${node.id} with ${node.screenPurposeId}`)
        .join(
          ", then "
        )}. Do not use any other node, screen purpose, or edge. Target node: ${curriculum.targetNodeId}.`
    : "Include one forward learningPath with 2–12 ordered graph steps. Each step must contain only the approved graph node id and screen-purpose id supplied by the curriculum context.";
  const referenceInstruction = reference
    ? `Curated reference: ${reference.id} version ${reference.version}; graph ${reference.graphVersion}; standard ${reference.standardCode}; source item ${reference.source}; target options ${reference.targets.join(", ")}. Reference prompt: ${reference.prompt}. Use this content as the lesson basis. Do not include or reveal an answer key.`
    : "";
  const correction = context.correctionAttempt
    ? ` Correct the previous draft using only these safe validation diagnostics: ${context.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join(" ")}`
    : "";

  return [
    "Create a structured lesson draft for Edu-Canvas equivalent-fractions matching.",
    "Return only the canonical JSON contract. Never return HTML, CSS, JavaScript, A2UI, URLs, or executable content.",
    `Teacher request: ${request.prompt}`,
    `Grade: ${request.grade}. Primary standard: ${request.standardId}. Language: ${request.language}. Difficulty: ${request.difficulty}.`,
    "Create exactly two standard variants, one scaffold variant, and one challenge variant. Each variant needs exactly 3 source items, 3 matching target items, zero distractor items, stable ids, one hint, deterministic feedback, language metadata, and accessibility metadata.",
    approvedNodes
      ? `Approved curriculum nodes: ${approvedNodes}. Approved curriculum edges: ${approvedEdges}.`
      : "",
    referenceInstruction,
    pathInstruction,
    "Include concise learner-safe rationale and nextScreenRationale; do not include chain-of-thought or private learner data.",
    correction,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const extractResponseDraft = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  if ("output_text" in body && typeof body.output_text === "string") {
    return JSON.parse(body.output_text) as unknown;
  }

  if (!("output" in body) || !Array.isArray(body.output)) {
    return undefined;
  }
  for (const item of body.output) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("content" in item) ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (const content of item.content) {
      if (
        typeof content === "object" &&
        content !== null &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        return JSON.parse(content.text) as unknown;
      }
    }
  }

  return undefined;
};

const lessonDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["variants", "learningPath"],
  properties: {
    variants: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "kind",
          "title",
          "instructions",
          "sourceItems",
          "targetItems",
          "distractorItems",
          "relationships",
          "hints",
          "feedback",
          "languageMetadata",
          "accessibilityMetadata",
        ],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["standard", "scaffold", "challenge"] },
          title: { type: "string", minLength: 1, maxLength: 400 },
          instructions: { type: "string", minLength: 1, maxLength: 400 },
          sourceItems: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            items: { $ref: ITEM_SCHEMA_REFERENCE },
          },
          targetItems: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { $ref: ITEM_SCHEMA_REFERENCE },
          },
          distractorItems: {
            type: "array",
            maxItems: 2,
            items: { $ref: ITEM_SCHEMA_REFERENCE },
          },
          relationships: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { $ref: "#/$defs/relationship" },
          },
          hints: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string", minLength: 1, maxLength: 400 },
          },
          feedback: {
            type: "object",
            additionalProperties: false,
            required: ["correct", "incorrect"],
            properties: {
              correct: { type: "string" },
              incorrect: { type: "string" },
            },
          },
          languageMetadata: {
            type: "object",
            additionalProperties: false,
            required: ["language", "direction", "locale"],
            properties: {
              language: { type: "string", enum: ["en", "ar"] },
              direction: { type: "string", enum: ["ltr", "rtl"] },
              locale: { type: "string" },
            },
          },
          accessibilityMetadata: {
            type: "object",
            additionalProperties: false,
            required: ["instructions", "sourceGroupLabel", "targetGroupLabel"],
            properties: {
              instructions: { type: "string" },
              sourceGroupLabel: { type: "string" },
              targetGroupLabel: { type: "string" },
            },
          },
        },
      },
    },
    learningPath: {
      type: "object",
      additionalProperties: false,
      required: ["direction", "steps", "rationale", "nextScreenRationale"],
      properties: {
        direction: { type: "string", enum: ["forward", "reverse"] },
        steps: {
          type: "array",
          minItems: 2,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["nodeId", "screenPurposeId"],
            properties: {
              nodeId: { type: "string" },
              screenPurposeId: { type: "string" },
            },
          },
        },
        rationale: { type: "string" },
        nextScreenRationale: { type: "string" },
      },
    },
  },
  $defs: {
    item: {
      type: "object",
      additionalProperties: false,
      required: ["id", "label"],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
      },
    },
    relationship: {
      type: "object",
      additionalProperties: false,
      required: ["id", "sourceId", "targetId"],
      properties: {
        id: { type: "string" },
        sourceId: { type: "string" },
        targetId: { type: "string" },
      },
    },
  },
} as const;
export const createOpenAILessonDraftProvider = (
  options: OpenAILessonDraftProviderOptions
): LessonDraftProvider => {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const provenance: ProviderProvenance = {
    provider: "openai",
    model: options.model,
    promptTemplateVersion,
    validatorVersion,
  };

  return {
    provenance,
    async generate(request, context, callOptions) {
      const timeoutMs = options.timeoutMs ?? defaultProviderTimeoutMs;
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = callOptions?.signal
        ? AbortSignal.any([callOptions.signal, timeoutSignal])
        : timeoutSignal;
      let response: Response;
      try {
        response = await fetchImplementation(
          `${baseUrl.replace(/\/$/u, "")}/responses`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: options.model,
              input: buildPrompt(request, context),
              text: {
                format: {
                  type: "json_schema",
                  name: "edu_canvas_lesson_draft",
                  strict: true,
                  schema: lessonDraftJsonSchema,
                },
              },
            }),
            signal,
          }
        );
      } catch {
        throw new LessonProviderError(
          "timeout",
          "The lesson provider could not be reached. Try again."
        );
      }

      if (!response.ok) {
        if (response.status === 408 || response.status === 504) {
          throw new LessonProviderError(
            "timeout",
            "The lesson provider timed out. Try again."
          );
        }
        if (response.status === 429) {
          throw new LessonProviderError(
            RATE_LIMIT_KIND,
            "The lesson provider is busy. Try again in a moment."
          );
        }
        if (response.status >= 500) {
          throw new LessonProviderError(
            "transient",
            "The lesson provider is temporarily unavailable. Try again."
          );
        }
        throw new LessonProviderError(
          "terminal",
          "The lesson provider rejected this generation request."
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new LessonProviderError(
          "terminal",
          "The lesson provider returned an unreadable response."
        );
      }

      let draft: unknown;
      try {
        draft = extractResponseDraft(body);
      } catch {
        throw new LessonProviderError(
          "terminal",
          "The lesson provider returned malformed lesson content."
        );
      }

      if (!draft) {
        throw new LessonProviderError(
          "terminal",
          "The lesson provider returned no lesson content."
        );
      }

      return {
        draft,
      };
    },
  };
};

export {
  type NormalizedGenerationRequest,
  type ProviderProvenance,
} from "./types";
