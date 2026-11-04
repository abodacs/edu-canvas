# Glossary — standards packs

Vocabulary for `src/server/curriculum/`. Meaning only. The **Standards pack** itself is a product curriculum noun and is defined in the root [GLOSSARY.md](../../GLOSSARY.md); this file defines the parts of that record. The map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Standards pack version

The identity of one complete edit of a standards pack. Any change to the graph, components, answer rules, allowed screens, or prompt frame produces a new pack version; a pack version is not a **Pack version**, which names a publication review revision.

### Curriculum graph

The prerequisite nodes and the directed edges between them, pinned by one graph version. A lesson is validated against the graph its pack names, never against whichever graph currently happens to be newest.

### Pack component

One skill, concept, or problem statement a standard pack names as part of the standard. A component is curriculum data, not a generated variant and not a **source item**.

### Answer rule

The pack's declared way to check whether a response is correct, together with the verdict used when the rule cannot verify it. A rule that can decide returns a match or a mismatch; teacher review is its own rule, not a silent pass.

### Prompt frame

The pack's words for a generated task: the task line, the two group labels, and the source and target item counts. The frame replaces subject-specific copy in the provider prompt without changing the artifact schema.

### Allowed screen pattern

The interaction shape a pack permits, such as matching. A pattern the pack does not list cannot render, even when the artifact schema can express it.
