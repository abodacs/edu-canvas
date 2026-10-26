# Validation tracker

Updated 2026-10-24; reframed 2026-10-25. Working evidence record for the [roadmap](../../../ROADMAP.md), [sprint](README.md), and [risk review](README.md#risks-and-decision-rules). All checks start pending: writing this tracker does not establish that a test ran or an implementation exists. Event evidence here feeds the production lifecycle gates; V12 is the production value gate — repeat teacher use, effort saved, and adoption path — and outranks every event award.

**Focused event scope (2026-10-26).** The [focused scope](focused-scope.md) defers V13–V16 to post-event. Event must-pass gates are V1–V3, V6, V8–V11. V4, V5, and V7 are evidence-if-available. The focused scope’s IC1–IC4 map to V3, V6, V8, and V9–V11.

## Evidence gates

| ID | Question / required artifact | Owner | Checkpoint | Status / evidence | Decision if unmet |
| --- | --- | --- | --- | --- | --- |
| V1 | Application/acceptance status, published rules, existing-code allowance, required artifacts, starting revision | Project owner | Before application deadline; recheck at kickoff | Pending; no receipt or rule record attached | Resolve eligibility before treating the project as an eligible entry |
| V2 | Revised demo transitions classified demonstrated / partial / absent / unknown, with evidence | Builder | Oct 26 | Pending | Estimate missing work; reduce breadth before promising the full loop |
| V3 | Real allowed-model response → actual validation → rendered preview; record failures and latency | Builder | Oct 27 | Pending | Fix contract incompatibility; do not count authentication as success |
| V4 | Reachable target segment, recent teacher task, current alternative, classroom context | Owner + teacher | First teacher session | Pending; participants unconfirmed | Keep product claims unvalidated; do not generalize another segment’s feedback |
| V5 | Reviewed example, guided step, independent check, feedback branches, routing table | Teacher + builder | Before learner-path approval | Pending | Correct content before publishing; preserve uncertainty in routing |
| V6 | Thin complete approved lesson → attempt → feedback → teacher decision | Builder | Oct 29 | Pending | Reduce presentation breadth; disclose missing boundaries |
| V7 | Comparable preparation/review/follow-up task against actual alternative and accessible specialist tool | Owner + teachers | Initial session; complete available comparisons by Nov 2 | Pending | Revise advantage claim; prototype timing does not prove generated-product savings |
| V8 | Held-out prompt, incorrect feedback, ambiguous answer, timeout, version/retry boundaries, keyboard/mobile checks | Builder + teacher | Oct 31 feature freeze | Pending | Fix core failures; no new feature work in Nov 1 buffer |
| V9 | Independent browser/device access, access and usage guards, reset/recovery | Builder | Nov 2 | Pending | Fix entry; use labeled recording only if rules permit |
| V10 | Three unfamiliar viewers explain user, problem, distinctive action, and observed proof | Owner + reviewers | Nov 3, before final recording | Pending | Revise story and recording; avoid adding features to solve a clarity problem |
| V11 | Final artifact, video, description, and claimed behavior agree; links open independently | Builder + owner | Before submission | Pending | Correct artifacts before submitting; record receipt only after submission |
| V12 | Repeat teacher use, conceptual transfer/retention, classroom effort, adoption path, cost per approved lesson | Owner + authorized pilot participants | After event, before expansion | Pending | Revise workflow/instruction or adoption model before broader investment |
| V13 | Exact Learning Commons standard/skills lookup, prerequisite-gap behavior, source panel/provenance, one offered retry then upload | Builder | Early approved integration proof; before generation-path acceptance | Pending; docs checked, no authenticated retrieval performed in this interview | Record access/coverage gaps; use the agreed recovery flow; do not silently replace grounding with model recall |
| V14 | Jev evaluated on reviewed intent matches; native confidence above/at/below 0.90; unsupported inputs; outage → manual confirmation when grounding exists | Builder + reviewer | Before enabling automatic generation | Pending; model not called; acceptance bar answered (UQ1, 2026-10-24): 40 reviewed cases, zero wrong and at least five correct automatic matches; labels and results still open (E6) | Keep automatic path disabled until evaluation supports it; confirm ambiguous matches |
| V15 | Selected-section revision preserves other sections, checks dependencies, flags conflicts, and requires reapproval; actual LaTeX rendering and fraction interactions checked | Builder + teacher | Before accepting the revised teacher/learner path | Pending | Fix failed behavior before claiming the feature complete |
| V16 | Selectable-text PDF/TXT/MD upload, unreadable extraction fallback, partial-extraction flags, and recovery evidence | Builder | Before accepting upload recovery | Pending; continuation policy answered (UQ2, 2026-10-24): generation stops until corrected extraction or a replacement file | Implement the stop-and-replace rule; flag missing content rather than silently treating extraction as complete |

Owners are roles, not confirmed participants. The sprint’s timeboxes cover these activities; this tracker does not add hours or require every exploratory probe before the event.

V13-V16 capture the expanded [UI scope](../../product/teacher-ui.md). These are planned checks, not additional time estimates; the 36–57-hour estimate (UQ3) exceeds the earlier 30-hour plan and the capacity decision (E3) is pending. Implementation approval and the user-supplied verification skills remain prerequisites. Passing these checks does not establish learning gains.

## Fair workflow comparison record

Use one row per observed task. Record unavailable tools as unavailable, not inferior. Compare the same objective, content availability, and quality bar; include reuse of existing materials and vary the order. Separate hand-authored prototype observations from generated-product observations.

| Participant code / segment | Task + existing material | Method + order | Setup / preparation / review / correction / sharing / result-reading time | Errors found / unresolved | Researcher help | Preferred method + reason | Actual next-use date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Not measured | Not assessed | Not recorded | Not observed | Unconfirmed |

Report sample size and individual observations. Do not infer learning gains from teacher timing or publish an overall improvement percentage from a few prototype sessions.

## Record observations and surprises

For each completed probe, add:

- Gate ID, date, participant code or artifact revision, and who observed it.
- Task/setup, expected behavior, actual observation, and evidence link.
- Assistance, errors, missing data, and alternative explanations.
- Decision: continue, revise, stop, or insufficient evidence; owner and next check date.

Capture surprising behavior before explaining it. In particular, look for missed errors during approval, correct answers with wrong reasoning, reports that take too long to interpret, and session failures. Keep synthetic attempts clearly distinct from participant observations and avoid storing identifying student information here.
