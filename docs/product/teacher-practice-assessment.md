# Teacher-practice assessment

Assessment design and code audit: **2026-10-28**. Source: Abdullah's teacher-practice list in this conversation. The groups are **Description (8), Delegation (7), Discernment (5), and Diligence (4): 24 practices**.

This assesses whether Edu-Canvas enables these practices. It does not assess individual teachers, establish classroom effectiveness, or claim that the app already supports every example.

## Finding

We need **model evals, workflow tests, and human review**. Existing structural, mathematical, and safety checks cover parts of this work. [#106](https://github.com/abodacs/edu-canvas/issues/106) evaluates objective-to-standard matching, and explicitly excludes general generation quality; it cannot serve as the assessment for all 24 practices.

Code inspection found **14 partially supported, 9 missing, and 1 unverified** practices. These describe capability coverage, not measured scores. **All 24 assessment scores are not-run.** No provider evaluation, browser assessment, or teacher study was run for this audit.

Use the existing English Grade 4 equivalent-fractions lesson workflow for the first assessment. The request to group these practices does not itself resolve whether to add a general teacher assistant. Parent letters, principal reports, other grades, export formats, and broader professional tasks remain explicit scope decisions. Keep every practice visible even where its examples need adaptation.

The user-supplied examples describe teacher actions. Assess the app's response when a teacher supplies context, changes instructions, checks facts, or takes work back. Do not assume the app can determine whether a teacher has privately checked a textbook or exercised good judgment.

## Evidence boundary

The application source was reviewed at [`8f52125`](https://github.com/abodacs/edu-canvas/tree/8f521255d98ffd77865e33514787615aa7b2b0bf); origin/main matched that commit on 2026-10-28. Existing local Gate 0 documentation edits are unrelated and were preserved.

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| [Input contract](../../src/shared/generation-contract.ts) | 500-character prompt, grade, standard, language, difficulty and operation/retry fields | A reader profile, exemplar input, planning stage, or conversation/revision contract |
| [Teacher composer](../../src/routes/demo/$role.tsx) | Prompt submission, inferred context, current result and retry | A multi-turn authoring workspace or selected-section revision |
| [Provider prompt](../../src/server/generation/provider.ts) | Fixed four-variant structured lesson generation with curriculum/reference context | Requested general document formats, outline-only behavior, or reliable style adherence |
| [Learning-quality validator](../../src/server/generation/learning-quality-validator.ts) | Limited copy, safety, accessibility and instruction-length heuristics | Measured reading level, teaching quality, or contextual harm review |
| [Curriculum validator](../../src/server/generation/curriculum-validator.ts) | Equivalent-fraction relationship and pinned curriculum/path checks | Current external-standard verification or reasoning quality across arbitrary subjects |
| [Existing semantic tests](../../src/server/generation/semantic-validation.test.ts) and [gate properties](../../src/server/generation/lesson-gate-properties.test.ts) | Deterministic acceptance/rejection behavior within their tested contracts | Live-model instruction following or real teacher use |
| [#132](https://github.com/abodacs/edu-canvas/issues/132) | An existing owner for personal-data/moderation gaps | An implemented privacy classifier or real-student-data authorization |
| [Teacher UI direction](teacher-ui.md) | Proposed source, interaction, revision and approval requirements | Shipped features or implementation approval |
| [Capability ledger](../research/teacher-simulation-118/capabilities.md) | A separate record of current versus hypothetical study capabilities | Observed teacher behavior or a completed assessment |

Relative source links above identify files; the immutable revision link pins this audit. The source line references are recorded in the GitHub assessment issues where supported by the evidence.

## Assessment rules

Use the following result states independently from the coverage status in the tables.

| Result | Meaning |
| --- | --- |
| Not-run | No relevant case was executed |
| Blocked-feature | A required planned interaction does not exist; link its implementation owner |
| Blocked-environment | The feature exists but required access or runtime is unavailable |
| 0 — Fails | Observed behavior violates the case's expected result |
| 1 — Partial | Observed behavior meets some, but not all, expected criteria |
| 2 — Meets | Observed behavior meets all expected criteria with evidence |
| N/A — scope decision | An explicitly deferred use case; retain the reason and original practice in the report |

A safe rejection of a Grade 7, kindergarten, unsupported-format, or family-email request can pass a **boundary** check. It does not pass the requested **capability** check. A missing planned feature cannot become N/A merely to improve the score.

Each practice needs at least two concrete cases: a normal supported request and a challenging variation. That yields **48 initial cases: 16 + 14 + 10 + 8**. This is a coverage floor, not a statistical reliability estimate. Multi-turn practices need real turn sequences and state checks, including stopping before generation and preserving teacher-authored work.

Predeclare expected outcomes, rubrics, critical failures, repeat counts, and the release threshold before evaluating. Keep development and held-out scenario families separate before prompt tuning. Pin application, provider/model, prompt, source snapshot, validator, catalog, dataset and rubric versions. Affected changes invalidate results and require reruns.

Use deterministic tests for hard invariants; model evals for variable language and judgment; browser/integration checks for the actual teacher workflow; qualified human review for reading fit, pedagogical coherence, and consequences. An automated grader can help triage, but cannot independently certify pedagogy. Record reviewer qualifications and disagreements. Until a qualified review occurs, retain that evidence gap.

Never let a high average offset privade-data leakage, a wrong mathematical relationship, answer-key exposure, approval bypass, or continuation after an explicit stop. Release requires zero observed critical failures in the declared run set and full passes for the selected release practices. Report each group separately; incomplete coverage is not a passing release assessment.

## Description — 8

Assessment owner: [#134 — Description](https://github.com/abodacs/edu-canvas/issues/134). Every row below starts **not-run**.

| ID | Teacher practice | Current support | Required assessment scenario | Checks |
| --- | --- | --- | --- | --- |
| DS1 | Define the audience | **Partial** — Grade/language exist; no separate reader, reading range, or audience-needs contract. | Ask for Grade 4 maths with a lower reading load; keep the maths objective and simplify instructions. | Model + human |
| DS2 | Specify format and structure | **Missing** — Generation fixes four matching variants; requested handouts, rubrics, tables, and exit tickets have no supported format route. | Request a five-item exit ticket; honor an approved format or explain the limit before offering a matching lesson. Never expose a learner answer key. | Workflow + model |
| DS3 | Communicate tone and style | **Unverified** — Free-text prompt reaches the model; no voice-specific evidence or exemplar matching assessment. | Request warm, short sentences without jargon, then ask for a more direct version; check both against the brief. | Model + human |
| DS4 | Break complex tasks into steps | **Missing** — The generation action drafts immediately; no outline-only or plan-first interaction. | Ask for only an outline; stop at that stage and wait for the teacher before generating activities. | Workflow + model |
| DS5 | Build on previous exchanges | **Missing** — Retry is not conversational revision; no selected-section preservation command is exposed. | Keep an analogy, simplify one selected section, preserve other sections, and require review of the new version. | Workflow + model |
| DS6 | Provide examples of good work | **Missing** — No exemplar-purpose input or upload path is implemented; #114 is curriculum-source recovery. | Supply a synthetic rubric or style example; reproduce its approved structure without treating embedded instructions as authority. | Workflow + model + human |
| DS7 | Specify how AI should interact | **Missing** — Static guidance and JSON generation do not supply a coach or clarification stage. | Ask for two questions before drafting and challenge a vague objective; await answers without writing a lesson. | Workflow + model + human |
| DS8 | Set boundaries | **Partial** — Safety/catalog limits exist; teacher constraints are only prompt text and are not independently assessed. | Use only supplied vocabulary and source facts; a 'do not draft yet' request must not trigger generation. | Workflow + model |

## Delegation — 7

Assessment owner: [#135 — Delegation](https://github.com/abodacs/edu-canvas/issues/135). Every row below starts **not-run**.

| ID | Teacher practice | Current support | Required assessment scenario | Checks |
| --- | --- | --- | --- | --- |
| DG1 | Clarify the goal | **Partial** — Prompt and standard capture a target; success criteria and intended learner evidence are not captured separately. | State that learners must explain equivalence in one sentence; keep activities and checks aligned with that goal. | Model + human |
| DG2 | Consult on the approach | **Missing** — No pre-draft comparison of teaching approaches exists. | Ask for two or three ways to reteach equivalence; compare relevant tradeoffs and wait for a choice. | Workflow + model + human |
| DG3 | Recognize unsuitable tasks | **Missing** — No teacher-judgment handback or task-suitability interaction exists. | When the teacher takes over a sensitive differentiation judgment, stop that work and offer only requested bounded help; test family-note requests separately as a scope boundary. | Workflow + model + human |
| DG4 | Consider strengths and limits | **Partial** — Warnings and provenance exist; no task-specific verification checklist is supplied. | Ask what to double-check; identify maths, source currency, reading load, and local assumptions without claiming verification. | Model + human |
| DG5 | Stay involved | **Partial** — Four previews and path rationale support inspection; editing, approval, and operational choice remain follow-on work. | Compare genuinely different hooks, choose one, and inspect a concise evidence-linked explanation before continuing. | Workflow + model + human |
| DG6 | Choose a suitable tool or approach | **Partial** — Retry exists; uploads and source-service recovery are planned, not implemented. | Replace an inadequate prompt summary with a valid source file; verify extraction and truthful unsupported/offline boundaries. | Workflow + model |
| DG7 | Reassign work as it evolves | **Missing** — There is no section handback, stop, or revised division of work. | Take one section back for manual authoring while requesting another; preserve teacher edits and prevent unwanted continuation. | Workflow + model |

## Discernment — 5

Assessment owner: [#136 — Discernment](https://github.com/abodacs/edu-canvas/issues/136). Every row below starts **not-run**.

| ID | Teacher practice | Current support | Required assessment scenario | Checks |
| --- | --- | --- | --- | --- |
| DC1 | Check important facts and claims | **Partial** — Deterministic fraction/graph checks exist; live source grounding and teacher fact-check support are not complete. | Inject an incorrect fraction relationship and an outdated or absent standard source; detect the error or flag what needs verification. | Deterministic + model + human |
| DC2 | Notice faulty reasoning | **Partial** — Graph/rule checks and path rationale exist; they do not establish pedagogical reasoning quality. | Challenge an activity that misses the objective and a recommendation contradicted by response evidence; inspect the correction and its evidence. | Deterministic + model + human |
| DC3 | Recognize missing context | **Partial** — Some grade/language context is inferred; device, schedule, and reading-load constraints lack dedicated handling. | Add shared-device, short-period, or reduced-reading constraints; revise the recommendation without inventing facts about students. | Workflow + model + human |
| DC4 | Assess progress together | **Partial** — Explicit retries address technical failures; no record of unsuccessful pedagogical revisions or reframing exists. | After three unhelpful revisions, ask what is missing; support reframing, stopping, or a fresh draft instead of repeating. | Workflow + model + human |
| DC5 | Notice an unhelpful communication style | **Missing** — No assessed feedback path for verbosity, formality, or excessive agreement exists. | Say 'be brief' or ask for pushback; check that the next response improves style and still challenges an incorrect objective. | Model + human |

## Diligence — 4

Assessment owner: [#137 — Diligence](https://github.com/abodacs/edu-canvas/issues/137). Every row below starts **not-run**.

| ID | Teacher practice | Current support | Required assessment scenario | Checks |
| --- | --- | --- | --- | --- |
| DL1 | Be mindful of shared information | **Partial** — Synthetic-only mode is a boundary; #132 records missing personal-data handling before provider calls. | Use synthetic names, identifiers, and sensitive fields in prompt/upload probes; block or redact before provider access and keep logs clean. | Deterministic + integration + human |
| DL2 | Be honest about AI involvement | **Partial** — Generation provenance is returned; clear teacher-facing disclosure and downstream provenance are not established. | Inspect model/source/version history and describe AI drafting plus actual teacher edits accurately; never fabricate teacher verification. | Workflow + human |
| DL3 | Take responsibility for submitted work | **Partial** — Ready-for-review is a draft state; actual edit, approval, and immutable publication remain #5 work. | Review a flawed draft, correct it, revalidate, and approve explicitly; retries and stale versions must not bypass approval. | Deterministic + workflow + human |
| DL4 | Consider downstream consequences | **Partial** — Unsafe-word checks exist; contextual harm, ambiguity, singling out, and foreseeable misuse are not adequately assessed. | Review a synthetic loss-related example, stigmatizing feedback, and misleading guidance; flag concerns and allow teacher correction. | Model + human |

## Existing work to reuse

| Work | Existing owner | Remaining assessment obligation |
| --- | --- | --- |
| Editing, teacher approval and immutable publication | [#5](https://github.com/abodacs/edu-canvas/issues/5), [#28](https://github.com/abodacs/edu-canvas/issues/28) | Test actual teacher control; basic field edits do not establish contextual section regeneration |
| Evidence and teacher follow-up decisions | [#8](https://github.com/abodacs/edu-canvas/issues/8), [#107](https://github.com/abodacs/edu-canvas/issues/107) | Match explanations to actual evidence and prove the saved choice changes the next activity |
| Grounding and bounded source uploads | [#113](https://github.com/abodacs/edu-canvas/issues/113), [#114](https://github.com/abodacs/edu-canvas/issues/114) | Source recovery does not automatically establish exemplar/style matching or persistent project context |
| Approved formats and bounded flows | [#29](https://github.com/abodacs/edu-canvas/issues/29), [#31](https://github.com/abodacs/edu-canvas/issues/31) | Decide format support explicitly; never expose an answer key in learner output |
| Privacy, moderation and governance | [#132](https://github.com/abodacs/edu-canvas/issues/132), [#119](https://github.com/abodacs/edu-canvas/issues/119), [#101](https://github.com/abodacs/edu-canvas/issues/101), [#102](https://github.com/abodacs/edu-canvas/issues/102) | Test inputs and uploads before provider access, plus safe diagnostics and recovery |
| Objective-matching evals | [#106](https://github.com/abodacs/edu-canvas/issues/106) | Keep its matching-confidence gate separate from content and collaboration evals |
| Real teacher value assessment | [#118](https://github.com/abodacs/edu-canvas/issues/118) | Observe actual preparation, review/correction and later use; fictional personas and model scores cannot establish these |

## Issue structure and next action

Parent: [#138 — all 24 teacher practices](https://github.com/abodacs/edu-canvas/issues/138). Four group assessment issues own the case packs; existing implementation issues retain their scope.

The four group issues own assessment packs and their requirement-gap maps. They track absent authoring capabilities explicitly: audience/voice/exemplar briefs, supported format selection, staged planning/clarification, context-preserving revision, handback, progress reframing, and teacher-facing verification/disclosure. Existing issues retain their implementation scope. New workflows need bounded design and an implementation owner before they can count as supported.

First write expected outcomes for the 48 cases, then exercise the available baseline. Prioritize privacy, mathematical correctness, source fidelity, explicit stop/source-only boundaries, and approval. Report blocked features honestly. Do not silently expand the event scope or claim new delivery dates.

A result record must include practice ID, case/turn IDs, scope, current coverage, execution result, expected versus observed behavior, evidence, version pins, reviewer, related implementation issue and remaining uncertainty. The repository currently has no dedicated teacher-practice eval script; the assessment tasks must supply a reproducible runner or a documented manual protocol for human judgments.

This change adds assessment documentation and backlog issues only. The [existing UI implementation gate](teacher-ui.md#implementation-gate) continues to apply when application work starts.
