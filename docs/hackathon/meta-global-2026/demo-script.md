# Meta hackathon demo script

Updated 2026-10-24. Current recording plan for the [execution plan](README.md). This script replaces the older Devpost/OpenAI-specific recording assumptions for this sprint; it does not change historical docs or claim the revised loop is shipped. Target runtime: 2:50. Confirm the event’s actual artifact requirements before recording.

## The story

A teacher needs to explain equivalent fractions and decide what to do when a learner still struggles. Show a reviewable explanation, supported practice, a fresh check, and the evidence behind a teacher-controlled follow-up. The product advantage remains a hypothesis until the workflow comparison is recorded in the [validation tracker](validation-tracker.md).

The latest [UI scope](../../product/teacher-ui.md) adds Learning Commons grounding, Jev matching, source visibility, section revision, and upload/recovery. Show the source-grounded draft and a focused teacher revision in the main story. Validate alternate and failure paths separately under V13-V16; a short recording does not waive full-feature acceptance. The timing below is a proposed recording budget, not evidence that the expanded flow already fits.

## Shot list

| Time | Screen/action | Narration intent |
| --- | --- | --- |
| 0:00–0:20 | Show the teacher’s objective and the supported Grade 4 scope. | Describe one concrete preparation/follow-up problem. Label an illustrative scenario; use an authentic observation only when recorded. |
| 0:20–0:55 | Submit teacher intent; show the matched standard/source panel and actual allowed-model draft. Revise one selected section, show preserved sections and dependency checks, then approve the full sequence. | Show source grounding and the distinctive teacher correction. Explain what was generated and reviewed, including feedback and follow-up branches. |
| 0:55–1:35 | Synthetic learner sees worked example, uses guided practice, answers incorrectly, receives feedback, and attempts a fresh independent item. | Explain the mathematics briefly. Identify synthetic attempts. Separate first response from hint use and retries. |
| 1:35–2:05 | Teacher sees the response evidence and tentative recommendation, then pauses or selects another approved action. | “This response suggests a follow-up check; it does not prove a diagnosis.” Use the actual observed state, not a scripted mastery claim. |
| 2:05–2:30 | Show one concise boundary proof tied to the submitted revision: bad output blocked, private grading, or immutable approved version. | Explain the division of responsibility: model drafts, bounded renderer displays, server grades, teacher governs approved choices. |
| 2:30–2:50 | Show supported scope, measured evidence if any, and next test. | State what worked and what remains unvalidated. Name the next real teacher or learner test without implying it already happened. |

Only narrate behavior the artifact actually demonstrates. If the full loop is incomplete, shorten the recording to the working slice and label the missing stages; do not splice planned UI into apparent live behavior.

## Proof and recording checks

- Record the actual model/configuration and revision privately; show no credentials or private answer keys.
- Label recorded footage, seeded lesson content, synthetic attempts, and any simulated states accurately. Do not describe a fixture as fresh model output.
- Preserve natural generation latency or clearly label a shortened wait. Do not hide failed core actions with edits.
- Rehearse an incorrect path and a new in-scope prompt, not only the seed example.
- Verify Jev threshold/unsupported/outage cases, Learning Commons retry/upload recovery, and selectable-text PDF/TXT/MD handling against V13-V16. Demonstrate adjustable fractions and legible rendered LaTeX; retain evidence beyond the main recording where event artifact rules permit.
- Have three unfamiliar reviewers explain what they saw before the final take; capture their descriptions under V10.
- Use captions and legible zoom. Demonstrate the teacher outcome before code details.
- Verify video and demo access from another browser/device, plus reset and recovery. Confirm required visibility and submission fields from event rules.
- Keep the video, repository instructions, submission description, and shipped behavior consistent. Record the submission receipt under V11 once submitted.

## Claims requiring evidence

“Faster preparation” needs comparable task observations including review and correction. “Better learning” needs learner evidence beyond scripted success. “Diagnoses misconceptions” needs stronger support than one wrong answer. “Unique” needs a defensible comparison with relevant alternatives. Use concrete demonstrations and bounded language until those claims are supported.

English is the event scope. Do not add an Arabic capability shot or an old sponsor/model claim simply because it appears in a previous script.
