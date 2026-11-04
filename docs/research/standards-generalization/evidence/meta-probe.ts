/**
 * Meta model role probe (muse-spark-1.2-contributor only, AgDR-0006).
 * Calls the Meta adapter directly, not the generation service (service.ts:190
 * rejects non-fraction standards). Hard cap M=9 calls; K<=12 reviewer cases.
 * Reads META_* from the environment by name; never prints values.
 *
 * Run from the repo root:
 *   node --env-file=.env --import tsx docs/research/standards-generalization/evidence/meta-probe.ts
 *
 * Roles:
 *   A. draft generator  x3 calls (4.OA.A.3 pack context): schema fit, latency, correction rate
 *   B. advisory reviewer x4 calls (batched K=12 provisional cases, 3 per call) -> warning-only agreement
 *   C. offline pack author x2 calls: 18 4.OA.A.3 components -> screen purposes (human review before storing)
 * Labels: reviewer cases are "provisional, not teacher evidence, not #106".
 */
import { readFileSync, writeFileSync } from "node:fs";

import { createMetaLessonDraftProvider } from "@/server/generation/provider";
import { validateProviderDraft } from "@/server/generation/validation";

const CAP = 9;
const here = "docs/research/standards-generalization/evidence";
// Only the key is required; model and base URL default as in src/server/config.ts:256-259.
const apiKey = process.env.META_API_KEY || process.env.OPENAI_API_KEY;
const model = process.env.META_MODEL || "muse-spark-1.2-contributor";
const baseUrl = process.env.META_BASE_URL || "https://api.meta.ai/v1";

if (!apiKey) {
  console.log(JSON.stringify({ status: "pending META key", calls: 0 }));
  process.exit(0);
}
if (model !== "muse-spark-1.2-contributor") {
  console.log(
    JSON.stringify({
      status: "refused: only the proven model is allowed",
      calls: 0,
    })
  );
  process.exit(1);
}

let calls = 0;
const log: unknown[] = [];
const budget = () => {
  calls += 1;
  if (calls > CAP) {
    throw new Error("call cap reached");
  }
};

const components = (
  JSON.parse(
    readFileSync(`${here}/lc-probe-out/04-components-4-oa-a-3.json`, "utf-8")
  ) as { data: { identifier: string; description: string }[] }
).data;

