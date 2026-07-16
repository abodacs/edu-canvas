# Edu-Canvas PRD Grill Log

This document records the decisions, contradictions, and unresolved questions discovered while stress-testing the master PRD.

## Status

- **Locked** — accepted product or architecture decision.
- **Superseded** — replaced by a later decision.
- **Unclear** — answers conflict or are incomplete; requires one focused follow-up.
- **Open** — recommendation was presented but not answered.

## Current product direction

- Matching activities are the first production workflow.
- The architecture is subject-agnostic, but Common Core Math for Grades 3–6 is the first content domain.
- Teachers create activities with both a guided composer and a free-form prompt.
- Teachers approve every generated variant before student use, in a bulk review flow with per-variant edits.
- Students match through structured source-first selection and multi-select; freehand ink is optional annotation only.
- Grading is deterministic and server-authoritative; student boards and ink are not sent to AI.
- Adaptive learning uses a curated prerequisite graph and finite teacher-approved packs, with recursive remediation and lazy pack generation.
- A2UI v0.9.1 is the UI wire protocol, using a versioned Edu-Canvas catalog; the canonical lesson model remains separate.
- Core lesson rendering and interaction use semantic DOM components through A2UI. The experimental HTML-in-Canvas API (and screenshot-style canvas tools) is optional progressive enhancement only; the product must work fully without browser flags or experimental renderer support.
- TanStack Start replaces Next.js; PostgreSQL is the system of record.
- The primary student context is independent learning at home, in English or Arabic, with responsive light/dark UI and RTL support.
- Real-student production data is gated on DPA, residency, security, and consent approval. A formal synthetic-data phase precedes that approval gate.

## Question register

