# AgDR-0018 — Standards-pack context, shared templates, and grounding adapter

> In the context of generalizing lesson generation beyond equivalent fractions ([#30](https://github.com/abodacs/edu-canvas/issues/30)) while the seeded curriculum is still the canonical demo data, facing the risk that a second subject becomes a second code branch and that a Learning Commons response leaks another tenant's curriculum or a raw provider payload into storage, I decided to make the versioned **standards pack** the one curriculum context for generation, to keep packs as shared templates plus tenant-owned overrides, to pin the pack version and answer rules on every accepted draft, and to place the Learning Commons adapter behind a validating anticorruption layer, accepting that seed data stays canonical until the physical wave-2 move, with the provider REST pipeline verified live on 2026-11-04 and its 8-row matrix recorded.

Recorded 2026-11-04. The context map and module ownership live in [ARCHITECTURE.md](../../../ARCHITECTURE.md#bounded-contexts-and-context-map); this record owns the decision and its limits.

## Context

The teaching loop needs curriculum data for more than equivalent fractions. The earlier design ([AgDR-0005](AgDR-0005-grounded-package-version-contracts.md)) named a grounded package contract; [#217](https://github.com/abodacs/edu-canvas/issues/217) added versioned packs, [#218](https://github.com/abodacs/edu-canvas/issues/218) added the Learning Commons pilot resolver, [#221](https://github.com/abodacs/edu-canvas/issues/221) carried the pack's prompt frame into the provider, and [#222](https://github.com/abodacs/edu-canvas/issues/222) added an English Language Arts pack. Without a named owner, the standard id, graph, answer rule, screen pattern, and prompt copy would each drift into a different generation branch.

## Decision

1. **Curriculum & Standards owns the pack.** `src/server/curriculum/` owns the strict pack schema, the tenant-scoped registry, the answer-rule registry, and the built-in packs. A pack is data: a new subject or standard ships as a new pack version, never as a code branch per standard. Lesson Drafting resolves a `VersionedCurriculumContext` from a pack and never reads seed data directly in production code.

2. **Shared templates have one visibility rule.** A pack pinned to `tenant_shared_standards` is a template every tenant may resolve. A pack owned by a tenant is visible only to that tenant and takes precedence over the shared template for the same standard. Another tenant's private pack never makes a standard "supported". The rule lives in `registry.ts` and in the generation support check.

3. **The pack version is pinned.** `packVersion` is separate from the graph version. Acceptance writes it, with `allowedScreenPatterns`, onto the draft provenance; the record and the public generation result expose both so a teacher can see which pack and screen guidance shaped each variant. Preview reads the pinned patterns, refuses an unlisted `?screenPattern=` with `UNSUPPORTED_SCREEN_PATTERN`, and keeps matching-only for a record written before patterns were pinned.

4. **Answer rules are declared and evaluated by kind.** A pack declares `fraction-equivalence`, `whole-number-expression` (with per-problem remainder rounding), `text-evidence`, or `teacher-review`. Each kind has exactly one evaluator. A rule that cannot decide returns its declared `unverifiedVerdict`; a definite contradiction is a mismatch. The provider prompt and the deterministic fixture read the same declared problems, passage, and examples, so an offline draft can satisfy the rule the pack declares.

5. **Learning Commons sits behind an anticorruption layer.** `src/server/grounding/standards/learning-commons-rest.ts` maps a fixed provider origin and fixed paths into application-owned facts, a gap vocabulary, and bounded copy. A corrupt persisted row fails closed through runtime validation, and a provider response never becomes an error `cause`. The REST pipeline was **verified live on 2026-11-04**: framework lookup, paginated standard scan, components, prerequisites, and the crosswalk fallback. The 8-row matrix and the ELA boundary are in [`live-matrix.json`](../research/standards-generalization/live-matrix.json); no credential is recorded. A 4xx on a sub-resource is a visible `unsupported-envelope`, never a false empty answer.

6. **Seed inversion is deferred.** `src/server/seed-data.ts` stays canonical until the wave-2 physical move into `src/curriculum/`. The temporary exception is explicit: `src/server/curriculum/built-in-packs.ts` may import the seed, and the test-support `*-fixtures.ts` module may import it; production generation may not. The `drafting-imports-seed-curriculum-directly` boundary rule is therefore an error, not a warn.

## Alternatives considered

- **One module per standard** — multiplies validators and copy for every new standard; rejected because a pack is data.
- **A global pack catalog with no tenant dimension** — simpler lookup, but it makes a private pack visible to every classroom; rejected in favor of templates plus tenant-owned overrides.
- **Trusting the persisted grounding JSON** — avoids a Zod dependency at the row boundary, but a corrupt row would become a fabricated grounding; rejected.
- **Live Learning Commons calls in this pass** — rejected at the time because no credential existed, and a fabricated live claim would weaken the evidence. Superseded on 2026-11-04: the verified pipeline and matrix replaced the recorded-fixture-only adapter.

## Consequences

- The context map gains a named Curriculum & Standards ownership row; the stale "direct seed-data imports today" and "anticorruption layer (planned)" notes are replaced by what now exists.
- The wave-2 boundary warn retires early for generation. The seed module itself still moves in wave 2.
- A pack edit produces a new pack version; a stored draft keeps the version that shaped it.
- The REST pipeline is live-verified, with the evidence path recorded. The California crosswalk path needs about seven sequential round trips and can exceed the 10-second deadline; California is out of scope by product decision. The matrix covers the positive rows and the ELA boundary; negative probes remain unrecorded.

## Handoff

[ARCHITECTURE.md](../../../ARCHITECTURE.md#bounded-contexts-and-context-map) owns the context map and module ownership. The [architecture harness](../../architecture-harness.md) owns enforcement intent. The answer-rule vocabulary is in [the curriculum glossary](../../../src/server/curriculum/GLOSSARY.md).
