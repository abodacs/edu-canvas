# Delegation practice pack (DG1–DG7)

Assessment owner: [#135](https://github.com/abodacs/edu-canvas/issues/135). Parent method: [#138](https://github.com/abodacs/edu-canvas/issues/138). Pack version: **v0**, dated **2026-11-03**. Dataset (`cases/`), results (`results/`), and runner (`scripts/eval-practices.ts`) live in-repo. Bump the version on any change to cases, anchors, or runner semantics.

This pack assesses whether Edu-Canvas supports seven teacher delegation practices. It does not score a teacher's competence.

## Issue state recorded at pack time

- Issue #135 had **0 comments** on 2026-11-03 (`gh api repos/abodacs/edu-canvas/issues/135/comments` → empty array).
- Stale-pin correction: the #135 body re-verifies its evidence at `50c3202` and the #138 body pins the same revision. Current main is `1a8c94e` (PRs #185 and #186 landed after the pin). Every anchor below was re-verified in this worktree at `1a8c94e` before this pack pinned it; moved line numbers are marked.

## Method

Every practice carries the five shared fields from #138: scenario (behavioural), capability evidence (`file:line` at the pinned revision, or an explicit GAP), result, evidence artifact, and gap owner. Each practice has exactly two authored cases (`normal` and `challenge`), predeclared in `cases/*.json` **before** execution; commit order is the predeclaration proof (cases commit precedes the results commit). `s0-smoke` is a fifteenth case on its own row: it spans the full delivery loop (DG1, DG3, DG4, DG5, DG6) rather than a single practice.

### Layers

| Layer | Meaning | Runs |
| --- | --- | --- |
| `A` | Pure deterministic, in-process, no database or server | always, incl. `pnpm check` |
| `B-det` | Deterministic, needs the database/server seam, no live model (deterministic fixture provider tests orchestration only) | when a migrated PostgreSQL is reachable, incl. `pnpm check` |
| `B-browser` | Real browser against the real server; model-independent steps | full run only; never in `pnpm check` |
| `B-live` | Expected result depends on live model output quality | only with `EVAL_LIVE_MODEL=1`; reported separately |

### Result vocabulary

Case scores use the #135 scale; run statuses use the #138 states. **None of these is a pass by itself.**

| Value | Meaning |
| --- | --- |
| `2` | Fully meets — observed behavior meets all predeclared criteria with evidence |
| `1` | Partly meets — observed behavior meets some criteria; the shortfall is named |
| `0` | Fails — observed behavior violates a predeclared criterion |
| `not-run` | The run did not attempt the case (e.g. deterministic subset) |
| `blocked-feature` | A required planned interaction does not exist; `flipCondition` names what unblocks it |
| `blocked-environment` | The feature exists but the required runtime/access is unavailable; `flipCondition` names it |
| `unverified` | Prompt-only behavior with no executable evidence yet |

A safe rejection passes a **boundary** check only. It never establishes the requested **capability**. A missing planned feature stays `blocked-feature`; it never becomes N/A.

## Practice rows (re-pinned at `1a8c94e`)

Gap owners are unchanged from the issue body; they are re-stated so the pack is self-contained.

| ID | Practice | Result (capability) | Capability evidence anchor at `1a8c94e` | Gap owner |
| --- | --- | --- | --- | --- |
| DG1 | Clarify the goal | partial | `src/shared/generation-contract.ts:28` — `lessonGenerationInputSchema` (was `#L27`); prompt capture `:30`, standard capture `:35`; the `.strict()` contract has no success-criteria or intended-evidence field | needs issue — owner Abdullah |
| DG2 | Consult on the approach | missing | GAP — grep over `src/` at `1a8c94e` for `approach.comparison`, `tradeoff`, `compare.*approach` → no matches; no pre-draft comparison stage exists in the generation workflow | needs issue — owner Abdullah |
| DG3 | Recognize unsuitable tasks | missing | Boundary signal only: `src/server/generation/service.ts:170-186` — `normalizeGenerationInput` rejects out-of-allowlist grades and standards with 422 `GENERATION_INPUT_INVALID` (allowlist `:131-134`); client seam table `src/lib/generation-failures.ts`. GAP for the capability: grep for `handback`, `reassign`, `take back` → no handback or task-suitability interaction | needs issue — owner Abdullah |
| DG4 | Consider strengths and limits | partial | `src/server/generation/learning-quality-validator.ts:295` — `reviewLearningQuality` (was `#L200`); supplies copy, accessibility, structure, language, and reading-load heuristics; no task-specific verification checklist | needs issue — owner Abdullah |
| DG5 | Stay involved | partial | `src/components/studio/teacher-studio.tsx:551` — `VariantChooser`, the four-variant radio chooser (was `#L157`, moved by the b5472de redesign); standard pin `:55`; deterministic gate properties via `pnpm verify:lesson-gate` (`package.json:43`) | needs issue — owner Abdullah |
| DG6 | Choose a suitable tool or approach | partial | `src/shared/generation-contract.ts:38-43` — retry fields on the contract (was `#L27`): `idempotencyKey` `:38`, `retryOfRequestId` `:39`, `revisesRequestId` `:43`; retry state machine in `src/server/generation/service.ts` (`isRetryableState`, `DRAFT_NOT_RETRYABLE`, `RETRY_METADATA_MISMATCH`); uploads/source-service recovery remain #113/#114 | [#113](https://github.com/abodacs/edu-canvas/issues/113) / [#114](https://github.com/abodacs/edu-canvas/issues/114) |
| DG7 | Reassign work as it evolves | missing | GAP — grep over `src/` at `1a8c94e` for `handback`, `hand back`, `reassign`, `stopGenerat` → no matches; no section handback, stop, or revised division of work | needs issue — owner Abdullah |

## Cases

| Case id | Practice | Layer | v0 status | Predeclared expectation (short) |
| --- | --- | --- | --- | --- |
| `dg-1-normal` | DG1 | A | — | Input without a standard is rejected 422 at the shared contract |
| `dg-1-challenge` | DG1 | A | — | Out-of-allowlist objective is rejected 422 with the curated Grade 4 message; contract captures no separate success criteria |
| `dg-2-normal` | DG2 | B-det | blocked-feature | Approach-comparison stage does not exist |
| `dg-2-challenge` | DG2 | B-det | blocked-feature | No way to continue from a chosen approach |
| `dg-3-normal` | DG3 | A | — | Unsuitable non-fraction task is rejected 422 — boundary only, no handback |
| `dg-3-challenge` | DG3 | A | — | Family-note request is blocked as personal-data before any provider call — boundary only |
| `dg-4-normal` | DG4 | A | — | Validator returns `pass` on a strong draft |
| `dg-4-challenge` | DG4 | A | — | Validator flags reading load and unsafe claims on a weak draft |
| `dg-5-normal` | DG5 | B-live | — | Four variants render; teacher chooses one; rationale inspectable |
| `dg-5-challenge` | DG5 | B-browser | — | Blocked draft offers revise-only recovery; no approve/publish path |
| `dg-6-normal` | DG6 | B-det | — | Failed draft retries through the real seam to ready-for-review |
| `dg-6-challenge` | DG6 | B-det | — | Retry decision rules refuse metadata drift and non-retryable states |
| `dg-7-normal` | DG7 | B-det | blocked-feature | Section handback does not exist |
| `dg-7-challenge` | DG7 | B-det | blocked-feature | No stop or continuation prevention |
| `s0-smoke` | S0 (own row) | B-browser | — | Full loop: sign-in, blocked generation, recovery, review, approve, publish, learner attempt, reveal |

The v0 status column is filled by an actual run recorded in `results/v0.json`; a dash means the score lives only in the results file. Blocked-feature cases carry the layer they would need once unblocked.

Case fields: `id`, `practice`, `title`, `layer`, `turnSequence` (ordered steps), `expected` (predeclared), `observableFailure`, and `flipCondition` (required whenever the case is blocked). The runner never invents a successful continuation and never turns a missing feature into N/A.

## Running

```bash
pnpm eval:practices --pack delegation                    # full run, writes results/v0.json + v0-rollup.md
pnpm eval:practices --pack delegation --deterministic    # layers A + B-det only (joined into pnpm check)
EVAL_LIVE_MODEL=1 pnpm eval:practices --pack delegation  # also attempts B-live cases
```

The deterministic subset (layers A and B-det) is part of `pnpm check`, so a `2` row cannot regress silently. The browser and live subsets are never part of `pnpm check`. B-browser cases execute through `scripts/eval-browser.mjs` (playwright-core standalone; not a repo dependency), which writes `results/browser-results.json` and per-step screenshots that the runner merges. If the Chromium binary is missing or the server is down, those cases record `blocked-environment` with the exact failure.

Pin requirements for any reported run: application revision (git SHA), provider/model, case version, and the runner version. `B-det` uses the deterministic fixture provider (`createDeterministicLessonDraftProvider`) — it tests orchestration only and is reported separately from any live-model result.

## Evidence rules

Every score in `results/v0.json` cites its evidence artifact (runner assertion output, screenshot path, or HTTP trace). Every blocked row carries its flip condition. If a step fails, the failure and its evidence are recorded as observed — a failing step is never rewritten into a pass.

## v1 rerun record (2026-11-03)

`s0-smoke` flipped 0 → 2 after three product fixes, each with a committed red-first or replay test:

1. `0e0962a` — `runAttempt` rebuilt `record.input` without `sourceSnapshotId`, so a source-grounded publish refused to create the learner assignment (the probe's "live proof absent" was right: the bridge had never run end to end).
2. `518e56f` — the synthetic fixture provisioned concurrently and raced on the tenant insert's second unique index (slug); one loser rejected the whole fixture and the composition cache held the rejected promise for the process lifetime, so every later sign-in returned `AUTH_UNAVAILABLE`.
3. `5082034` — the learner surface double-fires its start request; concurrent `start-run` writes now skip on conflict and read back the winner's row and receipt instead of aborting.

Rerun set: `{s0-smoke}` → `ac-surface`, `ac-boundary-empty` (new cases for the #8 acceptance map). Results: `results/v1.json`, `results/v1-rollup.md`; v0 stays as the pre-fix record.

## Observations recorded, not fixed here

- Seed gap: the synthetic roster lists `identity_demo_student` ("Omar Nabil") with **no** records-membership row while `learner_omar` shares the same display name and carries the membership. Assigning to the unrostered twin fails the records assignment check after the publication commits (503 after partial persistence) — a teacher hitting that picker entry sees "temporarily unavailable" with rows already written. Owner: Abdullah (seed data + the publish-after-commit UX).
- Runbook correction: serving on a non-default port requires `AUTH_PUBLIC_ORIGIN` to match the served port byte-for-byte (CSRF origin compare, `src/server/identity/csrf.ts:46-49`); this lane ran `--port 3112` with `AUTH_PUBLIC_ORIGIN=http://localhost:3112`. The scratch-DB recipe is not in `docs/foundation-runbook.md` — it recommends `docker compose down -v`, which this lane never used.
- `/learn` holds a connection open past load; `networkidle` never settles on it (harness note for future browser cases).
