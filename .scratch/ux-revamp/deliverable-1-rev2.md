# UX revamp — deliverable 1, revision 2 (still before UI code)

Rev 2, 2026-11-02. Worktree `ux-revamp`, branch `worktree-ux-revamp`, rebased
on `main` `3e65861`. Rev 1 (`deliverable-1.md`) stands except where corrected
below. New since rev 1: the app walk (objective step 3) is DONE, gap
resolutions G6/G9/G13 are in, the mocks G1–G3/G19 are amended, the baseline
task script and friction runner exist with real numbers, and the walk found
two P1 defects and one P0 that reshape the rollout.

Evidence index:

- Walked state matrix (open in a browser): `walk-matrix.html`
- Raw walk log: `walk/log.jsonl` · driver scripts `walk/phase*.mjs` · fixtures
  `fixtures/` (TXT, MD, text PDF, scanned PDF, mixed PDF)
- Baseline: `baseline/task-script.md`, `baseline/friction-runner.mjs`,
  `baseline/results.json`
- Mock targets for the visual diff: `.impeccable/mocks/screens/captures/*-target.png`

## 1. Corrections to rev 1 (verified against `3e65861`)

| Rev 1 said | Correction |
| --- | --- |
| "revising the prompt has no link to the old request (#148)" | STALE. #185 landed `revisesRequestId` (`generation-contract.ts:43`) + the recovery panel. Verified live: block on `personal-data` → "Let's reshape that request." → Revise request → next submit links to the blocked request. G7 resolved. |
| "all generation errors flatten to 500" (#149) | WRONG as stated. Typed `GenerationRequestError`s carry their own code/status at the seam (`generation/delivery.server.ts:30-47`); only untyped exceptions become 500 `GENERATION_FAILED`. #149's client half (keeping the seam code) landed in #185. |
| `GET /api/learner/runs` | POST only (`learner/runs.ts:9`). |
| 238 `--teacher-*` uses | 158 occurrences, 7 distinct tokens (butter, clay, forest, ink, mint, paper, sky). |
| "idle warning in the index text but not drawn" | STALE. `SessionExpiryBanner` renders on `/workspace` 120 s before the earlier deadline; `SessionEnded` renders after. BOTH captured live (shots 76, 80). |
| T01 quote from `legacy/v1/runs/T01.json` | The "uneven maths confidence / may miss errors" wording lives in v2 `agents/T01.md:47` and `README.md:13`; the v1 run JSONs are synthetic minutes (`"synthetic": true`). |
| S2 from v1 protocol | The "connection fails during preparation" probe is v2 `protocol.md:39`. |
| generationStateValues in `service.ts` | It is in `src/shared/generation-contract.ts:18-26`. |

## 2. Walk findings (new, ranked)

| ID | Sev | Finding | Fix proposal (default) |
| --- | --- | --- | --- |
| W6 | **P0** | Generation records write `provenance: options.provider.provenance` only (`generation/service.ts:715,735,1102`); the request's `sourceSnapshotId` never reaches the record. The publish bridge requires `decoded.provenance.sourceSnapshotId` (`publication/service.ts:737`), so **every publish ends "no activity to open" and the student loop is unreachable through the UI**. Verified in DB: `provenance->>'sourceSnapshotId'` empty on all attempts, including a fully grounded run. | One-line-class fix: merge `input.sourceSnapshotId` into the record provenance where the record is created. Own PR + tests; not silently folded into the revamp. **Default: fix now, before any screen work.** |
| W5 | **P1** | Idle expiry never renews on activity: `touchSession` is called only in `continueSession` (`identity/service.ts:644`); regular API calls do not renew `lastActivityAt`. A teacher working steadily is signed out 30 min after sign-in, mid-action (captured live: banner at shot 76, ended at shot 80 two minutes after real activity). | Slide the idle window on authenticated activity (renew inside `resolveRequestSession`), or heartbeat `/api/auth/continue` from the client. **Default: renew server-side on activity.** |
| W3 | **P1** | Source upload 500s for every real class tenant: the seed inserts standard `4.NF.A.1` only under `tenant_demo_eu_synthetic`; the studio pins `DEFAULT_STANDARD_ID` for all tenants (`teacher-studio.tsx:55`); `source_snapshots(tenant_id, standard_id)` FK → `standards`. FK 23503. Only the demo tenant ("Grade 4S · Synthetic Fractions") can upload. | Seed the standard rows per class tenant (and/or resolve the classroom's standard from the tenant). **Default: seed fix + a guard that maps the FK case to a typed 422.** |
| W2 | P2 | `GET /api/lessons/sources` always 403 `CSRF_REJECTED`: `isTrustedOrigin` rejects a missing `Origin` (`csrf.ts:48`) but same-origin GET fetches send none; the list route runs the mutation guard (`delivery.server.ts:211`). Panel restore + cancel-on-mount silently no-op — after reload the uploaded source vanishes from the panel. | Exempt GET from the origin guard (keep the session challenge), or have the client send the header pair only. **Default: exempt GET.** |
| W4 | P2 | The generation result view (variants AND blocked states) is lost on reload; no draft list exists. The review surface IS URL-addressable (`/workspace?review=<versionId>`, approvals restored). Regeneration after reload also silently drops the source binding (the chip is gone; a teacher who believes they are regenerating the same grounded lesson publishes an ungrounded pack). | URL-address the result (`?draft=<requestId>`) or list recent drafts. Ties into the dashboard gap G4. **Default: URL-addressable result view in the revamp of the studio screen.** |
| W1 | P2 | Composer ships pre-filled with "equivalent fractions for grade 4" (`teacher-studio.tsx:953`); the "empty" state is not empty. | Empty by default; keep the sample as placeholder only. **Default: empty + placeholder.** |
| W7 | P2 | `/learn` empty state copy is near-invisible (light-on-light). | Contrast fix in the learn screen revamp (axe would flag it). **Default: fix during 7-learn replacement.** |

## 3. What the walk verified live (evidence, not critique scores)

Reached in one sitting each, screenshots + real codes in `walk-matrix.html`:
sign-in (wrong-password copy, CSRF copy), class picker, composer + live
context, upload→extract→complete→review→bound chip, partial with real page gap
("(page 2)" — G9 resolved), failed scanned, generating, ready-for-review
variant chooser, blocked-by-validation with 4 real findings, blocked-by-
moderation + #185 recovery panel + revise path, review gallery/editor/approve
(5 approvals, URL-restorable), publish picker, publish 201 with publication +
assignment ids, the "no activity" branch, session banner + SessionEnded,
student /learn signed-out + empty, phone 390 (landing, workspace, learn).

Not reachable live (code-cited in the matrix): RATE_LIMITED,
AUTH_UNAVAILABLE, failed-retryable/terminal, IDEMPOTENCY_CONFLICT,
WARNINGS_UNACKNOWLEDGED (no warning codes on the walked pack), student
assigned states (W6). Live-model gate verdicts are nondeterministic: one run
blocked-by-validation, the next passed — T2 retry loop handles it.

## 4. Baseline measurement (starting point)

`baseline/results.json` (one run, 2026-11-02, deterministic sign-in, live
model): T1 sign-in→workspace **6.2 s**, T3 ground source **1.4 s**, T2
objective→variants **16.3 s**, T4 review+approve one screen **3.1 s**, T5
publish to one learner (all 5 approvals) **14.5 s**. All five pass headlessly.
These are friction proxies, not usability. The moderated round (5 teachers,
task-script.md) remains the real baseline and needs Abdullah's D5 go.

Runner notes baked in: hydration settle before filling controlled inputs;
live-model gate retry (≤3); publish needs all 5 approvals.

## 5. Mock amendments applied (G1–G3, G19)

`2-review.html`: Un-approve control dropped; approval pinned to the version.
`3-publish.html`: single-learner picker (class assign named as backend gap
G1), "Publish and assign", unpublish sentence removed, single "Copy learner
link", lede/variant counts reconciled. Fresh capture targets for all 9 mocks
+ 2 mobile views in `captures/*-target.png` (visual-diff reference exists for
every screen now; tolerance proposal unchanged from rev 1 §7: ≤1 % changed
pixels at the same viewport, masked text-length areas, intentional
differences listed per PR).

## 6. Updated decisions (defaults apply if unanswered)

| # | Decision | Default |
| --- | --- | --- |
| D1 | Implementation gate (approval + named verification skills) | Still held — no UI code until named. Everything in this rev is design/evidence/scaffolding. |
| D2 | Adopt shadcn/Base UI (AgDR-0016) | Yes (unchanged). |
| D3 | Visual-only vs flow change per screen | Unchanged + W4 makes the studio revamp a FLOW revamp (result URL, draft list) once approved. |
| D4 | Mock vs evidence conflicts | Code wins for gates (proven by walk); synthetic v1 runs never win. |
| D5 | Real teachers, how many | 5, baseline round first (unchanged; runner + script ready). |
| D6 | Capacity/time budget | Unset (unchanged). |
| D7 | Switch mechanism | Build-time per-route flag (unchanged). |
| D8 | Screen order | Sign-in → Studio compose → Review → Publish → Student board → Landing → Dashboard (unchanged), BUT see D9: the W6/W5/W3 fixes land before the Learn/Studio work that depends on them. |
| **D9** | **NEW — fix W6 (P0) now in its own PR?** | **Yes — it unblocks the student loop, the dashboard gap G4, and every Learn-screen done-bar item.** |
| **D10** | **NEW — fix W5 (P1) + W3 (P1) + W2 (P2) before the screen replacements?** | **Yes for W5/W3 (they corrupt task measurements: sessions die mid-task; real classes cannot produce the grounded flow at all); W2 rides along in the studio PR.** |
