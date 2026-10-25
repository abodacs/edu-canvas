# Edu-Canvas documentation

Edu-Canvas is a production product; these documents define and verify one trustworthy teacher-to-student loop that teachers return to. The hackathon event (October 26 – November 4, 2026) is the first external validation milestone, not the objective. The corpus was imported from the hackathon-2026 notes workspace on 2026-10-24 and reconciled on 2026-10-25 (PR 02, [#89](https://github.com/abodacs/edu-canvas/issues/89)): every requirement has one owning document.

## Document ownership

| Document | Owns |
| --- | --- |
| [Root README](../README.md) | Repository overview, stack, quick start, and safety boundaries |
| [Architecture](../ARCHITECTURE.md) | Stack, folder ownership, runtime flows, invariants, change recipes, and the enforcement map |
| [Architecture rationale](engineering/architecture-rationale.md) | Why the architecture document has its shape; candidate synthesis and accepted tradeoffs |
| [ROADMAP.md](../ROADMAP.md) | Product outcomes, release boundaries, lifecycle gates, and deferred commitments |
| [Product strategy](product-strategy.md) | Problem, target users, alternatives, value hypothesis, and evidence limits |
| [Walking skeleton](walking-skeleton.md) | Current end-to-end acceptance contract and actual delivery gaps |
| [Sprint guide](hackathon/meta-global-2026/README.md) | Event scope, eligibility assumptions, schedule, risks, and execution decisions (validation milestone) |
| [Validation tracker](hackathon/meta-global-2026/validation-tracker.md) | V1–V16 evidence gates, dated observations, and evidence links |
| [Demo script](hackathon/meta-global-2026/demo-script.md) | Recording sequence and bounded claims for the event artifact |
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
| [Foundation runbook](foundation-runbook.md) | Local setup, configuration, readiness, and redeploy checks for the foundation |
| [Release runbook](release-fly-supabase.md) | Deployment procedure, access and usage limits, and the production requirements list |
| [Architecture harness](architecture-harness.md) | Guardrails for state ownership, layer imports, and contract drift |
| [Observed behaviour](observed-behaviour.md) | Evidence boundary, job stories, and the research plan |
| [Threat model](security/threat-model.md) | STRIDE pass and open security questions |
| [Decision records](agdr/) | Architecture decisions AgDR-0001–0007 |
| [React Doctor triage](react-doctor-triage.md) | Dated code-quality scan findings and dispositions |
| [Plans](plans/hackathon-2026-pr-stack.md) | Historical import and reconciliation plan, file map, and change record |
| GitHub issues and Projects | Work ownership, dependencies, priority, lifecycle state, and delivery evidence |

## Change log

- 2026-10-25 (architecture): root [ARCHITECTURE.md](../ARCHITECTURE.md) and its [rationale](engineering/architecture-rationale.md) added. The architecture document owns the current system, folder ownership, runtime flows, and enforcement map; the design documents keep the target contracts.
- 2026-10-25 (PR 02): ownership reconciled; conflicts from [#89](https://github.com/abodacs/edu-canvas/issues/89) fixed; the July 2026 OpenAI Build Week documents (`DEVPOST_WINNING_STRATEGY.md`, `PRD_GRILL_LOG.md`), the superseded video script, and the unverified idea-brainstorm archive were removed. Their still-valid decisions live in the [decision record](design/design-doc-questions.md) and [teacher UI decisions](product/teacher-ui.md).
