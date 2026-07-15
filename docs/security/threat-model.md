# Threat Model — Edu-Canvas (STRIDE)

> Pre-build STRIDE pass, derived from the PRD. Scope: the demo slice + the trust boundaries that must hold even under the 48-hour cut. **Children's data + server-authoritative grading make this a higher-than-usual surface for a hackathon — these controls are not deferable.**

## Trust boundaries
1. **Student device / browser** ⟷ **Edu-Canvas server** (HTTPS; A2UI SSE ↓ / action HTTPS ↑)
2. **Edu-Canvas server** ⟷ **OpenAI GPT-5.6** (server-side only)
3. **Teacher** ⟷ **server** (approval, answer-key edits)
4. **Server** ⟷ **PostgreSQL** (tenant-scoped)
5. **A2UI catalog** — the allowlist boundary between model output and executable UI

## STRIDE

### Spoofing
- **S1 — forged student/teacher identity.** Mitigations: invite-only + class-code (Q64/65); email magic-link + MFA for adults (Q74/75); school-authorization + consent before minor activation (Q76). _Demo uses seeded judge accounts; real auth deferred — document as a known demo gap._
- **S2 — model output spoofing a valid lesson.** Mitigations: server validates the draft (Q77); A2UI compiler rejects unknowns (AgDR-0001).

### Tampering
- **T1 — client tampers its own score.** Mitigations: AgDR-0002 — client emits events only; client score ignored; answer key server-only. **Submission test required.**
- **T2 — tampering of published activities / answer keys.** Mitigations: published versions immutable (Q29); answer-key edits audited (Q68); attempts pin versions (Q144).
- **T3 — malicious prompt injection via teacher input reaching the model/UI.** Mitigations: server-side prompt + content moderation with blocking states (Q73); allowlisted renderer + CSP/Trusted Types (Q78); no generated HTML/JS execution.

### Repudiation
- **R1 — "I didn't approve/grade that."** Mitigations: audit events for logins, generation/approval, answer-key edits, work access, exports/deletes, retention, AI calls, validation failures (Q68); approving teacher + model/provider/version recorded per pack (Q147).

### Information disclosure
- **I1 — answer key leaks to the client.** Mitigations: AgDR-0002 — key absent from A2UI messages and client bundles; stored separately from visual components. **Submission test required.**
- **I2 — student data sent to the model.** Mitigations: no identifying data, no student images; only de-identified activity/structured data (Q16); no training on student data (Q156).
- **I3 — children's data exposure / wrong-region processing.** Mitigations: EU storage + EU inference (Q129, **UNRESOLVED** — Q103/108); real data gated on DPA + residency + security + consent (Q109/110); demo uses synthetic data only. _Open: confirm EU eligibility of the GPT-5.6 path before any real data._
- **I4 — admin overreach into student work.** Mitigations: no default admin access to individual work; exceptional access delegated + audited (Q67); no ordinary impersonation (Q151).

### Denial of service
- **D1 — AI generation cost/abuse.** Mitigations: per-tenant/teacher quotas; one active pack job per teacher; rate limits; cost telemetry (Q139); one server-correction attempt then teacher-controlled retry (Q27).
- **D2 — submission/grading flood.** Mitigations: server-side grading is cheap + deterministic; rate-limit submission events.

### Elevation of privilege
- **E1 — student escalates to teacher/admin capabilities.** Mitigations: server-authoritative authz on every action; tenant isolation (Q18); school-admin role boundaries (Q67).
- **E2 — unknown A2UI component/action escalates UI capability.** Mitigations: catalog allowlist + versioning (AgDR-0001). **Submission test required.**

## Highest-priority controls for the 48-hour build (must exist, not defer)
1. Answer-key isolation + client-score-ignored (T1, I1) — with submission tests.
2. A2UI catalog rejects unknowns (T3, E2) — with a submission test.
3. Server-side validation of model output (S2, T3).
4. Synthetic-data-only + EU-residency gate documented (I3).
5. Deterministic adaptation trace (supports R1 + the demo narrative).

## Open
- **EU residency of the GPT-5.6 path** (Q103/108/129) — confirm before any real student data.
- **Full auth is seeded for the demo** (S1) — document as a known demo gap, not a production claim.
