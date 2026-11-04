/**
 * Live S4 check: does `muse-spark-1.2-contributor`, prompted through #213's
 * pack frame, write subject-correct drafts that pass the real gate?
 *
 * Builds the provider context exactly as `buildProviderContext` in
 * `src/server/generation/service.ts` does (that helper is module-private), calls
 * the Meta adapter, then runs `validateProviderDraft` and
 * `reviewDraftForAcceptance`. It saves every draft. Hard cap: 4 calls
 * (M raised from 9 to 12; 8 were already spent).
 *
 * Run from the repository root:
 *   node --env-file=.env --import tsx docs/research/standards-generalization/evidence/meta-s4-live.ts
 */
import { writeFileSync } from "node:fs";

import { standardsPackRegistry } from "@/server/curriculum/registry";
import {
  resolveCurriculumContext,
  reviewDraftForAcceptance,
} from "@/server/generation/draft-acceptance";
import { createMetaLessonDraftProvider } from "@/server/generation/provider";
import type { ProviderGenerationContext } from "@/server/generation/provider";
import type { NormalizedGenerationRequest } from "@/server/generation/types";
import { validateProviderDraft } from "@/server/generation/validation";

const CAP = 4;
const here = "docs/research/standards-generalization/evidence";
const tenantId = "tenant_s4_live_probe";
const apiKey = process.env.META_API_KEY || process.env.OPENAI_API_KEY;
const model = process.env.META_MODEL || "muse-spark-1.2-contributor";
const baseUrl = process.env.META_BASE_URL || "https://api.meta.ai/v1";

if (!apiKey) {
  console.log(JSON.stringify({ status: "pending META key", calls: 0 }));
  process.exit(0);
}
if (model !== "muse-spark-1.2-contributor") {
  console.log(JSON.stringify({ status: "refused: unproven model", calls: 0 }));
  process.exit(1);
}

const provider = createMetaLessonDraftProvider({
  apiKey,
  model,
  baseUrl,
  timeoutMs: 100_000,
});

type Curriculum = NonNullable<ReturnType<typeof resolveCurriculumContext>>;

// Mirror of service.ts buildProviderContext; keep in step with it.
const buildContext = (
  curriculum: Curriculum,
  correctionAttempt: boolean,
  diagnostics: ProviderGenerationContext["diagnostics"]
): ProviderGenerationContext => {
  const { reference } = curriculum;
  return {
    correctionAttempt,
    diagnostics,
    ...(curriculum.promptFrame && { promptFrame: curriculum.promptFrame }),
    ...(curriculum.examples && { examples: curriculum.examples }),
    ...(curriculum.answerRules && { answerRules: curriculum.answerRules }),
    curriculumContext: {
      nodes: curriculum.nodes.map((node) => ({
        id: node.id,
        screenPurposeId: node.screenPurposeId,
      })),
      edges: curriculum.edges.map((edge) => ({
        prerequisiteId: edge.prerequisiteId,
        successorId: edge.successorId,
      })),
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

const probes = [
  {
    code: "4.OA.A.3",
    prompt:
      "Grade 4: match multistep word problems to the equation that represents each.",
  },
  {
    code: "4.OA.A.3",
    prompt:
      "Grade 4 support lesson: word problems with remainders, matched to equations.",
  },
  {
    code: "RI.5.2",
    prompt:
      "Match each key detail from the passage to the main idea it supports.",
  },
] as const;

let calls = 0;
const results: unknown[] = [];
const drafts: Record<string, unknown> = {};

for (const [index, probe] of probes.entries()) {
  const pack = standardsPackRegistry.resolve({
    tenantId,
    standard: probe.code,
  });
  if (!pack) {
    results.push({ probe: probe.code, error: "no standards pack" });
    continue;
  }
  const request: NormalizedGenerationRequest = {
    prompt: probe.prompt,
    grade: pack.grade,
    standardId: pack.standardId,
    language: "en",
    difficulty: "on-level",
  };
  const curriculum = resolveCurriculumContext(request, tenantId, {});
  if (!curriculum) {
    results.push({ probe: probe.code, error: "no curriculum context" });
    continue;
  }
  const started = performance.now();
  let correctionUsed = false;
  try {
    calls += 1;
    // eslint-disable-next-line no-await-in-loop -- calls run one at a time; each counts against the cap.
    let { draft } = await provider.generate(
      request,
      buildContext(curriculum, false, [])
    );
    let structural = validateProviderDraft(draft, { expectedLanguage: "en" });
    if (!structural.ok && calls < CAP) {
      calls += 1;
      correctionUsed = true;
      // eslint-disable-next-line no-await-in-loop -- one correction, counted against the cap.
      ({ draft } = await provider.generate(
        request,
        buildContext(curriculum, true, structural.diagnostics)
      ));
      structural = validateProviderDraft(draft, { expectedLanguage: "en" });
    }
    drafts[`${index + 1}-${probe.code}`] = draft;
    const latencyMs = Math.round(performance.now() - started);
    if (!structural.ok) {
      results.push({
        probe: probe.code,
        state: "blocked-by-validation (structural)",
        codes: structural.diagnostics.map((diagnostic) => diagnostic.code),
        correctionUsed,
        latencyMs,
      });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- acceptance follows its own call.
    const acceptance = await reviewDraftForAcceptance(
      {
        draft: structural.draft,
        input: request,
        tenantId,
        requestId: `draft_s4_live_${index + 1}`,
        provenance: provider.provenance,
        structuralDiagnostics: structural.diagnostics,
        graphVersion: curriculum.graphVersion,
      },
      {}
    );
    const codes: Record<string, number> = {};
    for (const diagnostic of acceptance.diagnostics) {
      const key = `${diagnostic.code}:${diagnostic.severity}`;
      codes[key] = (codes[key] ?? 0) + 1;
    }
    const [sample] = structural.draft.variants;
    results.push({
      probe: probe.code,
      packVersion: pack.packVersion,
      state: acceptance.state,
      codes,
      correctionUsed,
      latencyMs,
      sampleSources: sample?.sourceItems.map((item) => item.label),
      sampleTargets: sample?.targetItems.map((item) => item.label),
    });
  } catch (error) {
    results.push({
      probe: probe.code,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - started),
    });
  }
  if (calls >= CAP) {
    break;
  }
}

const out = {
  label: "provisional, not teacher evidence, not #106",
  model,
  calls,
  cap: CAP,
  results,
};
writeFileSync(
  `${here}/meta-s4-live.out.json`,
  `${JSON.stringify(out, null, 1)}\n`
);
writeFileSync(
  `${here}/meta-s4-live.drafts.json`,
  `${JSON.stringify(drafts, null, 1)}\n`
);
console.log(JSON.stringify(out, null, 1));
