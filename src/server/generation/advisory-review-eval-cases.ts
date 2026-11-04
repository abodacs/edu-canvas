import {
  fractionEquivalencePack,
  multistepWordProblemsPack,
  ri52MainIdeaPack,
} from "@/server/curriculum/built-in-packs";
import { parseTenantId } from "@/server/identity/identifiers";
import { createCurriculumContextFromPack } from "./semantic-validation";

import { reviewDraftForAcceptance } from "./draft-acceptance";
import { createEquivalentFractionsDraft } from "./provider";
import type {
  NormalizedGenerationRequest,
  ProviderLessonDraft,
  ProviderProvenance,
} from "./types";
import type { VersionedCurriculumContext } from "./semantic-validation-contract";
import type { StandardsPack } from "@/server/curriculum/standards-pack";

/**
#223: the provisional K≤12 cases for the advisory reviewer's measured run.

Every case is a draft plus the standards-pack context the deterministic gate
would use, so the run can compare the reviewer's warning against the gate's own
verdict. These are not #106 eval cases and carry no expected answer key: the
fraction/word-problem/main-idea packs supply the answer rules.

`scripts/advisory-review-eval.ts` consumes this module. It is test-support
evidence, not a production entry point.
*/

export type AdvisoryReviewEvalCaseKind = "control" | "defect";

export interface AdvisoryReviewEvalCase {
  id: string;
  kind: AdvisoryReviewEvalCaseKind;
  /** Where the draft came from: a characterization fixture or the pack fixture. */
  source: "characterization-fixture" | "pack-draft";
  standardCode: string;
  context: VersionedCurriculumContext;
  draft: ProviderLessonDraft;
  /** The deterministic gate's own verdict for the same draft and context. */
  deterministicState: "ready-for-review" | "blocked-by-validation";
  deterministicCodes: readonly string[];
}

const tenantId = parseTenantId(fractionEquivalencePack.tenantId);

const fixtureProvenance: ProviderProvenance = {
  provider: "advisory-review-eval-fixture",
  model: "fixture-model",
  promptTemplateVersion: "fixture-template-v1",
  validatorVersion: "lesson-validator-v2",
};

const requestFor = (
  pack: StandardsPack,
  prompt: string
): NormalizedGenerationRequest => {
  return {
    prompt,
    grade: pack.grade,
    standardId: pack.standardId,
    language: "en",
    difficulty: "on-level",
  };
};

const contextFor = (pack: StandardsPack): VersionedCurriculumContext => {
  return createCurriculumContextFromPack(
    pack,
    { grade: pack.grade, language: "en" },
    tenantId
  );
};

const packDraft = (pack: StandardsPack): ProviderLessonDraft => {
  return createEquivalentFractionsDraft(
    requestFor(pack, pack.promptFrame.taskLine),
    {
      frame: pack.promptFrame,
      examples: pack.examples,
      curriculum: {
        nodes: pack.graph.nodes.map((node) => {
          return { id: node.id, screenPurposeId: node.screenPurposeId };
        }),
        edges: pack.graph.edges,
        targetNodeId: pack.graph.targetNodeId,
      },
    }
  );
};

/**
Replace the label a relationship points at, so exactly one pair becomes wrong
without touching the structure. This mirrors what the characterization harness
does; the answer rule decides whether it blocks.
*/
const withWrongTargetLabel = (
  draft: ProviderLessonDraft,
  label: string
): ProviderLessonDraft => {
  const [variant, ...rest] = draft.variants;
  if (!variant) {
    throw new Error("The fixture draft needs a first variant.");
  }
  const [relationship] = variant.relationships;
  if (!relationship) {
    throw new Error("The fixture draft needs a relationship.");
  }
  return {
    ...draft,
    variants: [
      {
        ...variant,
        targetItems: variant.targetItems.map((item) => {
          return item.id === relationship.targetId ? { ...item, label } : item;
        }),
      },
      ...rest,
    ],
  };
};

