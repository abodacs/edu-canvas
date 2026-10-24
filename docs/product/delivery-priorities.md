# Product priorities and ticket writing

Planning draft, 2026-10-24. All agreed first-version features remain in the hackathon target. This orders work; it does not authorize implementation, claim delivery status, or establish capacity. The preliminary estimate for the full scope is 36–57 human hours ([UQ3](../design/design-doc-questions.md#answer-the-five-open-ui-design-topics)); Abdullah's capacity decision is still pending. The [implementation gate](teacher-ui.md#implementation-gate) applies to every build and integration probe.

## Product outcome

A teacher turns an equivalent-fractions objective into a source-grounded interactive lesson, improves one section without losing the rest, and uses learner response evidence to choose follow-up. Teacher effort and usefulness remain hypotheses until observed.

The official [Indie judging criteria](https://dev.meta.ai/events/global-hackathon) are creativity, technical ambition, and whether it works, checked 2026-10-24. They do not provide numerical scoring weights. Our proposed competitive bet is the visible combination of grounded authoring, useful interaction, precise revision, and teacher control. Using several services is not evidence of a better product.

Prioritize prerequisites and failure risks first, then visible teacher value, then presentation. Avoid numerical RICE scores without usage, impact, and effort evidence. Test the riskiest assumptions before polishing their dependent features. Retain the full target; bring any scope/budget conflict to Abdullah.

## Skill selection

| Responsibility | Recommended available skill | Use |
| --- | --- | --- |
| Choose product bets | `layers-product-strategy`, with `layers-intro` | Connect teacher need to outcome, compare options, test the riskiest assumption |
| Specify the full feature | `specs-plugin:prd-writer` | Consolidate interview decisions into user requirements and measurable outcomes |
| Define technical contracts | `specs-plugin:tdd-writer` | Reconcile the existing architecture, dependencies, failure behavior, and acceptance criteria |
| Write bounded execution tickets | `specs-plugin:task-writer` | After inventory/design, attach dated evidence, dependencies, scope, observable done criteria, and verification |
| Verify acceptance | `specs-plugin:ac-checker` | Check actual implementation and evidence, supplemented by Abdullah's forthcoming verification skills |

These skills are available already. No skill was installed. Additional candidates found through discovery: [prioritization-advisor](https://github.com/deanpeters/product-manager-skills/blob/main/skills/prioritization-advisor/SKILL.md) for framework selection and [user-stories](https://github.com/phuryn/pm-skills/blob/main/pm-execution/skills/user-stories/SKILL.md) for INVEST-style stories. They are optional; adding a framework does not replace product evidence.

## Proposed delivery order

These are candidate work packages, not code-verified execution tickets or delivery estimates. Split them after inspecting existing delivery evidence and the approved technical design. Reuse existing issues where they own the same work. All checks below are pending.

| Order | Work package | Observable exit condition | Why now |
| --- | --- | --- | --- |
| 1 | Eligibility, delivery inventory, and verification plan | Rules/model constraints recorded; current loop classified with evidence; Abdullah's skills read; gaps and estimated effort reconciled with full scope | Establish eligibility and actual remaining work before promising dates |
| 2 | Learning Commons to real Meta-model draft | Exact `4.NF.A.1` lookup and actual model output reach validation/preview; source IDs and gaps retained | Prove the two critical external contracts early |
| 3 | Complete bounded teaching sequence | Worked example, adjustable fraction diagram, guided hints, and independent check render; LaTeX and interactions checked in the browser | Produce the core visible learner value |
| 4 | Teacher grounding panel and review | Standard, skills, source links, and gaps visible beside the full sequence; publication requires approval | Make source alignment inspectable |
| 5 | Revise one section consistently | Selected section changes; other sections persist; dependency conflicts flagged; changed version requires approval | Proposed distinctive teacher action |
| 6 | Learner attempt and teacher follow-up | Server grading, corrective feedback, distinct first attempt/hints/retries, and evidence-based teacher override work against the approved version | Complete the original teacher-to-student loop |
| 7 | Jev matching and evaluation | Reviewed matching cases exercise native confidence above/at/below 0.90, unsupported input, and outage; automatic path enabled only after evaluation | Reduce confirmations without assuming calibrated task accuracy |
| 8 | Grounding recovery and lesson upload | One offered retry, then selectable-text PDF/TXT/MD upload; extracted-content gaps flagged; missing prerequisites distinguished from missing required skills | Deliver the agreed alternate entry path |
| 9 | Version, interruption, and access resilience | Reload/retry/edit boundaries, keyboard/mobile use, provider failures, and public-demo access/usage guards verified | Keep the complete feature set dependable |
| 10 | Teacher comparison and reviewer comprehension | Actual teacher corrections/effort recorded; three unfamiliar viewers can explain the distinctive action; claims match observed behavior | Check usefulness and communicate the value |
| 11 | Final demonstration and submission artifacts | Real generation, interaction, section revision, and teacher decision shown within the event's actual artifact requirements; access independently checked | Convert working capability into reviewable evidence |

Run teacher review alongside delivery as soon as a reference lesson is available. This order is a dependency-oriented default, not a requirement to postpone evaluation or feedback until the end. Full features remain targeted; narrower subject breadth and a bounded component catalog keep that target concrete.

## Writing guidance from Refactoring English

Source: Michael Lynch, _Refactoring English: Effective Writing for Software Developers_, v1.0.4, [local reference](../research/README.md#local-reference-materials). Page numbers below are printed pages; PDF viewer pages are three higher. Table of contents and extracted full-text search show no dedicated ticket-writing chapter.

- Chapter 1, p. 6: lead with the point. Ticket application: title the user-visible result and explain the problem before implementation details.
- Chapter 11, p. 64: remove ambiguity. Ticket application: name the trigger, exact threshold, expected result, and failure behavior.
- Chapter 19, pp. 163-179: design writing. The sections on goals/non-goals (pp. 168-169), scenarios (p. 169), constraints/SLOs (p. 171), and timelines (p. 172) help make work bounded and observable.
- Chapter 19, pp. 177-178: open issues state the problem, options, and immediate next step; resolved issues preserve the decision. These are design decisions, not a complete sprint-ticket format.
- Chapter 21, p. 212: summarize relevant bug context rather than making a reader reconstruct a linked ticket discussion.

The ticket application above is our synthesis. The book supplies writing guidance; acceptance-criteria tables, verification plans, and task lifecycle conventions come from the ticket-writing skill.

## Ticket quality bar

Use a concrete result as the title. Include the user problem and dated evidence, the bounded change, dependencies, decisions, acceptance criteria, verification, and one immediate next step. Each criterion specifies a trigger and observable result, including the important failure path. Separate planned behavior from demonstrated behavior. Keep implementation code in the implementation, and link to related context while summarizing what the reader needs.

Example title: **Generate without confirmation when a supported standard match has Jev confidence above 0.90.** Acceptance checks must also cover exactly 0.90, a lower value, a confident unsupported request, Jev failure, and retention of publication approval.

## Open decisions

Synced 2026-10-25 with the [design decision record](../design/design-doc-questions.md) (UQ1–UQ5); see the matching list in [teacher UI decisions](teacher-ui.md#open-decisions) for the full evidence status.

- PDF partial extraction (UQ2, answered): generation stops; corrected extraction or a replacement file is required.
- Matching evaluation (UQ1, answered with rule): 40 reviewed cases; zero wrong automatic matches and at least five correct automatic matches. Reviewed cases and results still pending (E6).
- Full scope versus budget (UQ3, answered with estimate): 36–57 human hours versus the earlier 30-hour plan. Abdullah must choose additional capacity, timeline changes where possible, or an explicit scope revision (E3).

Next planning step: the feature PRD and technical design now live in [design/design-doc.md](../design/design-doc.md) and its companions; turn the inventory-backed work packages into bounded tickets there. Ticket storage and tracker publication are not selected; no external issues have been created.

## Documentation audit

Audited 2026-10-24 against the conversation. Explicit decisions, unresolved questions, provider research, skill recommendations, PDF findings, and the approval gate are captured. Older roadmap/sprint/design defaults now point to the updated scope. Expanded acceptance checks remain pending, and technical diagrams/estimates are labeled as needing revision. Verified 96 local file/anchor links across eight documents and checked key decision coverage. No implementation or external-service evaluation was performed.

Update 2026-10-24: these notes now live in tracked paths under `docs/` (imported by PR 01 of the hackathon-2026 document stack).
