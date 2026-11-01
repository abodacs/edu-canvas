# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: Grades 3–6 teachers.** They prepare, review, and approve lessons. A teacher writes a plain-language objective, reviews four validated variants, edits one section at a time, approves, publishes, and assigns the lesson to a learner. Teachers make the final decision on everything a student sees.
- **Secondary: their students (ages 8–11).** A student opens an assigned link and does one focused activity (today a matching board), with feedback graded on the server and a clear next action.
- **Open:** where students do the activity (shared classroom devices, projector, or home devices) is not decided. Do not assume a device context.

## Product Purpose

Edu-Canvas is a lesson-preparation workspace that turns one learning objective into a lesson students understand. The model drafts. The server checks structure, curriculum quality, and safety. The teacher approves. Success means a teacher prepares, reviews, and follows up in less total time than their current method, can explain every learning decision, and can correct or reject any generated content.

The current release covers Grade 4 equivalent fractions (Common Core `4.NF.A.1`), in English only.

## Positioning

It is not a chat wrapper or worksheet generator. Generated content is structured data. It is validated before it renders and compiled into a fixed, allowlisted A2UI v0.9.1 catalog, and no generated HTML or JavaScript runs in the browser. Two things set it apart: a visible teacher trust boundary (nothing reaches a student without a teacher-approved, immutable version), and an explainable prerequisite path with a brief next-step story that shows what comes before and after, and why.

## Operating Context

Screens, their audiences, and their states:

| Route | Who | Purpose | States |
| --- | --- | --- | --- |
| `/` | public | Hero, loop diagram, hard-coded reveal sample, CTAs | static; signed-in header; signed-out banner via `?signedOut=1` |
| `/login` | public | Email + password | idle, submitting, field errors, six failure notices, success leads to membership or workspace |
| `/sign-up` | public | Teacher registration | idle, submitting, field errors, rate-limited, 30 s resend cooldown, unavailable |
| `/login` (membership) | pending auth | School picker | list, submitting, error, 5-minute expiry |
| `/workspace` | teacher | Studio, review, session controls | loading, unavailable, unauthenticated (redirects to `/login`), expired banner, revalidating, learner-account notice |
| `/learn` | student | Matching board | session loading, not-student, missing params, run loading, ready, saving, done, error |
| `/api/a2ui/preview` | server | Compiled preview fragment | 401/403/404/503 |
| `/api/publications/versions/:id/preview` | teacher | Stored version preview | 401/403/404/503 |

Studio sub-states: empty composer, generating, ready-for-review, blocked-by-validation, blocked-by-moderation, failed-retryable, failed-terminal, then review loading, review ready, review error.

User flows:

- **Auth:** sign up, sign in, pick a membership, open the workspace.
- **Draft:** prompt plus optional source, generate, four variants, preview tabs, open review.
- **Review:** open review, edit one section (creates a new version), approve each variant and the reverse path, acknowledge warnings, publish, assign one learner.
- **Learner:** open a link with assignment and variant, open the run, pair sources, press Done, see the score.
- **Recovery:** retry with the same input, cancel generation, moderation block, dismiss a review error.
- **Session:** idle warning, then continue or expire, then sign out.

## Capabilities and Constraints

- Grounding comes from the Learning Commons REST adapter. Each generation stores an immutable source snapshot. When grounding fails: one retry, then lesson upload (selectable-text PDF, TXT, Markdown). Model recall never silently substitutes for source grounding.
- A deterministic safety gate hard-blocks unsafe drafts before preview and before publication. Warnings stay visible for teacher review.
- Answer keys, mastery logic, and permissions stay on the server. The client never submits a score.
- Catalogs today: `matching-v1` and `fractions-v2`. LaTeX must render correctly in teacher preview and learner output.
- Synthetic data and seeded accounts only, until the consent and residency gates pass. No real student data.
- Arabic is a deferred product goal. No RTL commitment is recorded.
- Stack: TanStack Start, React 19, TypeScript, Tailwind CSS, Base UI (shadcn/ui conventions), PostgreSQL with Drizzle.

## Brand Commitments

- Name: **Edu-Canvas** (binding).
- Tagline: **"Turn one learning objective into a lesson your students understand."** (binding).
- Hanken Grotesk is the font in use today. It is not a binding commitment.

## Evidence on Hand

- Product docs: `README.md`, `docs/product-strategy.md`, `docs/product/teacher-ui.md`, `docs/design/`.
- The landing page's reveal sample is hard-coded, not real learner output.
- No teacher testimonials, pilot results, customer names, or usage metrics exist. Do not fabricate them. Hackathon validation is tracked in `docs/hackathon/`.

## Product Principles

1. **The teacher keeps judgment.** The system drafts and explains. It never silently publishes or changes an approved version.
2. **Show the trust boundary.** Validation results, safety blocks, warnings, grounding sources, and coverage gaps are visible, not hidden.
3. **Explain every learning decision.** The prerequisite path and next step are inspectable artifacts.
4. **Make each student moment focused.** One activity, plain instructions, feedback the student understands, a clear next action.
5. **Narrow and right beats broad.** One polished wedge before broad curriculum coverage.

## Accessibility & Inclusion

WCAG 2.2 AA on both teacher and learner surfaces. Learner surfaces use semantic DOM, not canvas-only interaction, and serve readers aged 8–11.
