# Edu-Canvas

> **Product promise:** turn a teacher's request into a validated matching lesson, then let the teacher decide the next step. The design keeps the teacher in control: they approve every variant, and AI never grades or publishes unreviewed content.

Edu-Canvas is building an adaptive visual-learning platform for **Grades 3–6**, starting with **Common Core Math**. The goal is a loop teachers return to because preparation, review, and follow-up take less total effort without giving up control. The **Meta AI Developer Hackathon 2026** (October 26 – November 4) is the first external validation milestone. Its event slice is Grade 4 equivalent fractions in English; Arabic is a deferred product goal.

## Why it's different

Our read: drafting standards-aligned materials is commoditizing. Free teacher copilots — Claude for Teachers, ChatGPT for Teachers, MagicSchool — generate plans, differentiation, and checks. The bet is the gated loop those tools do not run: a teacher approves an immutable version, students work through it, the server grades privately, and the teacher sees the evidence behind the next step.

The design differs in five ways:

- **Generative UI, not a chat wrapper.** The generation model produces a structured _lesson draft_; the server validates it and compiles it into **A2UI v0.9.1** messages from a fixed, allowlisted Edu-Canvas catalog. No generated HTML or JavaScript executes.
- **Browser-safe rendering.** Core lesson interaction uses semantic DOM components through A2UI. Experimental HTML-in-Canvas is optional visual polish and never required for authoring, accessibility, sharing, or grading.
- **Teacher-gated.** Every generated variant must be teacher-approved in a bulk review flow before any student sees it. Variants are content options, not teaching stages.
- **Server-authoritative grading.** The answer key stays on the server; the client cannot submit a score.
- **Adaptive and explainable.** A curated prerequisite graph is intended to drive the next activity; teachers see the reason and can override.

## Stack

- **TanStack Start** (TypeScript, full-stack) · **PostgreSQL** (server-only, tenant-scoped, immutable versions, append-only events/audit)
- Generation model behind a server-only provider interface; the exact event-allowed Meta model is recorded once access is proven ([decision C2](docs/design/design-doc-questions.md)) · **A2UI v0.9.1** wire protocol + custom catalog (SSE ↓ / HTTPS ↑)
- **shadcn/ui Base UI** · Tailwind CSS · logical CSS properties
- English (Arabic deferred) · WCAG 2.2 AA · responsive phone → desktop

## Status

🟡 **The generation and teacher-preview path works; the full loop does not.**

