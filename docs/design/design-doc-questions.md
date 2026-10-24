# One Useful Loop: answers and decisions

All 20 original design questions have answers below. This record also answers the five open UI design topics. Read the [design overview](design-doc.md) first; use this record to understand a decision.

Revised 2026-10-24 at Abdullah's request to answer the questions and prepare implementation. Earlier interview decisions retain their authority. New technical choices are design defaults selected for this request, not claimed earlier interview answers.

**Status:** design answers recorded. Provider access, verification results, build approval, and capacity confirmation remain evidence or owner tasks. An unanswered external test is not a design decision.

## Resolve the six earlier conflicts

| Conflict | Decision | Basis |
| --- | --- | --- |
| C1: teaching sequence | Worked example, guided practice, then independent check. Matching remains a practice interaction. | October roadmap and UI interview |
| C2: generation model | Use a proven event-allowed Meta model through the provider interface. Keep fixtures explicitly labeled. | October event direction; exact access remains E4/E5 |
| C3: language | English for this release. Arabic remains a later product goal. | October sprint scope |
| C4: learner context | Teacher-supervised use first. Home-independent use remains deferred. | October candidate use context |
| C5: educational context | Include Learning Commons, evaluated Jev matching, uploads, and recovery. Defer a general knowledge map. | Explicit UI interview supersedes the old exclusion |
| C6: service targets | Keep demo targets separate from production reference values. | Original question-pack intent |

## Answer Q1–Q5: product conflicts

### Q1. Which teaching sequence applies?

Use the October sequence. Keep the connection reveal as feedback after submission. Separate the first independent response from assisted practice and retries.

### Q2. Should the document name a specific model?

Name the provider interface now. Record the exact Meta model only after eligibility and access checks pass. Store that identifier with each generation attempt. No model access has been proven by this documentation work.

### Q3. How should the document describe Arabic?

State that Arabic is a deferred product commitment. Keep this release English-only. Preserve existing language fields for compatibility.

### Q4. How should the document describe home use?

State that home use is deferred. Teacher-supervised use is the release context, not a validated market claim.

### Q5. Should the knowledge layer appear only as an alternative?

No. The later UI interview includes runtime Learning Commons context in this release. Include the source, match, upload, and recovery contracts. Defer the general-purpose knowledge map and publisher-lesson adaptation.

## Answer Q6–Q11: document and user outcomes

### Q6. Which title should we use?

Use **One Useful Loop**. The first sentence explains the concrete teacher outcome.

### Q7. Who owns and approves the document?

Abdullah owns the design and the existing implementation gate. No additional approver is recorded. Do not describe this revision as owner-approved implementation.

### Q8. What is the objective?

Help a teacher prepare, approve, and teach a lesson on equivalent fractions, then choose the next activity from learner evidence.

The demonstration target is under three minutes by November 4. Keep the outcome sentence separate from the event target.

### Q9. How much background should remain?

Keep a short explanation of the existing foundation, the expanded scope, and the conflict this design resolves. Put file-level evidence in the companion inventory. Remove the long historical introduction.

### Q10. Which goals and non-goals apply?

Keep the teacher approval, learner practice, independent check, and evidence goals. Add every agreed UI feature to the release scope. Uploads, Learning Commons, Jev, fraction controls, math rendering, and section revision are required.

Defer website import, scanned-document recognition, publisher adaptation, Arabic, home use, LMS integration, and production administration. Do not claim mastery or learning improvement.

### Q11. Should failure recovery have its own scenario?

Yes. Cover source failure, Jev failure, incomplete extraction, invalid generation, timeout, and interrupted preview. Distinguish a source retry from a model correction and a teacher generation retry.

## Answer Q12–Q18: engineering decisions

### Q12. Which host should the design select?

Select one continuously running Fly.io instance and Supabase Postgres. Keep SSE support. Multiple instances require shared request limits first.

