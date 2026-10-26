# Focused event scope — one teacher-controlled loop

**Status:** v1, 2026-10-26. Ready to execute on Day 1; iterate only after IC1 passes. This document is the event execution decision. It narrows the [full event plan](README.md) and the [teacher UI scope](../../product/teacher-ui.md). The production [roadmap](../../../ROADMAP.md) and epic [#108](https://github.com/abodacs/edu-canvas/issues/108) remain the post-event direction.

## Decision

Build one complete, teacher-controlled equivalent-fractions loop.

- **User:** a Grade 4 teacher supporting a small group.
- **Problem:** after a learner struggles, the teacher must turn that response into useful follow-up without rebuilding the lesson or losing control.
- **Promise:** prepare and approve a short interactive lesson, inspect the learner's actual response, and choose a reviewed next activity.

This is a product hypothesis. The event can demonstrate the workflow; it cannot establish learning gains.

## Day 1 gate

**IC1 — real model to preview.** Within the first 5 focused hours:

- One real allowed-model request returns a draft.
- Validation accepts or rejects it explicitly.
- The draft reaches the existing A2UI preview.
- An unsupported request is rejected.

If IC1 passes, later work iterates from a real path. If IC1 fails, fix the provider contract first. Do not build UI around a fixture.

This gate is 17% of the 30-hour plan, inside the 15–25% front-end range. It buys down the largest unknown before any feature work.

## Why this scope

Current code has generation, structural and semantic validation, allowlisted A2UI preview, and prerequisite-path preview. Approval/publication, learner attempts, server grading, and follow-up are missing. Finish the loop; do not widen authoring.

The decisive demo moment is the teacher seeing a wrong response, the support already used, and a proposed follow-up — then changing it.

This is an explicit cut. The full event plan targets Learning Commons grounding, Jev matching, uploads, section revision, and bilingual hardening. This scope defers all five. Epic #108 assumes five developers and 150 hours; this plan assumes one builder and 30 + 6 hours. Neither staffing assumption is confirmed.

## Smallest compelling demo (about 3 minutes)

1. **0:00–0:35 — Prepare.** Teacher enters the objective. An event-allowed model returns a bounded draft; validation produces the A2UI preview. Show one curated, versioned curriculum reference with provenance.
2. **0:35–1:00 — Review.** Teacher edits one hint; revalidation runs; teacher approves every variant and branch that can reach the learner; publish an immutable pack. Four variants are content options, not four teaching stages.
3. **1:00–1:50 — Learn.** A synthetic learner sees a worked example, completes guided matching, then answers a fresh item incorrectly. Show specific corrective feedback. Keep first response, hints, and retries distinct.
4. **1:50–2:30 — Decide.** Teacher sees the response and a tentative recommendation. Teacher pauses it or selects another already approved activity; the learner receives it. No generated student-facing follow-up and no mastery diagnosis.
5. **2:30–3:00 — Prove.** Show one boundary check, such as an unapproved pack being blocked. State supported scope and evidence limits.

Timing is a presentation target, not a promise that live generation fits. Label shortened waits, recordings, seed data, and fixtures honestly.

## Keep / cut

| Keep for the event | Defer |
| --- | --- |
| Grade 4 equivalent fractions; English; one standard | Other subjects, grades, standards; Arabic rollout |
| One curated reference with clear provenance | Live Learning Commons, Jev matching, upload/OCR, source ingestion |
| Existing A2UI renderer; bounded matching; simple fraction bars | General UI planner; arbitrary HTML/JS; broad component catalog |
| Worked example → guided practice → independent check | General course builder; recursive paths; multi-page framework |
| One hint edit with revalidation and reapproval | General section regeneration; dependency-aware editing engine |
| Immutable approval; private server grading; recorded attempts | Open-ended AI grading; student chat |
| One approved follow-up with a short reason; teacher pause/override | Mastery dashboards; predictions; automatic diagnosis |
| Protected synthetic demo; recovery; keyboard and mobile use | Real onboarding, rostering, LMS, production rollout, class-size scaling |

The curated source is not a live Learning Commons result. Reject unsupported objectives clearly. Preserve existing working features, but do not spend the event extending them.

**Non-goal:** OpenIntelligentUI integration. Keep only the idea that learning state selects a trusted interface; implement those few states through the existing catalog.

## Build plan

Assumption: one accountable builder, 30 focused hours plus 6 hours reserve. These are timeboxes, not verified estimates. Re-estimate after IC1. Do not assume extra developers or overtime.

| Block | Hours | Deliverable | Binary exit check | Anchors |
| --- | --: | --- | --- | --- |
| D1 — Oct 26 | 5 | Baseline, rules, model access; real model → validation → preview; reference lesson review | **IC1:** real draft reaches preview; unsupported input rejected | [#117](https://github.com/abodacs/edu-canvas/issues/117), [#115](https://github.com/abodacs/edu-canvas/issues/115), [#105](https://github.com/abodacs/edu-canvas/issues/105) |
| D2–D3 — Oct 27–29 | 3 + 4 | Preview/publish gates; immutable approval and learner open | **IC2:** approved pack opens for the learner; unapproved pack blocked | [#28](https://github.com/abodacs/edu-canvas/issues/28), [#5](https://github.com/abodacs/edu-canvas/issues/5) |
| D4–D5 — Oct 30–31 | 4 + 4 | Learner path; teacher evidence, pause, and override | **IC3:** wrong answer → correct grade → feedback → teacher changes next activity | [#116](https://github.com/abodacs/edu-canvas/issues/116), [#6](https://github.com/abodacs/edu-canvas/issues/6), [#7](https://github.com/abodacs/edu-canvas/issues/7), [#8](https://github.com/abodacs/edu-canvas/issues/8), [#107](https://github.com/abodacs/edu-canvas/issues/107) |
| D6 — Nov 1 | 4 | Rehearse wrong/correct paths, new prompt, provider failure, refresh/double-submit, version change, access, keyboard, phone viewport | **IC4:** 3 consecutive full-loop runs; no manual database edits | [#9](https://github.com/abodacs/edu-canvas/issues/9)/[#10](https://github.com/abodacs/edu-canvas/issues/10), [#27](https://github.com/abodacs/edu-canvas/issues/27), [#74](https://github.com/abodacs/edu-canvas/issues/74) |
| D7–D8 — Nov 2–3 | 6 | Resolve demo access; available teacher/reviewer checks; record demo; prepare evidence | Recording and checklist pass | [#11](https://github.com/abodacs/edu-canvas/issues/11) |
| Reserve — through Nov 4 | 6 | Blockers only; no new capabilities | Final checks; submit only with authorization | — |

Issue numbers are ownership anchors, not a claim that full issue scope fits here or is completed. Integrate #19's necessary approved explanation into the bounded sequence; defer its separate presentation breadth rather than silently bypassing a dependency.

**Chain and float.** The critical chain is D1 → D2–D3 → D4–D5 → D6: 24 hours. Demo preparation adds 6 hours. The 6-hour reserve is the only float. Do not spend it before Nov 1. The plan is sequential and uncompressed; it fits inside the event window.

**God-activity split.** The 7-hour and 8-hour blocks are split into 3 + 4 and 4 + 4. Each half has its own exit check. Do not run two halves in parallel; there is one builder.

**Progress rule.** Report IC1–IC4 only. Do not report features. Each block must pass its exit check before the next starts. If a block overruns, apply the fallback ladder immediately; do not borrow from later blocks.

## Fallback ladder

Pick the highest rung that still passes its exit checks. The kill rung is always available. Never cut correctness, approval, private grading, recovery, or teacher control to simulate completion. Simplify presentation first.

| Rung | Hours | Scope | Trigger |
| --- | --: | --- | --- |
| Base | 30 + 6 reserve | Full focused loop | Default |
| Cut 1 | 24 + 4 reserve | Drop the teacher evidence view and override UI; teacher selects from the pre-approved follow-up list | Approval/publish or learner loop overruns by 2+ hours |
| Cut 2 | 18 + 3 reserve | Demo-only: generation → preview → approval on the real path; learner attempt and grade on a seeded pack, labeled | IC2 misses by end of Oct 29 |
| Kill | 8 | Record current generation → preview plus one boundary check; claim no loop | IC1 misses by end of Day 1 |

## Risk

| Risk | Signal | Response |
| --- | --- | --- |
| Model access or eligibility | IC1 cannot use a real allowed model | Cut 2 or Kill; do not fake live output |
| Approval/publish is larger than 7 hours | IC2 misses Oct 29 | Cut 1; keep pause/select from the approved list |
| Grading false success (#27) | A wrong answer gets a success reveal | Fix before IC3; test correct, incorrect, partial, and distractor-only cases |
| Teacher unavailable | No real teacher session | Mark usefulness unvalidated; do not substitute a claim |
| Existing-code rules unclear | Reuse is not confirmed | Verify before submission; keep the starting revision |

Indicative risk: base ~0.5; Cut 1 ~0.4; Cut 2 ~0.3; the current full-scope plan ~0.7+. The reserve is the decompression lever. Do not pad estimates.

## Success criteria

Must pass before submission:

- [ ] One real allowed-model request and two new in-scope prompt variations produce reviewable drafts; unsupported input is explicit and cannot publish.
- [ ] Three consecutive rehearsals complete generation → review → publication → learner attempt → teacher-selected follow-up, without manual database edits.
- [ ] A reviewed test set includes correct, incorrect, partial, and distractor-only selections. All grades and feedback match the expected result; no incorrect response receives a success reveal.
- [ ] Unapproved content cannot reach the learner. Editing approved content requires a new approval and version; prior attempts retain their original version.
- [ ] Server owns scoring. Tampered scores have no effect; private answer keys never appear in learner payloads.
- [ ] Duplicate submit/reload preserves one attempt result. A provider timeout gives an honest retry state without silently substituting a fixture.
- [ ] Teacher evidence shows the first independent response, hints/retries separately, and the reason for the proposed action. Pause/override changes the actual next activity.
- [ ] Teacher and learner actions work with keyboard alone and on a narrow phone viewport. The public demo has access/usage limits and a fresh-browser reset.
- [ ] Existing repository checks plus focused publication, grading, and recovery tests pass on the submitted revision.

Evidence if available, not blocking:

- [ ] One reachable target teacher prepares/reviews a lesson and chooses follow-up without builder intervention. Record time and corrections. If unavailable, mark usefulness unvalidated.
- [ ] At least two of three unfamiliar reviewers identify the target user, problem, and teacher-control moment after the demo.

Do not report preparation savings without a comparable baseline including review and correction time. Do not report learning improvement or diagnosed misconceptions from synthetic attempts.

## Event boundary

Submission: **4 November, 9 PM Eastern = 5 November, 4 AM Cairo**. Aim to have artifacts ready on 3 November; reserve 4 November for final verification.

Track and eligibility are working assumptions, not confirmed registration. Verify acceptance, team/track eligibility, existing-code rules, permitted model, and artifact requirements before committing. Provider access is not proved by the existing OpenAI-compatible implementation.

## Sources

- [Current README and implementation boundary](https://github.com/abodacs/edu-canvas/blob/main/README.md)
- [Full event plan](README.md)
- [Product priorities](../../product/delivery-priorities.md)
- [Demo script](demo-script.md)
- [Validation tracker](validation-tracker.md)
- [Expanded production epic #108](https://github.com/abodacs/edu-canvas/issues/108)
- [Provider contract](https://github.com/abodacs/edu-canvas/blob/main/src/server/generation/provider.ts)
- [Official Meta event page](https://dev.meta.ai/events/global-hackathon)