// A. Draft generator.
const provider = createMetaLessonDraftProvider({
  apiKey,
  model,
  baseUrl,
  timeoutMs: 100_000,
});
const request = {
  prompt:
    "Grade 4: match multistep word problems to equations (4.OA.A.3). Use whole numbers.",
  grade: 4,
  standardId: "standard_ccss_4_oa_a_03",
  language: "en" as const,
  difficulty: "on-level" as const,
};
const context = {
  correctionAttempt: false,
  diagnostics: [],
  curriculumContext: {
    nodes: [
      { id: "node_3_oa_d_8", screenPurposeId: "sp_two_step" },
      { id: "node_4_oa_a_3", screenPurposeId: "sp_multistep" },
    ],
    edges: [{ prerequisiteId: "node_3_oa_d_8", successorId: "node_4_oa_a_3" }],
    targetNodeId: "node_4_oa_a_3",
  },
};
for (let i = 0; i < 3; i += 1) {
  budget();
  const started = performance.now();
  try {
    // eslint-disable-next-line no-await-in-loop -- calls run one at a time; each counts against the cap.
    const { draft } = await provider.generate(request, context as never);
    const result = validateProviderDraft(draft, { expectedLanguage: "en" });
    let corrected: boolean | null = null;
    if (!result.ok && calls < CAP) {
      budget();
      // eslint-disable-next-line no-await-in-loop -- calls run one at a time; each counts against the cap.
      const retry = await provider.generate(request, {
        ...context,
        correctionAttempt: true,
        diagnostics: result.diagnostics,
      } as never);
      corrected = validateProviderDraft(retry.draft, {
        expectedLanguage: "en",
      }).ok;
    }
    log.push({
      role: "generator",
      ok: result.ok,
      corrected,
      codes: result.diagnostics.map((d) => d.code),
      latencyMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    log.push({
      role: "generator",
      error: (error as Error).message,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}

const rawCall = async (
  input: string
): Promise<{ text: string; latencyMs: number }> => {
  budget();
  const started = performance.now();
  const response = await fetch(`${baseUrl.replace(/\/$/u, "")}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(100_000),
  });
  const body = (await response.json()) as {
    output_text?: string;
    output?: { content?: { text?: string }[] }[];
  };
  const text =
    body.output_text ??
    body.output
      ?.flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? "")
      .join("") ??
    "";
  return { text, latencyMs: Math.round(performance.now() - started) };
};

// B. Advisory reviewer: K=12 provisional cases; label = expected "pass" | "warning".
const cases = [
  [
    "3 boxes of 12 pens, 5 given away. How many left?",
    "3 × 12 − 5 = p",
    "pass",
  ],
  [
    "3 boxes of 12 pens, 5 given away. How many left?",
    "3 × 12 + 5 = p",
    "warning",
  ],
  [
    "50 apples shared by 6 kids; leftovers to teacher. Each kid gets?",
    "50 ÷ 6 = 8 r 2",
    "pass",
  ],
  [
    "50 apples shared by 6 kids; leftovers to teacher. Each kid gets?",
    "50 × 6 = a",
    "warning",
  ],
  ["4 teams of 9 and 6 coaches. How many people?", "4 × 9 + 6 = p", "pass"],
  ["4 teams of 9 and 6 coaches. How many people?", "9 + 6 × 4 = p", "warning"],
  [
    "Main idea: bees help farms. Detail: bees carry pollen between crops.",
    "supports",
    "pass",
  ],
  [
    "Main idea: bees help farms. Detail: honey is sweet.",
    "supports",
    "warning",
  ],
  [
    "Main idea: storms shape coasts. Detail: waves erode cliffs.",
    "supports",
    "pass",
  ],
  [
    "Main idea: storms shape coasts. Detail: sand is made of rock.",
    "supports",
    "warning",
  ],
  ["90 stickers in bags of 7. How many full bags?", "90 ÷ 7 = 12 r 6", "pass"],
  ["90 stickers in bags of 7. How many full bags?", "90 ÷ 7 = 13", "warning"],
] as const;
let agree = 0;
let judged = 0;
for (let i = 0; i < 12; i += 3) {
  if (calls >= CAP) {
    break;
  }
  const batch = cases.slice(i, i + 3);
  // eslint-disable-next-line no-await-in-loop -- calls run one at a time; each counts against the cap.
  const { text, latencyMs } = await rawCall(
    `You review Grade 4-5 matching pairs. For each pair answer only "pass" or "warning" (warning = the pair looks wrong). Return a JSON array of 3 strings.\n${batch.map((c, j) => `${j + 1}. ${c[0]} => ${c[1]}`).join("\n")}`
  );
  let verdicts: string[] = [];
  try {
    verdicts = JSON.parse(
      text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)
    ) as string[];
  } catch {
    /* unparsed */
  }
  for (const [j, c] of batch.entries()) {
    judged += 1;
    if (verdicts[j] === c[2]) {
      agree += 1;
    }
  }
  log.push({
    role: "reviewer",
    latencyMs,
    verdicts,
    labels: batch.map((c) => c[2]),
  });
}

// C. Offline pack author (proposal only; a person reviews before storing a versioned pack record).
if (calls < CAP) {
  const { text, latencyMs } = await rawCall(
    `Group these 4.OA.A.3 learning components into at most 4 lesson screen purposes (worked example, guided practice, independent check, follow-up). Return JSON [{screenPurpose, componentIds[]}]. Use only the ids given.\n${components.map((c) => `${c.identifier}: ${c.description}`).join("\n")}`
  );
  writeFileSync(`${here}/meta-pack-author-proposal.txt`, text);
  log.push({
    role: "pack-author",
    latencyMs,
    status: "proposal — needs human review",
  });
}

const out = {
  label: "provisional, not teacher evidence, not #106",
  model,
  calls,
  cap: CAP,
  reviewerAgreement: `${agree}/${judged}`,
  log,
};
writeFileSync(`${here}/meta-probe.out.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
