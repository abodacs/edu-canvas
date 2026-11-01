# Edu-Canvas

> Turn one learning objective into a lesson your students understand.

Edu-Canvas is an adaptive lesson-preparation workspace for teachers of Grades 3–6. The current release focuses on Grade 4 equivalent fractions in Common Core Math. English ships first; Arabic is a deferred product goal.

A teacher describes an objective and gets four structured lesson variants, validated and ready to review in one place. The model drafts; the server checks structure, curriculum quality, and safety; the teacher keeps the final decision.

This is not a chat wrapper. Generated content is structured data, validated before it renders, and compiled into a fixed UI catalog. No generated HTML or JavaScript executes in the browser.

## The problem

Lesson planning is slow, repetitive, and hard to adapt to the real needs of a classroom.

Most AI tools for teachers:

- generate generic content
- do not validate against standards or learning quality
- are not built for explainable adaptation
- blur the line between teacher guidance and untrusted model output

For Grades 3–6 the gap is sharper: teachers need content that is age-appropriate, aligned, and safe to put in front of students.

## What Edu-Canvas does

Edu-Canvas is built around one teacher-controlled loop:

1. A teacher enters a topic, grade, standard, and learning goal.
2. The system generates four structured lesson variants, each validated before display.
3. The teacher reviews, edits, and approves the version students receive.
4. Students work through the approved activity with server-side validation.
5. The teacher sees the learning path, the evidence, and a proposed next step.

