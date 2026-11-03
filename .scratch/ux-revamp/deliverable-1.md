# UX revamp — deliverable 1 (before any code)

Worktree `ux-revamp`, branch `worktree-ux-revamp`, 2026-11-02. No application code changed. Decisions for Abdullah are marked **DECIDE** with a default; the default applies if there is no answer.

## 0. Three findings that shape everything

1. **The "raw persona transcripts" are not evidence.** `docs/research/teacher-simulation-118/` v2 holds role cards with "no simulated outcomes". The only runs (`legacy/v1/runs/*.json`, `sessions.csv`) are invented events and minutes; the archive README says not to present them as evidence. I used them only as hypotheses to test with real teachers. Every "conflict with evidence" below is therefore "conflict with a hypothesis" until real sessions exist.
2. **Several mocks promise behaviour the backend does not have** (section 2: class publish, unpublish, un-approve, lessons dashboard). These are product and API work, not restyling.
3. **The implementation gate is closed.** `docs/product/teacher-ui.md#implementation-gate` requires Abdullah's explicit approval plus verification skills covering content, pedagogy, rendering and interaction before any build, dependency or prototype. `verify-lesson-gate` covers only sampled structure (its own docs say so). AgDR-0016 is still "proposed". Design and docs work proceeds; code waits for the gate.

## 1. Flow maps, derived from the code

### 1a. Draft state machine (`generationStateValues`, `src/server/generation/service.ts`)

```
requested ─> generating ─┬─> ready-for-review      (gateArtifact pass; may carry warnings)
                         ├─> blocked-by-validation (hard_block finding; recovery = edit | replace | retry)
                         ├─> blocked-by-moderation (category only; MODERATION_REVISION_REQUIRED on resubmit)
                         ├─> failed-retryable      (provider timeout/rate-limit/transient; GENERATION_CLAIM_EXPIRED)
                         └─> failed-terminal
```

