# Edu-Canvas roadmap: prove one useful teaching loop

Revised 2026-10-24 from the [education notes](docs/research/education/), the existing product strategy, and the previous hackathon plan. This is the proposed product direction and delivery order for this notes workspace; it does not claim implementation is complete or change GitHub issue status. The [hackathon plan](docs/hackathon/meta-global-2026/README.md) translates it into the available sprint.

**Latest scope update:** Abdullah selected the full first-version [teacher UI feature set](docs/product/teacher-ui.md) for the hackathon: Learning Commons grounding, evaluated Jev matching, PDF/TXT/MD recovery, source visibility, interactive fractions, rendered LaTeX, and section revision. Those explicit decisions supersede earlier exclusions of connected-source access. The [priority order](docs/product/delivery-priorities.md) is proposed; fit within 30 human hours is unproven. Ask for implementation approval and the verification skills before building. Do not silently cut agreed features to preserve an older schedule.

See the [blind-spot review and experiments](docs/hackathon/meta-global-2026/README.md#risks-and-decision-rules) for competitive overlap, assessment validity, classroom friction, and failure probes. Those findings add an early real-model integration proof and fairer workflow comparisons. Track observations and decisions in the [validation tracker](docs/hackathon/meta-global-2026/validation-tracker.md); all gates remain pending until evidence is attached.

## Start with the outcome

Help a teacher prepare, review, and use a short lesson that explains one concept, gives students supported practice, and shows the teacher what needs attention next.

Initial scope: English, Grade 4 equivalent fractions, one teacher, one small lesson, synthetic learner attempts. Retain the existing `4.NF.A.1` focus rather than introducing a new subject. Grade 12 pain points in the notes do not establish demand among Grade 4 teachers; recruit within the chosen segment.

The working job story is: “When my students struggle with equivalent fractions, help me prepare a short explanation and practice sequence, then show me which responses need follow-up, without creating more checking work.” This is a hypothesis to test.

## First principles → product decisions

| Starting point | Consequence | What we build or measure |
| --- | --- | --- |
| The desired outcome is understanding that can be used independently. | Completing an interaction is insufficient evidence. | A fresh independent question after supported practice; delayed checking in a later pilot. |
| Novices need a usable starting point. | Do not require discovery before showing a method. | A clear worked example, guided practice, then an independent check. |
| A wrong answer is evidence of a response, not a certain diagnosis. | Keep recommendations modest and inspectable. | Show the actual attempt, support used, and a provisional next step that the teacher can override. |
| Teacher attention is limited. | Generation speed matters only if total preparation and review become easier. | Measure time through correction and approval, plus time interpreting results. |
| Teachers remain responsible for instruction. | Approval must cover what learners will actually receive. | Preview the entire sequence and remediation branch; publish an immutable approved version. |
| Generated content can be incorrect. | Plausibility and structural validity are insufficient. | Reviewed mathematical examples, bounded checks, private grading, and visible uncertainty. |
| Other tools can draft materials. | “AI lesson generation” alone is an insufficient reason to adopt. | Compare the complete workflow with the teacher’s current method, reusable materials, and an accessible specialist tool; include general AI where it is a real alternative. |

The instructional sequence is supported by Rosenshine’s discussion of modeling, guided practice, checking understanding, and independent practice. It supports a design choice, not a claim that this product improves learning. [Source: Principles of Instruction](https://www.aft.org/sites/default/files/periodicals/Rosenshine.pdf).

## What the education notes establish—and what they do not

| Material | Useful implication | Evidence limit |
| --- | --- | --- |
| [ChatGPT for Teachers](docs/research/education/chatgpt.txt) | Planning, adapting materials, context, and teacher control are already described in a broad teacher workspace. | Saved vendor material, not a current feature audit or proof of our users’ needs. |
| [Claude for Teachers](docs/research/education/claude.txt) | Curriculum grounding, differentiation, and instructional follow-up belong in the comparison. | Vendor claims do not establish Edu-Canvas demand or learning effects. |
| [Teacher research](docs/research/education/teacher-research.txt) | Workload and mixed readiness are candidate problems worth investigating. | A compiled AI-style synthesis, not recorded interviews; its impact ratings are unvalidated. |
| [Direct instruction](docs/research/education/direct-instruction.txt) | Put explanation and a worked example before unsupported exploration for beginners. | An unattributed argument, not sufficient evidence for a universal teaching rule. |

Do not turn claims about engagement, burnout, behavior, or mental health into product promises. Do not treat free pricing, model availability, or vendor features in saved notes as permanently current. The comparison below tests the tools participants can actually access.

## The smallest complete lesson

One lesson targets one observable objective: explain and identify equivalent fractions using equal-sized wholes, and apply the relationship to a new example.

1. **Teacher sets context.** Enter the objective within the bounded Grade 4 scope. Use the agreed [Learning Commons/Jev matching and recovery flow](docs/product/teacher-ui.md#agreed-direction), retaining source evidence and any gaps. Bulk curriculum imports and gated publisher-lesson adaptation remain deferred.
2. **Teacher reviews the draft.** Show the explanation, example, practice, feedback, independent check, and possible follow-up together. Allow correction or rejection before approval.
3. **Student sees a worked example.** Show why `1/2 = 2/4` with equal-sized wholes and explain multiplying numerator and denominator by the same factor.
4. **Student practices with support.** Ask for a missing step in a similar example. On error, explain the relevant step and allow a retry. Record whether support was used.
5. **Student answers independently.** Use a fresh example, such as `2/3 = 4/6`, without a hint before submission. In the pilot, include a teacher-reviewed explanation or transfer item using a representation already taught; matching alone cannot establish conceptual understanding. Preserve the first response separately from retries.
6. **System proposes one next action.** Use fixed, reviewed rules: more practice, a prerequisite check, or teacher review. Every learner-facing branch is approved in advance.
7. **Teacher sees evidence.** “Guided item correct after a hint; independent item incorrect. Suggested next step: check equal parts.” Provide a way to choose another approved activity or pause.

This is one bounded sequence within the existing lesson experience. It does not require a general multi-page framework. Existing four-variant contracts can remain during the sprint; four variants are not four instructional stages. Do not multiply the review burden by adding more variants.

A single incorrect answer must not become “student lacks the prerequisite,” and a single correct answer must not become “mastered.” Call the result an attempt or a provisional signal.

## Delivery steps and gates

Use this order for product decisions. During the hackathon, run a narrow real-model-to-preview integration proof by October 27 alongside the early validation steps; do not leave technical feasibility until step 5. Each gate requires an artifact, not a declaration that a feature exists. The builder owns artifacts and implementation; participating teachers judge usefulness and instructional acceptability.

### 1. Establish the problem before adding scope

Observe three target teachers walking through a recent equivalent-fractions lesson. Ask what triggered the lesson, what they reused, where preparation or checking took time, and what happened after students struggled. Collect de-identified examples and separate observations from interpretations.

**Deliverable:** three short evidence records with the recent task, current workaround, rough baseline time, and recurring difficulty. Record reachable segment, device/network context, and who permits or pays for the current tool (V4).

**Gate:** at least two describe a concrete recent problem that this narrow loop could address. This is an early screening threshold, not market validation. If recruitment is unavailable during the sprint, continue only as an explicitly unvalidated demo. If interviews contradict the problem, narrow or revise the job before adding features.

### 2. Test the teaching sequence manually

Create one hand-authored lesson following the seven steps above, with a correct-response path, a misconception path, and an uncertain-response path. Have a target teacher review the math, explanation, feedback, and next-step rules. Walk through it using synthetic attempts before depending on generation.

**Deliverable:** an approved reference lesson, answer key, and a small decision table mapping responses to follow-up.

**Gate:** no unresolved mathematical error; the teacher can explain the objective and accepts the follow-up choices. If the lesson fails here, revise the lesson before building generation around it.

### 3. Test whether the workflow earns its place

Ask three teachers to prepare the same short lesson using their normal method or accessible general AI tool, then the reference Edu-Canvas prototype. Vary the order between participants. Include prompting, review, corrections, sharing, and interpretation of sample attempts in the timing. Include the teacher’s best reusable material and one accessible specialist tool when relevant. Match content availability and quality requirements; record researcher assistance. Prototype timing tests the workflow only—repeat with generated drafts before claiming preparation savings.

**Deliverable:** a comparison sheet (V7): total time, corrections, unresolved errors, help needed, preferred method, and reason. Include review of incorrect-feedback branches; teacher approval may be the largest cost. Record one next lesson each teacher would actually try.

**Gate:** proposed pilot threshold: at least two of three complete the workflow with less total effort and choose to try it again, with no unresolved content error. Small samples are directional; do not publish a percentage improvement as a general result. If there is no advantage, simplify the review/results flow or reconsider the standalone product before expanding it.

### 4. Build one approved end-to-end path

Use the reference lesson as the contract. Implement or verify: validation → complete teacher preview → approval/version → student sequence → private grading → fixed next-step rule → teacher evidence and override.

**Deliverable:** a working lesson with persisted attempts tied to the approved version and understandable recovery from failures.

**Gate:** correct and incorrect paths both work; no incorrect attempt receives success feedback; blocked drafts cannot be previewed or published; unapproved content cannot enter a follow-up branch; client payloads contain no answer key. Check keyboard use and a narrow phone viewport. A teacher can pause or replace the proposed next activity. Exercise interrupted/repeated submissions and edits after approval so an attempt keeps its approved version (V6/V8).

Keep these checks when simplifying scope. Existing issue references are planning anchors, not verified current statuses: #28 safety, #5 approval, #6 grading, #7 feedback/next step, #8 teacher evidence, #9/#10 usability. Recheck #27’s reported false-success behavior before any learner-facing claim.

### 5. Add generation behind the proven lesson contract

Make the model draft the bounded sequence, not invent its pedagogy or execute arbitrary interfaces. Reuse the existing generation boundary, semantic renderer, and reviewed curriculum slice. Validate generated math, feedback, references, and branches against the reference cases; teacher review remains necessary.

**Deliverable:** generated drafts that can enter the same review and approval flow, plus a repeatable evaluation set containing valid, invalid, and ambiguous examples.

**Gate:** known bad cases are rejected or visibly flagged; teacher corrections persist; generation failure preserves the request and offers recovery. For the hackathon, prove a real allowed-model response reaches validation and preview early, then complete and evaluate generation here. Authentication alone is not an integration proof. A failed provider experiment must not drive a new product architecture.

### 6. Prove the demo, then test classroom use separately

For the event, demonstrate a real model draft, teacher approval, an incorrect synthetic attempt, useful feedback, an independent check, and the teacher’s next decision. Identify any seeded content or simulated attempts clearly.

**Demo gate:** repeatable end-to-end run in under three minutes, core boundary checks passing, and access/cost guards before public hosting. Use the [current demo script](docs/hackathon/meta-global-2026/demo-script.md); verify independent access and ask unfamiliar viewers to describe the distinctive action (V9/V10). A recorded fallback is labeled as a recording; it does not imply a live service exists.

After the event, complete a five-teacher value study, including the initial participants where practical. Then arrange a small, appropriately authorized learner pilot. Measure first independent attempts, support used, fresh transfer items, and a later retention check. Adult walkthroughs only establish usability, not child learning outcomes.

**Expansion gate:** teachers return for another real lesson, preparation plus review effort improves, students can interpret corrective feedback, and the pilot does not expose unresolved content or grading failures. Report sample sizes and uncertainty; a small pilot does not establish causal learning gains. Confirm the adoption/procurement path and cost per approved lesson, including retries and support, before production investment. Rehearse class-sized result interpretation and shared-device use before claiming classroom fit (V12).

## What changes from the previous roadmap

| Previous priority | Revised priority |
| --- | --- |
| Model migration first | Real model → validation → preview proof by Oct 27 alongside early problem/reference-lesson work; full-loop proof by Oct 29. |
| Value gate entirely after the event | Lightweight teacher/problem and baseline checks now; fuller value and learner studies after. |
| Matching → reveal as the teaching experience | Worked example → guided practice → independent check → provisional follow-up. |
| Trust architecture as the product identity | Teacher effort and usable learning evidence as the promise; architecture protects that promise. |
| Teacher reason is an early scope cut | Keep minimal attempt evidence and a teacher decision; cut richer dashboards and graph visualization. |
| Token allocation as delivery planning | Use human review hours and demonstrated gates; token availability does not validate lessons. |

## Defer until the evidence justifies expansion

Arabic/RTL completion, more grades or subjects, broad curriculum packs, general multi-page authoring, open-ended student chat, runtime student generation, parent reporting, LMS integration, and production administration. Retain existing boundaries; avoid a rewrite.

Expand one dimension at a time. First repeat the same lesson workflow with another equivalent-fractions objective. Then test an adjacent concept. Choose language or curriculum expansion based on the teachers who actually adopt the tool.

## Next three actions

1. Recruit three Grade 4 teachers and capture a recent lesson-preparation task; do not send outreach without the project owner’s instruction.
2. Write and teacher-review the reference lesson and three attempt paths.
3. Run one timed comparison against a teacher’s existing workflow, then revise the smallest build scope from what happens.

Open questions for research: Which teachers can be reached this week? Is the biggest cost preparation, reviewing AI drafts, or deciding what to reteach? Will they use the sequence in class, small groups, or homework? These affect the next iteration; they do not justify adding all three modes now.
