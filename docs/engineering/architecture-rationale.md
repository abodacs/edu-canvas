# Architecture document rationale

Companion to [ARCHITECTURE.md](../../ARCHITECTURE.md). This records the document design, not a second specification for the application.

## Problem

The previous architecture document mixed system explanation, task instructions, configuration reference, product status, and verification claims. Repeated rules made it harder to see which module owned a decision. Some claims exceeded their checks: the source scanner does not prohibit arbitrary mutable state, and demo snapshots intentionally expose synthetic identity and capability metadata.

The rewrite must explain the implemented system, distinguish design contracts from code, and give readers a direct path from a change to its owner and verification. Application behavior remains unchanged.

## Usage (caller's view)

- A provider author opens **Change recipes**, follows `LessonDraftProvider` to the factory, and checks the generation flow before changing correction behavior.
- A route author opens **Module ownership**, then **Contracts and trust boundaries**, to find the named delivery interface and public schema.
- A concurrency reviewer opens **Persist and recover attempts**, then **Invariants and verification**, to distinguish claim ownership from execution deadlines.

These reading paths were defined before selecting the outline. The generation call in the document uses the existing server-function contract; it introduces no proposed API or scaffold.

## Shape

A question index leads into an ownership-first reference: system overview → module ownership → contracts → runtime flows → compact change recipes → verification → deployment → implementation gaps. The module map names the existing interfaces and their owners. No new application types or modules are needed for a documentation rewrite.

The main boundaries remain explicit: server functions compose dependencies, the generation service accepts or rejects drafts, persistence owns atomic claims and writes, shared schemas define public data, and A2UI compiles validated records into renderable messages.

The interface is a small reading index and one change table. Flow details sit behind those entry points, while setup instructions, version inventories, and target acceptance contracts stay with their existing owners. This reduces what a reader must learn before finding the responsible module.

## Synthesis decision

Two structurally distinct outlines were considered against factual accuracy, boundary clarity, change navigation, duplication, and maintenance cost:

| Candidate | Strength | Weakness |
| --- | --- | --- |
| A: overview → owners → contracts → flows → extension map → checks → gaps | Explains responsibility before extension; keeps runtime facts together | Needs a short index for readers arriving with a task |
| B: task index → self-contained recipes → shared constraints → checks → gaps | Gives each common task a self-contained recipe | Repeats contracts and checks across recipes; mixes reference with procedure |

**Base: A.** Adapted B's question index and extension paths into two compact tables. Retained generation and preview walkthroughs where ordering explains behavior. Removed the separate stack-pin inventory, glossary, repeated capability table, and exhaustive decision digest because source files or linked documents already own those facts.

The red-flag review focused on split ownership, hand-synchronized lists, and claims of isolation stronger than the implementation. The selected outline gives each fact one primary section and records enforcement limits next to the rule.

The alternatives and synthesis were produced sequentially by one agent, following the user's instruction to work alone. No model runners or independent cross-judge were used.

## Tradeoffs accepted

- We accept a short extension table in a reference document so readers can locate the responsible interface without a separate manual.
- We accept source links instead of exhaustive copied signatures and version lists to reduce documentation drift.
- We accept a dated source baseline and a compact gap table so implemented behavior remains distinguishable from approved targets.

## Alternatives considered

A standalone recipe manual exposes implementation sequencing to every caller and repeats constraints. A pure diagram or file tree hides detail but does not explain acceptance policy, concurrency, or verification. Expanding the architecture harness would make a guardrail document own runtime architecture as well.

## Open questions and risks

- Will changes to runtime boundaries update the linked contracts and gap table in the same change?
- Will readers mistake a passing source or bundle scan for complete isolation despite the stated limits?

Provider access, deadline alignment, protected sessions, and deployment count are implementation risks recorded in the architecture gap table. This rewrite does not decide or implement them.

## Next implementation step

Use the change table to locate the existing owner, then update the relevant boundary, behavior checks, and architecture section together.
