# Teacher materials and interactive tutorials

Design interview decisions, 2026-10-24. This is a proposed UI direction, not an implementation inventory or authorization to build. Learning Commons is the selected first service. Standards-grounded original generation is the agreed first version; adapting publisher lessons is deferred.

This document owns the UI interview requirements and provider findings; [product priorities](delivery-priorities.md) owns proposed sequencing, skill recommendations, and ticket-writing guidance. The [sprint guide](../hackathon/meta-global-2026/README.md) owns event execution and the [validation tracker](../hackathon/meta-global-2026/validation-tracker.md) owns observed evidence. Latest explicit interview decisions govern where older planning defaults conflict. A final consolidated design review has not yet occurred.

## Implementation gate

**Before implementation, ask Abdullah for explicit approval and the verification skill names or paths. Proceed only after approval is received, the supplied skills have been read, and their required checks are included in the implementation plan.** The skills must cover content, pedagogy, rendering, and interaction behavior. Missing approval or skills keeps implementation on hold; documentation and design discussion may continue.

This gate covers implementation of this UI direction, including integrations, prototypes, dependencies, and application changes. Approval of interview recommendations is not implementation approval. Record the approved scope and skill references here when supplied, then run the required checks before reporting completion.

## Agreed direction

- Help teachers generate related teaching materials and interactive tutorials grounded in their teaching sources.
- Abdullah selected the full agreed first-version feature set for the hackathon (Q29), including Learning Commons, Jev, uploads, and recovery. This expands the earlier sprint scope; the preliminary estimate is 36–57 human hours ([UQ3](../design/design-doc-questions.md#answer-the-five-open-ui-design-topics)) versus the earlier 30-hour plan. Sequence the full scope rather than silently dropping features. See [product priorities](delivery-priorities.md).
- Initial framework: Common Core Grade 4 equivalent fractions (`4.NF.A.1`).
- Support connected services, uploads, and websites over time; start with Learning Commons.
- Generate original materials grounded in standards, learning components, and prerequisites for the first version. Defer adapting full publisher lessons until access is confirmed and the scope is approved.
- When Learning Commons grounding is unavailable, offer one retry. If the retry also fails, offer lesson upload as the fallback. This brings upload into the initial recovery path; website input remains deferred. Do not silently substitute model recall for source grounding.
- Partial grounding may proceed with visible gaps when the standard and required skills are available but prerequisites are missing. If the standard or required skills are unavailable, use the retry/upload recovery path.
- Show the matched standard, required skills, source links, and coverage gaps in a compact panel alongside the draft. High-confidence matches add no confirmation step.
- Initial lesson upload formats: selectable-text PDF, TXT, and Markdown (`.md`). Defer OCR for scanned PDFs; explain unreadable extraction and offer TXT/MD upload instead.
- Flag incomplete PDF extraction and identify affected content. Continuation behavior: resolved 2026-10-24 by design answer [UQ2](../design/design-doc-questions.md#answer-the-five-open-ui-design-topics) — generation stops; the teacher supplies corrected extraction or a replacement file.
- Accept a plain-language teaching objective. Evaluate TypeSafe Jev first against reviewed objective-to-standard examples before enabling automatic generation. Use native `confidence > 0.90` as the initial automatic-generation rule; at 0.90 or below, ask the teacher to confirm the match. Unsupported objectives always route to clarification, regardless of confidence. Validate this threshold on the matching task; native confidence is not measured accuracy. This rule skips objective-match confirmation only; teacher review/approval before publishing remains required.
- If Jev is unavailable, offer manual confirmation of the proposed standard when Learning Commons grounding is available. If grounding is unavailable, follow the one-retry then lesson-upload recovery path.
- Start with a small catalog of approved components and iterate quickly. Keep grading, answer keys, approval, and follow-up rules under application control.
- First package: a worked example, an interactive guided activity, and an independent check, all targeting equivalent fractions.
- Initial interactions: an adjustable fraction diagram, a guided question with hints, and an independent check. Each serves the learning objective.
- Render LaTeX correctly in teacher previews and learner output. Verify actual rendered math, not just the generated syntax.
- Update one selected section on teacher request, preserving other sections. Check dependencies across the package and flag related sections needing revision. Require teacher approval before publishing the changed version.
- Evaluate mathematical correctness, objective/source alignment, pedagogy, understandable instructions, rendering, and working interactions using the verification skills Abdullah will supply.
- Use teacher feedback and output quality to guide iteration; retain teacher approval before learner use.

## Open decisions

Synced 2026-10-25 with the [design decision record](../design/design-doc-questions.md) (UQ1–UQ5). Each topic keeps its remaining evidence task; a design answer is not observed evidence.

- **Jev acceptance bar (UQ1, answered):** 40 reviewed cases, split equally into development and held-out sets; zero wrong automatic matches and at least five correct automatic matches. Still needed: teacher labels and evaluation results (E6).
- **Incomplete PDF continuation (UQ2, answered):** stop generation, show affected content, require corrected extraction or a replacement file. Still needed: parser and browser checks (V16).
- **Scope versus budget (UQ3, answered with estimate):** full scope retained; preliminary estimate 36–57 human hours versus the earlier 30-hour plan. Still needed: fresh-base estimate (E2) and Abdullah's capacity decision (E3) before any delivery commitment.
- **Verification skills (UQ4, answered with rule):** require Abdullah's named skills for content, pedagogy, rendering, and interactions; AC01–AC24 provide the baseline checks. Still needed: actual skill paths and build approval (E1).
- **Missing technical details (UQ5, answered):** REST transport, immutable source snapshots, bounded uploads, fixed candidates, explicit deadlines, and versioned records. Still needed: integration and failure checks (V13–V16).

No design answer here is implementation approval; the [implementation gate](#implementation-gate) still applies.

## Decision trace

Question numbering follows the conversation. Only explicit answers and later accepted recommendations are treated as decisions; skipped questions remain open unless a subsequent answer settles them.

| Interview answers | Captured decision |
| --- | --- |
| Q1-Q4, Q6, Q8 | Teacher authoring and interactive tutorials; small first catalog; lesson package; teacher feedback and evaluated quality |
| Q5, Q9, subsequent service choice | Teaching-source grounding; Learning Commons first; other input routes sequenced explicitly |
| Q7, Q11 | Selected-section revision, dependency checks, and teacher reapproval |
| Q10, Q17 | Fraction diagram, guided hints, independent check; Common Core Grade 4 |
| Q12 and explicit hard-rule request | Approval plus supplied verification skills required before implementation |
| Q16 acceptance | Original standards-grounded generation first; publisher adaptation deferred |
| Q18, Q21, Q25 | One grounding retry then upload; partial-coverage rule; Jev-outage confirmation |
| Q19-Q20, Q23-Q24 | Plain-language intent; Jev evaluation; native-confidence threshold and unsupported-input handling |
| Q22, Q26 | PDF/TXT/MD; selectable-text PDFs initially; OCR deferred |
| Q27 | Compact grounding/source panel |
| Reply “Q26 flag” after Q28 | Incomplete extraction flagged; continuation resolved 2026-10-24 by design answer UQ2 (stop and require corrected text) |
| Q29 | Full agreed first-version features targeted for the hackathon; no silent feature cuts |

The conversation skipped Q13-Q15 after Learning Commons was identified; subsequent decisions settle service choice and sprint inclusion. Skill discovery and the Refactoring English PDF review are captured in [product priorities](delivery-priorities.md#skill-selection) and its [writing guidance](delivery-priorities.md#writing-guidance-from-refactoring-english).

## System One matching direction

Abdullah accepted evaluating TypeSafe Jev first for Q23 and native `confidence > 0.90` for Q24. Official TypeSafe documentation reviewed 2026-10-24; no credentials, API calls, installation, or task evaluation performed.

- [Jev](https://docs.typesafe.ai/introduction) evaluates state against typed questions and returns decisions and distributions. A generative model still creates the lesson.
- Proposed architecture: retrieve bounded candidate standards and their authoritative descriptions; pass them with teacher intent to a [Choice](https://docs.typesafe.ai/primitives/choice) decision. Include an unsupported/unclear route and test whether it correctly rejects out-of-scope requests. High confidence alone cannot make an unsupported objective in-scope.
- [Native confidence](https://docs.typesafe.ai/confidence) summarizes the probability distribution; it differs from the selected option's probability. Neither establishes measured accuracy for this education task without evaluation. Native confidence is the selected threshold field.
- Jev access requires a [TypeSafe API key](https://docs.typesafe.ai/introduction/quickstart). Pin and record the model version used for evaluation. Provider access, latency, cost, and failure behavior remain untested.
- This decision layer handles objective matching, not mathematical verification, rendering checks, grading, or publication approval. The user-supplied verification skills and implementation gate still apply.

## Learning Commons feasibility

Official documentation reviewed 2026-10-24; no authenticated request, exact-standard coverage check, or application integration was performed.

- Third-party access is supported through [REST](https://docs.learningcommons.org/api-reference/overview) and [MCP](https://docs.learningcommons.org/knowledge-graph/using-knowledge-graph/mcp-server). Both document Platform API-key authentication. The published MCP tools resolve standards, retrieve learning components, and trace progressions.
- The [dataset catalog](https://github.com/learning-commons-org/knowledge-graph#datasets) lists standards, math learning components, and the Math Coherence Map as open. [Math component coverage](https://docs.learningcommons.org/knowledge-graph/datasets/learning-components/math-learning-components) varies by framework and standard; verify the exact Grade 4 target before promising coverage.
- [IM v.360](https://docs.learningcommons.org/knowledge-graph/datasets/curriculum/im-v360) has open scope and sequence, but gated instructional and assessment materials. The [OpenSciEd dataset](https://docs.learningcommons.org/knowledge-graph/datasets/curriculum/openscied) is gated and lists no REST API endpoint. Claude's access does not establish Edu-Canvas access.
- [Gated access](https://docs.learningcommons.org/platform/using-the-platform/dataset-catalog#requesting-access-to-gated-data) involves publisher review and potentially a separate agreement, fees, and organization/domain verification. Timing and approval are unconfirmed.
- Agreed first direction: retrieve the selected standard, its learning components, and prerequisites to ground original material, and show the grounding in the teacher preview. Reusing the existing generation boundary remains the proposed technical approach pending inventory/design. This agreement is not implementation approval.
- Learning Commons supplies educational context. Edu-Canvas still needs its bounded interactive renderer, rendered LaTeX checks, grading boundary, section updates, and verification. No library choice or existing-code compatibility has been established in this interview.

## Reference material

- Raw UI research notes (intelligent-UI analysis and CopilotKit candidates): saved architectural inspiration and investigation candidates, not a verified implementation specification; retained in the local notes workspace (`.worktrees/hackthon-docs/`), not tracked here.
- [Product roadmap](../../ROADMAP.md) and [hackathon scope](../hackathon/meta-global-2026/README.md): existing scope and trust boundaries.