| # | Topic / question | Recorded outcome |
|---:|---|---|
| 1 | What is the v1 workflow? | **Locked:** Product vision is natural-language generation of standards-aligned visual learning workspaces; later narrowed to matching first. |
| 2 | Which activity ships first? | **Locked:** Matching only. |
| 3 | Must teachers approve generated activities? | **Locked:** Mandatory teacher review. |
| 4 | Standards source? | **Locked:** US Common Core Math. |
| 5 | Grade range? | **Locked:** Grades 3–6. |
| 6 | How does a student match? | **Locked:** Structured source/target selection; freehand lines are not the grading source of truth. |
| 7 | What matching cardinality? | **Superseded:** Initial one-to-one proposal was replaced by multi-answer relationships. |
| 8 | Which multi-answer relationship shape? | **Locked:** One source may map to multiple targets; targets are not reused across sources. Fully general many-to-many is deferred. |
| 9 | What counts as complete? | **Locked:** Student must select all and only the correct targets; order does not matter. |
| 10 | Is partial credit allowed? | **Locked:** Yes; incorrect selections are penalized and exact all-and-only matching is required for `isCorrect`. |
| 11 | Can teachers edit generated answer keys? | **Locked:** Yes; teachers can edit source/target text, relationships, standard, hints, feedback, and layout. |
| 12 | Are distractors supported? | **Locked:** Optional distractor targets are supported. |
| 13 | How many standards per activity? | **Locked:** One primary standard; teacher selects it and confirms AI suggestions. |
| 14 | Access model? | **Locked:** Private teacher-to-student assignments; no public links, anonymous submissions, or peer collaboration in v1. |
| 15 | Real or synthetic student data? | **Unclear / superseded:** Real data was initially accepted, then gated behind DPA/residency/security/consent approval and synthetic data before approval. See Q109–110. |
| 16 | What may be sent to AI? | **Locked:** No identifying data and no student image. Only de-identified activity/structured data may be considered. |
| 17 | Who controls retention? | **Locked:** School administrator sets the maximum/default; teacher may shorten but not extend. |
| 18 | Multiple schools? | **Locked:** Yes; each school is an isolated tenant. |
| 19 | School SSO? | **Superseded:** SSO deferred for now. |
| 20 | Interim account model? | **Locked:** Invite-only platform accounts; no anonymous access. |
| 21 | Image sources? | **Locked:** Platform assets and AI-generated images; arbitrary external URLs are not allowed. |
| 22 | AI-generated image flow? | **Locked:** Server-side generation → asset storage → safety/content checks → teacher approval → publish. Payload uses asset IDs. |
| 23 | Who owns image alt text? | **Locked:** System drafts it; teacher confirms or edits before publishing. |
| 24 | Syllabus uploads? | **Superseded / unclear:** Initially included, then explicitly deferred from v1. Treat as deferred unless re-opened. |
| 25 | Canonical lesson representation? | **Locked:** Normalized server-side lesson model; A2UI is only a render projection. |
| 26 | Where do AI calls happen? | **Locked:** Server-side only. |
| 27 | Generation failure recovery? | **Locked:** One automatic server correction attempt, then teacher-controlled retry; no recursive client loop. |
| 28 | Performance targets? | **Locked:** Use p95 SLOs; text draft roughly 10s p95, async image generation, local render roughly 500ms p95, drawing under 16ms/frame. |
| 29 | Can published activities be edited in place? | **Locked:** No; published versions are immutable. Edits create new versions. |
| 30 | Can students retry? | **Locked:** Yes; teacher-configurable limit, default recommendation three attempts. |
| 31 | Which retry score counts? | **Locked:** Latest score for immediate feedback; best score for mastery/progress. |
| 32 | How is feedback generated? | **Locked:** Deterministic rule/template feedback in v1; no student-facing freeform AI feedback. |
| 33 | Does v1 auto-adapt? | **Superseded:** Teacher-controlled progression was replaced by automatic adaptive progression modeled on mastery learning. |
| 34 | Does v1 need a prerequisite graph? | **Locked:** Yes; curated, platform-owned, versioned Grades 3–6 graph. |
| 35 | What proves mastery? | **Locked:** 90%+ on two different activities for the same skill. |
| 36 | What happens below mastery? | **Locked:** 70–89% → another same-skill activity; below 70% → simpler scaffold/prerequisite; repeated failures flag teacher; never advance before mastery. |
| 37 | How can adaptation coexist with review? | **Superseded:** Runtime generation is not allowed; use finite pre-generated teacher-approved packs. |
| 38 | Is the answer key separate? | **Locked:** Yes; server-only, separate from visual components. |
| 39 | Where is score computed? | **Locked:** Backend only; client sends events, never trusted score fields. |
| 40 | Must matching cards be rasterized onto Fabric or HTML-in-Canvas? | **Locked:** No; semantic DOM/A2UI cards are interactive and remain the grading source of truth. Fabric may support optional ink; HTML-in-Canvas or html2canvas may support optional preview/export only. None is required for core rendering, accessibility, sharing, or grading. |
| 41 | Can cards move/rotate/scale? | **Locked:** No in v1; matching cards are fixed and responsive. |
| 42 | Is freehand ink included? | **Locked:** Yes, as optional ungraded annotation; it must not replace semantic DOM interaction or become a canvas-only grading path. |
| 43 | Is ink persisted? | **Locked:** Yes; saved with immutable attempts and visible to teachers; never sent to AI. |
| 44 | Can students submit incomplete work? | **Locked:** Yes; partial credit and feedback are allowed. |
| 45 | Where do hints come from? | **Locked:** Teacher-approved hints from the activity pack; no runtime invention. |
| 46 | Do hints affect mastery? | **Locked later by Q119:** Hints do not reduce raw score, but assisted attempts do not count toward the two mastery proofs. |
| 47 | What does “save 90% teacher time” mean? | **Locked:** Recommended baseline is 30 minutes → 3 minutes per published activity; use as a formal success metric. |
| 48 | Must every adaptive variant be reviewed? | **Locked:** Yes. A later proposal to review only a policy/pack was rejected. Bulk review is allowed, but every variant requires approval. |
| 49 | How many variants per skill? | **Locked:** Four: two standard, one simplified scaffold, one review/challenge variant. |
| 50 | How deep is remediation? | **Superseded:** One-level remediation was rejected; full recursive remediation through the curated graph is required. |
| 51 | Missing prerequisite pack? | **Locked:** Pause progression, notify teacher, create review task; do not use unrelated or unreviewed content. |
| 52 | Who owns the graph? | **Locked:** Platform-curated and versioned; teachers select standards but do not edit graph relationships in v1. |
| 53 | Is the product math-only? | **Superseded:** Architecture is subject-agnostic; Common Core Math is the first supported subject/domain. |
| 54 | How should packs be reviewed? | **Locked:** Bulk review screen with per-variant edits and one pack approval action. |
| 55 | Remove Vision from v1? | **Superseded:** Vision remains only for teacher/AI asset QA; it does not grade student boards. |
| 56 | What does Vision analyze? | **Locked:** Non-student asset QA only. Student-board grading is excluded. |
| 57 | Accessibility target? | **Locked:** WCAG 2.2 AA. |
| 58 | Languages? | **Locked:** English and Arabic. |
| 59 | Does Arabic cover lesson content? | **Locked:** Yes; UI and lesson content, with RTL support. |
| 60 | Arabic terminology ownership? | **Locked:** Platform-owned, human-reviewed Arabic math glossary. |
| 61 | Network loss behavior? | **Locked:** Cache published activity, autosave locally, queue events, show connectivity, require server confirmation for final submission; no offline AI generation. |
| 62 | Multiple devices? | **Locked:** Same attempt may be open on multiple devices. |
| 63 | Conflict merge policy? | **Locked:** Server-ordered events; latest accepted selection state wins; ink merges by stroke ID; first final submission locks attempt. |
| 64 | Student onboarding? | **Locked:** Support both private invites and class codes. |
| 65 | Class-code safeguards? | **Locked:** Temporary/rotatable codes, PIN or roster verification, teacher confirmation/claim control, rate limiting, no roster exposure, revocation. |
| 66 | Student identity fields? | **Locked:** Opaque ID, teacher-visible display/roster label, school/class membership, activity/attempt records; no unnecessary DOB/email/demographics. |
| 67 | Admin access to work? | **Locked:** School admins cannot view individual work by default; exceptional access is delegated and audited. |
| 68 | Audit events? | **Locked:** Log logins, roles, roster changes, generation/approval, answer-key edits, student-work access, exports/deletions, retention changes, AI calls, and validation failures. |
| 69 | Teacher dashboard? | **Locked:** Yes; mastery by skill/standard, latest/best scores, attempts, hint use, remediation, attention flags, version history. |
| 70 | Explain adaptive decisions? | **Locked:** Yes; show plain-language reason and allow teacher override. |
| 71 | What may teachers override? | **Locked:** Assign approved packs, skip/revisit prerequisites, pause adaptation, adjust difficulty; manual mastery override requires reason/audit. |
| 72 | Hard-code model? | **Locked:** No; configurable provider/model/version with capability tests, fallback, and generation metadata. |
| 73 | Safety moderation? | **Locked:** Server-side moderation of teacher prompts, generated text, and images; blocking and remediation states required. |
| 74 | MFA? | **Locked:** Email-based MFA for adult accounts. |
| 75 | Adult login method? | **Locked:** Passwordless email magic link or one-time code. |
| 76 | Minor authorization? | **Locked:** School authorization/consent status and timestamp are required before account activation; school/deployment handles required consent process. |
| 77 | Authoritative validation? | **Locked:** Server-side; client validation is defense-in-depth only. |
| 78 | Closed Shadow DOM? | **Locked:** Optional; not a security boundary. Use allowlisted renderer, CSP/Trusted Types, safe data, semantic DOM. |
| 79 | Arbitrary CSS from model? | **Superseded by A2UI decision:** Styling is governed by the reviewed Edu-Canvas catalog; the model cannot emit arbitrary HTML/CSS or require HTML-in-Canvas. The exact token set remains an implementation detail. |
| 80 | Adopt real A2UI? | **Locked:** Yes; replace the PRD’s custom “A2UI” claim with real A2UI plus a custom Edu-Canvas catalog. |
| 81 | A2UI version? | **Locked:** v0.9.1. |
| 82 | A2UI transport? | **Locked:** SSE for server-to-client streaming, HTTPS actions for client-to-server events. |
| 83 | Catalog scope? | **Locked:** Fixed matching-focused semantic catalog: layout, text/image, match cards, hint/feedback/progress, ink, and accessibility metadata. The catalog must have a normal DOM renderer; experimental canvas rendering is not a dependency. |
| 84 | Allowlisted actions? | **Locked:** `selectSource`, `selectTarget`, `clearSelection`, `requestHint`, `submitAttempt`, `undoInk`, `clearInk`, `saveProgress`. |
| 85 | Catalog governance? | **Locked:** Versioned immutable catalogs; additive reviewed changes; new catalog ID for breaking changes; client advertises supported versions. |
| 86 | Client data boundary? | **Locked:** Public IDs/labels, layout/assets, selections, hints/feedback, progress/connectivity, ink; answer key/mastery/permissions remain server-side. |
| 87 | Should model emit A2UI directly? | **Locked:** No; model emits a lesson draft, server validates/normalizes, backend compiles A2UI messages. |
| 88 | Framework? | **Locked:** TanStack Start replaces Next.js. |
| 89 | Database? | **Locked:** Managed PostgreSQL, server-only access, tenant columns, immutable versions, append-only events/audit, migrations. |
| 90 | When generate prerequisite packs? | **Locked:** Lazily when needed; pause if not approved. |
| 91 | Event persistence granularity? | **Locked:** Persist completed selection/hint/submit/undo/clear actions, completed ink strokes, and periodic snapshots; not pointer moves. |
| 92 | Device support? | **Superseded:** “All responsive” is required; phones, tablets, laptops, desktops, portrait/landscape, touch/stylus/mouse/keyboard. |
| 93 | Primary context? | **Locked:** Home. |
| 94 | Student workflow? | **Locked:** Independent, self-paced use with optional parent support and asynchronous teacher monitoring. |
| 95 | Brand tone? | **Locked:** Calm, encouraging, quietly intelligent. |
| 96 | Aha moment? | **Locked:** Brief connection reveal: relationships settle, pattern is highlighted, concise why-explanation appears, next step unlocks with reason. |
| 97 | Theme? | **Locked:** Light and dark themes; light default. |
| 98 | Brand colors? | **Open implementation choice:** No existing colors; explore warm paper/ink foundation with one confident accent and high contrast. |
| 99 | Copy design context to Copilot instructions? | **Locked:** No. Design context recorded only in `.impeccable.md`. |
| 100 | Phone layout? | **Locked:** Step-by-step focused layout on narrow portrait screens; two-column layout on larger screens; no pinch-zoom required for core matching. |
| 101 | Raw attempt retention? | **Locked:** 90 days by default; school may shorten, not teacher extend; activities/progress and audit policy are separate. |
| 102 | Data region? | **Locked:** Europe for now. |
| 103 | Europe-only processing? | **Unclear:** User requested Europe-only processing; provider guarantees and exact scope need DPA/residency review. |
| 104 | Controller/processor model? | **Locked pending legal confirmation:** School is controller; Edu-Canvas is processor under DPA. |
| 105 | Encryption baseline? | **Locked:** TLS, encrypted DB/storage/backups/logs, application-level encryption for sensitive fields, managed key rotation, no client secrets. |
| 106 | Self-service data rights? | **Locked:** Self-service export/deletion UI deferred to v2. |
| 107 | Data-rights operations in v1? | **Locked:** Manual internal/admin process and backend capability remain required in v1. |
| 108 | Exact OpenAI residency boundary? | **Unclear:** EU content/inference may be possible for eligible accounts, but system metadata/non-GPU processing and image approval requirements need confirmation. |
| 109 | What to do while residency is uncertain? | **Locked:** Do not treat Europe-only processing as resolved; use a compliance launch gate and synthetic data until school/DPA review confirms the boundary. |
| 110 | Separate synthetic-data phase or immediate real-data v1? | **Locked:** Formal synthetic-data phase first; real student data remains blocked until DPA, residency, security, and consent approval. |
| 111 | Deployment model? | **Locked:** Single managed EU-hosted environment for app, DB, storage, queues, backups, and logs. |
| 112 | Activity creation UX? | **Locked:** Both guided composer and free-form prompt. |
| 113 | Required metadata? | **Locked:** Grade, primary standard, and language required; difficulty optional with default. |
| 114 | Activity size? | **Locked:** 3–8 source items; six default. |
| 115 | Distractor limit? | **Locked:** 0–2 distractors, maximum one per four source items. |
| 116 | Multi-answer UI? | **Locked:** Source-first multi-select with explicit “Done,” revisable before submit; selection order irrelevant. |
| 117 | Target reuse UI? | **Locked:** No reuse in v1; assigned targets become unavailable in an explainable, reversible way. |
| 118 | Partial-score formula? | **Locked:** `correct matches / (required matches + incorrect matches) × 100`; exact all-and-only required for correctness. |
| 119 | Hint effect on mastery? | **Locked:** No raw-score penalty, but assisted attempts do not count toward the two mastery proofs. |
| 120 | Validator errors/warnings? | **Locked:** Errors block approval; warnings require acknowledgement/edit/removal before pack approval. |
| 121 | Should pack generation be asynchronous? | **Open:** Recommendation was yes: save draft, background generation, notify teacher, never publish unapproved content. |
| 122 | Who starts adaptive loop? | **Locked:** Teacher assigns the first pack; the engine takes over after the first submission; teacher can pause/override. |
| 123 | Does mastery require spaced review? | **Locked:** Yes; use 1-, 3-, 7-, and 14-day review checkpoints; a failed review reopens the skill. |
| 124 | How should the student receive next activity? | **Locked:** Present one clear next recommended activity/message rather than a large activity menu. |
| 125 | Which skill wins when several are available? | **Locked with eligibility guard:** Prefer a new skill when eligible; never bypass unresolved prerequisites or mastery gates. |
| 126 | Does requesting a hint consume an attempt? | **Locked:** No; a hint belongs to the current attempt and submission scores it. |
| 127 | What does the student see after submission? | **Open:** Recommendation was score, missing/matched relationships, concise explanation, and one next action; hide internal mastery graph details. |
| 128 | May runtime generate while student waits? | **Locked:** No unreviewed student-facing runtime generation; background preparation is allowed only for content that later receives teacher approval. |
| 129 | What exactly must remain in Europe? | **Locked:** EU storage and EU model inference; any non-content metadata exception must be explicitly approved in the DPA. |
| 130 | What disaster-recovery target is required? | **Open:** Recommendation is no loss of final submissions, roughly 5-minute RPO for active attempts, and 1-hour RTO. |
| 131 | What happens when async generation fails? | **Locked:** Retain the draft, retry automatically, notify the teacher, explain the failure, and never silently discard the request. |
| 132 | Are activities assigned to classes or individuals? | **Locked:** Class assignment by default, with individual overrides. |
| 133 | Is there a parent role in v1? | **Locked:** No parent account or product role in v1; parents may support locally without default record access. |
| 134 | Can teachers reuse approved activities? | **Locked:** Yes; duplicate any published activity as a new draft/version; never edit the published version. |
| 135 | Which notifications are required? | **Locked:** In-app notifications plus teacher email for pack readiness, failures, attention flags, and assignments; no student email. |
| 136 | Are due dates required? | **Locked:** Optional due dates with supportive “late” status, not punitive auto-failure. |
| 137 | Can students choose future activities? | **Locked:** No unrestricted skill browsing; show one next recommendation and allow teacher-assigned overrides. |
| 138 | What is the default attempt limit? | **Locked:** Three attempts, teacher-configurable. |
| 139 | What AI generation limits are required? | **Locked:** Per-tenant/teacher quotas, one active pack job per teacher, rate limits, and cost/usage telemetry. |
| 140 | Can a pack publish with fewer than four approved variants? | **Locked:** No; replace failed/rejected variants before publishing the required pack. |
| 141 | What if an AI-generated image fails? | **Locked:** Use a safe platform placeholder or text-only variant, with teacher approval still required. |
| 142 | Can teachers save incomplete review work? | **Locked:** Yes, as a draft only; it cannot be assigned or published until valid and approved. |
| 143 | Can a student receive the same variant repeatedly? | **Locked:** Avoid repeats while other approved variants remain, using deterministic selection. |
| 144 | Should activity versions pin graph/catalog versions? | **Locked:** Historical attempts retain the exact graph, standards, A2UI catalog, and model versions used. |
| 145 | How should standards-catalog updates affect old work? | **Locked:** Standards entries are immutable by version; existing activities retain original metadata. |
| 146 | How should model changes affect approved content? | **Locked:** Model changes create new drafts requiring teacher review; approved content is never silently regenerated. |
| 147 | Should teacher-visible provenance be stored? | **Locked:** Record model/provider/version, prompt-template version, validator version, and approving teacher for each pack. |
| 148 | Can one teacher belong to multiple schools? | **Locked:** One school membership per account in v1; multi-school memberships deferred. |
| 149 | Can one student belong to multiple classes/teachers? | **Locked:** Yes through explicit class memberships; attempts remain assignment-scoped. |
| 150 | Who can transfer activity/class ownership? | **Locked:** School administrators only, with audit logging and immutable attempt history. |
| 151 | Can administrators impersonate users? | **Locked:** No ordinary impersonation; use time-limited delegated support access with explicit audit logs. |
| 152 | Are per-student accommodations required? | **Locked:** No teacher-configured accommodation profiles in v1. WCAG support remains a product requirement. |
| 153 | Must core matching work without ink? | **Locked:** Yes; ink is optional and never the only interaction path. |
| 154 | Should students control display preferences? | **Locked:** Yes; text size, theme/contrast, language, and reduced motion are user preferences within school policy. |
| 155 | Should accessibility preferences persist across devices? | **Locked:** Yes; preferences sync to the student account. |
| 156 | May real student data train or improve the AI? | **Locked:** No training or product-model tuning on student data; only approved de-identified aggregate metrics. |
| 157 | What learning analytics should be collected? | **Locked:** Minimum necessary events: correctness, attempts, hints, mastery transitions, and adaptation decisions; no ad/behavior tracking. |
| 158 | Should teachers export progress reports in v1? | **Locked:** Controlled CSV/PDF export for assigned classes, with audit logging and tenant scope. |
| 159 | How is the 90% teacher-time goal measured? | **Locked:** Measure median and p95 time from starting creation to approved publication; target median ≤3 minutes. |
| 160 | What student learning outcome defines v1 success? | **Locked as initial hypothesis:** At least 70% of assigned students reach mastery within three activities, compared with a non-adaptive baseline. |
| 161 | What generation-quality target is required? | **Locked:** Zero publishable safety or answer-key errors; track teacher edit/rejection rate. |
| 162 | What availability target is required? | **Locked:** 99.9% published-activity runtime availability, with a separate lower SLO for AI authoring. |
| 163 | What must block a production release? | **Open:** Recommendation is security, privacy, accessibility, content-validity, migration, and SLO gates. |
| 164 | Which real-device/browser matrix is required? | **Open:** Recommendation is current Chrome, Safari, Edge, and Firefox across phone/tablet/laptop, portrait/landscape, touch/stylus/mouse/keyboard. |
| 165 | Is human usability testing required? | **Open:** Recommendation is teacher and student usability testing with synthetic data before real-data launch. |
| 166 | How are risky features released? | **Open:** Recommendation is feature flags, staged rollout, kill switches for adaptation/AI, and rollback without mutating immutable attempts. |
| 167 | What is the build capacity before the Devpost deadline? | **Locked:** 48 hours remain; treat the competition cut as a hard boundary and optimize for one reliable end-to-end demo. |
| 168 | Is the real GPT-5.6 path available for the demo? | **Locked:** GPT-5.6/Codex access and deployment readiness are available; the demo must use the real path. |
| 169 | What single concept should the competition demo teach? | **Locked:** Equivalent fractions; it supports visual matching, multi-answer relationships, distractors, bilingual labels, and a clear prerequisite/aha path. |
| 170 | How should English/Arabic appear in the demo? | **Locked:** Language toggle with one clean language at a time; demonstrate Arabic RTL briefly rather than duplicating every card side-by-side. |

