# Observed behaviour — synthesis and research plan

> Snapshot: 2026-07-17. This note separates what the current evidence shows from what Edu-Canvas hopes users will do. It uses the issue tracker, QA evidence, the product decision log, and authored interface copy; it does not contain direct user research.

## Mode: synthesise, then plan

Partial research exists. The issue tracker gives us a QA reproduction and detailed product intent, but there are no interview transcripts, recordings, support tickets, analytics, diary entries, or moderated usability notes in the repository. Therefore:

- **Observed** means a concrete interaction or system result is recorded in evidence.
- **Inferred** means a user job is strongly suggested by a requirement or workflow, but has not been witnessed.
- **Assumed** means the product preference or outcome still needs user evidence.

## Evidence register

| Source                                                                                                                   | Evidence type                        | Confidence                            | What it supports                                                                                                     | What it cannot support                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Issue #27](https://github.com/abodacs/edu-canvas/issues/27)                                                             | Browser QA reproduction              | **Observed** for the system behaviour | A distractor-first path can produce a success reveal, including at a 320px viewport with reduced motion.             | It does not tell us how often real learners try this path or how they interpret it beyond the recorded risk. |
| [Issue #1](https://github.com/abodacs/edu-canvas/issues/1)                                                               | Acceptance criteria / product intent | **Inferred**                          | The intended journey is teacher prompt → four variants → approval → student matching → reveal → next activity.       | It is not evidence that teachers want this workflow or can complete it in three minutes.                     |
| [Issue #3](https://github.com/abodacs/edu-canvas/issues/3)                                                               | Planned failure and recovery states  | **Inferred**                          | Teacher retry, moderation, timeout, and actionable failure recovery matter to the proposed authoring flow.           | It does not show which failures teachers actually encounter or which recovery language works.                |
| [Issues #17](https://github.com/abodacs/edu-canvas/issues/17) and [#19](https://github.com/abodacs/edu-canvas/issues/19) | Product hypotheses                   | **Assumed**                           | A visible prerequisite path and forward story may help teachers trust the lesson and students understand the reveal. | It does not prove that either artifact improves approval, comprehension, or retention.                       |
| [PRD Q165](../PRD_GRILL_LOG.md#165)                                                                                      | Explicit research gap                | **Observed** as a planning state      | Human usability testing with synthetic data is still open and recommended before real-data launch.                   | It is a decision-log entry, not a completed study.                                                           |
| `src/components/landing/copy.ts`                                                                                         | Authored marketing copy              | **Assumed**                           | The team wants to communicate teacher control, a clear next step, and an “aha” moment.                               | The quoted teacher/student voices are not participant quotes and must not be presented as research evidence. |

## Concrete observations

1. In the landing preview, a tester can select only the card labeled `2/3`, click “Show the connection,” and receive a success-style message: “There it is: the names change, but the portion stays the same.” The three correct cards are highlighted while the selected distractor remains selected without an incorrect-state explanation. ([#27](https://github.com/abodacs/edu-canvas/issues/27))
2. The same QA failure was reproduced at a 320px viewport with reduced motion enabled. This establishes a responsive/accessibility risk, not a prevalence rate. ([#27](https://github.com/abodacs/edu-canvas/issues/27))
3. The intended authoring flow starts from a teacher’s prompt and asks the teacher to review four variants before a learner sees them. This is a designed workflow, not observed behaviour. ([#1](https://github.com/abodacs/edu-canvas/issues/1), [#3](https://github.com/abodacs/edu-canvas/issues/3))
4. The product contract repeatedly prefers one clear next activity and a concise reason over an unrestricted activity menu. This is a product choice that needs validation with teachers and learners. ([#1](https://github.com/abodacs/edu-canvas/issues/1), [PRD Q124](../PRD_GRILL_LOG.md#124))

## Patterns and candidate job stories

### Pattern: feedback can teach the wrong relationship

**Confidence: high for system risk; unknown for learner frequency.** A visible distractor can be selected first, and the current reveal confirms the wrong interpretation. Fix [#27](https://github.com/abodacs/edu-canvas/issues/27) before exposing the flow to children or describing it as learner-safe.

### Pattern: trust is being designed around review and recovery

**Confidence: inferred.** Issues #1, #3, #17, #18, and #19 repeatedly place validation, provenance, teacher review, path visibility, and retry states around generation. This is a coherent trust hypothesis, not yet a demonstrated teacher behaviour.

### Pattern: “one next step” is a repeated product preference

**Confidence: inferred.** The PRD and walking skeleton specify one recommended next activity and an explanation. We do not yet know whether teachers want to override it, whether students understand it, or when a menu would be preferable.

| Candidate job story                                                                                                                                                                                  | Confidence                                                   | Evidence boundary                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| When I have a grade, standard, and concept in mind, I want to start in my own words and review a small set of variants, so I can prepare a safe activity without building every detail from scratch. | **Inferred**                                                 | Supported by the intended flow in [#1](https://github.com/abodacs/edu-canvas/issues/1) and generation scope in [#3](https://github.com/abodacs/edu-canvas/issues/3); no teacher has said or demonstrated this yet. |
| When generation or validation fails, I want to understand what happened and retry without losing my request, so I can recover without abandoning the lesson.                                         | **Inferred**                                                 | Supported by the failure states in [#3](https://github.com/abodacs/edu-canvas/issues/3); no observed workaround or preferred wording exists.                                                                       |
| When I choose among fraction names, I want feedback that clearly distinguishes a distractor from a match, so I do not learn that an incorrect relationship is true.                                  | **Assumed need, directly motivated by observed system risk** | The risk is observed in [#27](https://github.com/abodacs/edu-canvas/issues/27); the learner’s actual interpretation is not.                                                                                        |
| When the system recommends what comes next, I want a concise reason and the ability to trust or override it, so the next activity feels earned rather than arbitrary.                                | **Assumed**                                                  | Supported by [#7](https://github.com/abodacs/edu-canvas/issues/7), [#8](https://github.com/abodacs/edu-canvas/issues/8), and PRD Q122/Q124; not user-tested.                                                       |

## Research gaps that matter now

1. What real event triggers a teacher to create or reuse an activity, and what do they do today instead?
2. Which parts of a generated pack make a teacher approve, edit, reject, or abandon it?
3. Do learners understand the matching task and the reveal, especially after selecting a distractor first?
4. Does Arabic RTL change comprehension, scanning, or confidence on a real device?
5. What evidence does a teacher need to accept, pause, or override the recommended next activity?
6. Do the “four variants,” prerequisite path, and forward story reduce preparation work, or do they add review burden?

## Smallest safe study

### Teacher JTBD interviews — six participants

Use recent real experiences, not hypotheticals:

- “Tell me about the last time you created a visual activity for a learner. What started it?”
- “Walk me through what you tried, what you reused, and where you spent time.”
- “What would make you approve or reject this generated variant?”
- “Tell me about the last time a tool failed or produced something unsafe. What did you do next?”
- “When a system recommends the next activity, what would you need to see before trusting it?”

Capture one observation per note: context, action, exact quote, workaround, and confidence. Show the composer prototype only after the past-event discussion.

### Student usability observation — six participants

Use synthetic content and required consent. Do not expose children to the known-broken preview; fix [#27](https://github.com/abodacs/edu-canvas/issues/27) or use a patched research prototype first.

Observe, without leading:

- first action on desktop and at 320px;
- what the learner does when the distractor is selected first;
- whether the learner can explain why `1/2`, `2/4`, `3/6`, and `4/8` belong together;
- whether the reveal and next action are understood in English and Arabic RTL where applicable;
- how the learner recovers after an incorrect choice.

### Teacher decision replay

Replay a small set of fixed attempts. Ask the teacher to predict, approve, pause, or override the next activity before revealing the system reason. Record prediction accuracy, confidence, and the language they use for the reason.

## Decision gates

- Do not expand into [#29–#31](https://github.com/abodacs/edu-canvas/issues) until the core loop is correct and at least directionally validated.
- Do not call the landing preview learner-safe until [#27](https://github.com/abodacs/edu-canvas/issues/27) is fixed and re-tested.
- Do not label an authored quote, acceptance criterion, or PRD decision as an observed user finding.
- Promote a job story from inferred to observed only when a note contains a specific situation, behaviour, and quotable evidence.

The immediate research bottleneck is not more feature ideation. It is seeing teachers prepare and review a real recent lesson, then watching learners interpret the corrected matching and reveal flow.
