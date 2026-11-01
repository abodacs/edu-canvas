# Glossary — lesson drafting

Vocabulary for `src/server/generation/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Lesson draft

The candidate content the drafting service produces from one request: four variants, a learning path, and diagnostics. A draft is not a lesson version; it becomes one only after review and approval.

**Implementing names:** `lesson_draft_requests`

### Generation request

One teacher instruction — prompt, grade, curriculum standard, language — with a normalised form and an idempotency key. The request is the identity that retries share; each retry adds an attempt to it.

### Generation attempt

One provider call cycle inside a generation request. Two attempts can belong to one request when the first draft fails structural validation and the system corrects it.

This is not a **learner attempt** — that one is a student's response.

**Implementing names:** `lesson_generation_attempts`

### Variant

One of the content options a draft offers: a **standard variant**, a **scaffold variant**, or a **challenge variant**. Variants are parallel renderings of the same objective, not four teaching stages and not four difficulty levels of the same text.

### Standard variant

The baseline content option. The word _standard_ here is not a curriculum standard; see [the homonym register](../../docs/domain/03-homonyms.md).

### Scaffold variant

The content option that adds structure or support to the same objective.

### Challenge variant

The content option that extends the same objective.

### Learning path

The ordered prerequisite chain one draft carries: the concept the lesson assumes, the connection, and the concept the lesson targets. A learning path is curriculum structure, not a route through screens and not a lesson plan.

### Forward story

The three-beat narrative assembled from an accepted learning path: prerequisite, connection, target. Every sentence comes from approved copy; the builder invents none of it.

### Source item

The left-hand item of a matching task: the prompt a student matches from. It is not a **source material**, which is an uploaded document.

### Draft review

The teacher's examination of a draft before approval: the question, the answer key, the explanation, the feedback after an error, and every possible next activity.

### Diagnostic

A finding the drafting or validation step records about a draft: its severity, a code, a message, and the field or variant it concerns. A diagnostic is shown to the teacher; it is not a logged error.

### Correction

The second provider call made after a draft fails structural validation, carrying the first diagnostics. A correction is not a retry: a retry reuses the request, a correction continues it.
