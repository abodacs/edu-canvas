# Deliver the hackathon plan and complete the product lifecycle

Planning snapshot: 2026-10-24. Owner: Abdullah. Status: proposed PR stack and tracker changes. This document records planned work; it does not claim that files were migrated, issues changed, or features delivered.

Land the project documents in tracked paths, reconcile the roadmap and issues, then deliver the complete approved teaching loop in reviewable PRs. Continue through teacher validation, an authorized pilot, production readiness, operation, and eventual retirement.

## Start from the verified repository state

| Observation | Evidence and consequence |
| --- | --- |
| Local and remote `main` are at `d3bd40975068dcb7441aced5b56cc89d67a2f6e9` | Read from Git and GitHub on this date. Refresh the base before execution. |
| `.worktrees/hackthon-docs` is a plain directory | It is absent from `git worktree list`. `.gitignore:17` ignores the directory. Its files cannot enter a normal PR without migration. |
| The source contains 55 files | The [file map](hackathon-2026-file-map.json) accounts for all files: import 26 project files; retain 29 personal reference files locally. |
| GitHub has 20 open issues and no milestones | All returned issues have no assignees or project memberships. Reconcile their July acceptance criteria before marking them ready. |
| No existing project is linked to this repository | All six accessible user projects were checked. None contains an `edu-canvas` item. Create a dedicated roadmap project rather than repurpose an unrelated board. |
| There are no open PRs | Work in existing local branches is not evidence of a merged capability. |
| `#27`, `#69`, and `#76` are closed | Preserve their states. Recheck the false-success case from `#27` against the release candidate. |
| `#75` is a merged PR | It added the older demo script for `#11`. Remove references that describe it as an open recording issue. |
| Full-scope implementation is estimated at 36–57 human hours | This is the local design's preliminary estimate, excluding credential and recruitment waits. It exceeds 30 hours by 6–27 hours before this documentation/tracker work. Re-estimate on the fresh base. |

