# AgDR-0004 — Bounded semantic validation at the lesson-generation seam

> In the context of reviewing structurally valid lesson drafts, facing the
> risk that a model can produce mathematically or pedagogically unsafe content
> that satisfies the shape contract, I decided to run deterministic curriculum
> and learning-quality validators against a normalized draft and a pinned,
> versioned curriculum context, to achieve explainable teacher review and a
> safe handoff to later preview work, accepting that weak variants remain
> teacher-visible warnings and incomplete validation requires an explicit retry.

## Context

Issue #3 establishes the canonical server-owned lesson draft and structural
validation boundary. That boundary proves shape, IDs, relationships, bounded
distractors, language metadata, and accessibility fields, but it cannot prove
that an equivalent-fractions relationship is mathematically correct, that a
path follows the approved prerequisite graph, or that four variants offer
meaningfully different learning moves.

Issue #18 needs two bounded review roles before any later A2UI preview or
publication work can consume a draft:

- the curriculum validator checks the pinned target, graph nodes and edges,
  path direction, cycles, and answer relationships;
- the learning-quality validator checks grade, language/RTL completeness,
  accessibility labels, unsafe or unsupported claims, explanation quality, and
  variant differentiation.

## Decision

The service passes only the structurally parsed draft, an optional normalized
reasoning path, and a server-created versioned curriculum context to the two
deterministic validators. Their structured findings carry a stable code,
`pass`/`warning`/`block` verdict, affected field or node, concise reason, and
validator version. A combined `block` removes the draft from the public
projection and persists actionable diagnostics; a warning keeps the draft
reviewable and visible to the teacher.

Advisory validation agents may add recommendations, but their output is
sanitized and can only create a teacher-visible warning. They receive a deep
cloned normalized input with private answer relationships omitted, so an agent
cannot mutate the canonical draft or inspect its answer mapping. The
deterministic curriculum/schema result remains authoritative when an advisory
recommendation disagrees with it. Advisory work is bounded to two attempts and
a short timeout; exhaustion produces a retryable state rather than allowing an
unverified draft through.

The existing diagnostics JSON boundary stores the findings, so no new answer
key, student identifier, raw provider payload, or chain-of-thought field is
introduced. The canonical draft is never rewritten by validation.

## Consequences

- Mathematical answer mismatches and invalid prerequisite paths are blocked
  before a later preview seam can consume them.
- Teacher-visible warnings explain weak variant differentiation and include safe
  recommendations without exposing private relationships.
- Deterministic fixtures cover pass, warning, block, disagreement, timeout, and
  explicit retry behavior without a model or network dependency.
- The seeded equivalent-fractions fixture intentionally surfaces a warning when
  variants share the same interaction structure; later provider work can
  improve the variants without weakening the validator.
- A timed-out review requires a teacher retry and does not silently fall back to
  an unreviewed draft.

## Handoff

Issue #28 owns the cross-cutting hard safety gate before preview and Share.
Issue #17 owns producing the reverse prerequisite path that this seam can
validate. Issue #4 consumes only accepted public content through the
allowlisted A2UI catalog. This decision does not authorize path generation,
publication, grading, or student content generation.