The release runbook was reconciled to this decision on 2026-10-25: it now directs one instance with database-backed quotas and process-local burst limits ([#89](https://github.com/abodacs/edu-canvas/issues/89)). If Fly.io cannot meet the requirements, evaluate another persistent host against the same checks. Hosting availability remains untested.

### Q13. Should the 30-second p95 target remain?

Yes, as a provisional demo target after source confirmation. Measure grounding separately. Use at least 20 sequential live requests. Record the nineteenth sorted duration, sample size, failures, and environment.

A target is not a measured result. Keep production service targets separate.

### Q14. Are more interfaces necessary?

Yes. Add source snapshots, objective-match decisions, uploads, lesson versions, section revision, publication, learner runs, attempts, and teacher decisions.

The existing provider and public schemas do not contain the complete feature. The [implementation contracts](design-doc-implementation.md) define the new records, commands, errors, and transitions.

### Q15. What happens if the Meta proof fails by October 27?

Extend the access investigation by one day within the agreed capacity. If live access still fails, use a clearly labeled recording or fixture for explanation.

A recording must show an actual recorded run. A fixture cannot establish live generation, model eligibility, or a passed V3 check. Keep the live-generation requirement incomplete and record the limitation in submission claims.

### Q16. Is seeded authentication acceptable?

A seeded identity is acceptable for isolated synthetic development. A public demo requires protected role-specific sessions and server authorization. A browser-supplied role is insufficient.

Production authentication remains deferred. Public hosting waits for access and usage checks.

### Q17. What logging should be added?

Add source, catalog, grading-rule, and next-step-rule versions. Record durations, result states, safe diagnostics, and request identifiers. Store raw lesson and attempt evidence in authorized database records.

Keep credentials, private answer keys, raw uploads, prompts, and learner responses out of operational logs. Avoid claiming that logs reconstruct every possible failure.

### Q18. How should open issues be organized?

Replace ambiguous open questions with E1–E8 in the [design overview](design-doc.md#complete-the-remaining-evidence-and-authorization-tasks). Separate authorization, inventory, capacity, external access, eligibility, verification, recruitment, and regression evidence.

Select synchronous generation for this release. Defer background-job generation. Preserve unrelated work; do not require destructive branch resets or worktree pruning.

## Answer Q19–Q20: size and review

### Q19. Keep the 2,500-word limit?

Yes, for the main design overview. Put implementation contracts, acceptance checks, and decision history in linked companion files. Each file starts with its purpose and current status.

### Q20. What is the review loop?

The design now includes concrete answers and implementation contracts. Record later corrections against stable question and acceptance IDs. Apply accepted corrections to the authoritative contracts.

Keep observed test results in the validation tracker. Record build approval and supplied verification skills through the existing UI gate. Documentation completion does not invent that approval.

## Answer the five open UI design topics

These answers supersede the earlier unresolved technical defaults. They do not rewrite the original interview record.

| ID | Open topic | Design answer | Evidence still needed |
| --- | --- | --- | --- |
| UQ1 | Jev examples and acceptance bar | Use 40 reviewed cases, split equally into development and held-out sets. Require zero wrong automatic matches and at least five correct automatic matches. | Teacher labels and evaluation results |
| UQ2 | Incomplete PDF continuation | Stop generation. Show affected content. Require corrected extraction or a replacement file. | Parser and browser checks |
| UQ3 | Full scope within 30 hours | Retain full scope. Preliminary estimate: 36–57 hours. Request capacity or explicit scope reconciliation before a delivery commitment. | Fresh-base estimate and Abdullah's capacity decision |
| UQ4 | Verification skills | Require Abdullah's named skills for content, pedagogy, rendering, and interactions. AC01–AC24 provide the baseline checks. | Actual skill paths and build approval |
| UQ5 | Missing technical details | Use REST, immutable source snapshots, bounded uploads, fixed candidates, explicit deadlines, and versioned records. | Integration and failure checks |

## Retain the source trail

- [UI interview decisions](../product/teacher-ui.md) govern explicit feature choices and implementation approval.
- [Product priorities](../product/delivery-priorities.md) supply the full-scope delivery sequence.
- [Roadmap](../../ROADMAP.md) supplies the teaching outcome and validation direction.
- [Sprint guide](../hackathon/meta-global-2026/README.md) supplies the earlier schedule and event assumptions.
- [PRD decision log](../../PRD_GRILL_LOG.md) supplies earlier decisions where no later choice conflicts.
- [Factory findings](../engineering/software-factory.md#blind-spot-review-2026-10-24) provide dated repository observations, not current test results.
- [Refactoring English skill](../research/README.md#local-reference-materials) supplies the reader-first structure and design-document guidance.