Generation, review, approval, publication, and server-side learner grading work today. Teacher evidence and the proposed next step are the next slices; the [Status](#status) section separates what ships from what is planned.

## Why it matters

- Saves teacher preparation time
- Keeps the teacher in the decision loop
- Produces explainable, standards-aware learning flows
- Keeps answer keys and private rules on the server
- Makes classroom AI safer and easier to defend

## Why it is different

These are the design commitments. The status table below shows which ones the current build enforces end to end.

- **Teacher-gated.** Every variant is a content option, not a teaching stage. Nothing reaches a student without a teacher-approved, immutable version.
- **Server-authoritative.** Answer keys, mastery logic, and permissions stay server-side; the client never submits a score.
- **Explainable.** A curated prerequisite path and a forward story explain what comes before and after, and why.
- **Structured, not conversational.** The model returns a validated lesson draft that compiles into an allowlisted **A2UI v0.9.1** catalog.
- **Safety-first.** A deterministic gate hard-blocks unsafe drafts before preview and before publication.

## Built with

- [TanStack Start](https://tanstack.com/start) with React 19 and TypeScript
- PostgreSQL with [Drizzle ORM](https://orm.drizzle.team)
- Tailwind CSS and Base UI (shadcn/ui conventions)
- A2UI v0.9.1 over SSE, with the `matching-v1` and `fractions-v2` catalogs
- Zod contracts and Vitest
- Node.js 26 and pnpm 10.17.1

## Product flow

The loop below is the target contract. The green block is available now; the amber block is the work in flight.

```mermaid
sequenceDiagram
    autonumber
    actor Teacher
    participant UI as Edu-Canvas UI
    participant Server as Edu-Canvas server
    participant Model as Generation model
    participant Catalog as Validator + A2UI catalog
    participant Store as PostgreSQL / seeded store
    actor Student

    rect rgb(226, 242, 233)
        Note over Teacher,Catalog: Available today
        Teacher->>UI: Enter objective, grade, standard, language
        UI->>Server: Submit lesson request
        Server->>Model: Request structured draft
        Model-->>Server: Return structured draft
        Server->>Catalog: Validate structure, safety, and curriculum quality
        Catalog-->>Server: Pass, warn, or hard-block
        Server-->>UI: Stream allowlisted A2UI variants (SSE)
        Teacher->>UI: Review variants, learning path, and warnings
    end

    rect rgb(255, 244, 224)
        Note over UI,Student: Target — not built yet
        Teacher->>UI: Approve and publish the pack
        UI->>Server: Publish request
        Server->>Store: Persist immutable activity version
        Student->>UI: Open assigned lesson
        UI->>Server: Request public activity
        Server-->>UI: Render approved learning content
        Student->>Server: Submit answers
        Server-->>Student: Grade, reveal, and recommend the next activity
    end
```

## Demo

A short screen capture is the strongest proof of value. Record only the working teacher path:

- a teacher prompt and the generated variants
- the validation warnings and the blocked-draft state
- the A2UI preview, learning path, and forward story

Do not present the approval, student, or grading screens as live behavior until those slices land. The [demo script](docs/hackathon/meta-global-2026/demo-script.md) keeps the full shot list and the claim boundaries.

## Quick start

Requires Node.js 26 or newer and pnpm 10.17.1.

```bash
docker compose up -d postgres
pnpm install
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
export OPENAI_API_KEY=<server-side-key>
pnpm db:setup
pnpm dev
```

Open `http://localhost:3000`. A clean checkout needs no environment file: it uses deterministic synthetic fixtures and a fixture provider.

Run the full verification pipeline:

```bash
pnpm check
pnpm build
pnpm start   # in one terminal
pnpm smoke   # in another
```

### PostgreSQL-backed local setup

```bash
docker compose up -d postgres
set -a; source .env.example; set +a
export OPENAI_API_KEY=<server-side-key>
pnpm db:setup
pnpm dev
```

PostgreSQL and a server-side provider key are required; there is no in-memory runtime fallback. See the [foundation runbook](docs/foundation-runbook.md) for configuration, readiness, and redeploy details.

## Status

🟡 **The teacher-to-student loop runs end to end on synthetic data. Adaptation and teacher evidence do not.**

| Working now | Next |
| --- | --- |
| Teacher accounts, sign-in, sessions, and membership state | Connection reveal and deterministic next activity ([#7](https://github.com/abodacs/edu-canvas/issues/7)) |
| Structured generation of four variants with retry-safe persistence | Teacher evidence, override, and pause ([#8](https://github.com/abodacs/edu-canvas/issues/8), [#107](https://github.com/abodacs/edu-canvas/issues/107)) |
| Curriculum, learning-quality, and hard safety validation, including the artifact gate | Teacher-facing moderation recovery ([#119](https://github.com/abodacs/edu-canvas/issues/119)) |
| Allowlisted A2UI preview over SSE, including fractions and native MathML | Deployment quotas, rollback, and monitoring gates ([#104](https://github.com/abodacs/edu-canvas/issues/104)) |
| Review versions, per-target approval, and immutable publication ([#5](https://github.com/abodacs/edu-canvas/issues/5)) | — |
| Learner assignment, the `/learn` board, and server-authoritative grading ([#6](https://github.com/abodacs/edu-canvas/issues/6)) | — |
| Prerequisite learning path and forward story in the preview | — |
| PDF, TXT, and MD source upload with explicit gap states | — |
| PostgreSQL and seeded persistence, health checks, security headers | — |

The [Meta AI Developer Hackathon 2026](docs/hackathon/meta-global-2026/README.md) (October 26 – November 4) is the first external validation milestone, not the product goal. The architecture document records the implemented flows and the gaps in detail: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Safety boundaries (non-negotiable, even under deadline pressure)

- Answer key, mastery, and permissions are **server-only** — never present in any client bundle or A2UI message.
- **No student images or identifying data** are sent to the model.
- Real student data is blocked until a **data-processing agreement (DPA), EU residency, security review, and consent** are in place; milestone deployments use **synthetic data only**.

## Repository layout

| Path | What |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Runtime architecture, invariants, and engineering boundaries |
| [`ROADMAP.md`](ROADMAP.md) | Product direction and delivery roadmap |
| [`docs/README.md`](docs/README.md) | Documentation index and document ownership |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, issue reports, and contribution checks |
| [`CODING_STANDARDS.md`](CODING_STANDARDS.md) | Engineering quality rules |
| [`docs/hackathon/meta-global-2026/focused-scope.md`](docs/hackathon/meta-global-2026/focused-scope.md) | Current event scope and execution plan |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | STRIDE threat model against implemented paths |
| [`docs/agdr/`](docs/agdr/) | Architecture decision records |

## Where the code lives

| Behavior | Start here |
| --- | --- |
| Teacher workspace | `src/routes/workspace.tsx` → `src/components/studio/teacher-studio.tsx` |
| Generation service and provider seam | `src/server/generation/service.ts` → `provider.ts` |
| Curriculum and learning-quality validation | `src/server/generation/curriculum-validator.ts`, `learning-quality-validator.ts` |
| Hard safety gate | `src/server/safety/artifact-gate.ts` → `artifact-enforcement.ts` |
| A2UI compiler and SSE delivery | `src/server/a2ui/compiler.ts` → `stream.ts` |
| Preview delivery seam | `src/server/a2ui/preview.server.ts` |
| Allowlisted catalog contract | `src/shared/a2ui-contract.ts` |
| Identity, sessions, and membership | `src/server/identity/` |
| Persistence adapters and migrations | `src/server/persistence/`, `drizzle/` |
| Source grounding and uploads | `src/server/grounding/` |
| Health checks and operator scripts | `src/server/health.server.ts`, `scripts/` |

Routes stay delivery modules. Domain rules, tenant checks, and public projections belong behind the named server seams; `src/shared/` holds only data the browser is allowed to receive.

## Governance

This project is governed under [ApexYard](https://github.com/me2resh/apexyard), with additional engineering and operational documentation stored in the repo.

## Additional documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`ROADMAP.md`](ROADMAP.md)
- [`docs/README.md`](docs/README.md)
- [`docs/foundation-runbook.md`](docs/foundation-runbook.md)
- [`docs/security/threat-model.md`](docs/security/threat-model.md)
- [`docs/hackathon/meta-global-2026/demo-script.md`](docs/hackathon/meta-global-2026/demo-script.md)
