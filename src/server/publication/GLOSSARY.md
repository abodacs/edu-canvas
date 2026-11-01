# Glossary — publication and review

Vocabulary for `src/server/publication/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Pack

The generated-pack model: a review version chain, its approvals, its publication, and its assignment, stored in `pack_*` tables. The pack is the authoring truth; the lesson version it produces is the runtime truth. This duplication is recorded debt, not a design goal.

### Pack version

One review revision of a pack. An edit inserts a new row with a parent link; nothing updates or deletes a version. A pack version is not a **lesson version**.

**Implementing names:** `pack_versions`

### Review version

The pack version a teacher is currently looking at, projected for review. It is a view of a pack version, not a stored copy.

### Approval

The teacher's acceptance of one target of a review version. An approval is pinned to the artifact hash and the validation-result hash of the version it accepted, so an edit invalidates it.

**Implementing names:** `pack_approvals`

### Approval target

The part of a review version one approval covers: one of the four variants, or the reverse path. It is not a **target item** and not a **target concept**.

### Pack publication

The immutable fact that one pack version was published. It is not a **record publication**, which the learner runtime reads.

**Implementing names:** `pack_publications`

### Pack assignment

The link from one pack publication to one learner in the pack model. It is not a **learner assignment**.

**Implementing names:** `pack_assignments`

### Pack receipt

The replay record for a pack write: operation key, input hash, and result identifiers.

**Implementing names:** `pack_receipts`

### Bridge

The translation that writes an approved pack into the canonical lesson records: one lesson version, one publication, and one learner assignment. The bridge is the only writer of that second copy. It is lossy in one place only: a section body is the variant's instructions, so the pack's own text does not survive verbatim. Lineage is not lossy — every revision of one review appends to the same lesson package.

### Bridged lesson

The lesson package one review produces. A review is named by its generation request, so every approved revision of that review is a version of the same package. The package and version tables are claimed by [records](../records/GLOSSARY.md).

### Publish

To make one approved version reachable by its learner. Publishing re-runs the artifact gate, compares the hashes and the gate policy version, then writes the publication and the assignment together.

### Draft review

The teacher's examination of the draft before approval. The same words name the activity in [drafting](../generation/GLOSSARY.md); here they name the stored review state it produces.
