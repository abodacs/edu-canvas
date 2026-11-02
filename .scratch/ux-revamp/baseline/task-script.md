# Baseline task script — Edu-Canvas UX revamp

Version 2, 2026-11-02. Measures the CURRENT UI before any screen is replaced,
then re-measures each replaced screen with the same tasks and scoring.
Moderated sessions record: task success (binary, criteria below), time on
task, error count (wrong path, dead end, gate refusal), SEQ (1–7, asked
immediately after each task), and SUS once per session (directional below
n=12).

## Honest-label rule

AI-persona scores and critique runs are supporting signals, never proof.
Headless runs (friction-runner.mjs) measure friction (time + step counts) and
must be labelled as such; they are not usability.

## Teacher tasks

- **T1 — Get to your workspace.** From `/`, sign in as a teacher and reach the
  composer. Success: composer visible without help. Errors: wrong path,
  re-reads, failed sign-in.
- **T2 — Turn an idea into draft variants.** Write the objective "Introduce
  equivalent fractions with paper strips and fraction bars." and create the
  lesson. Success: four variant cards render. Errors: blocked draft needing
  recovery, resubmits, wrong control.
- **T3 — Ground the draft in a real source.** Upload `fixtures/fractions-notes.txt`
  (or a partial fixture), resolve the alignment notice and skills confirm, so
  the composer shows the source chip. Success: "Drafts use …" note visible.
  Errors: upload failure, missed confirm, replaced file.
- **T4 — Review and approve one screen.** Open the review studio, open one
  variant, acknowledge warnings if shown, approve. Success: "Screen approved".
  Errors: missed ack, wrong back path, re-approval.
- **T5 — Publish to one learner.** Continue to publish, pick the learner,
  publish and assign. Success: publication id shown. Errors: publish blocker,
  wrong learner, second click confusion. NOTE: at the walk's HEAD the
  published pack never carries learner activity (W6) — record what the
  participant does with the "no activity" message; that copy is part of the
  task.
- **T6 — Recover from a block.** Given a moderation block, use the recovery
  panel to revise the request and reach a draft. Success: a clean draft
  follows the revised prompt. Errors: retry-with-same-prompt (refused),
  abandonment.

## Student tasks

- **S1 — Open the link and start.** From the copied learner link, sign in as
  the student and reach the board. Success: activity board visible.
- **S2 — Complete the matching activity.** Pair every source to a target,
  submit. Success: score shown.
- **S3 — Recover from a failed save.** With the network interrupted at
  submit, restore and submit without losing pairs. Success: submission lands
  exactly once. NOTE: S1–S3 are blocked at HEAD by W6 (no canonical activity
  can exist); run them after W6 lands.

## Session shape

1. SUS before tasks (or after, if the moderator prefers end placement — keep
   it consistent across rounds).
2. T1, T2, T3, T4, T5, T6 in order on one synthetic class; SEQ after each.
3. Debrief: one thing you'd change first.

## Sample plan (default, D5)

- Round 0 (baseline, current UI): 5 teachers, one 45-min session each.
- Round 1 (after the first two replaced screens): same 5 tasks, same scoring,
  5 teachers.
- Students: 3–5 per round with a teacher present, after W6.
- SUS: directional until n≥12; report with interval, not just a mean.
