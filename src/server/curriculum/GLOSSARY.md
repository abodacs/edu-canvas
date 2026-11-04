# Glossary — standards packs

Vocabulary for `src/server/curriculum/`. Meaning only. The **Standards pack** itself is a product curriculum noun and is defined in the root [GLOSSARY.md](../../GLOSSARY.md); this file defines the parts of that record. The map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Standards pack version

The identity of one complete edit of a standards pack. Any change to the graph, components, answer rules, allowed screens, or prompt frame produces a new pack version; a pack version is not a **Pack version**, which names a publication review revision.

### Curriculum graph

The prerequisite nodes and the directed edges between them, pinned by one graph version. A lesson is validated against the graph its pack names, never against whichever graph currently happens to be newest.

### Pack component

One skill, concept, or problem statement a standard pack names as part of the standard. A component is curriculum data, not a generated variant and not a **source item**.

### Answer rule

The pack's declared way to check whether a response is correct, together with the verdict used when the rule cannot verify it. A rule that can decide returns a match or a mismatch; teacher review is its own rule, not a silent pass. A whole-number rule declares how a remainder becomes a whole-number answer, so the evaluator never guesses whether to round up, down, or to the nearest.

### Shared standards-pack template

A pack pinned to `tenant_shared_standards` that every tenant may resolve. A tenant-owned pack for the same standard overrides the template; a private pack of another tenant is never visible. The template is a starting point, not a second opinion beside a classroom's own curriculum data.

### Pack example

One subject-correct source-to-target relationship a pack supplies so the deterministic fixture can build a matching draft that obeys the pack's own answer rule. An example is curriculum data for the offline fixture, not a learner answer or a generated variant.

### Prompt frame

The pack's words for a generated task: the task line, the two group labels, and the source and target item counts. The frame replaces subject-specific copy in the provider prompt without changing the artifact schema.

### Allowed screen pattern

The interaction shape a pack permits, such as matching. A pattern the pack does not list cannot render, even when the artifact schema can express it.
