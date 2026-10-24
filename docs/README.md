# Edu-Canvas documentation

Research, ideas, and references grouped by topic, imported from the hackathon-2026 notes workspace on 2026-10-24. The [import plan](plans/hackathon-2026-pr-stack.md) defines the mapping; the [change record](plans/hackathon-2026-import-changes.md) lists every deliberate edit against the source map. Ownership was reconciled on 2026-10-25 (PR 02, [#89](https://github.com/abodacs/edu-canvas/issues/89)): every requirement has one owning document.

## Document ownership

| Document | Owns |
| --- | --- |
| [Root README](../README.md) | Repository overview, stack, quick start, and safety boundaries |
| [ROADMAP.md](../ROADMAP.md) | Product outcomes, release boundaries, lifecycle gates, and deferred commitments |
| [Sprint guide](hackathon/meta-global-2026/README.md) | Event scope, eligibility assumptions, schedule, risks, and execution decisions |
| [Validation tracker](hackathon/meta-global-2026/validation-tracker.md) | V1–V16 evidence gates, dated observations, and evidence links |
| [Demo script](hackathon/meta-global-2026/demo-script.md) | Recording sequence and bounded claims |
| [Teacher UI decisions](product/teacher-ui.md) | Explicit UI requirements and the existing implementation gate |
| [Delivery priorities](product/delivery-priorities.md) | Proposed sequencing, skill recommendations, and writing guidance |
| [Design overview](design/design-doc.md) | Technical contracts, defaults, and design decisions ("One Useful Loop") |
| [Implementation contracts](design/design-doc-implementation.md) | Records, deadlines, commands, estimate, and acceptance checks AC01–AC24 |
| [Decision record](design/design-doc-questions.md) | Answers to design questions Q1–Q20 and UQ1–UQ5 |
| [Reading guide](design/design-doc-reading-guide.md) | Terms and writing rules for the design documents |
| [Product strategy](product-strategy.md) | Problem, target users, alternatives, value hypothesis, and evidence limits |
| [Walking skeleton](walking-skeleton.md) | Current end-to-end acceptance contract and actual delivery gaps |
| [Contributing](../CONTRIBUTING.md) | Local setup, actionable issues, useful commits, and contribution checks |
| [Code standards](../CODING_STANDARDS.md) | Coding and review rules, Ultracite commands, and documentation formatting |
| [Coding patterns](engineering/coding-patterns.md) | Seven engineering patterns adapted to Edu-Canvas domain rules and boundaries |
| [Software factory](engineering/software-factory.md) | Dated engineering-method notes; personal tooling sections are context, not contract |
| [Research index](research/README.md) | Registry of locally retained reference materials; raw research notes stay untracked |
| GitHub issues and Projects | Work ownership, dependencies, priority, lifecycle state, and delivery evidence |

Documents that already lived in this repository (`docs/foundation-runbook.md`, `docs/release-fly-supabase.md`, `docs/architecture-harness.md`, `docs/observed-behaviour.md`, `docs/security/threat-model.md`, `docs/agdr/`) keep their current ownership. Historical documents keep decision history only and are not active contracts: [root `PRD_GRILL_LOG.md`](../PRD_GRILL_LOG.md), [root `DEVPOST_WINNING_STRATEGY.md`](../DEVPOST_WINNING_STRATEGY.md), and [`product-strategy-video-script.md`](product-strategy-video-script.md) (superseded by the [demo script](hackathon/meta-global-2026/demo-script.md)).

## Saved research and notes

The raw research notes behind the imported documents are not tracked in this repository; they are retained in the local notes workspace (`.worktrees/hackthon-docs/`). The [research index](research/README.md) records this decision and lists the locally retained reference materials. The one tracked exception is the hackathon archive:

| Folder | Files |
| --- | --- |
| Hackathon archive | [Archived ideas](hackathon/meta-global-2026/archive/ideas.txt) |