## Active uncertainty queue

Only these should be asked next because confidence in the intended answer is below 70% or the decision materially affects launch safety:

1. **Q132:** Choose class/individual assignment behavior.
2. **Q133:** Choose whether parents have a product role in v1.
3. **Q134:** Choose teacher activity reuse behavior.
4. **Q135:** Choose notification channels and events.
5. **Q136:** Choose due-date behavior.
6. **Q137:** Choose student activity choice/autonomy.
7. **Q138:** Confirm default attempt limit.
8. **Q139:** Choose generation quotas and cost controls.
9. **Q140:** Choose minimum approved pack completeness.
10. **Q141:** Choose image-failure fallback.
11. **Q142:** Choose partial-review draft behavior.
12. **Q143:** Choose variant repeat behavior.
13. **Q144:** Choose graph/catalog pinning.
14. **Q145:** Choose standards-catalog update behavior.
15. **Q146:** Choose model-change behavior.
16. **Q147:** Choose generation provenance requirements.
17. **Q148:** Choose multi-school teacher membership.
18. **Q149:** Choose multi-class student membership.
19. **Q150:** Choose ownership transfer authority.
20. **Q151:** Choose administrator support access.
21. **Q152:** Choose per-student accommodation scope.
22. **Q153:** Confirm matching without ink.
23. **Q154:** Choose student display preferences.
24. **Q155:** Choose preference synchronization.
25. **Q156:** Choose secondary-use/training policy.
26. **Q157:** Choose learning analytics scope.
27. **Q158:** Choose teacher progress exports.
28. **Q159:** Choose teacher-time measurement.
29. **Q160:** Choose learning outcome metric.
30. **Q161:** Choose generation-quality threshold.
31. **Q162:** Choose availability SLO.
32. **Q163:** Choose release-blocking gates.
33. **Q164:** Choose device/browser test coverage.
34. **Q165:** Choose usability-testing requirement.
35. **Q166:** Choose staged-release controls.
36. **Q167:** Choose build capacity and deadline plan.
37. **Q168:** Verify GPT-5.6/Codex access and deployment readiness.
38. **Q169:** Choose the single demo learning concept.
39. **Q170:** Choose bilingual presentation for the demo.

## External references consulted

- [A2UI official site](https://a2ui.org/) and [A2UI catalogs](https://a2ui.org/concepts/catalogs/)
- [Chrome: HTML-in-Canvas API origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial?hl=en) — reviewed as an optional enhancement, not a core dependency
- [Math Academy: how its AI works](https://mathacademy.com/how-our-ai-works)
- [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- [European Commission: controller vs processor](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/obligations/controllerprocessor/what-data-controller-or-data-processor_en)
