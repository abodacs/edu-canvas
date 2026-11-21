---
name: delete-comment
description: "Sweep code comments in src/: categorise every comment (tautology, excuse, stale, decision record), delete them, move decisions into AgDRs, and lower the comment ratchet. Use when: (1) asked to run the comment sweep or /delete-comment, (2) a diff or branch accumulates new comments that must not ship, (3) after landing a feature whose implementation notes would otherwise become comments, (4) AgDR-0019 harvest records need a new entry."
---

# Delete comment

Repeatable version of the 2026-11-21 comment sweep ([AgDR-0019](../../../docs/agdr/AgDR-0019-comment-free-source.md)). The ban is a ratchet: prose comments in `src/` are deleted, not suppressed, and ceilings only fall.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, plus any file `pnpm verify:comments` reports. Scope is the TypeScript family in `src/` only (generated `src/routeTree.gen.ts` excluded). `scripts/`, configs, CSS, and docs keep their comments; do not widen the fence.

## Steps

1. **Inventory.** Run `pnpm verify:comments --json <path>` for an AST-extracted list of every comment (file, lines, byte offsets, text, directive flag). Never regex-scan: a `//` inside a string is not a comment, and a directive must not be swept.
2. **Keep directives.** `@ts-expect-error`/`@ts-ignore`/`@ts-nocheck`/`@ts-check`, `@deprecated`, `webpackChunkName` (Vite reads it for dynamic-import chunk names), `prettier-ignore`, `@__PURE__`, coverage ignores, and `<tool>-disable`/`<tool>-ignore` comments are machine contracts — never delete them as part of this skill. Audit each for a real root-cause fix, but leave the comment in place until that fix lands.
3. **Categorise every prose comment** by reading it with its surrounding code:
   - **Tautology** — restates the declaration it sits on. Delete.
   - **Excuse** — justifies a hacky implementation ("for now", "until #NN lands", a lint-rule appeasement, a documented workaround). Delete the comment, and record the hack in the tracking issue (see step 5) so the implementation gets fixed.
   - **Stale** — references code, tooling, or branches that no longer exist (for example: oxlint does not honor `eslint-enable`, so those comments are dead; skip-note rationales describing surfaces that since landed). Delete.
   - **Decision record** — documents a non-obvious constraint, contract, or why-branch. Delete the comment **and** move the content into an AgDR before the deletion lands.
4. **Harvest decisions.** Group harvested decisions by theme and extend the matching record instead of inventing one per comment: AgDR-0020 (browser seams and interaction), AgDR-0021 (generation, grounding, safety), AgDR-0022 (records, publication, learner runtime), AgDR-0023 (identity, test infrastructure). A recurring general rule belongs in AgDR-0019 §4 standing interpretations, not a new record. Cite `file:symbol` and issue numbers. Register a new AgDR only when the theme has no home; next free number is the highest existing plus one.
5. **File the excuse findings.** One tracking issue holds every excuse comment: `file:line`, why the implementation is hacky, the fix direction, and a verification step per [CONTRIBUTING.md](../../../CONTRIBUTING.md). Update the existing sweep issue before opening a new one.
6. **Delete mechanically when sweeping many files.** Byte ranges from the `--json` inventory delete whole lines for full-line comments and only the comment characters for trailing/inline ones; run prettier after. For a handful of comments, plain edits are fine.
7. **Lower the ratchet.** Run `pnpm verify:comments --update`; it clamps with `Math.min` per file and refuses any raise. Expect `files: {}` after a full sweep. Then run the check without flags — it must PASS.
8. **Verify the deletion broke nothing:** `pnpm typecheck`, `pnpm lint` (the 11 pinned warnings are the only allowed ones), and the vitest files covering touched modules — or `pnpm test` for a wide sweep. `pnpm format:check` for the touched files.
9. **Report** the deletion count, the categorization counts, the AgDR entries written, the issue items filed, and the new ratchet state.

## Hard rules

- A deletion and its AgDR entry land in the same PR. A decision that outlives its comment only if a record holds it.
- Never re-add a prose comment to explain a lint suppression; suppressions carry their own inline reason in the directive comment, and the root-cause fix belongs in the tracking issue.
- Never hand-raise `scripts/comment-budget.json`.
- Do not convert decision comments into longer identifiers, retries, or abstractions as a side effect; that is a separate change.
