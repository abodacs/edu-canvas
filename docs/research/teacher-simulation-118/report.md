# Persona-pack design review — v2

V2 revises the study inputs and questions. **No new simulation was run, and no v2 outcome exists.** The complete [v1 results](legacy/v1/report.md), [original profiles](legacy/v1/personas.json), [original protocol](legacy/v1/protocol.md), [raw runs](legacy/v1/runs/) and [CSV](legacy/v1/sessions.csv) remain archived together. Their authored minutes and decisions describe only v1.

## Changes and intended use

- Profiles and role cards now share version 2.0 and cover fictional identity, qualifications, workload, planning time, resources, languages, access, skills, policy, purchase authority and uncertainties. Identity never determines skill or attitude.
- Ten US Common Core Grade 4 core roles retain a comparable objective and quality bar. Two boundary roles receive screening and one rejection probe each, without four invented follow-up sessions.
- A revision-pinned [capability ledger](capabilities.md) distinguishes documented generation/preview behavior from the incomplete target loop and deferred integrations.
- The [protocol](protocol.md) starts with neutral questions, then separates shared stress conditions from persona-specific questions. The profiles no longer dictate return decisions.
- The [gap audit](gap-audit.md) links all twelve assignments to uncovered cases and evidence needed from real teachers. Keyboard/zoom coverage and a separate screen-reader probe are explicit.
- Effort is discussed as burden, help, trade-offs and unknowns. Purchasing willingness remains unknown. No new times, retention figures, error counts or learning claims are supplied.

## Interpretation limits

Daniel can value a better teaching decision despite equal or greater effort; Maya can miss errors despite completing review. Ruth may prepare online without teaching online. Lina's tool policy and funding, Elena's recommendation role, Owen's department review, Sam's response attribution, Noor's prerequisite uncertainty and Alex's actual opportunity to choose all require separate investigation. None predetermines adoption.

The uneven tool groups and deliberately varied contexts support no comparative inference. Fictional breadth does not replace recruitment or make the sample representative. Keep v1 outcomes separate from these revised profiles; shared IDs do not make old events applicable.

## Evidence and verification boundary

Source documents are pinned to `1c712488af9afd610592e7256abbe805f61d8817`; see the capability ledger. The historical v1 report retains its original `bfbdf9b571773948dd396e681942994c1a0d013b` document-read revision. Neither is fresh application evidence.

Documentation verification passed:

- All twelve identities, ten-core/two-boundary grouping, version markers and every profile field agree with the cards.
- All 29 original artifacts are retained. The 14 JSON/CSV files are byte-identical to the original commit; archived Markdown differs only in repaired links leaving the pack.
- All 171 local Markdown links and fragments resolve. All five pinned capability-source paths exist at the named revision and match the local source documents.
- Scoped `pnpm exec prettier --check` passed for the research index and all pack Markdown/JSON, including the archive. `git diff --check` passed; an additional file scan covered whitespace in untracked additions.

Runtime tests were skipped because this revision changes only documentation and fictional profile data. It supplies no provider or accessibility result.

[#118](https://github.com/abodacs/edu-canvas/issues/118) and [V12](../../hackathon/meta-global-2026/validation-tracker.md) remain pending. No real-study evidence or purchasing commitment has been established.
