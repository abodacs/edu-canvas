# Teacher-agent rehearsal for issue #118

Every participant, event, quote, and minute in this exercise is synthetic. This is a scripted study rehearsal, not teacher research.

## Task and product assumptions

Use an imagined English Grade 4 equivalent-fractions lesson. The objective is to explain and identify equivalent fractions with equal-sized wholes. The task includes a worked example, guided practice, and a fresh independent check.

Assume a research prototype offers draft, full review, correction, approval, immutable publication, private grading, response evidence, and teacher control. These are scenario assumptions. This run does not establish that the repository implements them. No agent operates the app or calls an external provider.

Compare the same lesson objective and quality bar with each persona's normal alternative. Include reusable materials. An LLM is a large language model used for drafting. Jev is an assumed objective-matching service in this exercise. Jev does not draft the lesson, grade answers, verify mathematics, or approve publication. Do not imply that real teachers already use it.

Preserve these documented matching rules in imagined Jev paths: native confidence above 0.90 can skip match confirmation for supported objectives. At 0.90 or below, request confirmation. Unsupported objectives stay unsupported at any confidence. A Jev outage allows manual confirmation only when source grounding exists. These are design rules, not verified provider behavior.

## Twelve separate roles

Read one profile in personas.json. Maintain that role across four sessions. Do not infer technology skill, trust, or outcome from a name or geography. Use the profile's stated constraints and trade-offs.

Ten roles fit the core subject and language. Two roles deliberately test unsupported language or subject requests. Keep those roles separate in the summary. Do not present this constructed mix as a representative sample.

## Four simulated sessions

1. Day 1: explain the recent baseline workflow. Try a first comparable lesson. Record setup and all review work.
2. Day 4: try a different equivalence example. Include an incorrect synthetic response and the teacher's next decision.
3. Day 8: decide whether to return without an interviewer's encouragement. Record a refusal, missing session, or product barrier as such.
4. Day 12: try another lesson if the teacher continues. Otherwise preserve the reason and unknowns.

No actual days elapse in this exercise. Week-two return means a completed imagined product session on day 8 or 12. It is not a prediction of real retention.

## Assigned probes

- T01: first-use setup followed by a familiar second task.
- T02: compare with strong reusable material. A neutral or worse result is allowed.
- T03: day-4 connection failure. Recovery and lesson readiness matter.
- T04: compare with an efficient existing LLM workflow, including correction work.
- T05: an unequal-whole diagram is present in the day-4 draft. Require correction before use.
- T06: a day-4 review control cannot be reached with the keyboard. Record blocked use if there is no usable recovery.
- T07: Jev native confidence is exactly 0.90 on day 4. Require confirmation.
- T08: Jev is unavailable on day 4 while authoritative source grounding remains available. Use manual match confirmation. Include shared-device transitions.
- T09: source prerequisites are missing on day 4, but the standard and required skills are available. Inspect the visible gap. Do not diagnose a pupil from one response.
- T10: a competing school duty occurs in week two. Positive preference does not establish return.
- T11: the offer is English-only. An Arabic-output request remains outside this rehearsal's supported task.
- T12: the request is Grade 5 fraction multiplication. An imagined confidence of 0.98 cannot make it in scope.

These probes are authored conditions, not defects found in the application.

## Output contract

Write one JSON file at runs/<ID>.json. Use the exact ID from the assigned profile. Do not edit another role's file.

The top-level fields are synthetic=true, persona_id, scope, assumptions, sessions, stated_preference, week_two_reason, and next_real_test. assumptions is an array of short strings. sessions contains exactly four entries, in order, for days 1, 4, 8, and 12.

Each session has these fields:

- day: 1, 4, 8, or 12.
- status: completed, blocked, declined, or missing.
- baseline_minutes: an object or null.
- edu_minutes: an object or null.
- researcher_help_minutes: a non-negative number or null. Include this time once in edu_minutes.setup.
- simulated_lesson_use: used, not_used, or unknown.
- errors_found: a non-negative integer or null.
- unresolved_errors: a non-negative integer or null.
- event: a short account of the assigned condition and action.
- decision: a short explanation tied to this persona's constraints.

Each minutes object has six non-negative numeric fields: setup, preparation, review, correction, sharing, and follow_up. All numbers are invented scenario inputs. Explain unusual costs in event or assumptions. Never describe them as measured time.

A completed session needs both minutes objects, numeric help, and numeric error counts. Include help in setup. A blocked session can record partial edu_minutes, but use a null baseline when the tasks are not comparable. A declined or missing session has null times, help, and errors. Never replace missing data with zero. An unresolved content error prevents simulated lesson use. Use used only for an imagined complete delivery, never for an actual classroom observation.

Do not force a favorable result. Do not invent a repair that removes the assigned obstacle. Keep untested procurement and learning outcomes unknown. A good synthetic result cannot satisfy issue #118, V12, Jev evaluation, or real-student authorization.

Use short, direct English. Do not browse, call providers, access student data, send outreach, or start another agent.

## Source boundaries

- [Issue #118](https://github.com/abodacs/edu-canvas/issues/118) owns the real five-teacher, two-week study.
- [Observed behaviour](../../observed-behaviour.md) separates observations from assumptions.
- [Teacher UI decisions](../../product/teacher-ui.md) owns the proposed Jev rules.
- [Validation tracker](../../hackathon/meta-global-2026/validation-tracker.md) keeps V12 pending without real evidence.