Sources: [GitHub issues](https://github.com/abodacs/edu-canvas/issues), [repository](https://github.com/abodacs/edu-canvas), and [merged recording PR](https://github.com/abodacs/edu-canvas/pull/75). Reproduce with `git worktree list`, `git check-ignore -v .worktrees/hackthon-docs/README.md`, `gh issue list --state all --limit 200`, `gh project list --owner abodacs`, and `gh api repos/abodacs/edu-canvas/milestones`. Inspect project membership with `gh project item-list <number> --owner abodacs --limit 200 --format json` for each returned project.

The [official event page](https://dev.meta.ai/events/global-hackathon), checked on this date, lists the application deadline as October 25 at 11:59 PM ET, subject to earlier capacity closure. The event starts October 26; submissions close November 4 at 9 PM ET. The page says official rules will be published before kickoff. Application acceptance, code-reuse permission, exact allowed-model requirements, and submission artifacts still need recorded evidence under V1.

## Preserve the complete product objective

A teacher turns a Grade 4 equivalent-fractions objective into a grounded lesson, revises one section, approves the exact version, and chooses follow-up from learner evidence.

The event scope is English, Common Core `4.NF.A.1`, teacher-supervised use, and synthetic learners. Retain Learning Commons, evaluated Jev matching, PDF/TXT/Markdown recovery, visible sources and gaps, adjustable fractions, rendered LaTeX, selected-section revision, teacher approval, private server grading, and teacher override.

Keep worked example, guided practice, and independent check as distinct instructional stages. The existing four variants remain content options; they are not four stages. Record the first independent response separately from hints and retries. Report provisional evidence rather than mastery or a diagnosis.

Use the later [design decisions](../design/design-doc-questions.md) to reconcile earlier documents. Incomplete extraction stops generation. Jev automation requires the specified reviewed evaluation. These are technical design defaults; verification and implementation approval remain outstanding.

The existing [UI implementation gate](../product/teacher-ui.md#implementation-gate) requires explicit build approval and Abdullah's verification skills for content, pedagogy, rendering, and interaction. Documentation migration and tracker planning can proceed. Application changes, prototypes, dependency installation, and integration probes wait for that gate. Record capacity reconciliation before committing to delivery dates; retain the full feature target unless Abdullah explicitly changes it.

## PR 01: put the project documents in tracked paths

Branch: `docs/hackathon-2026-import`. Base: refreshed `origin/main`. Copy the mapped files first; keep the original directory until the merged copy is verified from a clean checkout.

| Source relative to `.worktrees/hackthon-docs/` | Proposed destination | Files |
| --- | --- | --- |
| `README.md` | `docs/README.md` | 1 |
| `ROADMAP.md` | `ROADMAP.md` | 1 |
| `hackathon/` | `docs/hackathon/meta-global-2026/` | 4 |
| `engineering/design-doc*.md` | `docs/design/`, preserving filenames | 4 |
| `ui/README.md`, `ui/product-priorities.md` | `docs/product/teacher-ui.md`, `docs/product/delivery-priorities.md` | 2 |
| `engineering/software-factory.md` | `docs/engineering/software-factory.md` | 1 |
| `engineering/*.txt` | `docs/research/engineering/` | 5 |
| `education/` | `docs/research/education/` | 4 |
| `ui/*.txt` | `docs/research/ui/` | 2 |
| `design/` | `docs/research/design/` | 2 |
| Two source PDFs and `refactoring-english/` | Keep local; record reference links and disposition in `docs/research/README.md` | 29 |

The file map records every source path, destination, and SHA-256. It excludes personal books and generated book material from this project import. Do not delete those files or install the generated skill. A later reference-material change can establish a suitable repository location and redistribution basis separately.

PR 01 must:

- Import all 26 mapped project files without silently dropping requirements or research. Mark saved research, brainstorms, and historical probe results as such.
- Inspect imported text for credentials and private machine or portfolio details. Replace private operational details with the relevant project requirement; preserve substantive decisions.
- Rewrite file and anchor links, especially `../../../src`, `../../../docs`, root roadmap links, and references to locally retained books. Add a tracked reference index instead of broken PDF or skill links.
- Keep the software-factory notes as dated context. Remove personal role routing and mandatory agent workflows from the active project contract. Leave shared agent instructions unchanged.
- Make `docs/README.md` explain document ownership and link it from the repository README.
- Verify destination uniqueness, all 26 imported paths, links, anchors, and formatting. Record deliberate link/content changes against the source map.
- Open a docs-only PR. A fresh clone of its branch must contain the documents without `.worktrees`, symlinks, or the original machine.

## PR 02: reconcile scope, technical design, and roadmap

Branch: `docs/hackathon-2026-roadmap`. Base: PR 01. This PR makes the imported material usable as one delivery contract.

| Document | Owns after reconciliation |
| --- | --- |
| Root `ROADMAP.md` | Product outcomes, release boundaries, lifecycle gates, and deferred commitments |
| `docs/product-strategy.md` | Problem, target users, alternatives, value hypothesis, and evidence limits |
| `docs/product/teacher-ui.md` | Explicit UI requirements and the existing implementation gate |
| `docs/design/design-doc.md` and companions | Technical contracts, defaults, AC01–AC24, design decisions, and estimate |
| `docs/walking-skeleton.md` | Current end-to-end acceptance contract and actual delivery gaps |
| `docs/hackathon/meta-global-2026/README.md` | Event schedule, eligibility assumptions, risks, and execution decisions |
| Event validation tracker | V1–V16, dated observations, and evidence links |
| Event demo script | Recording sequence and bounded claims |
| GitHub issues and Projects | Work ownership, dependencies, priority, lifecycle state, and delivery evidence |

Rewrite the root README, walking skeleton, strategy, delivery priorities, and sprint references where they conflict. Remove obsolete Devpost-only model/harness requirements from active instructions. Preserve historical decisions with dates. Replace the unconditional 30-hour calendar with the fresh estimate and capacity decision. Keep the October 27 integration checkpoint and later event checkpoints labeled provisional until capacity is reconciled.

Synchronize the UI open-decision lists with UQ1–UQ5. Resolve the old offline-only grounding rule, bilingual event criteria, mandatory storytelling-agent dependency, four-variants-as-stages claim, `#75` issue reference, and stale `#27` status. Preserve the private-grading, safety, versioning, synthetic-data, and tenant boundaries.

Record architecture changes as focused AgDRs using the next unused identifier. Cover grounded package/version contracts, provider selection and deadlines, and demo access/deployment. Link them from the relevant issue. Update the release runbook to the design's single-instance demo, database-backed quotas, and process-local burst limits; do not claim production readiness.

Exit: every requirement has one owning document and a work-item mapping below; no active document contradicts the agreed scope or reports pending evidence as passed.

## Reconcile GitHub issues and Projects after PR 02

This is a tracker execution checkpoint, not a code PR. First save dated issue bodies, states, labels, dependencies, milestone data, and project configuration/items. Compare current values with this snapshot before editing. Record created IDs and every applied change in a tracked reconciliation record. Re-running the work must reuse existing issues and project items.

Create a repository-linked project named `Edu-Canvas roadmap`. Keep issues as the work records and link their PRs. Add PR-only items only when a distinct review need exists.

| Field | Values or use |
| --- | --- |
| Status | Backlog, Todo, In Progress, In Review, Done |
| Horizon | Readiness, Hackathon, Value gate, Pilot, Production, Expansion, Operations |
| Priority | P0 blocks a release or safety boundary; P1 required outcome; P2 optional or later |
| SDLC stage | Discover, Define, Design, Build, Verify, Release, Operate, Learn, Retire |
| Blockers | Linked issue IDs plus the next action; use native dependency links where supported |
| Target date | Actual deadline or agreed delivery checkpoint |
| Review date | Required for postponed work; set the first post-event review to November 10 |
| Assignees, milestone, parent, linked PRs | Use the built-in fields. Abdullah owns planning and unresolved decisions; assign execution when selected. |

Create milestones `M0: delivery ready`, `M1: Meta demo`, `M2: teacher value`, `M3: authorized pilot`, `M4: production ready`, and `M5: evidence-led expansion`. Only M1 gets the verified November 4 event deadline initially. Later dates follow the preceding evidence gate and available capacity.

Add views for readiness/blockers, hackathon execution, product roadmap by horizon, and operations. Filter the hackathon view to Readiness/Hackathon so postponed work remains visible elsewhere. Changing a view is distinct from removing a project item or closing its issue.

### Keep, revise, split, and postpone existing issues

All 20 open issues appear below. Proposed states apply after reconciliation, not at document creation. Use `Refs #n` until a PR completes the entire revised issue; only the final completing PR uses `Closes #n`.

| Issue | Proposed change | Horizon and readiness |
| --- | --- | --- |
| [#1](https://github.com/abodacs/edu-canvas/issues/1) | Keep as teaching-loop epic. Update model, English scope, grounded package, stages, revision, teacher decision, and child links. | Hackathon; stays open until children and release proof pass |
| [#5](https://github.com/abodacs/edu-canvas/issues/5) | Revise to whole-package preview, exact-version approval/publication, source provenance, and approved feedback branches. Remove `#19` as a blocker. Preserve review of all four variants. | Hackathon; blocked by contracts, rendering, access, and safety |
| [#6](https://github.com/abodacs/edu-canvas/issues/6) | Keep grading; replace best/latest-as-learning-evidence semantics with immutable first response, assistance, retries, and publication references. Preserve explicit retry limits in the contract. | Hackathon; blocked by publication |
| [#7](https://github.com/abodacs/edu-canvas/issues/7) | Revise to corrective feedback and provisional fixed-rule follow-up. Remove mandatory `#19` agent output and mastery claims. | Hackathon; blocked by saved graded attempts |
| [#8](https://github.com/abodacs/edu-canvas/issues/8) | Rename to learner evidence and teacher follow-up. Add accept/pause/approved override and stale-evidence handling; remove the read-only restriction. | Hackathon; blocked by `#7` |
| [#9](https://github.com/abodacs/edu-canvas/issues/9) | Keep English learner keyboard, screen-reader, responsive, reduced-motion, and recovery checks. Move Arabic/RTL delivery criteria into N14. | Hackathon; do not postpone accessibility |
| [#10](https://github.com/abodacs/edu-canvas/issues/10) | Keep English authoring/revision/recovery/accessibility checks. Move Arabic criteria into N14. | Hackathon; depends on completed teacher path |
| [#11](https://github.com/abodacs/edu-canvas/issues/11) | Keep release owner. Replace old sponsor/model assumptions; include guarded deployment, new script, clean-checkout proof, and V9–V11. | Hackathon; final release gate |
| [#19](https://github.com/abodacs/edu-canvas/issues/19) | Remove standalone storytelling-agent work from M1. Move required explanation/sequence criteria to `#5`, `#7`, and N08; link replacements. | Expansion; Backlog; review after M2 |
| [#28](https://github.com/abodacs/edu-canvas/issues/28) | Keep P0 safety gate. Add package/source/revision boundaries and hard blockers for known mathematical or dependency faults. Safe advisory warnings remain visible. | Hackathon; required before preview/publication |
| [#29](https://github.com/abodacs/edu-canvas/issues/29) | Keep platform generalization deferred. Extract only bounded fractions catalog work into N08. | Expansion; Backlog; review after M2 |
| [#30](https://github.com/abodacs/edu-canvas/issues/30) | Keep broad standards packs deferred. N03 owns the single-standard grounded slice. | Expansion; Backlog; review after M2 |
| [#31](https://github.com/abodacs/edu-canvas/issues/31) | Keep general multi-page authoring deferred. N08 owns the fixed instructional sequence. | Expansion; Backlog; review after M2 |
| [#58](https://github.com/abodacs/edu-canvas/issues/58) | Keep as value/adoption epic. Replace the dated model-only comparison with fair total-workflow comparison. Link N10/N11 and keep production/research rows conditional. | Value gate; pre-event research starts alongside build |
| [#68](https://github.com/abodacs/edu-canvas/issues/68) | Keep; configure main protection after checking the actual required CI context and solo-maintainer merge path. Record a failing-check merge rejection. | Readiness; repository-setting task, no code PR |
| [#70](https://github.com/abodacs/edu-canvas/issues/70) | Postpone blanket coverage expansion. Replace automatic per-PR floor increases with measured domain coverage improvements. Critical behavior checks still accompany each feature. | Production; Backlog; review November 10 |
| [#71](https://github.com/abodacs/edu-canvas/issues/71) | Keep. Review the uncommitted workflows in `.worktrees/sprint/.github/workflows/`; port only the intended changes. | Readiness; PR 03 |
| [#72](https://github.com/abodacs/edu-canvas/issues/72) | Rename to provider/data residency and retention decision. Cover the selected model, Learning Commons, Jev, uploads, and hosting. Do not treat an OpenAI-only answer as sufficient. | Production; blocks real learner data; synthetic-only demo retained |
| [#73](https://github.com/abodacs/edu-canvas/issues/73) | Keep P0 threat-model refresh. Cover uploads, external text, session/tenant checks, answer projections, quotas, and revision/publication races. Revisit against final implemented paths. | Hackathon; design review early, final verification before hosting |
| [#74](https://github.com/abodacs/edu-canvas/issues/74) | Keep P0; extend protected sessions to authoring, uploads, preview, learner reads, and follow-up decisions. Use database quotas and bounded burst limits. | Hackathon; blocks public access and paid-provider exposure |

Remove stale `ready-for-agent` labels from blocked or changed issues, including deferred `#19` and `#29`–`#31`. Restore readiness only after scope, dependencies, verification, and required authorization are complete. Do not use the label to trigger delegation.

Keep closed foundation issues closed. Put `#27`, `#69`, and `#76` in Done only if a completed-history view is useful. A reproduced `#27` failure justifies reopening it with new evidence; the old report alone does not. Reference PR `#75` under `#11` instead of creating another recording ticket.

No existing edu-canvas project memberships need removal in this snapshot. During execution, remove only verified duplicate or wrong-board items, preserving their issue and evidence. Move postponed work to Backlog with a horizon, review date, and restart condition. Close an issue as not planned only when its requirement is explicitly abandoned or fully transferred to linked replacements.

### Add missing work without duplicating existing ownership

N-identifiers are planning references, not GitHub issue numbers. Search by outcome before creation; write actual URLs back into this plan and parent issues.

| ID | New issue outcome | Observable acceptance | Horizon |
| --- | --- | --- | --- |
| N01 | Track and reconcile the hackathon documents | All 26 project files mapped and tracked; links pass in clean checkout; active documents agree | Readiness |
| N02 | Establish evidence, build authorization, and capacity | V1/V2, starting revision, actual verification skills, explicit approval, fresh estimate, capacity decision, and provider-access next steps recorded | Readiness |
| N03 | Ground the exact standard and show sources | Standard/required skills/provenance saved; gaps visible; one retry then upload; no model-recall substitution | Hackathon |
| N04 | Evaluate and enable Jev matching | Reviewed 40-case split, pinned versions, zero wrong held-out auto matches, at least five correct auto matches, threshold/outage/unsupported checks | Hackathon |
| N05 | Recover through PDF/TXT/Markdown upload | Bounded extraction, partial/scanned diagnostics, corrected-source review, private storage, expiry, and retry recovery work | Hackathon |
| N06 | Generate through the allowed Meta provider | Actual draft reaches validation/preview; source/version pins, lease ownership, deadlines, correction limit, and fixture/live distinction verified | Hackathon |
| N07 | Persist versioned lesson and learner records | Additive schemas/migrations, private/public projections, operation conflicts, legacy reader, tenant isolation, and restart evidence pass | Hackathon |
| N08 | Render the bounded fraction lesson sequence | Equal-sized adjustable fractions, real LaTeX, hints and fresh independent item work through a versioned catalog and semantic controls | Hackathon |
| N09 | Revise one section and require reapproval | Other section hashes preserved; dependency conflicts block publication; concurrent stale approval rejected | Hackathon |
| N10 | Observe teacher problems and compare total effort | Three target-teacher task records; matched workflow timing including corrections; alternatives, assistance, errors, and next-use intentions recorded | Hackathon |
| N11 | Complete repeat-use and adoption validation | Five teachers over two weeks plus two curriculum/admin interviews; actual return/use, effort, error burden, and adoption barriers recorded | Value gate |
| N12 | Design and run an authorized learner pilot | Approved protocol, participants/data permissions, taught transfer item and delayed check, interpretation limits, and continue/revise/stop decision | Pilot |
| N13 | Prove production and operating readiness | Auth/privacy decisions, restore and rollback drills, incident owner, measured costs/SLOs, retention/deletion, and maintenance plan demonstrated | Production |
| N14 | Restore bilingual teacher and learner delivery | Arabic/RTL requirements transferred from `#9`/`#10`; language/content/math checks and target-user evidence defined before build | Expansion |

N01 and N02 are readiness work, not new gates requiring a second approval of documentation. N02 records the existing UI approval requirement. Run N10 early; unavailable teachers leave the value claim unvalidated. N11 remains the full post-event gate, not a claim that a three-person screen establishes demand.

## Deliver the implementation PR stack

PR 01 and PR 02 form the documentation stack. Execute tracker reconciliation next. PR 03 onward starts only after the relevant readiness conditions pass. Order dependent branches by the table; keep one implementation PR active. Build branches from refreshed main after their prerequisites merge, or temporarily base a dependent PR on its open predecessor and retarget it after merge.

| PR | Result and issue ownership | Depends on | Required exit evidence |
| --- | --- | --- | --- |
| 03 | Security and PR-title CI, `#71` | 02 | Workflows run; malformed-title and security-report evidence; actual CI context recorded for `#68` |
| 04 | Versioned package/storage contracts and hard safety boundary, N07 + `#28` | 02, N02 | Additive migration, legacy reader, safe projections, blocked preview/publication; AC09, AC14, AC15, AC19, AC21 |
| 05 | Protected role sessions and persistent usage budgets, `#74` | 03, 04 | Invalid/forged sessions and exhausted quota rejected before provider/private access; AC14, AC20 |
| 06 | Learning Commons snapshot and teacher source panel, N03 | 04, 05 | Exact target lookup, source hashes, prerequisite gap, bounded retry; AC01, AC02; V13 |
| 07 | Evaluated Jev decision path, N04 | 06 | Threshold boundaries, unsupported clarification, manual outage recovery, changed-version disable; AC03, AC04, AC06, AC24; V14 |
| 08 | Upload recovery and expiry, N05 | 05, 06 | PDF/TXT/Markdown extraction, incomplete-source stop, safe replacement, deletion; AC02, AC05, AC23; V16 |
| 09 | Real Meta draft through existing generation seam, N06 | 04, 05, 06 | Real source-grounded output reaches actual validation and preview; AC07–AC09; V3. Explicit teacher match confirmation is valid while PR 07 is pending. |
| 10 | Fraction/math catalog and fixed teaching stages, N08 | 09 | Full sequence and hidden future answers; keyboard fraction controls and rendered math; AC15–AC17, AC21; V5/V15 |
| 11 | Exact-version review, approval, publication, assignment, `#5` | 10 | All variants and branches reviewed; repeated publish safe; stale approval fails; AC11, AC14, AC15, AC19 |
| 12 | Selected-section revision and dependency checks, N09 | 11 | Preserved section hashes, changed version unapproved, dependency diagnostics; AC10, AC11; V15 |
| 13 | Server grading and immutable attempt history, `#6` | 11 | Wrong answer plus forged score stays wrong; independent first response and hint history survive retries/reload; AC12–AC15, AC19 |
| 14 | Corrective reveal, fixed follow-up, teacher accept/pause/override, `#7` + `#8` | 13 | Actual attempt produces reproducible provisional reason; approved override and stale evidence checks; AC12, AC18; V6 |
| 15 | Teacher/learner usability and failure recovery, `#9` + `#10` | 07, 08, 12, 14 | Both paths work by keyboard, screen reader, narrow viewport, zoom, and interrupted/repeated actions; AC16 plus V8. Carry accessibility checks in earlier PRs too. |
| 16 | Guarded deployed demo and release runbook, part of `#11` + final `#73` | 03, 05, 15 | Fresh deployment, health/readiness, DB restart, quota/session checks, retention and rollback; AC19, AC20, AC23; V9 |
| 17 | Release evidence, recording, and submission package, completion of `#11` | 16 | All AC01–AC24 accounted for; three rehearsals, 20 live requests, known limitations, independent access; AC22; V10/V11 |

PR 09 can run immediately after PR 06 to prove provider feasibility early. PR 07 and PR 08 remain required before PR 15 and release. Their deferred position during a probe does not remove them from event scope. Split a row further if the fresh inventory shows independent review units; update its estimate and issue links before building.

`#68` is a repository-settings task after CI contexts are verified. `#73` gets an early design review in PR 02 and final implemented-path evidence in PR 16. Those activities do not justify closing either issue before its acceptance criteria pass. `#11` stays open through its final release proof.

For each PR, state the user-visible result, bounded scope, dependencies, verification, and rollback. Link the owning issue and AC/V identifiers. Update the relevant feature documentation in the same PR. A merged prerequisite makes a dependent issue eligible for reassessment; it does not mark that issue implemented.

## Use evidence to move through the full lifecycle

| Milestone | Objective and accountable owner | Exit evidence and next decision |
| --- | --- | --- |
| M0: delivery ready | Abdullah reconciles scope/capacity; builder preserves the plan and defines contracts | PR 01/02, issue/project reconciliation, V1/V2, approval/skills, and updated estimate. Missing rules or capacity keep the delivery date provisional. |
| M1: working event release | Builder delivers every agreed feature; Abdullah owns event submission | PR 03–17, AC01–AC24, V3/V5/V6/V8–V11/V13–V16. Submit by November 4 only with accurate demonstrated claims. Keep missing checks explicit; a recording does not pass live-generation evidence. |
| M2: teacher value | Abdullah and recruited teachers test whether the workflow earns repeat use | N10/N11, V4/V7/V12, matched total-effort/error records, five-teacher repeat-use observations, and two adoption interviews. Proposed initial screen: two of three report a concrete problem and prefer to retry after comparable use. Agree the repeat-use decision bar before N11; judge individual evidence and sample limits. Revise or stop expansion if value is absent. |
| M3: authorized learner pilot | Abdullah owns authorization; teacher/research reviewer owns instructional assessment | N12, `#72` and required access/privacy/security controls before real learner data. Compare fresh independent performance, taught transfer, delayed retention, classroom effort, and error burden under a predeclared protocol. No efficacy claim from synthetic runs. |
| M4: production ready | Builder and named operator prove the product can be supported | N13, `#70`, `#72`, remaining `#73` findings, production identity/tenant tests, restore/rollback drills, deletion, observed cost per approved lesson, support ownership, and measured service targets. Enable production only after acceptance. |
| M5: evidence-led expansion | Abdullah selects one next need demonstrated by users | Reassess `#19`, `#29`–`#31`, N14, LMS/export, publisher access, OCR, broader standards, and home use. Each selected capability gets its own evidence, design, estimate, and PR stack. Do not commit all deferred ideas at once. |
| Operations and learning | Named operator monitors reliability/cost and Abdullah reviews product evidence | Regular dependency/security review, content-error triage, model/source drift evaluation, restore drills, support feedback, and roadmap review. Changing matching/model pins reruns the relevant evaluation before automation returns. |
| Retirement or replacement | Abdullah decides; operator executes a recorded shutdown/migration plan | Disable new work, notify authorized users where applicable, export permitted records, complete retention/deletion, revoke credentials, remove hosting, archive evidence, and close or transfer remaining issues. Demo cleanup runs on the design's schedule even if product work continues. |

After the event, review postponed work on November 10. Do not set pilot or production dates until participants, evidence, controls, and capacity support them. Track a feature across discovery, definition, design, build, verification, release, operation, learning, and retirement using the SDLC field and its linked evidence.

## Verify completion without confusing documentation with delivery

For document PRs, validate the file map, destination collisions, repository-relative links and anchors, formatting, and stale-scope claims. Check the imported branch from a clean checkout before deleting any local source. This plan itself needs only document/map verification.

For behavior changes, run `pnpm check` and focused acceptance checks. Persistence changes also require `pnpm test:database` against a dedicated disposable database; this suite is separate from `pnpm check`. Apply migrations only to that test database during verification. Runtime/deployment changes also require `pnpm smoke` against the built service. Run the supplied content, pedagogy, rendering, and interaction skills, plus browser checks for affected paths. Workflow-only changes need workflow validation and actual CI evidence.

Attach revision, environment, command/probe, observed result, and evidence URL to every accepted criterion. Record fixtures separately from live calls. Use the validation tracker's V identifiers and the implementation design's AC01–AC24; do not add a second pass/fail ledger in this plan.

After tracker edits, reread every affected issue and project item. Verify all 20 original open issues are accounted for, required new outcomes have real issue links, postponed issues retain review dates, and no duplicate items exist. Mark Done only after the issue's complete acceptance evidence passes. Export the final tracker state alongside the before snapshot so edits can be reversed.

Planning handoff is complete when this plan and file map are reviewable in tracked paths. Execution is complete only when the mapped files are merged into main, active documents agree, GitHub issues/Projects match the accepted scope, and each chosen lifecycle milestone has its own evidence.

## Unresolved questions

- What capacity or explicit scope change reconciles the fresh full-scope estimate with 30 hours and the event deadline?
- Which verification skill names/paths and explicit UI build approval will Abdullah supply?
- What do the published rules permit for existing code, exact models, and final artifacts, and has the application been accepted?
- Do authenticated services cover the exact target and meet the contracts? Which Meta model actually passes V3?
- Which teachers/reviewers can participate, and what repeat-use/pilot thresholds will they agree before observations begin?