const withWrongSourceLabel = (
  draft: ProviderLessonDraft,
  label: string
): ProviderLessonDraft => {
  const [variant, ...rest] = draft.variants;
  if (!variant) {
    throw new Error("The fixture draft needs a first variant.");
  }
  const [relationship] = variant.relationships;
  if (!relationship) {
    throw new Error("The fixture draft needs a relationship.");
  }
  return {
    ...draft,
    variants: [
      {
        ...variant,
        sourceItems: variant.sourceItems.map((item) => {
          return item.id === relationship.sourceId ? { ...item, label } : item;
        }),
      },
      ...rest,
    ],
  };
};

const gateOf = async (
  draft: ProviderLessonDraft,
  context: VersionedCurriculumContext,
  suffix: string
): Promise<
  Pick<AdvisoryReviewEvalCase, "deterministicState" | "deterministicCodes">
> => {
  const result = await reviewDraftForAcceptance(
    {
      draft,
      input: {
        prompt: `Advisory review eval ${suffix}`,
        grade: context.grade,
        standardId: context.standardId,
        language: "en",
        difficulty: "on-level",
      },
      tenantId,
      requestId: `draft_req_advisory_eval_${suffix}`,
      provenance: fixtureProvenance,
      structuralDiagnostics: [],
      graphVersion: context.graphVersion,
    },
    { curriculumContext: () => context }
  );

  return {
    deterministicState:
      result.state === "ready-for-review"
        ? "ready-for-review"
        : "blocked-by-validation",
    deterministicCodes: [
      ...new Set(result.diagnostics.map((diagnostic) => diagnostic.code)),
    ].toSorted(),
  };
};

const buildCase = async ({
  id,
  kind,
  source,
  pack,
  draft,
}: {
  id: string;
  kind: AdvisoryReviewEvalCaseKind;
  source: AdvisoryReviewEvalCase["source"];
  pack: StandardsPack;
  draft: ProviderLessonDraft;
}): Promise<AdvisoryReviewEvalCase> => {
  const context = contextFor(pack);
  const gate = await gateOf(draft, context, id);
  return {
    id,
    kind,
    source,
    standardCode: pack.standardCode,
    context,
    draft,
    ...gate,
  };
};

export const buildAdvisoryReviewEvalCases = async (): Promise<
  AdvisoryReviewEvalCase[]
> => {
  const fractionDraft = packDraft(fractionEquivalencePack);
  const wordProblemDraft = packDraft(multistepWordProblemsPack);
  const mainIdeaDraft = packDraft(ri52MainIdeaPack);

  const cases = await Promise.all([
    buildCase({
      id: "fraction-control",
      kind: "control",
      source: "pack-draft",
      pack: fractionEquivalencePack,
      draft: fractionDraft,
    }),
    buildCase({
      id: "fraction-wrong-target",
      kind: "defect",
      source: "characterization-fixture",
      pack: fractionEquivalencePack,
      draft: withWrongTargetLabel(fractionDraft, "5/7"),
    }),
    buildCase({
      id: "word-problem-control",
      kind: "control",
      source: "pack-draft",
      pack: multistepWordProblemsPack,
      draft: wordProblemDraft,
    }),
    buildCase({
      id: "word-problem-wrong-equation",
      kind: "defect",
      source: "characterization-fixture",
      pack: multistepWordProblemsPack,
      draft: withWrongTargetLabel(wordProblemDraft, "4 + 6 − 5 = p"),
    }),
    buildCase({
      id: "main-idea-control",
      kind: "control",
      source: "pack-draft",
      pack: ri52MainIdeaPack,
      draft: mainIdeaDraft,
    }),
    buildCase({
      id: "main-idea-absent-detail",
      kind: "defect",
      source: "characterization-fixture",
      pack: ri52MainIdeaPack,
      draft: withWrongSourceLabel(
        mainIdeaDraft,
        "Bees build their hives inside flowers."
      ),
    }),
  ]);

  return cases;
};
