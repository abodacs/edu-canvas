import { fractionEquivalencePack } from "@/server/curriculum/built-in-packs";

import { validatorVersion } from "./validation";
import type { LessonLanguage } from "@/shared/generation-contract";
import type {
  AnswerRule,
  StandardsPackExample,
  StandardsPackPromptFrame,
} from "@/server/curriculum/standards-pack";

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

export const promptTemplateVersion = "lesson-prompt-v2";
export const defaultProviderTimeoutMs = 100_000;

export interface ProviderCurriculumContext {
  nodes: readonly { id: string; screenPurposeId: string }[];
  edges: readonly { prerequisiteId: string; successorId: string }[];
  targetNodeId: string;
}

/**
 * The task the standards pack asks for (#221): the line the lesson must ask the
 * learner to perform, the two group labels the matching screen shows, and the
 * item counts the draft should carry. The prompt is built from this, and the
 * deterministic fixture builds its draft from the same values.
 */
export type ProviderPromptFrame = StandardsPackPromptFrame;

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
  /**
   * Present whenever the request resolves a standards pack. A context without
   * one keeps the fixture's seeded equivalent-fractions framing.
   */
  promptFrame?: ProviderPromptFrame;
  /**
   * The pack's subject-correct relationships. The deterministic fixture builds
   * its draft from these, so an offline run obeys the pack's own answer rule
   * instead of always emitting equivalent-fraction pairs.
   */
  examples?: readonly StandardsPackExample[];
  /**
   * The pack's answer rules. The prompt states the declared problems and the
   * approved passage so a live provider call can satisfy the same rule the
   * offline fixture and the validator apply.
   */
  answerRules?: readonly AnswerRule[];
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

