# Glossary — records and student learning

Vocabulary for `src/server/records/` and `src/server/learner/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

## Authoring

### Lesson package

The teacher-owned identity a version chain belongs to. It carries the owner, the target standard, the title, and the head revision used for concurrency. It carries no lesson content.

**Implementing names:** `lesson_packages`

### Lesson version

An immutable revision of a package: ordered sections, variant references, provenance, private answer relationships, content and package hashes, validation evidence, and rule versions. A section revision keeps the package; a fresh draft starts a new package.

This is not a **pack version**. One word, two stored rows; see [the homonym register](../../docs/domain/03-homonyms.md).

**Implementing names:** `lesson_versions`, `lessonVersionSchema`

### Section

One ordered block of a lesson version. The four kinds are worked example, guided practice, independent check, and follow-up. A section is content, not a teaching stage and not a screen.

**Implementing names:** `sectionSchema`, `sectionsSchema`

### Section item

One selectable item inside a section, with a role: source item, target item, or distractor.

**Implementing names:** `sectionItemSchema`

### Target item

The right-hand item of a matching task: the answer a student chooses. This is not the **target concept** of a learning path, and not an **approval target**.

### Variant reference

The pointer from a lesson version to one variant of the draft it was built from. It records identity and kind only; the content lives in the section bodies.

**Implementing names:** `variantReferenceSchema`, `variantReferencesSchema`

### Authored edit

One teacher change to an approved version, recorded with its author and its section. An edit never mutates a version; it produces the next one.

**Implementing names:** `authoredEditSchema`

### Provenance

The record of where content came from: provider, model version, prompt version, and the authored edits applied since. Provenance is evidence about origin, not a quality signal.

**Implementing names:** `provenanceSchema`

### Curated reference

Human-supplied evidence for the focused path. It is explicitly not a source snapshot and carries no retrieval time or native match confidence.

**Implementing names:** `curated_references`, `curatedReferenceSchema`, `curatedReviewedContentSchema`

### Validation finding

One observation from a check: a code, a severity, a field, and an optional recommendation. A finding is data the teacher may see; it is not a log line.

**Implementing names:** `validationFindingSchema`

### Validation result

The complete outcome of one check pass, with the validator version and the timestamp. A result is stored with the version it validated; it cannot be reused for different content.

**Implementing names:** `validationResultSchema`

### Rule versions

The set of rule and catalogue versions that produced a validation result or a publication. Rule versions make a stored decision reproducible.

**Implementing names:** `ruleVersionsSchema`

### Publication

The immutable fact that a teacher approved one exact lesson version. It pins the content hash, package hash, private-answer digest, validation-result hash, and rule versions. It never mutates the version.

This is not a **pack publication** — that record belongs to the generated-pack model.

**Implementing names:** `publications`, `publicationSchema`

### Learner assignment

The fact that one publication reaches one learner. A learner assignment is created with the publication and never reassigned. It is not a **class assignment**, which links a teacher to a class.

**Implementing names:** `assignments`, `assignmentSchema`

## Learning

### Learner run

The mutable progress record for one assignment: stage, first-response status, revision, and next activity. Its publication, learner, and variant never change.

**Implementing names:** `learner_runs`, `learnerRunSchema`

### Stage

Where a run is: assigned, active, awaiting decision, paused, advanced, or completed. A stage is progress through one assignment, not a teaching stage inside a lesson.

### Learner attempt

An immutable response record, keyed to the learner run, item, and publication. It is not a **generation attempt**, and it is not the legacy `attempts` fixture table.

**Implementing names:** `learner_attempts`, `learnerAttemptSchema`

### Selected pair

One source-to-target choice inside a submitted attempt. The record keeps what the student chose, including the wrong choice.

**Implementing names:** `selectedPairSchema`

### Assistance event

An append-only record that a learner used a hint or other assistance on a specific run and item, before any feedback release that claims it was saved.

**Implementing names:** `assistance_events`, `assistanceEventSchema`

### Next activity

The activity a run points at after the current one. The stories show a teacher choosing it; the record stores whatever choice was made, and does not itself propose one.

**Implementing names:** `nextActivitySchema`

### Target concept

The concept a next activity leads to, named by `nextActivity.targetId`. It is a curriculum concept, not a matching target item.

### Learning evidence

The learner work a teacher inspects: attempts, assistance, and decisions for one run, with a hash that makes the set reproducible. It is not **research evidence**.

### Teacher decision

The immutable choice — accept, pause, or override — bound to the current evidence hash and the assigning teacher.

**Implementing names:** `teacher_decisions`, `teacherDecisionSchema`

### Operation receipt

The record that makes a write replay-safe: tenant, actor, membership, authorization revision, action, operation key, input hash, and result ids.

**Implementing names:** `operation_receipts`
