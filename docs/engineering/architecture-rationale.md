# Architecture document rationale

Companion to [ARCHITECTURE.md](../../ARCHITECTURE.md). One page. This records why the document has its present shape. It is not a second architecture.

## Problem

Edu-Canvas had architecture knowledge in four places: code, `README.md`, `docs/design/`, and `docs/architecture-harness.md`. None was the operating manual for a change. A new engineer had to reconstruct the runtime path from the README sequence diagram. An agent had to infer the import law from a verifier script. The repository's own method notes say agents copy the nearest example and take the shortest compiling path, so a missing map is a missing constraint, not a missing tutorial.

The design problem was therefore documentary, with three constraints:

- The document must serve a human reading top to bottom and an agent arriving with one change in mind.
- It must not duplicate the product status, roadmap, design contracts, or decision records that already own those facts.
- Every rule it states must name the mechanism that rejects a violation, or it does not belong in the document.

## Usage (caller's view)

The reader's contract is the document's `§1` router and the per-recipe shape.

```text
Agent: "Add a provider for a second model vendor."
1. ARCHITECTURE.md §1 → row "Add or replace a generation provider" → §6.1
2. §6.1: copy provider.ts, touch config/factory/tests
3. §7 I4/I5 and §6.1 constraints: claim, one correction, explicit deadline
4. pnpm check
```

```text
Engineer: "Where does a role-limited page get its data?"
1. ARCHITECTURE.md §5.1 sequence
2. Open the named files in order
3. §4.2 tells them why the route may not import the service directly
```

```text
Reviewer: "Is this PR allowed to add a global store?"
1. §7 I9 and §8
2. pnpm verify:architecture rejects it
3. The review comment points at the gate, not at prose
```

The document succeeds when a reader can answer "what do I touch, what must I not break, and what proves it" without opening more than two files.

## Shape

The document is a task-indexed decision map with a layered reference spine.

- **Front matter** states revision, scope, companions, reading paths, and precedence. The revision is a commit id, so staleness is falsifiable.
- **§1 router** is the only entry surface an agent needs. One row per common change: recipe, nearest example, gate.
- **§2–§5** are the shared constraint card: context and trust boundary, stack and pins, folder ownership and import law, then the four runtime flows. They exist because a task recipe cannot state the causal model without repeating it.
- **§6** holds the recipes. Each names one copyable example, the files to touch, the constraints that are easy to violate, and the gate.
- **§7–§8** pair each invariant with its enforcing mechanism and list the cage. This is the part that makes the document architectural rather than descriptive.
- **§9–§10** state the deployment shape and, deliberately, the drift between documents and code.
- **§11–§12** point to decisions and define terms.

Interface depth is the design criterion. The public surface is small: one router table, eight recipes, ten invariants. Behind it sit the flows, the catalog, the state machine, the adapter contract, and the gate map. A reader who only needs a change never reads the flows; a reader who needs to judge a boundary change never relies on the router alone. The document hides detail in links only where another document already owns it.

Load-bearing decisions:

- Every rule has an enforcement column. A rule without a mechanism is marked as a target or omitted.
- The document distinguishes **Shipped** from **Target** at the capability level, not in a footnote.
- It names known drift instead of smoothing it. A future reader may mistake `fly.toml`, the provider names, or the seeded fixture for canon; the drift table stops that.
- It does not repeat the README's product pitch, the roadmap's dates, the design document's feature scope, or the AgDRs' rationale.

## Synthesis decision

Two structurally distinct candidates were sketched before writing.

- **Candidate A — layered narrative.** Context → stack → folders → flows → invariants → recipes → cage → gaps. Strong causal model; weak entry point for an agent with a task.
- **Candidate B — task-indexed decision map.** Router → shared constraint card → one section per change → cage. Strong entry point; fragments the causal model if used alone.

**Base: B.** The repository's dominant failure mode is an agent inventing a seam or copying the wrong example. B puts the one allowed path first and makes the gate adjacent to the change.

**Grafted from A:** the system context and trust-boundary diagram, the pinned stack and configuration surface, the runtime flow walkthroughs with state tables, the invariant-to-enforcement pairing, and the shipped/target/drift split. Without these, B's recipes are instructions without a model.

**Rejected:** A as the base (an agent must read six sections before it can act); a C4-only document (omits enforcement and duplicates the README diagrams); an ADR digest (duplicates `docs/agdr/`); a generated file-tree dump (changes constantly, carries no constraint).

Both candidates independently made the cage the center and both rejected an ADR digest. That convergence is the strongest signal in the synthesis.

Two sketch runners ran on the session model because this harness exposes no per-runner model field. They read the same repository and produced independent skeletons; their factual claims were checked against the code before use.

## Tradeoffs accepted

- We accept a longer document in exchange for one that both audiences can enter. A pure router would be shorter and would leave the flows unexplained.
- We accept some duplication of file paths with `README.md` in exchange for keeping the architecture self-contained. The README's repo-layout table is product navigation; this document's folder table is ownership and import law.
- We accept a dated revision and a drift table in exchange for honesty. A timeless architecture document would be false at this repository's change rate.
- We accept that the recipes will drift as slices land, in exchange for one obvious path today. The alternative, waiting for generators, leaves agents with no path.
- We accept that the document does not cover `scripts/`, SQL, CSS, or the SSR bundle, because the current verifiers do not. The coverage gap is named rather than implied.

## Alternatives considered

**A pure task index.** It wins on entry speed and loses on judgment. An agent can follow "add a provider" without learning that the provider output is untrusted, that at most one correction is allowed, or that provenance crosses the public boundary. Those constraints are the architecture. The hybrid keeps the index and attaches the model.

**A pure layered narrative.** It wins for a new engineer and loses for an agent under task pressure. The recipes would sit at the end, after six sections the agent did not ask for. The hybrid moves the router to the front.

**A generated document from code.** It would stay accurate mechanically but cannot state intent, invariants, or the reasons behind a gate. The repository already generates what can be generated: the route tree, the Drizzle metadata, and the gate output. The architecture document should own what cannot be derived.

**Expanding `docs/architecture-harness.md`.** It owns guardrail rationale, not the system. Expanding it would make one document own two jobs and leave the runtime flows homeless.

## Open questions and risks

- Will the drift table stay current, or become a graveyard? Default: every change that touches a drifted item updates its row; the reviewer checks the row, not the prose.
- Should `ARCHITECTURE.md` join `pnpm check` through Prettier? Default: yes, added to the explicit `format` and `format:check` lists. A link checker is a later, separate gate.
- Should the recipes become a scaffold command? Default: after the core loop lands. A generator that is not tested against `pnpm check` becomes another stale example.
- Does the document remain useful when the loop gains approval, grading, and adaptation? Default: add one recipe and one flow per new seam; do not grow a second document.
- Is the one-Machine deployment constraint acceptable beyond the milestone? Default: no. Shared limit state is a prerequisite for horizontal scale.

## Next implementation step

Open `ARCHITECTURE.md` §1, pick the change, and follow its recipe. The first structural change after this document should also add the row that sent you there, if the router lacked it.
