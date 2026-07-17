# Edu-Canvas — OpenAI Build Week Strategy

Last verified: 2026-07-17

This document is the persistent competition overlay for the master PRD. It does not delete production requirements; it defines the smallest credible build and demo that can win the Education track.

> Current issue-driven status: the foundation slice in [issue #2](https://github.com/abodacs/edu-canvas/issues/2) is shipped, while the landing story is being refined in [PR #25](https://github.com/abodacs/edu-canvas/pull/25). Generation and the downstream teacher-to-student loop remain open in [issues #3–#11](https://github.com/abodacs/edu-canvas/issues/3). The product strategy, seven-layer orientation, and evidence gaps are recorded in [`docs/product-strategy.md`](docs/product-strategy.md). Treat the competition build cut below as the target contract, not a claim that every step has shipped; [issue #27](https://github.com/abodacs/edu-canvas/issues/27) is an open learner-safety blocker for the current landing preview.

## Competition facts

- Event: OpenAI Build Week.
- Track: Education.
- Deadline shown on the official page: July 21, 2026 at 5:00 PM PT.
- Required: a working project built with Codex using GPT-5.6.
- Submission requires: project description, category, public sub-three-minute YouTube demo with audio explaining Codex and GPT-5.6 usage, a public repository or repository shared with the listed Devpost testing addresses, README/setup/sample data, and a Codex `/feedback` session ID.
- Judging dimensions: technological implementation, design, potential impact, and quality of the idea.

Source: [OpenAI Build Week on Devpost](https://openai.devpost.com/)

## Winning thesis

**Edu-Canvas turns a teacher’s plain-English or Arabic request into a safe, standards-aligned visual matching lesson in minutes, then gives a student an adaptive “aha” moment without letting AI grade or publish unreviewed content.**

The memorable contrast:

> Teacher prompt → teacher-approved A2UI lesson → student match → deterministic mastery → next best activity.

## Why this can win

### Technological implementation

- Real A2UI v0.9.1 messages rendered through a custom, allowlisted Edu-Canvas catalog.
- GPT-5.6 generates a constrained lesson draft; the server validates and compiles it into A2UI.
- No generated HTML or JavaScript execution.
- Core lesson interaction uses semantic DOM/A2UI. Experimental HTML-in-Canvas is optional polish only and must have a normal DOM fallback.
- Server-authoritative answer key and deterministic scoring.
- Recursive adaptive decision trace backed by a curated prerequisite graph.
- Codex-built, working end-to-end slice with a readable repository and tests.

### Design

- One coherent home-learning flow instead of a feature-heavy dashboard.
- Calm, encouraging, quietly intelligent visual language.
- Responsive English/Arabic experience with RTL support.
- A short connection reveal after submission: the correct relationships settle, the concept is explained, and the next step becomes obvious.
- WCAG 2.2 AA interaction path that does not depend on canvas or freehand ink.

### Potential impact

- Concrete teacher promise: reduce activity preparation from about 30 minutes to about 3 minutes.
- Student promise: get immediate, understandable feedback and an appropriate next activity.
- Trust promise: teachers approve content; AI never silently changes the answer key or grades from a screenshot.

### Quality of idea

- Combines generative UI, curriculum alignment, teacher control, bilingual access, and mastery learning in one visible loop.
- Avoids the generic “AI worksheet generator” pattern by making adaptive visual learning and explainable progression the product, not a chat wrapper.

## Competition build cut

The demo should implement one polished vertical slice:

1. Teacher enters a free-form prompt and selects grade, standard, and language.
2. Server calls GPT-5.6 and creates a constrained lesson draft.
3. The server validates the domain model and emits A2UI v0.9.1 messages.
4. Teacher reviews four variants in one approval screen and publishes the pack.
5. Student opens the activity on desktop or phone, selects all matching targets, and submits.
6. Server calculates the score from the private answer key.
7. Student sees the connection reveal and next recommended activity.
8. Teacher sees the adaptation reason and mastery state.

### Demo content

Use equivalent fractions as the single concept. Example: source `1/2` maps to `2/4`, `3/6`, and `4/8`; `2/3` is a distractor. The aha reveal shows that the different names cover the same portion of a whole, then routes a struggling student toward the equal-parts prerequisite.

Use synthetic data and a seeded demo tenant/account. Real student data is blocked until the DPA, residency, security, and consent gates are complete.

## Demo choreography: under three minutes

### 0:00–0:20 — Problem

Show the teacher’s current burden: turning a learning objective into a differentiated, bilingual visual activity takes too long.

### 0:20–0:55 — Generate

Type one natural-language request. Show GPT-5.6 producing a structured draft, not code. Briefly expose the validated A2UI catalog boundary.

### 0:55–1:20 — Approve

Show the four variants in one review surface. Highlight one teacher edit and one validator warning. Approve the pack.

### 1:20–2:05 — Learn

Switch to the student view. Demonstrate responsive layout, Arabic RTL or English toggle, multi-answer selection, an incorrect distractor, submission, deterministic score, and the connection reveal.

### 2:05–2:35 — Adapt

Show the student receiving the next approved activity and the teacher dashboard explaining why the system chose it. Demonstrate the prerequisite graph with a small, visible example.

### 2:35–3:00 — Trust and Codex

State the safety boundary: teacher approval, server-only answer key, no student images to AI, no executable generated UI. Show the repository, tests, and how Codex/GPT-5.6 accelerated implementation.

## Must-build list

- TanStack Start app shell and server boundary.
- PostgreSQL schema or a production-shaped seeded persistence layer.
- GPT-5.6 server call with structured lesson draft output.
- Normalized lesson model separate from A2UI.
- A2UI v0.9.1 custom catalog and SSE transport.
- Semantic DOM renderer that works without experimental browser flags; optional canvas enhancement is not part of the critical path.
- Teacher composer and bulk approval screen.
- Four activity variants with one scaffold and one review/challenge variant.
- Student source-first multi-select interaction.
- Server scoring formula and immutable attempt/version records.
- One small prerequisite graph with at least one recursive remediation path.
- English/Arabic toggle, RTL, mobile layout, keyboard path, reduced motion.
- Connection reveal and deterministic feedback.
- Teacher progress/adaptation view.
- Synthetic demo seed data and a judge-friendly test account.
- README, setup script, sample data, tests, and submission assets.

## Explicitly cut from the competition demo

These remain production-roadmap items unless they are already effortless:

- Full Grades 3–6 standards graph.
- Multiple subjects beyond the math-first slice.
- Syllabus/document uploads.
- Student-board Vision grading.
- Real student data and production consent workflows.
- Full school-admin compliance console.
- SSO, parent accounts, and multi-school memberships.
- Full offline conflict resolution across multiple devices.
- Arbitrary image ingestion or external URLs.
- Broad freehand drawing as a graded modality.
- Large curriculum browsing and unrestricted student choice.

## Anti-patterns that could lose the judging room

- Demoing a huge unfinished platform instead of one complete loop.
- Calling a custom payload “A2UI” without using the actual protocol/catalog concepts.
- Showing a chat box with no meaningful generated interface.
- Letting the model grade, publish, or mutate answer keys without teacher/server controls.
- Making judges wait for an AI job with no progress state.
- Spending the demo on GDPR architecture instead of showing the product’s learning impact.
- Using decorative gamification instead of the connection reveal.
- Showing a broken mobile layout or inaccessible canvas-only interaction.
- Requiring judges to enable Chrome flags, use Canary, or rely on experimental HTML-in-Canvas for the core demo.
- Failing to show exactly where Codex and GPT-5.6 were used.

## Evidence to collect before submission

- Screen-recorded timing of prompt-to-approved-pack; target median ≤3 minutes.
- A before/after teacher workflow comparison.
- A test proving no invalid answer key reaches the student runtime.
- A test proving client-submitted scores are ignored.
- A test proving A2UI catalog rejects unknown components/actions.
- A responsive English/Arabic walkthrough.
- A deterministic adaptation trace: result → reason → next approved activity.
- A README path that takes a judge from clone to running demo quickly.
- A concise Codex/GPT-5.6 contribution log and the required `/feedback` session ID.

## Future-session operating rule

When continuing this project, optimize decisions in this order:

1. Working demo loop.
2. Judge-visible quality and polish.
3. Clear Codex/GPT-5.6 evidence.
4. Safety and deterministic grading.
5. Production hardening.

Do not expand the build cut unless the new feature improves at least one judging dimension and can be demonstrated reliably before the deadline.

## 48-hour execution plan

### Non-negotiable scope

Build one deterministic, seeded demo path:

`teacher prompt → GPT-5.6 draft → server validation → A2UI render → teacher approval → student matching → score → connection reveal → next activity`

Do not attempt the full production PRD in this window.

### Hours 0–6: foundation

- TanStack Start shell.
- Seeded synthetic tenant, teacher, student, standards, graph, activity versions, and attempts.
- Server-only OpenAI client configuration.
- One health check and one judge-friendly demo account.
- Minimal database or production-shaped repository layer.

### Hours 6–16: generation and A2UI

- One free-form teacher prompt.
- Required grade/standard/language fields.
- GPT-5.6 structured lesson draft.
- Domain validation: IDs, source/target relationships, distractors, four variants, accessibility metadata.
- A2UI v0.9.1 custom catalog with only the components used in the demo.
- Server-to-client stream or a stable A2UI message response; do not build generic catalog infrastructure.

### Hours 16–26: teacher and student loop

- Teacher review screen with four variants and one edit.
- Publish immutable pack.
- Student responsive matching screen.
- English/Arabic toggle and one RTL path.
- Multi-select, submit, server score, partial credit, retry.
- Connection reveal and one deterministic next-activity decision.

### Hours 26–32: trust, quality, and polish

- Keep answer key server-only.
- Add visible validation warning/error states.
- Add loading/progress state for generation.
- Add one teacher dashboard view showing score, mastery, and adaptation reason.
- Add keyboard path and reduced-motion behavior.
- Add a small amount of purposeful delight; no broad animation system.

### Hours 32–38: proof and hardening

- Test invalid model output, wrong client score, unknown A2UI component/action, incomplete submission, Arabic RTL, mobile layout, and retry behavior.
- Add README setup, seeded data, test credentials, and exact demo steps.
- Remove dead routes, unfinished controls, fake claims, and distracting roadmap UI.

### Hours 38–43: demo and submission assets

- Record a sub-three-minute demo with audio.
- Show the teacher-time promise, not architecture diagrams.
- Explicitly say where Codex accelerated implementation and where GPT-5.6 powers the product.
- Prepare repository URL, README, sample data, category, description, and `/feedback` session ID.

### Hours 43–48: freeze

- No new features.
- Rehearse the demo from a clean environment.
- Verify every link and credential.
- Submit early enough to recover from upload or Devpost issues.

### 48-hour kill list

Cut immediately if unfinished:

- full PostgreSQL production schema
- real authentication and school onboarding
- offline/multi-device synchronization
- AI image generation
- Vision asset QA
- full recursive graph traversal
- four genuinely different generated variants
- generic A2UI catalog negotiation
- requiring HTML-in-Canvas or another experimental browser renderer
- sound, confetti, advanced ink tools, and broad dashboards

Use seeded fixtures or deterministic fallbacks for anything not central to the demo. Never fake the core GPT-5.6 → A2UI → approval → student → score path.
