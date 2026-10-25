# Threat Model — Edu-Canvas (STRIDE)

> Pre-build STRIDE pass, derived from the July 2026 PRD decision log (log removed 2026-10-25; still-valid answers live in the [design decision record](../design/design-doc-questions.md)). Scope: the validation-milestone slice + the trust boundaries that must hold even under deadline pressure. Reconciled 2026-10-25 ([#89](https://github.com/abodacs/edu-canvas/issues/89)): the generation provider is selected per [AgDR-0006](../agdr/AgDR-0006-provider-selection-and-deadlines.md), not fixed in advance. **Children's data + server-authoritative grading make this a higher-than-usual surface — these controls are not deferable.**

## Trust boundaries

1. **Student device / browser** ⟷ **Edu-Canvas server** (HTTPS; A2UI SSE ↓ / action HTTPS ↑)
2. **Edu-Canvas server** ⟷ **Generation provider** (server-side only; provider selected per [AgDR-0006](../agdr/AgDR-0006-provider-selection-and-deadlines.md))
3. **Teacher** ⟷ **server** (approval, answer-key edits)
4. **Server** ⟷ **PostgreSQL** (tenant-scoped)
5. **A2UI catalog** — the allowlist boundary between model output and executable UI

## STRIDE

### Spoofing

- **S1 — forged student/teacher identity.** Mitigations: invite-only + class-code (Q64/65); email magic-link + MFA for adults (Q74/75); school-authorization + consent before minor activation (Q76). _Validation-milestone deployments use seeded accounts with invitation sessions; production authentication is a release-runbook requirement, documented as an open gap until met._
- **S2 — model output spoofing a valid lesson.** Mitigations: server validates the draft (Q77); A2UI compiler rejects unknowns (AgDR-0001).
- **S3 — stolen or leaked invitation credential yields a teacher or learner session.** Mitigations: separate teacher/learner invitation credentials exchanged for signed, HttpOnly, Secure, SameSite session cookies; identity and role derive from the server session only (Q16); no invitation credential in client bundles or repository files; reset and recovery rehearsed (V9, AC20) ([AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md)).

### Tampering

- **T1 — client tampers its own score.** Mitigations: AgDR-0002 — client emits events only; client score ignored; answer key server-only. **Submission test required.**
- **T2 — tampering of published activities / answer keys.** Mitigations: published versions immutable (Q29); answer-key edits audited (Q68); attempts pin versions (Q144).
- **T3 — malicious prompt injection via teacher input reaching the model/UI.** Mitigations: server-side prompt + content moderation with blocking states (Q73); allowlisted renderer + CSP/Trusted Types (Q78); no generated HTML/JS execution.

### Repudiation

- **R1 — "I didn't approve/grade that."** Mitigations: audit events for logins, generation/approval, answer-key edits, work access, exports/deletes, retention, AI calls, validation failures (Q68); approving teacher + model/provider/version recorded per pack (Q147).

### Information disclosure

- **I1 — answer key leaks to the client.** Mitigations: AgDR-0002 — key absent from A2UI messages and client bundles; stored separately from visual components. **Submission test required.**
- **I2 — student data sent to the model.** Mitigations: no identifying data, no student images; only de-identified activity/structured data (Q16); no training on student data (Q156).
- **I3 — children's data exposure / wrong-region processing.** Mitigations: EU storage + EU inference (Q129, **UNRESOLVED** — Q103/108); real data gated on DPA + residency + security + consent (Q109/110); milestone deployments use synthetic data only. _Open: confirm EU eligibility of the selected provider path (AgDR-0006) before any real data._
- **I4 — admin overreach into student work.** Mitigations: no default admin access to individual work; exceptional access delegated + audited (Q67); no ordinary impersonation (Q151).

### Denial of service

- **D1 — AI generation cost/abuse.** Mitigations: per-tenant/teacher quotas; one active pack job per teacher; rate limits; cost telemetry (Q139); one server-correction attempt then teacher-controlled retry (Q27). Milestone values: 10 generation attempts per teacher per hour, 100 per tenant per day, 200 provider calls per tenant per day, and 30 authoring requests per session per minute ([AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md)).
- **D2 — submission/grading flood.** Mitigations: server-side grading is cheap + deterministic; rate-limit submission events.

### Elevation of privilege

- **E1 — student escalates to teacher/admin capabilities.** Mitigations: server-authoritative authz on every action; tenant isolation (Q18); school-admin role boundaries (Q67).
- **E2 — unknown A2UI component/action escalates UI capability.** Mitigations: catalog allowlist + versioning (AgDR-0001). **Submission test required.**
- **E3 — learner session reaches teacher capabilities, or a quota/burst limit is bypassed.** Mitigations: identity and role derive from the server session only (Q16); server-authoritative authorization; database-backed quotas with process-local burst limits return `RATE_LIMITED` ([AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md), AC20).

## Highest-priority controls for the milestone deployment (must exist, not defer)

1. Answer-key isolation + client-score-ignored (T1, I1) — with submission tests.
2. A2UI catalog rejects unknowns (T3, E2) — with a submission test.
3. Server-side validation of model output (S2, T3).
4. Synthetic-data-only + EU-residency gate documented (I3).
5. Deterministic adaptation trace (supports R1 + the milestone narrative).

## Open

- **EU residency of the selected generation provider** (Q103/108/129; provider per [AgDR-0006](../agdr/AgDR-0006-provider-selection-and-deadlines.md)) — confirm before any real student data.
- **Full auth is seeded in milestone deployments** (S1) — an open gap until the [release runbook](../release-fly-supabase.md) production requirements are met.
- **Invitation-credential reset and recovery** (S3) — V9 requires an independent-device rehearsal; no evidence is recorded yet.

Threat IDs (S/T/R/I/D/E) are local to this document; they are unrelated to the design documents' E1–E8 evidence tasks.