| Working now | Next |
| --- | --- |
| TanStack Start runtime, PostgreSQL migrations and seed, server-owned authentication, and health/readiness endpoints ([#2](https://github.com/abodacs/edu-canvas/issues/2)) | Hard safety gate ([#28](https://github.com/abodacs/edu-canvas/issues/28)) |
| Server-side generation with four structurally validated draft variants, persistence, diagnostics, and retry-safe generation ([#3](https://github.com/abodacs/edu-canvas/issues/3)) | Teacher approval and immutable publication ([#5](https://github.com/abodacs/edu-canvas/issues/5)) |
| Deterministic curriculum and learning-quality reviews with bounded advisory-agent retries; warnings stay teacher-visible, and blocks keep drafts out of the public projection ([#18](https://github.com/abodacs/edu-canvas/issues/18)) | Learner attempts and server grading ([#6](https://github.com/abodacs/edu-canvas/issues/6)) |
| Compiles accepted public drafts into a pinned, allowlisted A2UI v0.9.1 catalog and streams a semantic-DOM teacher preview with recoverable connection states ([#4](https://github.com/abodacs/edu-canvas/issues/4)) | Reveal and deterministic adaptation ([#7](https://github.com/abodacs/edu-canvas/issues/7)) |
| Validated, version-pinned prerequisite path and teacher-review blocking states in the preview ([#17](https://github.com/abodacs/edu-canvas/issues/17)) | Teacher evidence and override ([#8](https://github.com/abodacs/edu-canvas/issues/8), [#107](https://github.com/abodacs/edu-canvas/issues/107)) |

[Issue #27](https://github.com/abodacs/edu-canvas/issues/27) is closed (2026-10-21). Re-verify its reported false-success behavior against the release candidate before any learner-safe claim. The issue-driven product strategy and observed-behaviour plan live in [`docs/product-strategy.md`](docs/product-strategy.md) and [`docs/observed-behaviour.md`](docs/observed-behaviour.md).

## Repo layout

| Path | What |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Stack, folder ownership, runtime flows, invariants, change recipes, and the enforcement map |
| [`ROADMAP.md`](ROADMAP.md) | Product direction, delivery order, and validation gates |
| [`docs/README.md`](docs/README.md) | Documentation index and document ownership |
| [`docs/hackathon/meta-global-2026/focused-scope.md`](docs/hackathon/meta-global-2026/focused-scope.md) | Current event execution scope: one teacher-controlled loop, 30 + 6 hours |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, issue reports, commit messages, and verification |
| [`CODING_STANDARDS.md`](CODING_STANDARDS.md) | Code quality rules and links to engineering patterns |
| [`docs/archive/`](docs/archive/README.md) | Archived historical records: hackathon-2026 import plans and file map, engineering method notes, triage logs |
| `docs/product-strategy.md` | North-star outcome, issue-driven loop, and seven-layer audit |
| `docs/observed-behaviour.md` | Evidence boundary, job stories, and research plan |
| `docs/walking-skeleton.md` | The thinnest end-to-end slice (the acceptance contract) |
| `docs/foundation-runbook.md` | Operator/developer setup, redeploy, and handoff checks for issue #2 |
| `docs/release-fly-supabase.md` | Fly.io + Supabase Postgres release procedure and launch gates |
| `docs/architecture-harness.md` | Guardrails for state ownership, layer imports, and contract drift |
| `docs/agdr/` | Agent Decision Records (architecture decisions) |
| `docs/security/threat-model.md` | STRIDE threat model |
| `.impeccable.md` | Design context |

## Runtime navigation

Start from the delivery module, then follow the domain-named server module:

| Behavior | Start here |
| --- | --- |
| Architecture rules and allowed change paths | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Teacher workspace | `src/routes/workspace.tsx` → `src/components/studio/teacher-studio.tsx` |
| Teacher lesson generation | `src/routes/api/lessons/generate.ts` → `src/server/generation/` |
| Server-owned authentication | `src/routes/api/auth/` → `src/server/identity/` |
| Semantic lesson validation | `src/server/generation/semantic-validation.ts` |
| A2UI catalog contract and validation | `src/shared/a2ui-contract.ts` |
| A2UI preview delivery seam | `src/server/a2ui/preview.server.ts` |
| A2UI lesson compiler and SSE delivery | `src/server/a2ui/compiler.ts` → `src/server/a2ui/stream.ts` |
| Semantic A2UI preview renderer | `src/components/a2ui/lesson-preview.tsx` |
| Persistence composition | `src/server/persistence.ts` |
| PostgreSQL persistence adapters | `src/server/persistence/` |
| Browser-safe generation contract | `src/shared/generation-contract.ts` |
| Canonical synthetic curriculum fixture | `src/server/seed-data.ts` |
| PostgreSQL seed implementation | `src/server/persistence/seed-postgres.ts` |
| Operator seed entry point | `scripts/database-seed.ts` |

The route should stay a delivery module. Domain rules, tenant checks, persistence choice, and public projection belong behind the named server seams. The shared seam contains only data the browser is allowed to receive.

## Target loop (not yet implemented)

The diagram is the target contract, not current behavior: one deterministic, seeded path from a teacher request to a student’s explainable next activity. The current checkout implements the generation and teacher-preview portion only. The hard safety gate, approval/publication, grading, and adaptation remain follow-on slices. See [`docs/product-strategy.md`](docs/product-strategy.md) for the intended order and evidence gaps.

```mermaid
sequenceDiagram
    autonumber
    actor Teacher
    participant TeacherUI as Teacher browser
    participant Server as Edu-Canvas server
    participant Model as Generation model (server-side)
    participant Catalog as Validator + A2UI catalog
    participant Store as Seeded repo / PostgreSQL
    actor Student
    participant StudentUI as Student browser
    participant Adapt as Grader + adaptation

    Teacher->>TeacherUI: Enter prompt, grade, standard, language
    TeacherUI->>Server: Submit generation request (HTTPS)
    Server->>Model: Request constrained lesson draft
    Model-->>Server: Return structured draft
    Server->>Catalog: Validate structure and bounded curriculum quality
    alt Validation hard-blocks draft
        Catalog-->>Server: hard_block with actionable errors
        Server-->>TeacherUI: Keep draft out of preview and Share
    else Validation passes or warns
        Server->>Catalog: Build reverse prerequisite path and forward story
        Server->>Catalog: Compile validated draft into A2UI
        Catalog-->>TeacherUI: Stream allowlisted A2UI variants and visible warnings (SSE)
        Teacher->>TeacherUI: Review variants, path, story, and warnings
        Teacher->>TeacherUI: Edit and approve the four content variants
        TeacherUI->>Server: Publish approved pack (HTTPS)
        Server->>Catalog: Re-run hard safety gate before Share
        alt Share hard-blocked
            Catalog-->>Server: hard_block with actionable errors
            Server-->>TeacherUI: Keep pack unpublished and explain the block
        else Safe to publish
            Server->>Store: Persist immutable activity/version
            Store-->>Server: Return published pack
            Server-->>TeacherUI: Confirm pack is ready
        end

        Student->>StudentUI: Open assigned activity
        StudentUI->>Server: Request public activity (HTTPS)
        Server->>Store: Load approved activity/version
        Store-->>Server: Return public activity data
        Server-->>StudentUI: Render allowlisted A2UI activity (SSE)
        Student->>StudentUI: Select matching targets and submit
        StudentUI->>Server: Send selection events only (HTTPS)
        Server->>Adapt: Grade using private answer key
        Adapt->>Store: Store immutable attempt and version references
        Adapt->>Store: Read prerequisite graph
        Adapt-->>Server: Score, reveal, and deterministic next activity
        Server-->>StudentUI: Show score, connection reveal, next activity
        Server-->>TeacherUI: Show mastery state and adaptation reason
    end

    Note over Server,Adapt: Answer key, mastery, and permissions stay server-side.
    Note over StudentUI,Server: Client never sends a score; no student images or identifying data go to the model.
```

## Quick start

PostgreSQL and a server-side provider credential are required:

```bash
docker compose up -d postgres
pnpm install
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
export OPENAI_API_KEY=<server-side-key>
pnpm db:setup
pnpm dev
```

Open `http://localhost:3000`, or run the full acceptance pipeline:

```bash
pnpm check
pnpm build
pnpm start
pnpm smoke
```

See [`docs/foundation-runbook.md`](docs/foundation-runbook.md) for configuration, readiness, and safe redeploy details.

## Safety boundaries (non-negotiable, even under deadline pressure)

- Answer key, mastery, and permissions are **server-only** — never present in any client bundle or A2UI message.
- **No student images or identifying data** are sent to the model.
- Real student data is blocked until a **data-processing agreement (DPA), EU residency, security review, and consent** are in place; milestone deployments use **synthetic data only**.

## Governance

Governed under [ApexYard](https://github.com/me2resh/apexyard). Per-project governance docs (handover assessment, C4 diagrams) live in the ops portfolio. The README was originally generated by apexyard `/handover` and is maintained with the project.
