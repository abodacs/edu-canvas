# Edu-Canvas

> Turn a teacher's plain-English or Arabic request into a safe, standards-aligned visual matching lesson in minutes — then give a student an adaptive "aha" moment. **Teachers approve every variant; AI never grades or publishes unreviewed content.**

Adaptive, bilingual (**English / Arabic, RTL**) visual-learning platform for **Grades 3–6**, starting with **Common Core Math**. Built for **OpenAI Build Week** (Education track).

## Why it's different

- **Generative UI, not a chat wrapper.** GPT-5.6 produces a structured _lesson draft_; the server validates it and compiles it into **A2UI v0.9.1** messages from a fixed, allowlisted Edu-Canvas catalog. No generated HTML or JavaScript executes.
- **Browser-safe rendering.** Core lesson interaction uses semantic DOM components through A2UI. Experimental HTML-in-Canvas is optional visual polish and never required for authoring, accessibility, sharing, or grading.
- **Teacher-gated.** Every generated variant is teacher-approved in a bulk review flow before any student sees it.
- **Server-authoritative grading.** The answer key never leaves the server; the client cannot submit a score.
- **Adaptive + explainable.** A curated prerequisite graph drives the next activity; teachers see the reason and can override.

## Stack

- **TanStack Start** (TypeScript, full-stack) · **PostgreSQL** (server-only, tenant-scoped, immutable versions, append-only events/audit)
- **OpenAI GPT-5.6** (server-side only) · **A2UI v0.9.1** wire protocol + custom catalog (SSE ↓ / HTTPS ↑)
- **shadcn/ui Base UI** · Tailwind CSS · logical CSS properties for RTL
- English + Arabic (RTL) · WCAG 2.2 AA · responsive phone → desktop

## Status

