# Small software factory

Deliver features end-to-end with agents. One owner, one loop, minimum prose.

Synthesizes the owner's skills and agent-architecture research notes, retained in the local notes workspace (`.worktrees/hackthon-docs/`), not tracked here. This document absorbs the 2026-10-24 factory blind-spot review (formerly `factory-blindspots.md`, deleted on consolidation) and carries its probe results, re-verified the same day.

> **Dated context, 2026-10-24.** The "Harness and routing", "Skill roster", and "Apexyard" sections record the owner's personal tooling decisions on that date, as do the specific skills named inside the feature loop. They are not repository requirements. The repository guardrails ("The cage") and the feature loop's stages and gates are.

Harness: the owner selects and configures the agent harness personally (decision recorded 2026-10-24); that choice is dated context, not a repository standard. No CLAUDE.md unless the owner asks.

The [design doc](../design/design-doc.md) feeds this factory's stage 0 (intake); its Open issues carry the sprint-level blockers.

## Principle: inverse pyramid of leverage

Put the most effort at the top. The least at the bottom.

1. **Codebase** — canonical slices, typed extension points, generators. Agents copy what they see.
2. **Static analysis** — types, lint, architecture checks. Reject bad code in 5 ms.
3. **Prose** — AGENTS.md and skills. Glue only. Never a rule a linter could own.
4. **Human review** — judgment calls only.

Rule: any rule that can move up a level must move up. Don't review the code — design the cage.

## The cage (already in this repo)

| Guardrail | Command |
| --- | --- |
| Format + lint + styles | `pnpm fix` (ultracite), `pnpm lint`, `pnpm lint:styles` |
| Types | `pnpm typecheck`, `pnpm typecheck:tsrs` |
| Tests | `pnpm test`, `pnpm test:database` (contract) |
| Build | `pnpm build` |
| Architecture | `pnpm verify:architecture` — layer ownership, state ownership, delivery seams, contract ownership |
| Client boundary | `pnpm verify:client-boundary` — secret and answer-key leakage |
| Everything | `pnpm check` |

Database contract tests need the local Postgres container up first: `docker compose up -d postgres`. The checked-in `.env` points `DATABASE_URL` at `127.0.0.1:5432`, and vitest does not load `.env` — source it before running (`set -a; . ./.env; set +a`).

Gap rule: a new architectural rule goes into `verify-architecture` or ESLint. Never into prose.

## Feature loop (end to end)

**0. Intake.** Pressure-test the request with the owner's intake skill (dated roster below). Write every decision back into the ticket. The ticket is the permanent record. Acceptance criteria are checkpoints: goal, validation, evidence. Not prose.

**1. Scaffold.** Copy the nearest canonical slice. One obvious pattern per concern. No new abstractions. Delete deprecated code first — old code is an example agents copy.

**2. Build.** Agent implements inside the slice. Persistence, state, and cross-cutting concerns go through existing typed seams. Skills enter only where judgment is needed (roster below).

**3. Gate.** `pnpm check` must pass. Persistence-touching changes also run `pnpm test:database` with the container up. Loop-facing changes get a browser pass. Attach evidence per checkpoint.

**4. Review.** Reviewer agent reads the diff. Max 3 fix rounds; on cap, revert the branch and write a descope note (standing rule 1). A recurring finding becomes a lint rule, arch check, or test — never another explanation.

**5. Ship.** One slice per PR. Owner reads the summary and checkpoint evidence. The cage already read the rest.

**6. Learn.** Escaped defects get encoded only under standing rule 3. Everything else goes to the post-event backlog. Prose shrinks every week, or the factory is drifting.

## Harness and routing

The owner routes factory work through a personal task-triage and playbook layer (owner decision 2026-10-24). Its mechanics live in personal tooling outside this repository; the project contract is the feature loop above, not the routing layer.

- Skills are shared across the owner's agent harnesses from a personal skill directory outside the repository (58 installed 2026-10-24).
- Per-role model routing lives in a personal configuration outside the repository, with a `large (xhigh)` budget and cheaper workhorse roles. Model changes require re-running the owner's setup step.
- The owner's support tools (slop cleanup, app control) are editor plugins; their documented fallbacks are a manual slop pass before commit and Playwright/CDP or PTY for app control.

