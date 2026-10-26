# AgDR-0008 — Bounded contexts, domain-named layout, and enforced boundaries

> In the context of the walking skeleton growing into the production loop ([#108](https://github.com/abodacs/edu-canvas/issues/108)) while standards-aligned drafting has commoditized and the gated post-draft loop is the differentiator, facing the risk that tech-shaped top-level folders (`components`, `lib`, `server`) hide the domain and that five incoming capabilities (approve, publish, grade, adapt, real identity) accrete onto seams nobody owns, I decided to name the module structure after the teaching-loop bounded contexts, to adopt a screaming domain-named target layout reached by a strangler migration of one context per PR after the November 4 event, and to enforce the boundaries with `dependency-cruiser` alongside the existing architecture verifier, to achieve a codebase whose structure tells the product story and whose boundary rules fail CI instead of relying on review memory, accepting one new development dependency, warn-severity rules for enumerated boundary debt, and that no physical file moves happen before the hackathon event.

Recorded 2026-10-26. The context map, target layout, old-path → new-path mapping, and migration waves live in [ARCHITECTURE.md](../../../ARCHITECTURE.md#bounded-contexts-and-context-map); this record owns the decision and the alternatives considered.

## Context

The [competitive read](../../../README.md) (2026-10-26): free teacher copilots commoditize drafting; the differentiator is the gated loop — approve → immutable publish → attempt → private grading → justified next step. The current tree predates that framing: `server/generation/` bundles drafting with the validators that manufacture trust, `server/demo/` mixes session policy into composition, and no check catches a dependency cycle. Issues [#98](https://github.com/abodacs/edu-canvas/issues/98)–[#107](https://github.com/abodacs/edu-canvas/issues/107) add five capabilities across three of the loop's verbs; each one lands somewhere in the tree, so the tree's language decides whether they clarify or bury it.

## Decision

1. **Bounded contexts derived from the journey verbs**, classified core (Validation & Safety, Teacher Review, Student Learning), supporting (Lesson Drafting, Curriculum & Standards, Identity & Tenancy, A2UI Protocol), and generic (Platform). Drafting is deliberately supporting: it must exist and stay bounded, but it is not the moat. ARCHITECTURE.md owns the table and the context map.
2. **Context relationships**: the Learning Commons adapter is an anticorruption layer over the curriculum context (planned in [AgDR-0005](AgDR-0005-grounded-package-version-contracts.md); the seeded stand-in conforms today). `src/shared/` is published language — browser-safe Zod contracts — not a shared kernel. The A2UI protocol is a versioned published language under [AgDR-0001](AgDR-0001-a2ui-catalog-governance.md) catalog governance.
3. **Screaming layout as target, not big bang**: top-level folders named for contexts (`drafting/`, `validation/`, `teacher-review/`, `student-learning/`, `curriculum/`, `identity/`, `a2ui/`), plus framework seams that stay (`routes/`) and generic platform folders (`platform/`, `ui/`, `shared/`). Every physical move ships in its context's wave with the old → new mapping already published in ARCHITECTURE.md.
4. **Enforcement**: `verify:boundaries` (`dependency-cruiser`) joins `pnpm check`. Layer rules mirror the existing verifier; this tool adds what the regex scan cannot see — dependency cycles, per-context decoupling, and database-client ownership. Error-severity rules must stay green in every PR; warn-severity rules are named boundary debt, each tied to the wave that retires it. Two type-level cycles this tool surfaced (persistence selector ↔ adapters, provider ↔ types) were broken in the same change.

## Alternatives considered

- **`eslint-plugin-boundaries`** — no cycle detection across the whole graph and a weaker path model; rejected in favor of `dependency-cruiser` for that reason.
- **Big-bang restructure** — one PR moving everything maximizes hackathon-window risk and review size; rejected for the strangler plan.
- **Keep tech-shaped folders with conventions only** — conventions rot exactly when the five incoming capabilities land; rejected because the rules are the deliverable, not the names.

## Consequences

- New development dependency (`dependency-cruiser`); it runs only in verification, never ships.
- Boundary debt is visible and enumerable instead of folklore: five warn edges today, each annotated with its wave.
- Every migration wave must update the rules and ARCHITECTURE.md in the same PR, or the map drifts — the repository treats drift as a defect.
- Context names are ubiquitous language: adding a capability means naming its context first, then its folder.

## Handoff

ARCHITECTURE.md owns the context map, the target layout with the old-path → new-path mapping, and the wave ordering. The [architecture harness](../../architecture-harness.md) records the enforcement intent of both scanners. Context-decision changes route through a new AgDR per the [change recipes](../../../ARCHITECTURE.md#change-recipes).
