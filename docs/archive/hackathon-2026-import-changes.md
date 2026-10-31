# Hackathon-2026 import: change record

Deliberate changes made during PR 01 relative to the source snapshot in [hackathon-2026-file-map.json](hackathon-2026-file-map.json) (55 files, SHA-256 verified before copying on 2026-10-24). Link rewrites are listed once per pattern with their scope; content edits are listed individually. No requirement or research content was silently dropped.

Source corpus: `.worktrees/hackthon-docs/` (git-ignored, kept locally until the merged copy is verified from a clean checkout). Retained-local materials (2 PDFs, `refactoring-english/`, one PNG) were not imported; they are indexed in [docs/research/README.md](../research/README.md).

## New files created by the import (not present in the source corpus)

| File | Purpose |
| --- | --- |
| `docs/research/README.md` | Tracked reference index: type and provenance for each saved research file, plus the local-reference-materials section that replaces dead PDF/skill links |
| `docs/plans/hackathon-2026-import-changes.md` | This change record |

## Link rewrites by file

Destination-relative links were rewritten so every link resolves from the new tracked location. Patterns below were applied to all occurrences; anchors were preserved (all source anchors were verified against existing headings before the move).

| File | Rewrites applied |
| --- | --- |
| `docs/README.md` | Full rewrite (see below); all corpus links point at the new `docs/` layout, `../ROADMAP.md` at the root roadmap |
| `ROADMAP.md` | `education/…` → `docs/research/education/…`; `ui/README.md` → `docs/product/teacher-ui.md`; `ui/product-priorities.md` → `docs/product/delivery-priorities.md`; `hackathon/…` → `docs/hackathon/meta-global-2026/…` |
| `docs/hackathon/meta-global-2026/README.md` | `../ROADMAP.md` → `../../../ROADMAP.md`; `../ui/README.md` → `../../product/teacher-ui.md`; `../ui/product-priorities.md` → `../../product/delivery-priorities.md` |
| `docs/hackathon/meta-global-2026/demo-script.md` | `../ui/README.md` → `../../product/teacher-ui.md` |
| `docs/hackathon/meta-global-2026/validation-tracker.md` | `../ROADMAP.md` → `../../../ROADMAP.md`; `../ui/README.md` → `../../product/teacher-ui.md` |
| `docs/design/design-doc.md` | `../ui/README.md` → `../product/teacher-ui.md`; `../hackathon/…` → `../hackathon/meta-global-2026/…`; `../../../docs/release-fly-supabase.md` → `../release-fly-supabase.md`; `../../../docs/agdr/AgDR-0002-…` → `../agdr/AgDR-0002-…` |
| `docs/design/design-doc-implementation.md` | `../../../src/…` → `../../src/…` (10 links); `../../../drizzle/…` → `../../drizzle/…`; `../../../package.json` → `../../package.json`; `../../../docs/agdr/…` → `../agdr/…`; `../ui/README.md` → `../product/teacher-ui.md`; `../hackathon/validation-tracker.md` → `../hackathon/meta-global-2026/validation-tracker.md` |
| `docs/design/design-doc-questions.md` | Source-trail block rewritten: `../ui/…` → `../product/…`; `../ROADMAP.md` → `../../ROADMAP.md`; `../hackathon/README.md` → `../hackathon/meta-global-2026/README.md`; `../../../PRD_GRILL_LOG.md` → `../../PRD_GRILL_LOG.md`; `software-factory.md#…` → `../engineering/software-factory.md#…`; `../refactoring-english/SKILL.md` → `../research/README.md#local-reference-materials` |
| `docs/design/design-doc-reading-guide.md` | `../refactoring-english/SKILL.md` → `../research/README.md#local-reference-materials` |
| `docs/engineering/software-factory.md` | `skills.txt`/`agent-architecture.txt` → `../research/engineering/…`; `design-doc.md` → `../design/design-doc.md`; `../hackathon/README.md` → `../hackathon/meta-global-2026/README.md` |
| `docs/product/teacher-ui.md` | Renamed targets: `product-priorities.md` → `delivery-priorities.md`; `../hackathon/…` → `../hackathon/meta-global-2026/…`; `intelligent-ui.txt`/`copilotkit.txt` → `../research/ui/…`; `../ROADMAP.md` → `../../ROADMAP.md` |
| `docs/product/delivery-priorities.md` | `README.md#implementation-gate` → `teacher-ui.md#implementation-gate`; `../Refactoring-English-1.0.4.pdf` → `../research/README.md#local-reference-materials` (anchor text changed to "local reference") |
| `docs/plans/hackathon-2026-pr-stack.md` | The two known-broken `.worktrees/hackthon-docs/…` links (from PR #82) repointed to `../design/design-doc-questions.md` and `../product/teacher-ui.md#implementation-gate` |
| `README.md` (repository root) | Repo-layout table: added `ROADMAP.md` and `docs/README.md` rows |

## Content edits

| File | Change | Reason |
| --- | --- | --- |
| `docs/README.md` | Full rewrite of the 15-line source README: added the document-ownership table, a pointer to the import/change records, the pre-existing-documents note, and the research-section provenance warning | Spec requires `docs/README.md` to explain document ownership; source had only a folder table |
| `docs/engineering/software-factory.md` | Added a dated-context banner marking "Harness and routing", "Skill roster", and "Apexyard" — plus the specific skills named inside the feature loop — as personal tooling, not repository requirements; stage 0 and stage 3 of the feature loop reworded to name the workflow step rather than a personal skill | Spec: keep factory notes as dated context; remove personal role routing and mandatory agent workflows from the active contract |
| `docs/engineering/software-factory.md` | Harness line: named personal harness choice replaced with "the owner selects and configures the agent harness personally" | Remove personal role routing; preserve the substantive decision (harness choice is personal, no repo-mandated harness) |
| `docs/engineering/software-factory.md` | "Harness and routing" bullets: personal skill-directory path, per-role model names and config paths, and plugin names replaced with requirement statements (personal config outside the repository) | Remove private machine/tooling details; preserve decisions (shared skill set, per-role model budget, fallback behaviors) |
| `docs/engineering/software-factory.md` | Skill roster: added "Personal roster … not a repository requirement" qualifier | Mandatory agent workflow marked as dated personal context |
| `docs/engineering/software-factory.md` | Apexyard setup bullet: private sibling repo name, `onboarding.yaml`, portfolio profile name, and routing-config filename replaced with "private sibling holding the owner's project registry, onboarding profile, and agent-routing configuration" | Remove private portfolio details; public ApexYard governance substance retained |
| `docs/engineering/software-factory.md` | Handover bullet: dropped the personal role-pairing detail (tech-lead → qa-engineer); kept P0/handover status and the reopen condition | Personal role routing removed; substantive status preserved |
| `docs/engineering/software-factory.md` | Facts table: `gh auth status` username removed; two rows gained dated supersession notes (docs corpus migrated) | Private account identifier; statements made false by this migration |
| `docs/engineering/software-factory.md` | Blind spot 1: appended _Update 2026-10-24_ noting the corpus now lives in tracked paths, source directory retained pending clean-checkout verification | Statement superseded by this PR |
| `docs/design/design-doc.md` | "The notes directory is Git-ignored…" replaced with a dated update noting the documents now live in tracked `docs/` | Statement made false by this migration |
| `docs/product/delivery-priorities.md` | Closing "these notes are inside a Git-ignored directory" paragraph replaced with a dated update | Statement made false by this migration |
| `docs/research/README.md` (new) | All 14 saved-research files marked with type and provenance (saved web article / AI transcript / pasted snippets / brainstorm / personal note) | Spec: mark saved research, brainstorms, and historical probe results as such; file contents otherwise untouched |

## Deliberate non-changes

- Abdullah ownership, gate, and capacity statements outside `software-factory.md` were kept: they are substantive decisions (design owner, UI implementation gate, capacity escalation paths), not personal role routing.
- The 13 `.txt` research files and `archive/ideas.txt` are byte-identical to the source snapshot; their provenance marking lives in the research index.
- Historical probe results in `software-factory.md` (facts table, blind spots, pending probes) were kept as dated records, with superseded entries annotated rather than deleted.
- Content reconciliation (stale scope claims, model references, Devpost-era wording) is deliberately deferred to PR 02 per the import plan.
- Retained-local materials (2 PDFs, `refactoring-english/`, Learning Game PNG) were not imported and are referenced only through the research index.

## Verification evidence (2026-10-24, branch `docs/hackathon-2026-import`)

| Check | Command / method | Result |
| --- | --- | --- |
| Source snapshot integrity | SHA-256 of all 55 source files vs `hackathon-2026-file-map.json` | 55/55 match |
| Destination uniqueness | `git ls-files` against the repo before staging; no pre-existing tracked file at any destination | No collisions |
| All 26 imported paths staged | `git ls-files` per mapped destination | 26/26 |
| Content identity | SHA-256 of staged files vs map: 14 byte-identical; the 12 `.md` files differ only by the rewrites recorded above | Matches change record |
| Links and anchors | Scripted sweep over all 31 repository markdown files: 159 relative links resolved from their new locations, heading-slug anchor check | All resolve; the 2 broken anchors in `docs/observed-behaviour.md` predate this import (PR 02 scope) |
| Formatting | `pnpm exec prettier --check` with explicit paths over all 30 changed files (repo-pinned prettier) | All pass |
| Fresh clone | `git clone --branch docs/hackathon-2026-import` into an empty directory | 26/26 documents present; no document is a symlink; no markdown link enters `.worktrees/` |
| Source directory | `.worktrees/hackthon-docs/` untouched (55 files) | Kept per plan, pending post-merge verification |
