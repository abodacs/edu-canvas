# Edu-Canvas

> Turn a teacher's plain-English or Arabic request into a safe, standards-aligned visual matching lesson in minutes — then give a student an adaptive "aha" moment. **Teachers approve every variant; AI never grades or publishes unreviewed content.**

Adaptive, bilingual (**English / Arabic, RTL**) visual-learning platform for **Grades 3–6**, starting with **Common Core Math**. Built for **OpenAI Build Week** (Education track).

## Why it's different

- **Generative UI, not a chat wrapper.** GPT-5.6 produces a structured _lesson draft_; the server validates it and compiles it into **A2UI v0.9.1** messages from a fixed, allowlisted Edu-Canvas catalog. No generated HTML or JavaScript executes.
- **Teacher-gated.** Every generated variant is teacher-approved in a bulk review flow before any student sees it.
- **Server-authoritative grading.** The answer key never leaves the server; the client cannot submit a score.
- **Adaptive + explainable.** A curated prerequisite graph drives the next activity; teachers see the reason and can override.

## Stack

- **TanStack Start** (TypeScript, full-stack) · **PostgreSQL** (server-only, tenant-scoped, immutable versions, append-only events/audit)
- **OpenAI GPT-5.6** (server-side only) · **A2UI v0.9.1** wire protocol + custom catalog (SSE ↓ / HTTPS ↑)
- **shadcn/ui Base UI** · Tailwind CSS · logical CSS properties for RTL
- English + Arabic (RTL) · WCAG 2.2 AA · responsive phone → desktop

## Status

🟡 **Foundation slice in progress.** Issue #2 now provides the TanStack Start runtime, synthetic demo repository, PostgreSQL migrations/seed, health/readiness endpoints, and role-limited demo views. Lesson generation remains in issue #3. Implementation is built with **Codex + GPT-5.6** (Devpost requirement).

## Repo layout

| Path                            | What                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `PRD_GRILL_LOG.md`              | 170-question product decision log — the spec                        |
| `DEVPOST_WINNING_STRATEGY.md`   | Competition cut + 48-hour execution plan                            |
| `docs/walking-skeleton.md`      | The thinnest end-to-end demo slice (the build contract)             |
| `docs/foundation-runbook.md`    | Operator/developer setup, redeploy, and handoff checks for issue #2 |
| `docs/architecture-harness.md`  | Guardrails for state ownership, layer imports, and contract drift   |
| `docs/agdr/`                    | Agent Decision Records (architecture decisions)                     |
| `docs/security/threat-model.md` | STRIDE threat model                                                 |
| `.impeccable.md`                | Design context                                                      |

## Runtime navigation

Start from the delivery module, then follow the domain-named server module:

| Behavior                               | Start here                                       |
| -------------------------------------- | ------------------------------------------------ |
| Seeded teacher/student demo            | `src/routes/demo/$role.tsx` → `src/server/demo/` |
| Demo role policy and tenant assertion  | `src/server/demo/policy.ts`                      |
| Public demo read model                 | `src/server/demo/read-model.ts`                  |
| Server-function delivery seam          | `src/server/demo/server-function.ts`             |
| Persistence choice and interface       | `src/server/persistence.ts`                      |
| Seeded/PostgreSQL persistence adapters | `src/server/persistence/`                        |
| Browser-safe demo contract             | `src/shared/demo-contract.ts`                    |
| Canonical synthetic curriculum fixture | `src/server/seed-data.ts`                        |
| PostgreSQL seed implementation         | `src/server/persistence/seed-postgres.ts`        |
| Operator seed entry point              | `scripts/db-seed.ts`                             |

The route should stay a delivery module. Domain rules, tenant checks, persistence choice, and public projection belong behind the named server seams. The shared seam contains only data the browser is allowed to receive.

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