Re-run the owner's model-setup step after any model-plan change. Model or harness updates mid-sprint only on breakage (blind spot 9).

## Skill roster (prose layer, glue only)

Personal roster, owner decision 2026-10-24. Stages name the owner's preferred skills, not a repository requirement.

| Stage | Skill | Note |
| --- | --- | --- |
| Plan | `/grill-me` | Pressure-test the request; decisions go back into the ticket |
| Design taste | `/ask-matt` or `/critique` | Second opinion on UX/arch judgment |
| React quality | `vercel-react-best-practices` | Apply to agent-generated components |
| Simplify | `/simple` | Cut complexity before review |
| E2E test | `browser-use:web-gui-tester` | Dry-run validated 2026-10-24 (see blind spot 7) |
| Animation | `/animate` | Only after the loop is green |
| Security pass | `/audit` + `modern-web-guidance` | Before the demo |

## Standing rules (factory law, owner-ratified 2026-10-24)

1. **Review-cap revert.** At the 3-round cap the agent reverts the branch and writes a descope note. The owner rethinks at the next session start, with the day intact. A capped feature never waits overnight.
2. **Overnight command allowlist.** Unattended build/test agents get the cage only: test, build, lint, typecheck. Never `db:*`, deploys, `gh pr merge`, or dependency bumps. The owner executes those.
3. **Encode threshold.** Encode a recurring failure into a rule only if it occurred twice and the fix takes under 15 minutes. Everything else goes to the post-event backlog file.

## Apexyard

Apexyard owns the repo-governance layer: AgDR records, hooks, golden-path CI. Wiring is live (verified 2026-10-24):

