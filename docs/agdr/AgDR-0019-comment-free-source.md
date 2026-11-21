# AgDR-0019 — Comment-free source

> In the context of 1,370 prose comments (3,125 lines across 244 files) accumulated in `src/`, of which a full-categorization sweep found 1,326 decision records, 29 tautologies, 9 stale references, and 6 excuses, facing the risk that prose drifts from the code it describes, that agents propagate a recorded workaround instead of fixing the cause, and that the few decisions that matter drown in the rest, I decided to ban prose comments in `src/`, to harvest durable decisions into AgDRs and standing interpretations, to exempt machine directives, and to enforce the ban with a per-file ratchet that can only fall, accepting that context now lives one hop from the code and that every future justification needs a named artifact.

Recorded 2026-11-21. The harvested decision bodies live in [AgDR-0020](AgDR-0020-browser-seams-and-interaction-contracts.md), [AgDR-0021](AgDR-0021-generation-grounding-and-safety.md), [AgDR-0022](AgDR-0022-records-publication-and-learner-runtime.md), and [AgDR-0023](AgDR-0023-identity-and-test-infrastructure.md).

## Context

A full sweep of `src/` on 2026-11-21 read every prose comment in context and categorized it. The distribution was not the usual one: this codebase used comments as the primary home for boundary contracts, idempotency semantics, accessibility rationale, and recorded spec divergences. That is exactly why the ban pays — that material was invisible to every check, and a stale sentence could contradict a live test with nothing to notice. The sweep evidence (inventory, categorization rubric, per-comment categories) is archived in `.scratch/comment-sweep/` (gitignored working evidence; this record and the AgDRs below are the durable copy).

Scope of the ban: the TypeScript family in `src/` (`*.ts`, `*.tsx`), excluding the generated `src/routeTree.gen.ts`. CSS, `scripts/`, config files, and documentation keep their comments; `scripts/` and root configs are tool-owned and reviewed as dependency code.

## Decision

1. **`src/` carries no prose comments.** A comment must be a machine directive or not exist.

2. **Machine directives are exempt.** The toolchain reads these; they stay until their suppression is fixed at the source: `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`, `@deprecated`, `webpackChunkName`, `<tool>-disable[-next-line]` / `<tool>-ignore` for eslint, oxlint, biome, prettier, stylelint, vitest, c8, v8, depcruise, node, `prettier-ignore`, `@__PURE__`, `c8`/`v8`/`istanbul ignore`, `sentry-ignore`. The verify script reports the surviving count (93 at adoption) so the residue stays visible.

3. **Knowledge moves to a named home, in the same change that deletes the comment:**
   - an architecture decision ([AgDR-0020](AgDR-0020-browser-seams-and-interaction-contracts.md) – [AgDR-0023](AgDR-0023-identity-and-test-infrastructure.md) hold the 2026-11-21 harvest),
   - a context [GLOSSARY](../../GLOSSARY.md) entry for a domain term,
   - a test name or assertion for a behaviour contract,
   - an identifier or type name for a shape,
   - an issue body for a deferral or known gap.

4. **Standing interpretations.** These constraints recur across the codebase; they no longer need a comment at each site, and a reviewer should not "simplify" them away:
   - Explicit comparisons, unreachable `default` branches, named-object-instead-of-literal patterns, and code-point count forms may look redundant. They carry a narrowing or lint purpose.
   - Accessibility: text carries the meaning (colour and tone are never the only signal); each page announces through its single live region; focus moves after the commit that reveals the change; native controls are preferred over ARIA recreations; radio groups handle keys explicitly.
   - Fail closed at boundaries: an unknown catalog, component, action, or payload refuses; an empty provider answer is an explicit gap, never a confident claim; missing configuration invalidates the affected session rather than falling back; a corrupt stored row throws rather than hydrating plausibly.
   - Idempotency: receipts resolve before work; a replay returns the stored identifiers; a limited verdict consumes nothing; a release only ever frees the holder's own lease.
   - Tenant scope: every read and write carries the session-resolved tenant; a foreign referent is an indistinguishable refusal, never an existence oracle.
   - Test deferrals use `it.skipIf` with the owning issue named; disabled-test modifiers and empty test bodies are rejected by the vitest preset.
   - Server-only values never reach the browser: projections are constructed field by field, never produced by deleting keys from a stored record.

5. **Enforcement is a ratchet, not trust.** `pnpm verify:comments` counts comment lines per file from the TypeScript AST (so a `//` inside a string never counts), compares each file against `scripts/comment-budget.json`, and fails when a file exceeds its ceiling or appears with no entry (new files default to zero). `--update` may lower a ceiling, never raise it. The script is wired into `check:static` and the [AGENTS.md](../../AGENTS.md) rule table names it.

6. **The repeat pass is a skill.** `.agents/skills/delete-comment/SKILL.md` re-runs this process on a later diff: inventory, categorize (tautology / excuse / stale / decision record), act, move decisions into AgDRs, lower the ceilings with `--update`.

## Alternatives considered

- **A linter rule banning comments** — no oxlint rule bans all comments, and a custom ESLint-plugin-bridge rule cannot express the per-file ratchet; the verify script does both and follows the `verify:design-tokens` idiom.
- **Keep JSDoc on exported symbols** — rejected: the sweep showed JSDoc carried the same drift risk as line comments, and the biggest cluster (contract field docs) is already expressed by the strict schemas those fields belong to.
- **Include `scripts/` and configs in the ban** — rejected for this pass: those files are tool-owned and change with their tools; the ratchet can widen later without a format change.

## Consequences

- Roughly 3.4k lines leave `src/` (3,125 comment lines plus collapsed blank lines), about 3.5% of the tree.
- Decisions live one hop from the code; a reader landing on `records-commands.ts` without the AgDRs sees invariants enforced by tests and types, not explained by prose.
- The 6 excuse findings and the recorded spec divergences moved to [#264](https://github.com/abodacs/edu-canvas/issues/264) instead of living as prose beside the code they apologize for.
- Comment-only knowledge that was never harvested is gone; the sweep read every comment before deleting, so the loss is bounded to what this record and the four harvest records above restate.

## Handoff

Enforcement: `scripts/verify-comments.ts` + `scripts/comment-ratchet.ts` + `scripts/comment-budget.json`, rule row in [AGENTS.md](../../AGENTS.md). Harvest: AgDR-0020 (browser seams), AgDR-0021 (generation, grounding, safety), AgDR-0022 (records, publication, learner runtime), AgDR-0023 (identity, test infrastructure). Repeat process: the `delete-comment` skill. Excuse findings and recorded divergences: [#264](https://github.com/abodacs/edu-canvas/issues/264).