🟡 **Foundation, structural generation, and bounded semantic validation are in place; the end-to-end loop is still being built.** [Issue #2](https://github.com/abodacs/edu-canvas/issues/2) provides the TanStack Start runtime, synthetic demo repository, PostgreSQL migrations/seed, health/readiness endpoints, and role-limited demo views. [Issue #3](https://github.com/abodacs/edu-canvas/issues/3) adds the server-side GPT-5.6 path, four structurally validated draft variants, persistence, diagnostics, and retry-safe generation. [Issue #18](https://github.com/abodacs/edu-canvas/issues/18) adds deterministic curriculum and learning-quality reviews with bounded advisory-agent retries; warnings remain teacher-visible and blocks keep drafts out of the public projection. [Issue #28](https://github.com/abodacs/edu-canvas/issues/28) owns the cross-cutting hard safety gate, and [issue #4](https://github.com/abodacs/edu-canvas/issues/4) consumes accepted drafts for allowlisted A2UI preview; approval/publication, grading, and adaptation remain later slices. [Issue #27](https://github.com/abodacs/edu-canvas/issues/27) remains an open correctness blocker before the landing preview can be called learner-safe. The issue-driven product strategy and observed-behaviour plan live in [`docs/product-strategy.md`](docs/product-strategy.md) and [`docs/observed-behaviour.md`](docs/observed-behaviour.md). Implementation is built with **Codex + GPT-5.6** (Devpost requirement).

## Repo layout

| Path                            | What                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `PRD_GRILL_LOG.md`              | 170-question product decision log — the spec                        |
| `DEVPOST_WINNING_STRATEGY.md`   | Competition cut + 48-hour execution plan                            |
| `docs/product-strategy.md`      | North-star outcome, issue-driven loop, and seven-layer audit        |
| `docs/observed-behaviour.md`    | Evidence boundary, job stories, and research plan                   |
| `docs/walking-skeleton.md`      | The thinnest end-to-end demo slice (the build contract)             |
| `docs/foundation-runbook.md`    | Operator/developer setup, redeploy, and handoff checks for issue #2 |
| `docs/release-fly-supabase.md`  | Fly.io + Supabase Postgres release procedure and launch gates       |
| `docs/architecture-harness.md`  | Guardrails for state ownership, layer imports, and contract drift   |
| `docs/agdr/`                    | Agent Decision Records (architecture decisions)                     |
| `docs/security/threat-model.md` | STRIDE threat model                                                 |
| `.impeccable.md`                | Design context                                                      |

## Runtime navigation

Start from the delivery module, then follow the domain-named server module:

| Behavior                               | Start here                                             |
| -------------------------------------- | ------------------------------------------------------ |
| Seeded teacher/student demo            | `src/routes/demo/$role.tsx` → `src/server/demo/`       |
| Teacher lesson generation              | `src/routes/demo/$role.tsx` → `src/server/generation/` |
| Demo role policy and tenant assertion  | `src/server/demo/policy.ts`                            |
| Public demo read model                 | `src/server/demo/read-model.ts`                        |
| Server-function delivery seam          | `src/server/demo/server-function.ts`                   |
| Semantic lesson validation             | `src/server/generation/semantic-validation.ts`         |
| Persistence choice and interface       | `src/server/persistence.ts`                            |
| Seeded/PostgreSQL persistence adapters | `src/server/persistence/`                              |
| Browser-safe demo contract             | `src/shared/demo-contract.ts`                          |
| Browser-safe generation contract       | `src/shared/generation-contract.ts`                    |
| Canonical synthetic curriculum fixture | `src/server/seed-data.ts`                              |
| PostgreSQL seed implementation         | `src/server/persistence/seed-postgres.ts`              |
| Operator seed entry point              | `scripts/db-seed.ts`                                   |

The route should stay a delivery module. Domain rules, tenant checks, persistence choice, and public projection belong behind the named server seams. The shared seam contains only data the browser is allowed to receive.

## End-to-end demo sequence

The walking skeleton below is the target contract: one deterministic, seeded path from a teacher request to a student’s explainable next activity. This branch covers role-limited delivery, persistence, structural teacher draft generation, and #18’s bounded curriculum/learning-quality checks; #28’s hard safety gate, #4’s allowlisted A2UI preview, approval/publication, grading, and adaptation remain issue-driven follow-on slices. See [`docs/product-strategy.md`](docs/product-strategy.md) for the intended order and evidence gaps.

```mermaid
sequenceDiagram
    autonumber
    actor Teacher
    participant TeacherUI as Teacher browser
    participant Server as Edu-Canvas server
    participant GPT as GPT-5.6
    participant Catalog as Validator + A2UI catalog
    participant Store as Seeded repo / PostgreSQL
    actor Student
    participant StudentUI as Student browser
    participant Adapt as Grader + adaptation

    Teacher->>TeacherUI: Enter prompt, grade, standard, language
    TeacherUI->>Server: Submit generation request (HTTPS)
    Server->>GPT: Request constrained lesson draft
    GPT-->>Server: Return structured draft
    Server->>Catalog: Validate structure and bounded curriculum quality
    alt Validation hard-blocks draft
        Catalog-->>Server: hard_block with actionable errors
        Server-->>TeacherUI: Keep draft out of preview and Share
    else Validation passes or warns
        Server->>Catalog: Build reverse prerequisite path and forward story
        Server->>Catalog: Compile validated draft into A2UI
        Catalog-->>TeacherUI: Stream allowlisted A2UI variants and visible warnings (SSE)
        Teacher->>TeacherUI: Review variants, path, story, and warnings
        Teacher->>TeacherUI: Edit and approve four variants
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
    Note over StudentUI,Server: Client never sends a score; no student images or identifying data go to GPT-5.6.
```

## Quick start

The default clean checkout is deterministic and synthetic-data-only; PostgreSQL is optional for local boot.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, or run the full acceptance pipeline:

```bash
pnpm check
pnpm build
pnpm start
pnpm smoke
```

For the PostgreSQL-backed path, start the local dependency and apply the forward-only migration/seed:

```bash
docker compose up -d postgres
set -a; source .env.example; set +a
pnpm db:setup
pnpm dev
```

See [`docs/foundation-runbook.md`](docs/foundation-runbook.md) for configuration, readiness, and safe redeploy details.

## Safety boundaries (non-negotiable, even under deadline pressure)

- Answer key, mastery, and permissions are **server-only** — never present in any client bundle or A2UI message.
- **No student images or identifying data** are sent to the model.
- Real student data is blocked until **DPA + EU-residency + security + consent** approval; the demo uses **synthetic data only**.

## Governance

Governed under [ApexYard](https://github.com/me2resh/apexyard). Per-project governance docs (handover assessment, C4 diagrams) live in the ops portfolio.

_Generated by apexyard `/handover` — review & refine._