- **Setup** ran 2026-10-20/21 in split-portfolio mode: the public ApexYard fork plus a private sibling holding the owner's project registry, onboarding profile, and agent-routing configuration. Ops-fork git hooks installed (`core.hooksPath = .githooks`).
- **Handover** assessed edu-canvas 2026-10-20: registered `P0`, status `handover`, harnessability `moderate`. Status returns to `active` when #27 and #28 close.
- **Hooks** governing agent turns: block-git-add-all, block-main-push, check-secrets, pre-push-gate, validate-branch-name, validate-pr-create.
- **AgDRs** 0001–0004 live under `docs/agdr/`; architectural decisions enter there, not prose.
- **CI golden paths**: `foundation.yml` + `ai-code-review.yml` tracked; `security.yml` + `pr-title-check.yml` copied into the sprint worktree on 2026-10-24 (the #71 gap — commit them as the sprint's first governance PR).
- **LSP**: `typescript-language-server` 6.0.2 installed, `ENABLE_LSP_TOOL=1` set; review and handover deep-dives get the cheap semantic path.

Gate map: a loop feature cannot merge without the cage (above) plus the apexyard pre-push gate.

## Blind-spot review (2026-10-24)

Probes marked **ran** were executed. Numbering matches the original review so cross-references ("factory blindspot N") stay valid.

### Facts established

| Probe | Result | Meaning |
| --- | --- | --- |
| **Ran:** full gate `pnpm check` | PASS, exit 0, 58.8 s | The cage is green and cheap. Run it per feature, not per day. |
| **Ran:** DB contract suite | First run failed — `ECONNREFUSED 127.0.0.1:5432`; after `docker compose up -d postgres`, 6/6 PASS in 3.5 s | The suite works; the container was simply down. The green gate covers persistence when the container runs. |
| **Ran:** web-gui-tester dry run | PASS — landing SSR renders, client-side nav to `/demo/teacher` works, teacher studio renders | Browser automation drives the TanStack Start stack. Notes: scroll below-fold targets into view first (GSAP entrance animations block actionability); wait after client-side navigation before snapshotting. |
| **Ran:** base rebase | `main` fast-forwarded `ad5717d` → `d3bd409` (`origin/main`); 5 stale worktree entries pruned; sprint worktree `.worktrees/sprint` created on `sprint/hackathon-2026` | Sprint base fixed. |
| **Ran:** pstack install | 58 skills installed to codex, claude code, zcode; role config written | Full poteto-mode routing is executable. |
| **Ran:** repo base (was) | Checkout on merged side branch `test/GH-79`; local `main` stale at July | Fixed by the rebase above. The docs corpus that lived in this checkout migrated into tracked `docs/` on 2026-10-24. |
| **Ran:** docs location | `.worktrees/` is git-ignored; `hackthon-docs` is a plain directory, not a worktree | Corpus untracked at probe time; superseded 2026-10-24 when the corpus moved into tracked `docs/` (blind spot 1 resolved). |
| **Ran:** issue states | #28, #5, #6, #7, #8, #9, #10, #74 OPEN; #27 CLOSED; #75 is a merged PR | The loop is greenfield. No canon exists yet. |
| **Ran:** `gh auth status` | Authenticated | PR flow works. |
| **Ran:** tooling config | pnpm ignores `pnpm.onlyBuiltDependencies` (warning on every run) | Config drifts without any gate noticing. |

### Blind spots

**1. The plans are outside version control.** ROADMAP, hackathon plans, blind-spot reviews, the factory doc, and all notes live in a git-ignored directory. One `git clean -fdx` or disk event erases the sprint plan. *Status:* owner chose to keep it uncommitted on 2026-10-24. The standing fix — `git add -f .worktrees/hackthon-docs` on a `docs/hackathon-2026` branch, or move it under tracked `docs/` — remains the default the moment the owner reverses that call. *Update 2026-10-24:* resolved — the corpus was imported into tracked paths (PR 01 of `docs/plans/hackathon-2026-pr-stack.md`); the original directory stays local until the merged copy is verified from a clean checkout.

**2. A green gate is not a working loop.** The DB contract suite is now proven (facts table), and web-gui-tester drives the stack, but no product-level E2E of the loop has run — the loop itself is unbuilt. The DB suite joins the pre-freeze run on Oct 31. Use a manual demo checklist until an E2E proves itself.

**3. The sprint must start from the right base.** Resolved 2026-10-24: `main` fast-forwarded to `origin/main`, stale worktrees pruned, sprint worktree created. Features build from `.worktrees/sprint`, not this checkout.

**4. No canonical slice exists for the loop.** All loop issues are OPEN; stage 1 says "copy the nearest canonical slice" and none exists yet. Treat #28 as canonization work — review it twice as hard. Features #5→#8 then copy a reviewed pattern, not a first draft.

**5. The "learn" stage competes with shipping.** The source evidence for rule-encoding came from team-scale regimes; this is one person with 30 hours. Now standing rule 3: encode only twice-seen failures with sub-15-minute fixes; everything else defers to the post-event backlog.

**6. Unattended runs have no guardrails.** Factory agents get full `pnpm`, which includes `db:migrate`, deploys, and dependency bumps. Now standing rule 2: the overnight allowlist. Write nothing further before the first overnight run — the rule is already law.

**7. The skill roster is unvalidated.** Validated so far: `web-gui-tester` (dry run, facts table) and the pstack install. Still owing one dry run each: `/ask-matt`, `/critique`, `/simple`, `/animate`, `/audit`. Drop any skill that fails its dry run — plain prompting may beat a mediocre skill.

**8. Review-cap escalation stalls overnight.** Resolved as standing rule 1: on cap, revert and descope; the owner rethinks next session.

**9. Tool and model drift mid-sprint.** Freeze tool versions for the sprint; update only on breakage, never for novelty (design doc, Dependencies). The pnpm warning already shows config drifting under a stable repo. The pstack model config is versioned by intent — re-run `/setup-pstack` only when the plan changes.

### Probes still pending

| Probe | Surprise it can reveal |
| --- | --- |
| One unattended overnight run under the allowlist | What agents attempt when nobody watches |
| Re-run the full gate after the first loop feature | The cage may not cover seams the loop newly creates |
| Roster dry runs: `/ask-matt`, `/critique`, `/simple`, `/animate`, `/audit` | A mediocre skill costs more than plain prompting |
| Application status check | Owned by the [sprint guide](../hackathon/meta-global-2026/README.md) (V1) — if not submitted by Oct 25, 23:59 ET, all factory work is moot |
