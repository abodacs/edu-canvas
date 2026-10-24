# Coding patterns

Use these patterns when implementing or reviewing domain rules, integrations, state transitions, and error handling. The [code standards](code-standards.md) contain the language and tooling checklist. The [architecture harness](../architecture-harness.md) defines the existing layer boundaries.

Adapted from CodeByUmar, _7 Coding Patterns I Stole From Senior Engineers_, published in Skill Stuff on Medium, June 8, 2026 (saved PDF, pages 1-2). The [research index](../research/README.md#local-reference-materials) records the local source. The examples below apply the ideas to Edu-Canvas; they describe design guidance, not implementation status.

## 1. Use early returns for failure paths

Check preconditions before the main operation. Return a defined failure or throw a descriptive error when a condition fails. Keep the successful path visible at the same indentation level.

For a lesson command, reject an invalid request, a missing lesson, or a tenant mismatch before changing data. Preserve the order required by authorization and information-disclosure rules. A named guard should explain what prevented the operation.

Keep nesting when it expresses a real hierarchy, such as a prerequisite tree. Flattening every branch can make that structure harder to follow.

## 2. Name the domain meaning

Name values and functions after the concept and operation they represent. Include distinctions that affect correctness, such as draft, approved version, private answer key, and public projection. Use the terms in the [design reading guide](../design/design-doc-reading-guide.md#use-one-term-for-each-concept).

For example, `publicLessonProjection` tells a reviewer more than `data`. A name such as `hasRequiredSkills` should describe only that check. It must not imply that a lesson is also approved for publication.

Use short names for small, obvious scopes. Add detail when a name carries a domain rule or prevents a mistaken assumption.

## 3. Translate external data at a boundary

Validate external input and map it into an application-owned contract at the entry point. Keep provider response fields, database rows, HTTP details, and environment parsing inside their owning adapters.

For Edu-Canvas, model output must pass the lesson contract before domain code consumes it. Return only the permitted public projection to the browser. Follow the [architecture harness](../architecture-harness.md) for shared modules and named server delivery seams.

Test malformed responses and provider changes at the adapter boundary. Add mapping where external details would otherwise spread across callers; a pass-through wrapper with no validation or translation adds little value.

## 4. Represent valid states explicitly

Use required fields, literal states, and discriminated unions to express meaningful differences. Reserve optional fields for values that can actually be absent in that state. Validate untrusted values before treating them as a domain object.

For a publication flow, distinguish a draft package from an approved package version. Require the relevant approval evidence at the publication boundary. Avoid one object with optional approval fields and independent booleans that permit contradictory combinations.

Types make mistakes visible during development. Runtime checks still protect persisted data, external input, and transitions that depend on current authorization or versions.

## 5. Separate decisions from effects

Put a substantial domain decision in a pure function that receives facts and returns a result with a reason. Let the calling service load data, apply the decision, and perform authorized effects.

A publication eligibility decision can inspect validation and approval evidence without writing to the database. Test its allowed and blocked cases directly. Verify persistence and delivery separately where those effects meet the decision.

Keep the required transaction or version check around the write. A pure eligibility result alone cannot prevent concurrent changes. Extract decisions that carry domain risk; a trivial expression does not need another module.

## 6. Make errors actionable

Give consumers a stable error code and safe human-readable message. Add structured context, such as an operation name, field, or request identifier, when it helps diagnose the failure. Branch on codes instead of matching message text.

For a rejected lesson request, identify the field or review step the teacher can correct. For an unavailable provider, explain the available recovery action. Keep internal causes in approved server diagnostics, with enough safe context to trace the operation.

Keep secrets, student identifying data, private answer keys, and raw provider payloads out of public errors and logs. Use existing error contracts and observability conventions before adding another format.

## 7. Keep changes reviewable

Give each diff one clear purpose. Explain the resulting behavior, show relevant verification, and make rollback implications visible. Keep unrelated cleanup out of a behavior change.

For example, separate a domain rename from a new approval rule when each can stand alone. Keep a change together when splitting would temporarily break a contract or leave callers incompatible. Include migrations and configuration changes explicitly when they are required.

Verify both the intended result and relevant failure paths. A successful local demo alone does not establish that a change can be reviewed, merged, or safely reverted.
