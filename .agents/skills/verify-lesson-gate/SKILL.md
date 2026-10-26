---
name: verify-lesson-gate
description: "Formal verification skill for Edu-Canvas's Validation & Safety gate. Use when: (1) any change touches src/server/generation/validation.ts (lesson contract validation), src/server/generation/learning-path.ts (validated prerequisite path), the provider draft contract in src/shared/generation-contract.ts, or generation diagnostics/shared contract types, (2) a change adds, removes, or loosens a rule of what lesson drafts may contain, (3) reviewing or debugging why a provider draft was accepted into ready-for-review or blocked, (4) running or extending the property checks for the gate (verify:lesson-gate)."
---

# Verify the lesson gate

## What is verified, in plain words

Two properties, checked against the real code with [fast-check](https://fast-check.dev) property-based testing:

1. **Nothing malformed or unsafe passes the draft gate.** If `validateProviderDraft` (`src/server/generation/validation.ts`) returns `ok`, an independent re-check in the property file satisfies every rule the gate enforces: exactly the 2 standard / 1 scaffold / 1 challenge variant mix, unique item/relationship/variant ids across the whole draft, the distractor-to-source limit (`floor(sourceItems / 4)`, contract-capped at 2), every relationship pointing at a source and target item of its variant, each target owned by at most one source, every source matched at least once, every target matched at least once, the teacher-requested language and direction, and no executable markup, script URL, or inline-event-string anywhere in the accepted payload.
2. **Nothing leaves the curriculum on the path to teacher preview.** If `buildValidatedLearningPath` (`src/server/generation/learning-path.ts`) accepts a provider proposal, the accepted path walks only approved forward prerequisite edges of the versioned context, never repeats a node, every step carries its node's screen purpose and the language-correct label and screen purpose, the last step is the target node, and the rationale copy stays learner-safe and within 240 collapsed characters.

**Harm if broken:** a draft with duplicated ids, reused targets, wrong language, or script-like copy would reach the teacher preview as `ready-for-review`, and a path skipping an approved prerequisite edge would teach fraction steps out of order. These are the trust gates of the post-draft loop (Validation & Safety context in ARCHITECTURE.md; hard-safety gap tracked in #28).

Two failure probes complete the cycle: a mutation catalog that injects one rule break at a time into an otherwise valid generated draft/path — each must be **rejected** with its named diagnostic code (`DUPLICATE_ID`, `DISTRACTOR_LIMIT`, `TARGET_REUSED`, `SOURCE_WITHOUT_TARGET`, `UNKNOWN_SOURCE`, `UNKNOWN_TARGET`, `MISSING_VARIANT_KIND`, `LANGUAGE_MISMATCH`, `EXECUTABLE_CONTENT`, `UNTRUSTED_FIELD`, `INVALID_CONTRACT`, and each path-rejection reason) — and an arbitrary-JSON fuzz that must never crash the gate and stays subject to re-check 1 whenever the gate accepts.

## How to run

```bash
pnpm verify:lesson-gate
```

About one second (200 runs per property, fixed seed 12345). CI runs the same file through `pnpm test`. Two environment knobs: `LESSON_GATE_RUNS` for more runs (use `LESSON_GATE_RUNS=2000 pnpm verify:lesson-gate` for a deeper sweep before merging a gate change), `LESSON_GATE_SEED` to reproduce a failing counterexample byte-for-byte (the printed seed from the failing run).

## Where the checks live

`src/server/generation/lesson-gate-properties.test.ts` — one file, four `it` blocks. The independent re-check functions (`checkAcceptedDraft`, `checkAcceptedPath`) re-derive the rules; the generators (`buildValidBaseDraft`, `buildVersionedPlanContext` + `buildBaseLearningPathProposal`) produce genuinely valid drafts and curriculum plans by construction; the probe arrays (`draftMutationProbes`, `learningPathMutationProbes`) carry the break catalog.

## Reading a failure

| Failure message begins with | Meaning | What to do |
| --- | --- | --- |
| `A generated valid draft was rejected` / `A generated valid learning path was rejected` | The generators no longer describe the gate's contract, or the gate itself got stricter. | Not automatically a bug. Read the quoted diagnostics against the diff that changed the gate. If the contract changed deliberately, update the generator and its re-check in the same change. If not, treat as a real regression. |
| `Mutation probe “…” was accepted` (via `expected true to be false`) | **Real break.** A gate rule was dropped or loosened; the property file proves an injected rule break reached `ok`. | Reproduce with `LESSON_GATE_SEED=<seed> pnpm verify:lesson-gate`; fix the gate rule; never "fix" it by weakening the probe. |
| A re-check violation (`Accepted …` items inside the assertion diff) | **Real break.** The gate accepted output that violates its own rules. | The violation text names the rule and the offending value. Fix the gate. Do not weaken the re-check until the rule it mirrors is deliberately retired. |
| `Expected the probe's diagnostic code to be present` (via `toContain`) | The injected break was rejected by _other_ rules but the named rule is gone or mislabeled. **Real break or code rename.** | Restore the rule or update the code name in gate, re-check, and probe together. |
| An unexpected throw inside a probe or generator | Generator/probe drift. | Fix the fixture; the gate is still under suspicion until the property runs clean. |

Never weaken a property or probe to make the check pass. Findings stay findings.

## What is NOT verified (bounds, as of 2026-10-26)

- The **semantic validators** (`curriculum-validator.ts`, `learning-quality-validator.ts`, `semantic-validation.ts`) and the service orchestration in `service.ts` (claiming, idempotency, retry states) are outside this check — the properties cover the two structural gate functions only.
- **Level:** the checks sample a seeded, structured generator plus a shallow JSON fuzz per run (200 runs by default, bounded shapes) — a strong sampling bound, not exhaustive proofs. A fixed-input guarantee would need a different tool class than TypeScript supports natively.
- **Content-safety depth:** the pattern scans re-checked here are the current official spot-checks; the cross-cutting hard safety gate (#28) remains unimplemented and is out of scope here. `verify:client-boundary` and `verify:boundaries` own delivery and layer rules, not this content gate.
- The **provider adapter, persistence round-trip (`generation-codec.ts`), and A2UI rendering** are separate seams with their own tests.

## When a change touches verified code

1. If the change intends to move the contract (new rule, relaxed rule), update the re-check and at least one probe to match **in the same PR**, and write the acceptance-line impact in the body.
2. Run `pnpm verify:lesson-gate`. Then record this commit in the sync commit line below and confirm the covered-code list still matches the diff.
3. When unsure whether the change touches the gate, open the three files above; any edit inside them does.

## Coverage record

| Checks | Covered code | Last confirmed at commit |
| --- | --- | --- |
| All four property blocks | `validateProviderDraft` in src/server/generation/validation.ts; `buildValidatedLearningPath` in src/server/generation/learning-path.ts | 3a6f7e57e728ff8447a826184554cc5b08f84991 (verification introduced right after this commit; move this forward only after re-running a pass on the new commit and confirming the re-checks still describe the code) |

Move the sync commit forward only after confirming that the verification still describes the code at that commit. If you have edited the gate without rereading this skill, treat the next distinctive failure as suspect and verify against the re-check rules first. To bring a stale skill back in line after edits it missed, follow `/maintain-formal-verification-skill`.
