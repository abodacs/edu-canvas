# Standards generalization: grounding and lesson validation beyond 4.NF.A.1 (#113, #30)

Status: **research record, finished 2026-11-04 except the V1/V3 generation rows.** All file:line citations were re-checked against `main` at `211e30f`. The fixture step that had not run now runs as a vitest characterization test, and its measured result is in [§2a](#2a-measured-fixture-outcomes). The async advisory reviewer was measured live in [§7a](#7a-measured-advisory-reviewer-run); the V1/V3 draft-generation model rows in §7 remain unrun. California is **out of scope by product decision (2026-11-04)**: Multi-State is the only shipped jurisdiction, so the CDE wording check is not required. No production code under `src/` changed in this record.

This record started as a local brief whose live evidence is not in the repository. Claims resting only on that evidence are marked **(uncommitted evidence)**:

- `lc-probe-out/*.json` and `lc-probe-log.json`: 5 of N=6 live Learning Commons calls, all HTTP 200, captured 2026-11-04.
- `db-readonly.out`: a read-only snapshot of a local `edu_canvas` database.

Committed evidence that this record cites:

- [142-mcp-eval/evidence.json](../142-mcp-eval/evidence.json), [free-text-evidence.json](../142-mcp-eval/free-text-evidence.json), [free-text.md](../142-mcp-eval/free-text.md)
- [IC1 evidence](../../hackathon/meta-global-2026/evidence/)
- [`scripts/lc-mcp-eval.ts`](../../../scripts/lc-mcp-eval.ts)
- The harness, [`standards-generalization.characterization.test.ts`](../../../src/server/generation/standards-generalization.characterization.test.ts)

**Terminology.** In this record, a **standards pack** is the versioned curriculum data that #30 proposes: graph, components, answer rules and allowed screen patterns. The repository already has a different term, **Pack**: the generated-pack publication model in [`src/server/publication/GLOSSARY.md`](../../../src/server/publication/GLOSSARY.md). The local brief said only "pack", and this record renames it to avoid the collision. A standards pack fills the **Curriculum port** gap recorded in [`src/server/grounding/GLOSSARY.md`](../../../src/server/grounding/GLOSSARY.md).

## What changed from the local brief

| Claim | Brief | Verified on `211e30f` |
| --- | --- | --- |
| B2 `resolveStandardPack` | `delivery.server.ts:34-47` | `src/server/grounding/delivery.server.ts:35-49` |
| B4 production `semanticValidation` call | `draft-acceptance.ts:288-292` | `src/server/generation/draft-acceptance.ts:302-306` |
| B4 provider reference | `service.ts:358-375` | `service.ts:357-375` (`buildProviderContext`; reference literal `:362-370`) |
| Advisory clamp | `semantic-validation.ts:263` | `:263-269` (`boundedAgentOptions`; the 5000 ms clamp is on `:265`; the default is 250 ms) |
| Advisory warning only | `semantic-validation.ts:136-158` | `:136-163` (`verdict: "warning"` on `:146`) |
| Unknown catalog fails closed | `a2ui-contract.ts:21-22` | The comment is on `:22`; the check is `hasUnknownCatalog` at `:460` |
| B11 seed catalog | DB stores `edu-canvas-matching-v0` (#110 open) | In the repository, the seed now pins `A2UI_CATALOG_VERSION` (`seed-data.ts:89`, fixed by `1b65da8`, PR #188). The DB value is from a local database seeded before that fix **(uncommitted evidence)**. #110 is still open on GitHub |
| Pre-mortem: "REST top-1 picked RI.4.2 over RI.5.2" | `free-text.md` | **Wrong.** Row `adv-ela-main-idea` ("teach students to identify the main idea of a text") has no expected code. REST returned `RI.3.2, RI.4.2, RI.1.2, RI.5.2, RI.2.2`; top-1 is **RI.3.2** (0.805), and RI.5.2 is rank 4 (`free-text-evidence.json:3056-3061`). The 43% exact hit@1 is correct (`free-text.md:13`) |
| §1 CA crosswalk "Jaccard=1" | evidence.json | Committed evidence records `matchType: "exact"` and `alignmentScore: 1` with `hasJaccard: false`. The Jaccard figure exists only in uncommitted evidence |
| §9 S2 "sequence after #115 lands" | #115 open | #115 was closed (completed) on 2026-10-31, so S2 is no longer sequenced behind it |
| §10 Q3 default "teacher acknowledgment per screen" | proposed | **Already implemented** by #5 (PR #167). Approving a screen requires acknowledging each of its warning codes (`publication/service.ts:484-498`, `WARNINGS_UNACKNOWLEDGED`), and publication lists unacknowledged codes as blockers (`:169-176`). Acknowledgment works per code per screen, deduplicated (`shared/publication-contract.ts:90-110`). So one acknowledgment covers all three unverified pairs on a screen |
| B7 one-node RI.5.2 path | blocked by `PATH_TOO_SHORT` | It is blocked **earlier**, by the structural gate (`INVALID_CONTRACT` at `learningPath.steps`, `validation.ts:55`). `PATH_TOO_SHORT` is reached only when the structural gate is bypassed. See §2a |

All other citations in §2 matched `211e30f` exactly.

## 1. Probe standards and coverage

| Probe | Learning Commons coverage | Evidence |
| --- | --- | --- |
| `4.NF.A.1` (Multi-State and CA) | Full: 5 components; prerequisites `4.OA.A.2` and `3.NF.A.3`; CA matches exactly (`alignmentScore` 1) | `evidence.json` runs `multi-state-4.NF.A.1`, `california-4.NF.A.1` |
| `4.OA.A.3` (non-fraction math from the #113 pilot registry) | Full: 18 components; prerequisites `4.NBT.A.3`, `4.NBT.B.6`, `3.OA.D.8`; CA 3 of 3 exact | `evidence.json` runs `multi-state-4.OA.A.3`, `california-4.OA.A.3` |
| `RI.5.2` (non-math, ELA) | **Partial.** MCP progression refuses non-math ("Progressions are only available for Common Core State Standard - Mathematics …"), with 0 progression rows. The REST search resolves it (top-1, score 0.926, CC BY 4.0) with **0 learning components and 0 prerequisites** **(uncommitted evidence)** | `evidence.json` `elaBoundary` (`:4259`); `lc-probe-out/01..03` |

Primary texts, verbatim, from thecorestandards.org (an unofficial mirror; the official PDFs were not fetched):

- **4.OA.A.3:** "Solve multistep word problems posed with whole numbers and having whole-number answers using the four operations, including problems in which remainders must be interpreted. Represent these problems using equations with a letter standing for the unknown quantity. Assess the reasonableness of answers using mental computation and estimation strategies including rounding."
- **RI.5.2:** "Determine two or more main ideas of a text and explain how they are supported by key details; summarize the text."

**California: out of scope (product decision 2026-11-04).** The pilot ships **Multi-State only**; California is not a supported jurisdiction and no California pack is planned. The CDE PDFs redirect to a WAF page, but that no longer blocks anything: the wording check is **not required**. If California is ever sold, download the two CDE PDFs in a browser and compare them to the Multi-State text before authoring a California pack version.

Consequence for #113: under the #113 rule R-04, RI.5.2 yields `skills-missing` and blocks generation. That rule is in an uncommitted note, `.scratch/tasks/113-source-grounding/113-source-grounding.md:103`. A non-math standards pack therefore cannot take its skills from Learning Commons today. Its skills must be written by hand from the primary text and labeled as a different kind of source.

## 2. Trace: where each probe breaks

The path is: teacher input → grounding → generation → validation → A2UI preview → learner run. Citations are on `211e30f`.

| # | Break point | `4.NF.A.1` | `4.OA.A.3` | `RI.5.2` |
| --- | --- | --- | --- | --- |
| B1 | `src/server/generation/service.ts:140-143,190-195`: `supportedStandardIds` holds only the seed id and code, so any other standard throws "Use Grade 4 equivalent fractions (4.NF.A.1)." **Measured (§2a)** | passes | **blocked** | **blocked** |
| B2 | `src/server/grounding/delivery.server.ts:35-49`: `resolveStandardPack` calls `resolveCurriculumContext` (`draft-acceptance.ts:226-234`), which falls back to `createSyntheticCurriculumContext`. That function never returns `undefined`, so **every standard reads as "pack exists"** (a false positive) | passes | false pass | false pass |
| B3 | `semantic-validation-contract.ts:134-149`: the synthetic context hardcodes `standardCode` 4.NF.A.1, `targetNodeId` `graph_node_equivalent_fractions` and the seed graph, whatever `standardId` is | correct | wrong graph | wrong graph |
| B4 | `service.ts:357-375`: the provider reference is always the seed `1/2` activity. `service.ts:365,594` pin `graphVersion` to `equivalent-fractions-v1`, so a real standards pack gets `CURRICULUM_GRAPH_VERSION_UNSUPPORTED` (`draft-acceptance.ts:117-123`) | passes | blocked once B3 is fixed | same |
| B5 | `provider.ts:445`: the prompt's first line says "equivalent-fractions matching". `provider.ts:449` fixes 3 source and 3 target items. In the fixture path (`provider.ts:101-127,217`), the path and items are fractions | fits | wrong framing | wrong framing |
| B6 | `curriculum-validator.ts:20-44,276-327`: the only answer rule parses `n/d`. Any other label gets `ANSWER_RELATIONSHIP_UNVERIFIED` as a **warning**, so wrong answers pass to review. **Measured (§2a)** | verified | every pair unverified (warning) | every pair unverified |
| B7 | `validation.ts:52-59` (`steps … .min(2)` on `:55`) rejects a one-step path structurally. `curriculum-validator.ts:255-268` adds `PATH_TOO_SHORT` if that gate is bypassed. RI.5.2 has no prerequisite graph. **Measured (§2a)** | ok | ok (3.OA.D.8 → 4.OA.A.3) | **blocked** unless the standards pack authors a prerequisite node |
| B8 | `validation.ts:123-128` (`providerDraftSchema`): exactly 4 matching variants, each with source items, target items and relationships | fits | fits only as word-problem → equation matching | fits only as detail → main-idea matching; cannot express a summary |
| B9 | `a2ui-contract.ts:16,27`: the only catalogs are `matching-v1` and `fractions-v2`. `fractions-contract.ts:27-28` allows denominators up to 12 only | ok | matching only | matching only |
| B10 | `learner/grading.ts:7-105`: `matching-grader-v1` checks exact pairs and knows no subject | ok | ok | no free-text grading |
| B11 | `seed-data.ts:47-53,54-79`: one standard, a 2-node graph, fraction content. All 17 stored drafts in the local DB use `standard_ccss_4_nf_a_01` **(uncommitted evidence)** | — | — | — |

Stored evidence of B6 **(uncommitted evidence)**: draft `draft_req_6c99492c…` (model `meta/muse-spark-1.1`) used number-line text as targets. All 12 of its relationships drew `ANSWER_RELATIONSHIP_UNVERIFIED` warnings, and the draft reached `ready-for-review`.

### 2a. Measured fixture outcomes

The harness is [`src/server/generation/standards-generalization.characterization.test.ts`](../../../src/server/generation/standards-generalization.characterization.test.ts). It has 6 tests, all passing, and runs in `pnpm test`. It builds standards-pack contexts in memory and passes them to `reviewDraftForAcceptance` through `options.curriculumContext`. It uses the production semantic validators, the learning-path builder and the artifact gate. It also calls `validateProviderDraft`, and it sends a 4.OA.A.3 generation request through `createGenerationService` with seeded persistence.

The test pins **today's gaps**. A slice that closes a gap must flip the matching expectation in the same change: S3 for B6, and S2 for B1 and B7.

| Case | `validateProviderDraft` | `reviewDraftForAcceptance` state | Curriculum findings |
| --- | --- | --- | --- |
| 4.OA.A.3 request (`standardId: "4.OA.A.3"`), via `normalizeGenerationInput` and `service.generate` | — | throws `GenerationRequestError` `GENERATION_INPUT_INVALID`, "This learning objective is not supported. Use Grade 4 equivalent fractions (4.NF.A.1)." | — |
| 4.OA.A.3 word problem → equation, correct answer set, 2-node path `3.OA.D.8 → 4.OA.A.3` | `ok: true`, 0 diagnostics | **`ready-for-review`** | 12 × `ANSWER_RELATIONSHIP_UNVERIFIED` (warning) |
| The same draft with **one wrong pair** (`4 + 6 − 5 = p` for a problem whose answer is 4 × 6 − 5) | `ok: true` | **`ready-for-review`** | **identical** to the correct set: the diagnostic arrays are deep-equal, with no `ANSWER_MISMATCH` |
| Control: the same harness with fraction labels and one wrong pair (`1/2 → 2/3`) | `ok: true` | `blocked-by-validation` | 4 × `ANSWER_MISMATCH` (hard_block) |
| RI.5.2 detail → main idea, one-node path | `ok: false`, `INVALID_CONTRACT` "Generated content is invalid at learningPath.steps: Too small: expected array to have >=2 items" | — | — |
| The same RI.5.2 draft, sent straight to acceptance | — | `blocked-by-validation` | `PATH_TOO_SHORT` (hard_block) plus 12 × `ANSWER_RELATIONSHIP_UNVERIFIED` |

Every case also carries learning-quality warnings: 3 × `VARIANT_NOT_MEANINGFULLY_DIFFERENT`, 1 × `SCAFFOLD_LEVEL_UNCLEAR` and 1 × `CHALLENGE_LEVEL_UNCLEAR`. They come from the fixture, which repeats one interaction structure across all four variants. They do not change any state.

Result: all of the brief's code-reading predictions hold, with one refinement. A one-node RI.5.2 path is rejected by the structural gate before `PATH_TOO_SHORT` can apply. **B6 is confirmed: a wrong 4.OA.A.3 answer produces the same diagnostics as a correct one**, and only teacher review stands between it and a learner. The fraction control shows the answer rule is live in this harness, so the 4.OA.A.3 pass is not caused by the fixture.

## 3. Layers and the merge recommendation

- **Grounding** (#113): standard, skills and prerequisites go into a `SourceSnapshot`. It depends on no other layer. Its evidence can be re-run today ([`scripts/lc-mcp-eval.ts`](../../../scripts/lc-mcp-eval.ts)).
- **Alignment** (#30): a standards pack (graph, screen purposes, answer rules, prompt framing) consumed by B1 and B3–B7. It consumes a snapshot but can start from hand-written pack data. **It does not truly depend on #113**: a standards pack is versioned data, and a snapshot is one possible source for it. §2a shows that the acceptance seam already takes an injected context.
- **Rendering** (#29): catalog and draft shape (B8–B10). Alignment can ship on `matching-v1` for 4.OA.A.3 and a reduced RI.5.2 task. Rendering only gates _richer_ lessons.

**Recommendation: an epic with child issues.** Keep #113 and #30 as children, and add a child for pack-driven generation (B1–B5). Do not merge them. The layers have different seams and different evidence (Learning Commons fixtures for one, gate tests for the other). Merging would make #30 wait on live grounding for no reason.

## 4. Answer-rule decision table

| Rule | Machine-verifiable? | Verdict | Standards pack data location |
| --- | --- | --- | --- |
| Fraction equivalence (`a·d = b·c`) | yes | mismatch: `hard_block` (measured, §2a control); match: pass | `answerRules[].kind="fraction-equivalence"` (exists in code, `curriculum-validator.ts:36-44`) |
| Arithmetic equation result (4.OA.A.3: the expression evaluates to the stated answer; remainder interpretation is declared) | yes, for whole-number expressions | mismatch: `hard_block` | `answerRules[].kind="whole-number-expression"`, plus numeric bounds from the component text |
| Operand bounds (digit limits per component) | yes | violation: `warning` (standards quality) | `components[].bounds` |
| Word problem ↔ equation semantic fit | no (needs reading) | `warning` and teacher review | `answerRules[].kind="teacher-review"` |
| Main idea ↔ supporting detail (RI.5.2) | no | `warning` and teacher review | same, plus `source.kind="primary-text"` |
| Detail appears verbatim in the provided passage | yes (substring or normalized match against the passage) | absent: `hard_block` | `answerRules[].kind="text-evidence"`, with the passage in the snapshot |
| Path nodes, edges, target, screen purposes | yes (exists) | `hard_block` | `graph` |
| Unparseable label under a machine rule | — | **open decision** (§10 Q3): `warning` today (B6, measured) | `answerRules[].unverifiedVerdict` |

The advisory model reviewer can only add `warning`. This is already enforced at `semantic-validation.ts:136-163`.

## 5. Version compatibility

Pins already exist: `validatedLearningPath.versionPins` (`validation.ts:77-85`) holds the draft, graph, catalog, model and validator versions. [AgDR-0005](../../agdr/AgDR-0005-grounded-package-version-contracts.md) requires immutable publications that pin content and validation-result hashes and rule versions.

| Standards pack | Catalog | Published artifact | Result |
| --- | --- | --- | --- |
| v1 | matching-v1 | published on v1 | runs; graded with the pinned rules |
| v2 (answer rules or graph edited) | matching-v1 | published on v1 | **keeps v1**: no revalidation, and the learner run is unchanged. The teacher sees "newer pack available"; regenerating creates a new draft version |
| v2 | matching-v1 | new draft | validated against v2 |
| v1 or v2 | fractions-v2 | any | allowed only if `allowedCatalogs` lists it; otherwise `hard_block` `UNSUPPORTED_CATALOG` |
| any | unknown catalog | any | fails closed (`a2ui-contract.ts:460`, `hasUnknownCatalog`) |
| v1 withdrawn (error found) | — | published on v1 | needs an explicit teacher pause or replace (#107), never a silent change |

Gap: the standards-pack version is not yet a pin. Add `packVersion` beside `graphVersion`.

## 6. A2UI impact

`matching-v1` plus `providerDraftSchema` cannot express these:

- **4.OA.A.3:** an equation with an unknown that the learner enters, multistep work, remainder interpretation as an input, and estimation. Only word problem → equation **matching** fits, and §2a shows that it passes the structural gate.
- **RI.5.2:** the passage itself (there is no long-text component), a free-text summary, and choosing two or more main ideas with evidence highlighting. Only detail → main-idea **matching** over a short passage fits, and Text is capped at 500 characters (`a2ui-contract.ts:124-128`).

**Verdict:** this does not block #30. A matching-only pilot is honest if each standards pack declares `allowedScreenPatterns: ["matching"]` and shows a visible diagnostic for an unsupported pattern (a #30 acceptance criterion). Richer lessons belong in #29, which stays a dependency.

## 7. Model role: reviewer measured, V1/V3 rows still not run

`META_API_KEY` is now present. The async advisory reviewer (#223) was measured on 6 provisional cases (§7a): all calls completed, and the reviewer warned on every case, including the three the deterministic gate accepted. The V1/V3 generation rows in this section are still **not run**; only the reviewer was.

The runtime reads `META_API_KEY`, `META_MODEL` (default `muse-spark-1.2-contributor`) and `META_BASE_URL` (`src/server/config.ts:255-259`).

What committed evidence already shows:

- V3 latency: 33.467 s with one correction (`evidence/ic1-2026-10-27/README.md:66,76`) and 15.97 s with none (`ic1-2026-10-30/README.md:33`). AgDR-0006 states about 20–47 s per draft (`:25`). Local DB runs **(uncommitted evidence)**: 33.5 s (ready) and 41.7 s (blocked). One of the two committed V3 runs needed a correction, which is a small sample.
- **An inline advisory reviewer is infeasible.** `semantic-validation.ts:265` clamps the agent timeout to at most 5000 ms (default 250 ms). A timeout becomes `hard_block` `VALIDATION_TIMEOUT` (`:202-220`), and the report becomes `retryable` (`:298-300`). A Meta reviewer taking 15–47 s would turn every draft into `failed-retryable`. Generation alone may use 200 s (AgDR-0006 `:22`), so an inline review on top of it exceeds the budget. The reviewer must run **asynchronously, after `ready-for-review`**, and write only warnings. Production also passes no `recommendationAgents`: the only consumer is `semantic-validation.ts:283`, and `draft-acceptance.ts:302-306` calls `semanticValidation` with no options.
- Draft generator: the adapter (`provider.ts:636`) can be called directly with a `ProviderGenerationContext` built from a standards pack. But the prompt framing at `provider.ts:445` (B5) biases the output toward fractions, so standards-pack framing must replace that line.
- Offline pack author: a model would propose component → screen-purpose mappings, for example the 18 `4.OA.A.3` components → 4 screen purposes. A person reviews each proposal before it is stored as a versioned standards-pack record. The model stays out of grounding, `hard_block` decisions, grading and answer keys.
- Other models in the local DB (`meta/muse-spark-1.1`, `meta/muse-spark-1.3`, `deepseek/deepseek-v4.1-flash`) are **unproven**: none has V1/V3 records. **(uncommitted evidence)**: muse-spark-1.3 took 85.8 s and was blocked; deepseek took 77.4 s and failed.

**Unblock:** add `META_API_KEY`, `META_MODEL=muse-spark-1.2-contributor` and `META_BASE_URL=https://api.meta.ai/v1` to `.env`. The V1/V3 generation probe still needs a scratch `meta-probe.ts` (not yet written) that calls `createMetaLessonDraftProvider` with a standards-pack context and the §2a fixtures.

### 7a. Measured advisory reviewer run

The async reviewer (#223) is implemented and measured. Run it with `node --import tsx scripts/advisory-review-eval.ts` (writes [advisory-review.json](advisory-review.json)) and check the committed result with `… advisory-review-eval.ts check`. The reviewer runs after `ready-for-review`, has a 60 s bound, and can only add warnings.

<!-- advisory-review:start -->

Measured 2026-11-04T13:09:52.989Z with `muse-spark-1.2-contributor` (meta, bound 60000 ms) on 6 provisional cases. No credential is recorded.

| Case | Draft source | Deterministic gate | Advisory verdict | Agrees | Latency | Failure class |
| --- | --- | --- | --- | --- | --- | --- |
| `fraction-control` | pack-draft | ready-for-review | warning | no | 15051 ms | — |
| `fraction-wrong-target` | characterization-fixture | blocked-by-validation | warning | yes | 16162 ms | — |
| `word-problem-control` | pack-draft | ready-for-review | warning | no | 13772 ms | — |
| `word-problem-wrong-equation` | characterization-fixture | blocked-by-validation | warning | yes | 18551 ms | — |
| `main-idea-control` | pack-draft | ready-for-review | warning | no | 11662 ms | — |
| `main-idea-absent-detail` | characterization-fixture | blocked-by-validation | warning | yes | 11808 ms | — |

Agreement 3/6; defect recall 3/3; control false alarms 3/3; failures 0; mean latency 14501 ms (max 18551 ms).

A defect case is a planted wrong pair; the deterministic gate blocks it. A control case is a pack draft the gate accepts. The shipped reviewer only runs on `ready-for-review` drafts, so the defect cases are a discrimination probe, not a product path. Agreement means the advisory verdict matched the gate: a warning on a blocked draft, or no warning on an accepted draft.

<!-- advisory-review:end -->

**What the result means.** The model returned exactly the prompt's 4-finding cap on all six cases, so warning presence did not discriminate a planted wrong pair from a gate-accepted draft. The 3/3 defect recall is therefore not evidence of validation skill: the same behavior produced 3/3 false alarms on the controls. Read plainly, the reviewer is a **learning-quality reviewer that always finds something**, not a validator. That matches its shipped role — it can only append advisory warnings after `ready-for-review` and can never block, publish, change a diagnostic, or touch an answer key. Two limitations follow: (1) there is no measured evidence that it catches wrong answers better than the deterministic gate, and it must never be used that way; (2) reasons longer than 240 characters fall back to a generic message, so some findings reach the teacher without the model's explanation.

## 8. Pre-mortem: it shipped and failed

| Cause | Class |
| --- | --- |
| Wrong 4.OA.A.3 or RI.5.2 answers reached students: unverifiable pairs were only warnings (B6, measured: a wrong pair's diagnostics are identical to a correct set's), and a teacher acknowledged the warning code once per screen without checking each pair | known gap |
| Grounding said "pack exists" for every standard (B2), so teachers were sent to generation that then failed (B1) | known gap |
| Non-math standards packs had no Learning Commons skills; hand-written skills drifted from the primary text with no hash check | known gap |
| California is never supported; a teacher there has no pack | accepted (out of scope) |
| The inline advisory reviewer timed out and blocked everything | known (now) |
| Matching-only lessons felt trivial for RI.5.2, and teachers did not adopt them | blind spot (needs #118) |
| A standards-pack upgrade silently changed grading for published lessons | known gap (`packVersion` not pinned) |
| Learning Commons data changed between the snapshot and the standards pack (dateModified 2025) | unknown |
| A teacher's sentence resolved to the wrong grade's standard: for "identify the main idea of a text", REST top-1 was RI.3.2 and RI.5.2 ranked 4th (`free-text-evidence.json:3056-3061`); exact hit@1 is 43% overall (`free-text.md:13`) | known; mitigated by teacher confirmation |
| Arabic standards packs: RTL main-idea text exceeded the 500-character Text limit | blind spot |

## 9. Parallel slices

| Slice | Seam | Blocked by | Unblocks | Exit evidence | Start now? |
| --- | --- | --- | --- | --- | --- |
| S1 Standards-pack record contract (graph, components, answerRules, allowedScreenPatterns, packVersion) | new records under `src/server/curriculum/`, `GLOSSARY.md` (a distinct term from publication **Pack**) | — | S2, S3, S5 | `verify:glossary-coverage`, `verify:architecture-map`, `verify:boundaries` | **yes** |
| S2 Pack-driven context resolution (replaces B1–B4: `supportedStandardIds`, the synthetic context, the seed graphVersion, the `resolveStandardPack` false positive) | `resolveCurriculumContext` (`draft-acceptance.ts:226`) | S1 | S4 | `pnpm check`, `verify:lesson-gate`; flip the B1 case in the §2a harness | after S1 |
| S3 Answer-rule registry (fraction plus whole-number-expression plus text-evidence; `unverifiedVerdict`) | `curriculum-validator.ts:276` | S1 | S4 | `verify:lesson-gate` property tests; flip the B6 wrong-pair case in the §2a harness to `ANSWER_MISMATCH`; future #106 eval cases | after S1 |
| S4 Pack-framed prompt (B5) | `provider.ts:420-460` | S2 | model eval | future #106 cases; a V3-style record | no |
| S5 #113 REST resolver into a SourceSnapshot (8 pilot rows) | `src/server/grounding/` | #112 storage | S1 data source | recorded Learning Commons fixtures; live matrix | **yes** (lane E1) |
| S6 Async advisory reviewer | `SemanticValidationAgent` off the request path | S2, keys | — | agreement on K≤12 provisional cases (not #106): measured, 3/6, §7a | shipped |
| S7 Non-math standards pack (RI.5.2, matching-only, skills from the primary text) | standards-pack data | S1, S3 | #30 non-math acceptance criterion | flip the B7 RI.5.2 case once the pack authors a prerequisite node; teacher review through #118 (future) | no |

Check against the #108 lanes: #30 is in "Deferred (post-day-3)". S1, S3 and S7 conflict with no day-1–3 lane seam. S5 _is_ lane E1 Dev 2. S2 touches `service.ts`, which #115 also touched. #115 is now closed, so S2 can follow S1 directly.

Checks still to come, and not claimed here: #106 (eval set) and #118 (teacher review).

## 10. Decisions for Abdullah (each with a default)

1. Merge, epic, or separate? **Default: epic with children** (#113, #30, and a new pack-driven-generation child).
2. Non-math subject and pilot jurisdictions? **Decided 2026-11-04: ELA RI.5.2, Multi-State only. California is not needed and no California pack ships.**
3. What verdict for unverifiable relationships under a machine rule? The options are warning, silent pass, or hard_block. **Default: warning plus a required teacher acknowledgment per screen.** Never a silent pass. The per-screen acknowledgment already exists (#5, `publication/service.ts:484-498`). It works per warning _code_, though, so one acknowledgment covers every unverified pair on the screen. §2a shows the warning alone cannot tell a wrong pair from a right one. Proposed refinement, also defaulted: S3 adds machine rules, so 4.OA.A.3 pairs stop being "unverifiable", and acknowledgment stays per code.
4. Before or after the day-3 deferral in #108? **Default: after**, except S1 and S5, which can start now.
5. Pull #29 into scope? **Default: keep it as a dependency**, and ship matching-only standards packs with a visible pattern diagnostic.
6. Ship the advisory reviewer? Inline or async? **Default: ship async only**, after a measured run. Inline is infeasible (§7). The run happened (§7a): ship async, warning-only, and never treat it as a validator — it warned on every gate-accepted control.
7. Look into a second Meta model? **Default: no**, until V1/V3 evidence exists. The local DB shows 1.1, 1.3 and deepseek runs with no records.
8. Caps: **Defaults N=6 (5 used), M=9 (0 used), K=12 (0 used).**

## Steps not run: blockers and unblock commands

- **V1/V3 generation rows in step 7: not run.** The advisory reviewer was measured (§7a); the draft-generation model rows were not. Unblock: see §7.
- **California: not needed.** Product decision 2026-11-04: Multi-State only. Do not download the CDE PDFs unless a California sale is on the table; then verify the wording before authoring a California pack version.
- **Project map final update:** not done. Unblock: run the project-map skill (UPDATE) and add the §10 decisions 1–8.

The fixture acceptance step **ran**; see §2a. Reproduce it with:

```bash
pnpm exec vitest run src/server/generation/standards-generalization.characterization.test.ts
```