- Retry only from retryable states, same prompt: `DRAFT_NOT_RETRYABLE`, `RETRY_METADATA_MISMATCH`, `DRAFT_SUPERSEDED`, `CANCELLATION_FORBIDDEN`, `GENERATION_SOURCE_NOT_READY`, `CURRICULUM_STANDARD_NOT_CONFIGURED`.
- Moderation block cannot be retried with the same prompt; revising the prompt has no link to the old request (open issue #148). All generation errors flatten to 500 (open issue #149).
- Recovery per finding comes from one table (`safety/recovery-policy.ts`): retry > replace > edit. Warnings never block; they always say "edit".
- One request yields **three variant kinds** in the contract (`standard | scaffold | challenge`) plus a reverse-path (learning path) target.

### 1b. Source snapshot (`sourceSnapshotStateValues`)

`extracting -> complete | partial | failed`. Gaps: missing prerequisites, extraction faults (scanned-page, broken-math, encoding, parser-fault), unverified alignment. Upload snapshots always carry an alignment notice. A partial snapshot needs `requiredSkillsConfirmed`; unverified alignment needs `alignmentAcknowledged` before review. Corrected text replaces a snapshot (`replacesSnapshotId`). Only `upload` mode exists in code (`sourceModeValues`).

### 1c. Review and publication (`src/server/publication/`)

```
pack_versions: ready-for-review | blocked-by-validation   (immutable rows; edit = new row with parent link)
approve(target): 4 variant targets + 1 reverse-path target ("learning-path"), pinned to artifactHash + validationResultHash
                 warnings must be acknowledged by code (WARNINGS_UNACKNOWLEDGED)
revise: <=8 edits, fields: sourceItem, targetItem, hint, feedbackCorrect, feedbackIncorrect; needs expectedArtifactHash
publish: re-runs gate; needs ALL targets approved (MISSING_APPROVAL); one learnerId; gate must pass (GATE_BLOCKED / GATE_STALE)
         -> one publication + one assignment; unique (tenant, publication) => ONE learner per publication
```

Errors teachers can hit: `REVIEW_NOT_READY`, `REVIEW_STALE`, `MISSING_APPROVAL`, `WARNINGS_UNACKNOWLEDGED`, `GATE_BLOCKED`, `GATE_STALE`, `PUBLICATION_FORBIDDEN`, `PUBLICATION_UNAVAILABLE (503)`. No route exists to un-approve, unpublish or list lessons.

### 1d. Learner (`learner-contract.ts`)

Run stage: `assigned -> active -> awaiting-decision | paused -> advanced -> completed`. Sections: worked-example, guided-practice, independent-check, follow-up. First-response status `pending | submitted`; correctness `correct | partial | incorrect`; assistance `none | hinted`. Server grades. Routes: `GET /api/learner/runs`, `POST /api/learner/attempts`. The teacher decision (accept, pause, override) is stored but has no teacher route in `src/routes/api`.

### 1e. User flows

- **Teacher:** sign up/in -> membership pick -> Studio (objective, optional source) -> [source review] -> generate -> variants -> review/edit/approve each -> acknowledge warnings -> publish to one learner -> (results, next-step decision: not built).
- **Student:** link with assignment + variant -> `/learn` -> pair -> Done -> score -> wait for teacher.

## 2. Mock vs state machine vs evidence (gap list)

Source tags: **[code]** repo file, **[hyp]** v1 invented run, **[v2]** v2 role card question. Fix proposals only. **DECIDE** each: mock or evidence wins. Default: *code wins for gates, mock wins for visual*; where the mock needs a new backend capability, the screen ships without it and the capability becomes its own issue.

| # | Mock says | Conflict / gap | Source | Proposed fix | Default |
|---|---|---|---|---|---|
| G1 | 3-publish: "Assign to Class 4B · 26 learners… Publish to 24 learners… A to 6, B to 4, D to 14" | One publication reaches one learner; roster/class filtering is "#6/#98 scope" | [code] `docs/architecture-harness.md` ("One assignment per publication"); `publicationPublishInputSchema.learnerId` single | Phase 1 mock = single-learner picker (what exists). Class assign is a backend issue first | Mock bows to code |
| G2 | 3-publish: "You can unpublish later" | No unpublish route or action (`publicationActionValues` = approve-target, revise-version, publish) | [code] | Remove the sentence now; add unpublish to backlog | Remove copy |
| G3 | 2-review: "Un-approve" on an approved variant, "no learner has it yet" | No un-approve route; approvals are pinned records | [code] `publication-contract.ts` | Drop the control; keep "a later edit makes version 3" | Drop control |
| G4 | 4-dashboard: Needs-you list, all lessons, learner/variant/results, "16 ready for 4.NF.A.2" | No lessons list route, no results/teacher-decision route; teacher decisions stored only | [code] `src/routes/api` has no list/results endpoint; `learner/service.ts` 69 lines | Dashboard is a new backend capability. Ship it last, or as an empty-state shell | Last |
| G5 | 1-studio: "Four variants… A Worked example, B Guided, C Independent, D Matching" | Contract kinds are `standard | scaffold | challenge`; mock labels are product names | [code] `variantKindValues` | Map labels in one copy table, verified against `variantKindValues` | Add copy map |
| G6 | 1-studio: "Draft again (replaces unapproved variants). Approved ones stay." | No code path found that retains approved variants across a new generation; a revision link is open issue #148 | [code] `retryOfRequestId` rejects blocked-by-moderation (#148) | Treat as unverified; test in the walk (step 3). Fall back to "Draft again makes a new set" | Unverified |
| G7 | 1-studio: "Edit objective" after a block; 6-errors: "Rewrite objective" | Works only if #148 lands; today the new prompt is a fresh request | [code] #148 | Fresh request with the old text prefilled | Fresh request |
| G8 | 6-errors: "Learning Commons didn't respond. We tried twice… upload" | Code has one retry then upload per product doc; no UI-visible retry counter | `teacher-ui.md` line 20; `source-contract.ts` | Keep copy; wire retry count from the real error | Keep |
| G9 | 6-errors: PDF "pages 3-4 have no readable text" | Failure reasons are an enum; page ranges may not exist in the gap shape | [code] `sourceGapSchema` | Confirm gap carries page info; else copy says "some pages" | Verify |
| G10 | 2-review: "Learning path" Before/This/Next | Mock shows one path; code has a validated forward path; reverse-path is the approval target, id `learning-path` | [code] | Keep; label must say which path is approved | Keep |
| G11 | 3-publish: "Preview as student" | Preview route exists (`/api/publications/versions/:id/preview`); no student-view flag | [code] | Reuse the preview route, label "preview" | Keep |
| G12 | 7-learn: "Your teacher sees your result and picks your next lesson" | Matches `awaiting-decision`, but the decision UI does not exist | [code] | Keep copy; it is accurate student-side | Keep |
| G13 | 8-matrix: 8 session/auth failures | Six `/login` failure codes must map to real codes; mock says so itself | 8-state-matrix footnote | Table of code -> notice in the walk | Do in walk |
| G14 | All screens: English only | `ar` is a supported `LessonLanguage` with RTL; T11 [v2] question is Arabic output; issue #10 says UI copy is English-only | [code] + [v2] | Out of event scope; mocks need an RTL pass later | Defer, list |
| G15 | 2-review: two checks "My edit still fits" + "unit fractions aren't in the source" | Gate: warnings acknowledged by **finding code**, not free-text checks | [code] `acknowledgedFindingCodes` | Checklist rows come from finding codes, not prose | Code-driven |
| G16 | 2-review: reviewer sees one variant at a time | T01 [hyp]: "early-career, uneven maths confidence… may miss errors"; v1 T05: unequal-whole diagram | [hyp] `legacy/v1/runs/T01.json`, `T05.json` | Do not treat "review done" as "error caught"; show gate findings beside the content, not behind a tab | Hypothesis only |
| G17 | 2-review: edits are per section with "Edit section" | T06 [hyp]: keyboard cannot focus the feedback-branch control; T06 [v2]: zoom, keyboard | [hyp] `legacy/v1/runs/T06.json` | Every control reachable by keyboard at 200% zoom is a hard acceptance row | Hard bar |
| G18 | No mock shows lost connection mid-review | T03 [v2] S2: "connection fails during preparation" | [v2] `protocol.md` S2 | Add an "offline / saving failed, work kept" state | Add state |
| G19 | 3-publish: link copy "Copy all 24 links" | Each link must open only that learner's variant; the code ties assignment to learner and session | [code] | Single link per publication for now | Single link |

Evidence caveat: G16-G18 rest on invented runs. They are test hypotheses, not findings.

## 3. State matrix (screen x state)

Legend: **M** = mock exists, **8** = in 8-state-matrix, **C** = state exists in code, **-** = no mock. Cells marked `walk` need a real run in step 3.

| Screen | empty | loading | partial extraction | gate-blocked | error | approved / un-approved | phone |
|---|---|---|---|---|---|---|---|
| Landing | M | - | n/a | n/a | - | n/a | - |
| Sign in / up / school | M | M(8) | n/a | n/a | M(8: 6 failures, rate-limit, unavailable, expiry) | n/a | - |
| Studio (compose) | M(6) | - (generating shown? no) | M(source gaps in 2) | M(6 moderation) | M(6: grounding, PDF, 503) | n/a | - |
| Studio variants | - | - | - | M (variant C blocked) | - | M (approved D) | - |
| Review | - | - | M (gap check) | M (blocked) | M(8: review error dismiss) | M approved / un-approve (un-approve unsupported, G3) | M (captures/review-mobile-*) |
| Publish | - | - | n/a | M (C not available) | - (GATE_BLOCKED, GATE_STALE, MISSING_APPROVAL, PUBLICATION_FORBIDDEN, 503) | M | - |
| Lessons dashboard | M(6) | - | n/a | M (blocked in Needs you) | - | M | - |
| Student board | - | M(8) | n/a | n/a | M(8) | n/a | - (the board is mobile-first, no phone capture) |
| Preview panel | - | - | n/a | n/a | M(8: 401/403/404/503) | n/a | - |

**Not covered by any mock (add or accept):** generating/loading state in Studio (the 100 s provider deadline; one claim-expiry path); failed-retryable vs failed-terminal; cancel generation; idempotency conflict; stale review (`REVIEW_STALE`, `GATE_STALE`); `WARNINGS_UNACKNOWLEDGED`; source `extracting`, `partial` confirm, `failed`, alignment acknowledge; multi-snapshot replace; publish idempotent replay; session idle warning is in the index text but not drawn; phone for every screen except Review; student completed/awaiting-decision/paused screens; dark/forced-colors; RTL.

`walk` is blocked until the app runs with a provider and DB. Next action: boot with the deterministic provider (dev only per the identity boundary) and real source files (selectable PDF, scanned PDF, TXT, MD), then fill every `walk` cell with a screenshot. See open question Q1.

## 4. Core tasks and measurement plan

**Teacher tasks (T1-T6):** T1 get from sign-in to a workspace; T2 write an objective and get four variants; T3 attach a source and resolve a partial or failed extraction; T4 review one variant, fix one flagged item, approve; T5 publish to a learner and copy the link; T6 recover from a block or failure (moderation, grounding, 503).
**Student tasks (S1-S3):** open the link and start; complete the matching activity; recover from a failed save.

**Measures per task:** success (binary, with predefined criteria), time on task, error count (wrong path, dead end, gate refusal hit), SEQ (7-point, one question right after each task). **Overall:** SUS once per session.
**Starting point:** moderated sessions on the **current UI** before replacing anything. 5 teachers per round is enough to find usability problems; it cannot give statistically reliable SUS. Treat SUS as directional until n >= 12. Students: 3-5 with a teacher present. Quantitative gate "no worse than starting point" needs the same task script and the same scoring on old and new screens.
**Instrumented proxies when no humans:** scripted Playwright runs record time and step counts per task. They measure friction, not usability, and must be labelled as such.
**Per replaced screen:** repeat the same tasks that touch that screen; compare against the baseline. Report effect with the interval, not just a mean.
**Real teachers, DECIDE:** default **5 teachers, one baseline round now, one round after the first two screens**. Recruitment is not established (issue #118 pending). Without real teachers, the "no worse than baseline" bar cannot be met honestly and stays open; do not substitute AI personas. 

## 5. Stack: shadcn on Base UI (AgDR-0016) vs the gate and harness

**State today:** `components.json` exists (`base-nova`, `rtl: true`), `@base-ui/react` 1.6.0, shadcn CLI 4.22.1, Tailwind 4.3.3. `src/components/ui` holds only button, badge, card. `src/styles.css` has 238 `--teacher-*` references (oklch) and an `@theme inline` block at line 90. `base.css` has 43 tokens (hex colors, `--s-1..8`, `--fs-*`, `--r-*`, `--ease`, serif/sans).

| | Adopt (AgDR-0016 option A) | Keep hand-written |
|---|---|---|
| Accessibility | Tabs, radio group, select, dialog with correct roles and keyboard handling from the primitive; answers G17 | Re-implement and re-test each |
| Harness | `src/components/ui` is UI-only; `verify:architecture` forbids UI importing runtime. Compatible. Learner content stays on the A2UI catalog, never shadcn | No risk |
| Client boundary | Components are client code; no secrets involved. `verify:client-boundary` unaffected | Same |
| Cost | Two bumps (shadcn 4.23, base-ui 1.9). Restyled components need manual `--diff` review on update | None |
| Bundle | Base UI is tree-shakable; each primitive adds KB. Budget needed | Smaller |
| Gate | Adoption is a dependency change, so it is **behind the implementation gate** | Same gate for any UI work |

Recommendation: **adopt** (default). Base UI is already installed; the real change is adding ~12 primitives and moving tokens. Risk: the 238 `--teacher-*` uses mean the token move touches every current screen. Mitigation: map tokens first (below), keep `--teacher-*` as aliases until the last old screen is deleted.

**If accepted (order):**
1. Move the 43 `base.css` tokens into `@theme` unchanged (names, values, no new tokens). Add oklch equivalents only if a contrast check forces it. Keep `--teacher-*` as aliases.
2. Component map from the mocks:
   - composer card -> custom (the textarea + helper layout is product-specific); input/textarea/label -> shadcn
   - grade/language pickers -> radio group / select (shadcn)
   - variant tab list -> tabs; variant cards -> card (exists) with status badge (exists)
   - warning/blocked/error banners -> alert
   - lessons table -> table
   - loading -> skeleton; account menu -> dropdown menu; hints -> tooltip
   - fraction diagram, matching board, math text -> **custom** (A2UI renderer; must not become shadcn)
   - landing hero sample -> custom; stageshow fits here only (faux UI illustration for `0-landing`). It does not suit product screens, so I will not use it on Studio or Review.

## 6. Rollout, switch, order

**Switch, DECIDE.** Default: a per-route build-time flag in `src/config` (e.g. `UI_REVAMP_ROUTES=studio,review`) read in the route module, with the old screen at `/…?ui=legacy` for the review window. Why: server config already owns env; no new runtime store; `verify:architecture` forbids unowned global state. Alternative: a query param only (no deploy to flip, but a user can land in either UI at will). Delete the old screen once the bar passes (migrate-callers-then-delete).

**Order, DECIDE.** Default: (1) tokens + fonts + primitives (no visible change), (2) **Sign-in/up** (low risk, tests the whole pipeline: tokens, baselines, axe, budgets, with no lesson-gate exposure), (3) **Studio compose + variants**, (4) **Review** (highest value and highest gate risk: warnings, acknowledgements, edits, approvals; has the only phone captures), (5) **Publish**, (6) **Student board** (smallest, high-stakes for kids; do after a11y/budget practice), (7) Landing (stageshow), (8) Lessons dashboard last (needs new backend).
Why not Studio/Review first: they carry the gate logic and the most unmocked states; a first screen should prove the pipeline.

## 7. Done bar proposals (per screen)

- **Visual diff vs `captures/`:** only 3 captures exist (`studio-desktop.png`, `review-mobile-before/after.png`). Proposal: tolerance <= 1% changed pixels at the same viewport, masked for the text-length-driven areas; before building, I regenerate captures from the mocks for every screen and state so each target exists. Intentional differences (real data, gaps G1-G19) are listed per PR.
- **Playwright:** one flow per matrix cell, with screenshot baselines; needs adding `@playwright/test` and axe, which is itself a dependency decision under the gate.
- **axe:** zero serious or critical (project doc #10 already names axe-core + manual contrast; screen readers remain a recorded limitation).
- **Budgets (proposed, adjust after measuring today):** LCP <= 2.5 s on throttled mobile, INP <= 200 ms, route JS gzip <= current route + 20 KB.
- **`pnpm check` green** incl. `verify:client-boundary`, `verify:boundaries`.
- **Task measures** no worse than the baseline (needs section 4).

## 8. Decisions for Abdullah (each with a default)

| # | Decision | Default |
|---|---|---|
| D1 | Approve implementation and name verification skills (the gate) | Hold all code until given; design continues |
| D2 | Adopt shadcn/Base UI per AgDR-0016 | Yes |
| D3 | Visual-only vs flow change per screen | Visual-only for sign-in, student board; flow changes only where G1-G4 are resolved by trimming the mock to current backend |
| D4 | Mock vs evidence conflicts (G1-G19) | Code wins for gates; mock wins for pure visual; invented runs never win |
| D5 | Real teachers: whether and how many | Yes, 5, baseline round first |
| D6 | Capacity and time budget | Unset; existing estimate 36-57 h applies to the old plan; I propose no commitment |
| D7 | Switch mechanism | Build-time per-route flag |
| D8 | Screen order | Section 6 |

## 9. Verification status

- Read and quoted: AgDR-0016, architecture harness, teacher-ui gate, shared contracts, generation/source/publication/learner state, all 9 mocks, v1/v2 simulation files.
- Not done: running the app (matrix walk), tests, `pnpm check`, project-map run, Playwright baselines. The `stageshow` skill was installed into `.agents/skills/` (and `skills-lock.json` changed); unstaged.
- `/modern-web-guidance` not yet run: it is required before HTML/CSS/client JS, so it runs at the first code step.
- `/principle-experience-first` is installed (`~/.claude/skills/principle-experience-first`), so no fallback source was needed.
