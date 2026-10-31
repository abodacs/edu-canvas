# Edu-Canvas — Meta hackathon

Revised 2026-10-24; reconciled 2026-10-25 with the [technical design](../../design/design-doc.md) ([#89](https://github.com/abodacs/edu-canvas/issues/89)). This replaces the earlier model-first sprint order with the [first-principles roadmap](../../../ROADMAP.md). English-only equivalent fractions and the existing architecture remain the working constraints. Capacity: the preliminary estimate for the full scope is 36–57 human hours ([UQ3](../../design/design-doc-questions.md#answer-the-five-open-ui-design-topics)); the earlier 30-hour calendar below is provisional and awaits Abdullah's capacity decision (E3). No implementation or submission status is asserted here.

**Current event execution scope (2026-10-26):** the [focused event scope](focused-scope.md) narrows this plan to one teacher-controlled loop, one builder, and 30 + 6 hours. It explicitly defers Learning Commons grounding, Jev matching, uploads, section revision, and bilingual hardening. Where this README and the focused scope disagree, the focused scope governs event execution.

This is the full event plan and source of truth for eligibility, schedule, risks, and experiments. The [focused event scope](focused-scope.md) is the current execution decision. The [project roadmap](../../../ROADMAP.md) owns the production direction; this event is its first external validation milestone. Build for the product, not the showcase: capabilities built for the event must carry into production use (protected sessions, quotas, real recovery paths), and anything that only works as a stage prop is cut.

**Scope history.** The 2026-10-24 UI interview (Q29) targeted the full agreed [teacher UI feature set](../../product/teacher-ui.md), including Learning Commons grounding, evaluated Jev matching, upload/recovery, source panel, interactive fractions with correct LaTeX, and section revision. The 2026-10-26 [focused event scope](focused-scope.md) supersedes that decision for event execution. It builds one teacher-controlled loop and defers those five items. The full feature set remains the production direction. The UI [implementation gate](../../product/teacher-ui.md#implementation-gate) still applies before implementation and integration probes.

| Document | Owns |
| --- | --- |
| This README | Full event plan: scope, decisions, schedule, risks, and experiments |
| [Focused event scope](focused-scope.md) | Current execution decision: one loop, one builder, 30 + 6 hours, checkpoints, fallback ladder |
| [Validation tracker](validation-tracker.md) | Evidence gates, test status, observations, and resulting decisions |
| [Teacher UI decisions](../../product/teacher-ui.md) | Latest UI requirements, provider findings, approval gate, and open decisions |
| [Product priorities](../../product/delivery-priorities.md) | Proposed full-scope sequence, product/ticketing skill recommendations, and writing guidance |

The early integration proof, specialist-tool comparison, reviewer-comprehension test, and protected failure buffer fit inside the earlier 30-hour plan; against the 36–57-hour estimate (UQ3) they require the capacity decision (E3) first. All validation remains pending until evidence is recorded in the tracker.

## Demonstrate one useful teaching loop

```text
teacher objective → validated draft → teacher review and approval
→ worked example → guided practice → independent check
→ evidence-based provisional next step → teacher decision
```

The product hypothesis is reduced teacher preparation/review effort with clearer evidence for follow-up. The event demonstrates a functioning loop; it cannot prove learning gains.

## Event constraints

The official event page lists October 26–November 4, 2026, an application deadline of October 25 at 11:59 PM ET (or earlier if capacity fills), and submission by November 4 at 9 PM ET. It describes Indie and Startup tracks and the Build for Your World theme. These are the working dates, verified October 24; recheck changes and published rules before committing the submission. [Official event page](https://dev.meta.ai/events/global-hackathon).

Retain the Indie / Build for Your World direction. Verify model access and permitted use of existing code when the rules are available. Start with an accessible, allowed Meta model behind the existing generation boundary; use an allowed Meta open-weight option only if operationally feasible. Do not promise a particular model or credit allocation before access works.

## Before kickoff

- Complete the application before its deadline; this document does not submit it.
- Arrange three target-teacher conversations and collect one recent lesson task. The project owner handles outreach unless explicitly delegated.
- Draft the reference equivalent-fractions lesson using worked example, guided practice, independent check, and approved follow-up.
- Check current issue status before treating earlier docs as an implementation inventory. Preserve a starting revision and distinguish existing work from event-built work; confirm the applicable reuse rules.

## Ten-day execution budget (provisional)

These are human work/review hours, not estimates of autonomous agent throughput. Pre-kickoff application and scheduling are additional; if unavailable beforehand, use reserve and reduce polish. Teacher availability is an external dependency. **These dates and hours are provisional planning checkpoints, not commitments: the full-scope estimate is 36–57 hours (UQ3) and Abdullah's capacity decision (E3) is pending. Re-baseline this table after that decision.**

| Dates | Hours | Work | Reviewable exit condition |
| --- | --- | --- | --- |
| Oct 26 | 3 | Check rules and current delivery evidence; begin real provider-to-preview proof. Conduct one short teacher task walkthrough if available. | Required transitions inventoried; real contract attempted; reachable user and missing evidence recorded. |
| Oct 27 | 3 | Finish the narrow real-model/validator/preview proof. Teacher-review the reference lesson and begin a fair baseline comparison. | Actual model output reaches preview or incompatibility is identified; reference lesson and routing table reviewed. |
| Oct 28–29 | 6 | Build a thin complete path with safety, approval, teaching stages, grading, and minimal teacher follow-up. | By Oct 29, one end-to-end path demonstrated; absent boundaries trigger scope reduction. |
| Oct 30–31 | 6 | Harden incorrect/uncertain paths, teacher override, generation recovery, and version behavior. Review a held-out prompt and freeze feature additions. | Required proof exercised beyond the seed example; no false success or mastery claim. |
| Nov 1 | 3 | Protected failure buffer: resolve blockers and simplify. Add no new features. | Frozen loop stable enough to record; remaining limitations documented. |
| Nov 2 | 3 | Complete available teacher comparison; check independent access and guards; deploy if ready. | Observations or explicit evidence gaps; guarded demo or rules-permitted labeled recording. |
| Nov 3 | 3 | Test the rough demo with unfamiliar reviewers; correct the story and record final artifacts. | Viewers can explain the difference; repeatable sub-three-minute demo. |
| Nov 4 | 3 | Final access/artifact checks and submission before the deadline. | Verified deliverables and submission receipt, once actually submitted. |
| **Total** | **30 (earlier plan; full-scope estimate is 36–57 hours — UQ3)** |  |  |

These timeboxes are scope controls, not guarantees. If a stage overruns, apply the cut order below. Teacher research may overlap calendar days, but do not describe an untested demo as validated. If two of three teachers reject the underlying job or see no workflow advantage, revise the promise and stop adding features; an event artifact may still be submitted with honest limitations.

## Issue mapping and scope changes

Existing anchors: #28 safety → #5 approval → #6 grading → #7 feedback and next activity → minimal #8 teacher evidence. #9/#10 cover necessary usability; #104 covers generation quotas. The merged recording-script work (PR [#75](https://github.com/abodacs/edu-canvas/pull/75), not an open issue) is superseded for this sprint; use the evidence from V9–V11. #58 now has a lightweight pre-event portion and a fuller post-event value gate.

These references come from prior planning documents, not a fresh issue audit. Before coding, check existing acceptance criteria and implementation. Add the worked example, guided step, independent attempt, hint-use evidence, and teacher override to the relevant work items if missing; they are proposed scope, not assumed shipped capabilities.

Keep four variants where existing contracts require them. Implement the instructional sequence inside the bounded lesson experience; do not pull in #31’s general multi-page framework. Keep #19’s useful explanation as brief next-step text instead of a separate presentation artifact.

## Required proof

- An actual allowed-model call produces a reviewable draft.
- Safety and content gates block known bad cases before preview/publish.
- The teacher approves the full learner sequence and any follow-up branch.
- Grading is server-authoritative and answer keys stay out of client payloads.
- An incorrect attempt gets corrective feedback, never an unconditional success reveal. Recheck #27’s reported behavior regardless of its current tracker status.
- First independent answers and supported retries remain distinguishable.
- The next activity and reason are reproducible from a fixed attempt; the teacher can pause or override with another approved activity.
- The loop works by keyboard and on a narrow phone viewport; retry/reload and edits after approval preserve attempt/version correctness.
- A held-out in-scope prompt reaches the same review path; provider failure has explicit recovery.
- An unfamiliar reviewer can explain the distinctive teacher action; independent demo/video access is verified.
- Public hosting has access and usage limits. Seeded data, synthetic attempts, and recorded fallbacks are plainly identified.

## Cut order when time slips

These cuts apply to optional breadth and presentation. Escalate a conflict involving the agreed UI feature set to Abdullah; Q29 retains its full scope until he explicitly revises it.

1. Extra visual polish, graph displays, and variant-specific embellishments.
2. Rich reporting; retain the actual attempt, support used, proposed next action, and minimal override.
3. Additional concepts and lesson examples beyond the reviewed reference scope.
4. Public hosting if access/cost guards cannot be made ready; use a labeled recording if the event rules allow it.

Do not cut mathematical correctness, the worked example/practice/check sequence, approval, private grading, corrective feedback, or the minimal teacher decision. If these cannot fit, report the incomplete scope instead of claiming a complete teaching loop.

## After the event

Finish the five-teacher value gate, including matched comparison with reusable materials and an accessible specialist alternative, actual repeat use, classroom effort, cost per approved lesson, and the adoption/procurement path (V12). Only then plan an authorized learner pilot and production work. Arabic, broader standards, LMS integration, and general authoring wait for evidence from the narrow workflow.

## Risk review context

Reviewed 2026-10-24 against the roadmap, execution plan, education notes, and primary sources linked below. No teacher interviews, competitor hands-on trials, provider benchmarks, or learner studies were performed in this review.

The largest risk is building a correct, polished experience whose advantage nobody can explain. Further risks are measuring activity completion as learning and discovering integration problems too late. The scenarios below are proposed probes, not observed failures. Record outcomes in the [validation tracker](validation-tracker.md); use the validation tracker for the current evidence sequence.

## Separate the two outcomes

| Outcome | Necessary evidence | Common false substitute |
| --- | --- | --- |
| Competitive hackathon entry | Clear problem, distinctive visible capability, credible technical work, reliable demonstration, eligibility and complete submission | Feature count, architectural vocabulary, assumed judging weights |
| Effective product | A reachable user, a recurring task, acceptable total effort, useful instructional decisions, repeat use, evidence of learning and a viable adoption path | A prize, teacher compliments, synthetic student success, one polished lesson |

The event page names creativity, technical ambition, and whether it works for the Indie track. It does not publish numerical weights there. Application selection is a separate process that considers idea and technical skill. Full competition requirements, including treatment of existing code and submission artifacts, must still be confirmed from the published rules; the accessible waiver page did not expose substantive text in this review. [Official event page](https://dev.meta.ai/events/global-hackathon), [linked waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver).

## Risks and decision rules

### 1. The alternative is stronger than “a chatbot”

**Observed planning gap:** the roadmap compares against general AI and normal preparation but lacks a specialized-product comparison.

ASSISTments publicly offers curriculum-aligned practice, immediate feedback, and instructional reports. Eedi describes expert-authored diagnostic questions, misconception-focused infrastructure, and a constrained tutor. Those capabilities overlap with our proposed value; these are vendor descriptions, not independent performance findings. [ASSISTments](https://www.assistments.org/), [Eedi](https://www.eedi.com/).

**Unknown:** what useful task can a target teacher accomplish more easily here than with an existing tool or a reused worksheet?

**Cheapest probe:** pick the teacher’s actual alternative, plus one accessible specialist tool. Complete the same preparation-to-follow-up task with matched content. Count setup, correction, review, assignment, and results-reading time. If tool access fails, record the comparison as incomplete rather than a product win.

**Decision:** if our advantage is only nicer generated content, narrow or reconsider the product. A candidate advantage worth testing is changing a specific explanation while preserving the teacher’s objective, approved branches, and inspectable evidence. This is a hypothesis, not a uniqueness claim.

### 2. The event story lacks a memorable, visible difference

**Risk:** trust boundaries may be invisible in a short presentation. The reviewer-comprehension test is planned under V10; no results are recorded.

**Probe:** show a 60-second rough recording to three people unfamiliar with the project. Ask each to describe the user, problem, distinctive action, and what they actually saw work. Avoid teaching them the answer first.

**Decision:** if they describe “another AI worksheet generator,” revise the demonstration before adding features. A proposed demo moment: a plausible incorrect answer leads to specific feedback; a fresh check remains incorrect; the teacher sees exactly why the system suggests a follow-up and changes it. Show the evidence, not a diagnosis claim.

**AI contribution:** show the model turning teacher intent into a bounded, reviewable lesson. Deterministic validation, grading, and approved routing remain visibly separate. Explain what is generated and what is authored. Do not add unrelated model features merely to name more sponsor products.

### 3. A model-access check is not an integration proof

**Earlier planning gap, addressed by this schedule:** full model integration was scheduled for November 1. Successful authentication does not prove the model produces the actual lesson contract, supported components, usable feedback, or valid branches.

**Probe by October 27 (provisional checkpoint):** one real allowed-model request → actual validation → rendered preview using the existing boundary. Run a valid request, an unsupported objective, and a request that cannot meet the contract. Record latency, retries, rejection, and correction needs.

**Decision:** resolve contract incompatibility before polishing the learner path. Keep a reviewed fixture for deterministic development, clearly separated from live generation. A fallback model needs the same checks; open weights are not an automatic zero-effort backup.

### 4. The schedule assumes unverified implementation capacity

**Observed planning gap:** three teaching stages, attempt semantics, override, review, integration, and deployment fit into 30 hours only if enough foundation exists. Issue numbers are not a delivery inventory. Submission day was serving as both reserve and deadline work.

**Probe:** before implementation, mark each required demo transition as demonstrated, partial, absent, or unknown using current evidence. Assign an owner and an estimated human review cost. Do not equate a closed issue with proof of the revised behavior.

**Decision:** require a thin full loop by October 29; freeze feature additions October 31. These checkpoint dates are provisional pending the capacity decision (E3). Preserve November 1 for failures and simplification. If the minimum loop is still absent at the checkpoint, reduce presentation breadth and state the incomplete scope; do not compensate with new features.

### 5. Successful matching may measure a shortcut

**Hypothesis:** learners might match colors, card positions, repeated numbers, or memorized multiplication patterns without understanding equivalence. Conversely, reading or interaction difficulty might appear to be a math problem.

**Probe:** author a small teacher-reviewed assessment set: a supported example, a fresh independent item, a representation change, and an explanation prompt. Vary irrelevant cues. Keep first responses, hints, and retries separate. Verify the alternate representation was taught; otherwise failure may reflect representation unfamiliarity.

**Decision:** report item-level evidence and uncertainty. Do not infer mastery from a matching score. Add conceptual transfer and later retention to the pilot rather than a bigger mastery dashboard.

The IES fractions guide recommends developing fractions as numbers, using number lines, and explaining why procedures make sense. This motivates testing understanding beyond shaded-area matching; it does not establish our assessment’s validity or require building a new renderer during the sprint. Use a reviewed static item if necessary. [IES practice guide](https://ies.ed.gov/ncee/WWC/PracticeGuide/15/Published).

### 6. One wrong response does not identify its cause

**Hypothesis:** the same answer could reflect guessing, a slip, unfamiliar notation, a reading issue, or a misconception. A fixed prerequisite route can be reproducible and still instructionally wrong.

**Probe:** have a teacher review several distinct explanations for the same incorrect answer. Ask what extra evidence would change the next action. Include a correct answer with incorrect reasoning.

**Decision:** offer a brief approved follow-up check or teacher review when evidence is ambiguous. Keep causal language tentative. Route on explicit observed responses, not a hidden claim to know the learner’s mental state.

### 7. Teacher approval can become the largest cost

**Hypothesis:** four variants × several stages × remediation branches create more checking than the teacher’s old workflow. “Teacher in control” can conceal unpaid quality assurance.

**Probe:** time review of the entire generated pack, including incorrect-feedback branches. In an adult-only research fixture, include a clearly tracked, deliberately planted content error and test whether the review flow helps the teacher catch it. Never publish this fixture to learners.

**Decision:** one recommended sequence, reusable reviewed material, and concise change visibility may be more useful than more generation. Preserve current backend contracts during the event if required, but measure review burden before expanding them. If teachers routinely miss errors, approval alone is not an adequate quality mechanism.

### 8. One learner working does not establish classroom fit

**Hypothesis:** launching a lesson, switching shared devices, recovering interrupted attempts, or reading many student results may consume the time saved preparing it. English Grade 4 may also be unrelated to the teachers we can actually reach.

**Probe:** ask a reachable teacher to walk through where the lesson happens, on whose device, with what network and how much available time. Rehearse two anonymous sessions on a shared device, then interpret 20 synthetic learner summaries with missing and conflicting evidence. These are research probes, not a commitment to build a class dashboard.

**Decision:** choose one use context before a pilot. A teacher-supervised small group is a candidate, not an assumed market. If reachable users need another language/curriculum, record that mismatch; keep event English scope explicit and revisit the pilot segment rather than generalizing feedback across populations.

### 9. The comparison can manufacture a benefit

**Observed design risk:** a hand-authored, rehearsed Edu-Canvas lesson could be compared with a teacher building a new lesson from scratch. That favors our prototype and hides generation/review costs.

**Probe:** match the task, content availability, quality bar, and allowed preparation on both sides. Include reuse of the teacher’s best existing material. Alternate order, record assistance, and separate prototype findings from generated-product findings. Run a held-out prompt after the demo case.

**Decision:** prototype timing supports an interaction hypothesis only. Re-run the comparison with generated drafts before claiming preparation savings. “Would use” becomes stronger evidence only when a teacher returns for another task.

### 10. Neither the user acquisition path nor the payer is known

**Observed planning gap:** a production gate exists, but no named route to the first repeat users or buying decision is established.

**Probe:** ask participating teachers where their last adopted tool came from, who allowed it, who paid, what it displaced, and what would stop this one. Seek a specific next-use date, not a hypothetical willingness-to-pay score. Track inference, retries, support, and review cost per approved lesson.

**Decision:** distinguish teacher enthusiasm from institutional adoption. If value exists but another standalone application is the barrier, test a lightweight export or integration concept after the event before building a broad platform. No outreach or purchasing is authorized by this document.

## Experiments that expose surprises

These are proposed probes, not completed tests. Builder owns technical probes; a target teacher owns instructional review. Reserve real learner research for an appropriately authorized pilot. An adult pretending to be a child cannot validate learning.

| Probe | Deliberate perturbation | What surprise it can reveal | Response if it fails |
| --- | --- | --- | --- |
| Unrehearsed teacher task | Teacher supplies a new in-scope objective/example | Demo works only for its seed prompt | Narrow the advertised supported scope; add held-out evaluation cases |
| Error-path inspection | Review all feedback and follow-up branches | Main question is correct but remediation teaches an error | Block the pack; repair review and validation coverage |
| Wrong reasoning, right answer | Same score, different explanation | Score conflates understanding and guessing | Preserve explanation evidence; avoid automatic mastery claims |
| Unfamiliar layout | Reorder options, remove decorative matching cues | Learner success comes from interface hints | Fix the interaction; repeat the independent check |
| Expired/interrupted session | Reload after submission; double-submit | Duplicate attempts, lost work, false completion | Repair attempt recovery and idempotency within the core loop |
| Revision after approval | Edit teacher draft while learner holds an older lesson | Grading/feedback changes under an active attempt | Preserve approved version references and reject invalid transitions |
| Provider unavailable | Timeout, rejection, malformed output | Failure silently masquerades as a fresh generation | Clear recovery state; label any seeded fallback |
| Independent access | Fresh browser, another device, no developer account | Reviewer cannot enter or repeat the demo | Simplify entry and verify reset without weakening guards |
| Multiple anonymous learners | Alternate sessions on one shared device | Cross-session state or misleading attribution | Fix isolation before any pilot |
| Class-sized interpretation | 20 synthetic learners, mixed hint use and missing items | Teacher report creates more work or false grouping | Reduce to actionable evidence; defer automatic grouping |
| Blind review | Hide model/product labels on comparable lesson outputs | Preference is driven by branding or novelty | Revisit claimed differentiation |
| Return after several days | New task and delayed fresh learner check | Enthusiasm or immediate success does not persist | Revise workflow or instruction before expansion |