export interface MetaLessonDraftProviderOptions {
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

/**
The fixture's own item copy. It stays the seeded equivalent-fractions pairs so a
deterministic run reproduces the published demo lesson. Everything that names
the task — the task line, both group labels and the item counts — comes from the
pack's prompt frame, so an offline run describes the same task as a live
provider call (#221).
*/
const fixturePairs = [
  { source: "1/2", target: "2/4" },
  { source: "2/3", target: "4/6" },
  { source: "3/4", target: "6/8" },
  { source: "1/3", target: "2/6" },
  { source: "2/5", target: "4/10" },
  { source: "3/5", target: "6/10" },
  { source: "1/6", target: "2/12" },
  { source: "1/8", target: "2/16" },
] as const;

const fixtureDecoys = ["2/3", "3/8"] as const;

/** The structural validator caps a matching draft at 8 source items. */
const maximumFixturePairs = fixturePairs.length;

/**
The frame the fixture follows when no pack frame reaches it: the seeded
equivalent-fractions pack. A resolved pack context always supplies its own.
*/
const defaultFixtureFrame: ProviderPromptFrame =
  fractionEquivalencePack.promptFrame;

const resolveFixtureFrame = (
  context?: ProviderGenerationContext
): ProviderPromptFrame => context?.promptFrame ?? defaultFixtureFrame;

/**
The seeded path is the equivalent-fractions lesson. A resolved pack brings its
own graph, so the fixture walks that pack's nodes instead of the seed's.
*/
const createLearningPath = (
  request: NormalizedGenerationRequest,
  curriculum?: ProviderCurriculumContext
): NonNullable<ProviderLessonDraft["learningPath"]> => {
  if (curriculum) {
    return {
      direction: "forward",
      steps: curriculum.nodes.map((node) => {
        return {
          nodeId: node.id,
          screenPurposeId: node.screenPurposeId,
        };
      }),
      rationale: localizedText(
        request.language,
        "Start with the prerequisite skill so the lesson reaches the matching target in one visible step.",
        "نبدأ بالمهارة السابقة حتى يصل الدرس إلى الهدف المطابق في خطوة واضحة."
      ),
      nextScreenRationale: localizedText(
        request.language,
        "The matching screen shows the target skill before teacher review.",
        "تعرض شاشة المطابقة المهارة المستهدفة قبل مراجعة المعلم."
      ),
    };
  }

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

interface LocalizedCopy {
  readonly en: string;
  readonly ar: string;
}

interface FixtureVariantPlan {
  readonly index: number;
  readonly kind: VariantKind;
  readonly sourceCount: number;
  readonly targetCount: number;
  /** The fixture clamps this to the structural distractor cap. */
  readonly distractorCount: number;
  readonly title?: LocalizedCopy;
  readonly instructions?: LocalizedCopy;
  readonly extraHints?: readonly LocalizedCopy[];
}

/**
The pack frame carries one language: English. An Arabic request keeps the
fixture's own Arabic copy, so the deterministic lesson stays fully Arabic.
*/
const arabicFixtureCopy = {
  taskLine: "طابق كل كسر مع اسم آخر للجزء نفسه من الكل.",
  instructions: "تعليمات لمطابقة الكسور المكافئة",
  sourceGroupLabel: "الكسور المطلوب مطابقتها",
  targetGroupLabel: "الكسور المكافئة المحتملة",
  hint: "اقرأ كل عنصر قبل أن تختار ما ينتمي إليه.",
  correct: "كل مطابقة تربط عنصرًا بما ينتمي إليه.",
  incorrect: "مطابقة واحدة لا تنتمي بعد. راجع كل زوج مرة أخرى.",
} as const;

const fixtureHint: LocalizedCopy = {
  en: "Read each item on the left before you choose its match.",
  ar: arabicFixtureCopy.hint,
};

const createVariant = (
  request: NormalizedGenerationRequest,
  frame: ProviderPromptFrame,
  plan: FixtureVariantPlan,
  pairs: readonly StandardsPackExample[]
): ProviderVariant => {
  const { language } = request;
  const sourceItems = pairs
    .slice(0, plan.sourceCount)
    .map((pair, itemIndex) => {
      return {
        id: `source-${plan.index}-${itemIndex + 1}`,
        label: pair.source,
      };
    });
  const targetItems = pairs
    .slice(0, plan.targetCount)
    .map((pair, itemIndex) => {
      return {
        id: `target-${plan.index}-${itemIndex + 1}`,
        label: pair.target,
      };
    });
  const relationshipCount = Math.min(sourceItems.length, targetItems.length);
  const distractorCount = Math.min(
    plan.distractorCount,
    Math.floor(sourceItems.length / 4)
  );
  const distractorItems = fixtureDecoys
    .slice(0, distractorCount)
    .map((label, itemIndex) => {
      return {
        id:
          itemIndex === 0
            ? `distractor-${plan.index}`
            : `distractor-${plan.index}-near`,
        label,
      };
    });

  return {
    id: `variant-${plan.index}`,
    kind: plan.kind,
    title: localizedText(
      language,
      plan.title?.en ??
        `${variantKindTitles[plan.kind].en} — ${frame.targetGroupLabel}`,
      plan.title?.ar ?? variantKindTitles[plan.kind].ar
    ),
    instructions: localizedText(
      language,
      plan.instructions?.en ?? frame.taskLine,
      plan.instructions?.ar ?? arabicFixtureCopy.taskLine
    ),
    sourceItems,
    targetItems,
    distractorItems,
    relationships: sourceItems
      .slice(0, relationshipCount)
      .map((source, itemIndex) => {
        return {
          id: `relationship-${plan.index}-${itemIndex + 1}`,
          sourceId: source.id,
          targetId: targetItems[itemIndex]?.id ?? "",
        };
      }),
    hints: [
      {
        en: fixtureHint.en,
        ar: fixtureHint.ar,
      },
      ...(plan.extraHints ?? []),
    ].map((hint) => localizedText(language, hint.en, hint.ar)),
    feedback: {
      correct: localizedText(
        language,
        "Every match pairs an item with the one that belongs with it.",
        arabicFixtureCopy.correct
      ),
      incorrect: localizedText(
        language,
        "One match does not belong yet. Check each pair again.",
        arabicFixtureCopy.incorrect
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
        frame.taskLine,
        arabicFixtureCopy.instructions
      ),
      sourceGroupLabel: localizedText(
        language,
        frame.sourceGroupLabel,
        arabicFixtureCopy.sourceGroupLabel
      ),
      targetGroupLabel: localizedText(
        language,
        frame.targetGroupLabel,
        arabicFixtureCopy.targetGroupLabel
      ),
    },
  };
};

/** A variant two pairs wider than the frame's base, capped by the pair list. */
const addPairs = (count: number, maximum: number): number => {
  return Math.min(count + 2, maximum);
};

export interface FixtureDraftOptions {
  /**
   * The pack frame the draft must follow. Defaults to the seeded
   * equivalent-fractions frame.
   */
  readonly frame?: ProviderPromptFrame;
  /**
   * The pack's subject-correct relationships. Defaults to the seeded
   * equivalent-fractions pairs.
   */
  readonly examples?: readonly StandardsPackExample[];
  /** The resolved pack graph the learning path must walk. */
  readonly curriculum?: ProviderCurriculumContext;
}

export const createEquivalentFractionsDraft = (
  request: NormalizedGenerationRequest,
  options: FixtureDraftOptions = {}
): ProviderLessonDraft => {
  const frame = options.frame ?? defaultFixtureFrame;
  const pairs = options.examples ?? fixturePairs;
  const maximumPairs = Math.min(pairs.length, maximumFixturePairs);
  // The studio asks a teacher to choose between the two standard cards, so the
  // fixture gives them different interaction structures, titles, and copy —
  // otherwise the draft notes correctly flag them as duplicates (#168 P1-3).
  // Item-count caps from the structural validator steer the shapes: a 3-item
  // set carries no decoys (floor(3/4) = 0) and an 8-item set may carry two.
  const wideSourceCount = addPairs(frame.sourceItemCount, maximumPairs);
  const wideTargetCount = addPairs(frame.targetItemCount, maximumPairs);
  const widePairs = Math.min(wideSourceCount, wideTargetCount);

  const practice = createVariant(
    request,
    frame,
    {
      index: 1,
      kind: "standard",
      sourceCount: frame.sourceItemCount,
      targetCount: frame.targetItemCount,
      distractorCount: 1,
    },
    pairs
  );

  const explore = createVariant(
    request,
    frame,
    {
      index: 2,
      kind: "standard",
      sourceCount: wideSourceCount,
      targetCount: wideTargetCount,
      distractorCount: 2,
      title: {
        en: `Explore — ${frame.targetGroupLabel}`,
        ar: "استكشاف الكسور المكافئة",
      },
      instructions: {
        en: `Match all ${widePairs} pairs, and watch for decoys that look close but do not belong.`,
        ar: "طابق كل الأزواج، وانتبه للأفخاخ التي تبدو قريبة لكنها لا تنتمي.",
      },
    },
    pairs
  );

  // The guided card carries the gentlest load: the frame's own pair count, no
  // decoys, and an extra support move, so its structure visibly differs from
  // practice.
  const scaffold = createVariant(
    request,
    frame,
    {
      index: 3,
      kind: "scaffold",
      sourceCount: frame.sourceItemCount,
      targetCount: frame.targetItemCount,
      distractorCount: 0,
      instructions: {
        en: "Work one pair at a time, with a hint before your first match.",
        ar: "زوج واحد فقط في كل مرة، مع إرشاد قبل أول مطابقة.",
      },
      extraHints: [
        {
          en: "Take one pair at a time: read the left item fully before you choose.",
          ar: "زوج واحد فقط في كل مرة: اقرأ العنصر كاملًا قبل أن تختار.",
        },
      ],
    },
    pairs
  );

  // The review card adds the reasoning demand: two decoys and an
  // explain-the-decoy instruction, while the correct pairs stay canonical.
  const review = createVariant(
    request,
    frame,
    {
      index: 4,
      kind: "challenge",
      sourceCount: wideSourceCount,
      targetCount: wideTargetCount,
      distractorCount: 2,
      instructions: {
        en: `Match all ${widePairs} pairs, then explain why the close decoy does not belong.`,
        ar: "طابق كل الأزواج، ثم اشرح لماذا الفخ القريب لا ينتمي.",
      },
      extraHints: [
        {
          en: "Before you match, say which group each item belongs to.",
          ar: "قبل أن تطابق، قل إلى أي مجموعة ينتمي كل عنصر.",
        },
      ],
    },
    pairs
  );

  return {
    learningPath: createLearningPath(request, options.curriculum),
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

    generate(request, context) {
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

      const draft = createEquivalentFractionsDraft(request, {
        frame: resolveFixtureFrame(context),
        ...(context.examples && { examples: context.examples }),
        ...(context.curriculumContext && {
          curriculum: context.curriculumContext,
        }),
      });
      if (shouldBeInvalid) {
        draft.variants[0].relationships[0].targetId = "missing-target";
      }

      return Promise.resolve({
        draft,
      });
    },
  };
};

const findAnswerRule = <K extends AnswerRule["kind"]>(
  rules: readonly AnswerRule[] | undefined,
  kind: K
): Extract<AnswerRule, { kind: K }> | undefined => {
  return rules?.find((rule): rule is Extract<AnswerRule, { kind: K }> => {
    return rule.kind === kind;
  });
};

/**
 * The prompt states the pack's declared problems and approved passage so a
 * live provider call can produce relationships the pack's own answer rule can
 * verify. Answers are never included: the rule owns them.
 */
const answerRuleInstruction = (
  answerRules: readonly AnswerRule[] | undefined
): string => {
  const wholeNumber = findAnswerRule(answerRules, "whole-number-expression");
  const evidence = findAnswerRule(answerRules, "text-evidence");
  const lines = [
    wholeNumber
      ? `Use these problem statements verbatim as the source items, without changing their wording: ${wholeNumber.problems
          .map((problem) => `"${problem.text}"`)
          .join(" ")}. Do not include or reveal an answer key.`
      : "",
    evidence
      ? `Every detail in the source items must come from this approved passage, quoted verbatim: "${evidence.passage}".`
      : "",
  ];
  return lines.filter((line) => line.length > 0).join("\n");
};

/**
 * The provider prompt is framed by the standards pack (#221). The task line,
 * both group labels, the item counts, the curator reference, and the answer
 * rule's declared problems or passage all come from the pack, so a 4.OA.A.3
 * lesson asks for word-problem → equation matching and a 4.NF.A.1 lesson keeps
 * its equivalent-fraction matching.
 */
export const buildLessonPrompt = (
  request: NormalizedGenerationRequest,
  context: ProviderGenerationContext
): string => {
  const frame = context.promptFrame;
  const curriculum = context.curriculumContext;
  const reference = context.referenceContext;
  const approvedNodes = curriculum?.nodes
    .map((node) => `${node.id} (${node.screenPurposeId})`)
    .join(", ");
  const approvedEdges = curriculum?.edges
    .map((edge) => `${edge.prerequisiteId} -> ${edge.successorId}`)
    .join(", ");
  const frameInstruction = frame
    ? `Task: ${frame.taskLine}`
    : "Task: match each item with the one it belongs with, following the teacher request.";
  const itemInstruction = frame
    ? `Create exactly two standard variants, one scaffold variant, and one challenge variant. Each variant needs exactly ${frame.sourceItemCount} source items from "${frame.sourceGroupLabel}", ${frame.targetItemCount} matching target items from "${frame.targetGroupLabel}", zero distractor items, stable ids, one hint, deterministic feedback, language metadata, and accessibility metadata.`
    : "Create exactly two standard variants, one scaffold variant, and one challenge variant. Each variant needs at least 3 source items, at least one matching target item, stable ids, one hint, deterministic feedback, language metadata, and accessibility metadata.";
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
    "Create a structured lesson draft for a Scholé matching lesson.",
    frameInstruction,
    "Return only the canonical JSON contract. Never return HTML, CSS, JavaScript, A2UI, URLs, or executable content.",
    `Teacher request: ${request.prompt}`,
    `Grade: ${request.grade}. Primary standard: ${request.standardId}. Language: ${request.language}. Difficulty: ${request.difficulty}.`,
    itemInstruction,
    answerRuleInstruction(context.answerRules),
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
export const createMetaLessonDraftProvider = (
  options: MetaLessonDraftProviderOptions
): LessonDraftProvider => {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.meta.ai/v1";
  const provenance: ProviderProvenance = {
    provider: "meta",
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
              input: buildLessonPrompt(request, context),
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
