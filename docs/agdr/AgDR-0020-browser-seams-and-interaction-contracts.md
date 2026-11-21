# AgDR-0020 — Browser seams and interaction contracts

> In the context of deleting prose comments from `src/components`, `src/routes`, `src/lib`, and `src/shared` (AgDR-0019), facing the loss of recorded session, accessibility, and flow contracts that no type or test fully restates, I decided to consolidate the harvested decisions here as the durable record, to keep each contract enforced by the seam that owns it, and to accept that this page is prose, read at review time, not at parse time.

Recorded 2026-11-21. Harvested from code comments deleted by the comment-free-source sweep ([AgDR-0019](AgDR-0019-comment-free-source.md)). Each row names the module that owns the contract.

## Session and identity on the client (`src/components/auth`)

- The auth client states one contract per endpoint: `GET /api/auth/context` mints the pre-auth challenge before any mutation; sign-in returns an active projection or a membership choice; sign-up is always verification-pending for new and duplicate addresses alike; `POST /api/auth/membership` consumes the pending credential for one class; `GET /api/auth/session` never renews idle time and carries the session-bound CSRF token; `POST /api/auth/continue` is the only renewal; logout revokes locally, then clears site data.
- Pending memberships after sign-in live in same-tab module memory, never browser storage: the pending authority itself is an HttpOnly cookie, and the labels only drive the choice screen for the tab that just signed in. The store is a mutable holder so the module keeps single-source-of-truth without reassigning a top-level binding.
- A revocation request must outlive the navigation that follows it; `keepalive` semantics, not fire-and-forget.
- `BroadcastChannel` has no origin concept and no `targetOrigin` argument; the sign-out/expiry signal travels only to this origin's other tabs. A missing channel is not a failure.
- Session reads re-fetch server truth instead of showing a signed-out page over a live session: the credential is HttpOnly, so only a server response can clear it. A never-signed-in visitor is not an expired one — only a session that loaded and then vanished counts as expiry. A monotonic epoch drops late responses from superseded requests.
- The idle warning shows 120 seconds before the server-provided deadline and announces once; there is no ticking countdown in a live region; the banner is a labelled `alertdialog` (a native `<dialog>` would announce as `role="dialog"` and lose the semantics), and Escape hands focus back to the work.
- An auth failure with no control to focus makes the notice host the focus target; client-side validation focuses the failing field instead. A repeated submit can leave error text unchanged, so a request counter guarantees the render that carries the focus move. A retry that succeeds replaces the failure it was recovering from.

## Middleware, router, and response headers (`src/router.tsx`, `src/start.ts`, `src/server/security-headers.ts`)

- The middleware mints one nonce per request ([#130](https://github.com/abodacs/edu-canvas/issues/130)); the router stamps it on the inline hydration bootstrap and rendered styles, and the client reads it back from the `csp-nonce` meta tag. The nonce key has one writer and one reader so a rename cannot silently break the hand-off.
- Adding `src/start.ts` replaces TanStack Start's default middleware list, so the default CSRF filter is repeated there; dropping it would strip server functions.
- Security headers are one policy applied once at the HTTP edge: the response class comes from the request path, so every route inherits the set and a new route is a document by default. A non-document response renders nothing but still denies `frame-ancestors`. Degrading headers must never turn a served response into a failure — an unreachable shape is left untouched. `getGlobalStartContext()` is untyped framework data and is narrowed at the seam rather than cast in the router.

## Teacher studio and workspace (`src/components/studio`, `src/routes/workspace.tsx`, `src/routes/login.tsx`, `src/routes/index.tsx`)

- The teacher curation surface ([#5](https://github.com/abodacs/edu-canvas/issues/5)) routes every action through the publication seam; the component never computes approval or publication state locally.
- The source panel ([#114](https://github.com/abodacs/edu-canvas/issues/114)) binds generation to a reviewed, complete snapshot through `onBoundSnapshotChange`; the draft composer stays prompt-only.
- Moderation recovery ([#119](https://github.com/abodacs/edu-canvas/issues/119)): a blocked result and the same-prompt refusal open the same panel; the panel replaces the retry affordance; a ready draft survives a later block (variant B) so approved work is kept while the blocked request is revised; "Revise request" arms the link so the next submission carries a fresh operation key and names the blocked request; a ref keeps the composer from re-rendering on arm. Moderation copy never offers the unchanged request again ([copy rules](../../docs/design/blocked-generation-recovery.md)).
- Variant cards are the chooser ([#168](https://github.com/abodacs/edu-canvas/issues/168) P0-1): a native radio group with the membership screen's explicit-key pattern. Failure focus lands on the inline status beside Create lesson (P0-2), and the landing confirms sign-out through `?signedOut=1` (P2-5) so refreshes and shares never carry the banner.
- Opening a stored draft (`/workspace?draft=<id>`) is one load per link, free of React so its ordering is testable; the opening flag follows the link and never sticks after the link goes away mid-read; an aborted read changes nothing; nothing polls. Callers pass fresh callbacks each render, so the read goes through a ref. A draft still `generating` surfaces once as a pending notice.
- Race guards: no submission may race the stored-draft read; a response that lands after the session changed is discarded; browser `crypto.randomUUID()` (UUIDv4) is used because UUIDv7 does not exist in browsers and the operation key needs uniqueness only.
- The membership choice is same-tab module memory resolvable in initial state; a full page load always starts empty so server and first client render agree. The first class is preselected until the teacher picks another. After sign-in succeeds the route stays mounted while `/login/membership` renders, so a stale pending flag cannot leave the form disabled after a cancel.
- The studio pins the classroom's current standard for generation because the session projection carries no curriculum id, until a teacher can choose one.

## Learner page (`src/components/learn`, `src/routes/learn.tsx`)

- The learner board carries `data-source`/`data-target` hooks so the page can name where focus lands after an action removes or disables the focused control ([#9](https://github.com/abodacs/edu-canvas/issues/9)); focus moves once the removing render commits; the request lives in a ref, consumed not shown.
- Bidi isolation: each Latin or numeric token in a right-to-left run is wrapped in `<bdi>` so it keeps its own order without changing the Arabic base direction; a whole left-to-right sentence is isolated once (word-by-word isolation would let the base direction reverse word order); left-to-right pages pass text through untouched.
- The page has exactly one live region; the progress line is visible text, not a second announcement. The graded line is shared by the result panel and the live announcement.
- The pack's approved language decides the page's `lang` and `dir`; approved copy is never translated, and a version stored before approved copy existed keeps the document's English default.

## UI primitives (`src/components/ui`)

- `Field` clones the native control to pass id/ARIA wiring down (lint-suppressed at the site), so label, help, and error ids reach the real input; a shown error always marks the control invalid, a caller-supplied `aria-invalid` for server-side state stays.
- `Button` with `busy` keeps the label mounted and never sets `disabled`: a busy control must stay focusable; `aria-disabled` is the focusable disabled form.
- The app shell renders the signed-in chrome and the single `<main id="main">`; a page that adopts it renders no second `<main>`. The skip link is the document's first focusable element and lives in `__root.tsx`, outside the shell. Breadcrumb current-page matching is exact (search included) so an ancestor on the same path is never announced as current.
- Status pills and steps carry meaning in text; colour and tone only reinforce it. Chips are a fieldset of native radios (radio mode) or `aria-pressed` buttons (toggle mode); a chip never sets its own role.
- The landing scene is inline SVG only — the CSP allows no remote image host — and reads `--scene-*` tokens so artwork and tokens share one palette; the closing dusk scene reuses the hero's dot patterns and stipple filter, and both scenes stay mounted so the references resolve. The studio window on the landing page is a static illustration of the seeded fixture with hand-written verdict copy, never server state.
- The synthetic-data marker owns only the hook every surface shares; the sentence and element belong to the caller, because copies differ by place.

## Shared seam helpers (`src/lib`, `src/shared`)

- A fetch rejection carries no HTTP status, so route code uses a sentinel for the network-failure outcome.
- Generation failures resolve to one teacher-ready message: identity-boundary codes keep canned copy; generation seam codes carry a curated server message surfaced verbatim plus the seam code so the studio can open the matching panel ([#104](https://github.com/abodacs/edu-canvas/issues/104) states the real retry window in that message).
- The stored-draft client collapses every transport outcome into three results so the composer never handles transport detail; a missing draft and another teacher's draft read identically.
- Shared contracts (`learner-contract.ts`, `progress-contract.ts`, `publication-contract.ts`, `source-contract.ts`, `generation-contract.ts`) are browser-safe published language: the route parses the payload again on arrival so a renamed field fails on both sides. Storage schemas stay stricter and server-side. The teacher progress view is observational: stored decisions render verbatim, never recomputed; no answer key or private field crosses.
- `story-plan.ts` repeats the server's `ValidatedLearningPath` shape on purpose: `src/shared` must not depend on `src/server`; if the server type gains a field a beat should show, add it here in the same change. Role labels are surface chrome and the only strings a beat may carry that do not come from the accepted path. The connection clause is an exact byte slice of stored approved copy, matched on the raw string and returned verbatim, never recased.

## Alternatives considered

- **Keep these as comments at each site** — rejected by [AgDR-0019](AgDR-0019-comment-free-source.md): the same sentence restated at many sites drifts independently; the general rules moved to AgDR-0019 §4 standing interpretations, the specific decisions live here.

## Consequences

- A reviewer questioning an unusual pattern (explicit key handlers, `<bdi>`, focus counters) finds the reason here instead of beside the code.
- New interaction work must extend this record or its owner skill instead of adding a comment.

## Handoff

The [UI ownership map](../../scripts/ux-ownership.json) and [ARCHITECTURE.md](../../../ARCHITECTURE.md#bounded-contexts-and-context-map) own file-level ownership. The blocked-generation copy rules live in `docs/design/blocked-generation-recovery.md`. Enforcement of the comment ban is [AgDR-0019](AgDR-0019-comment-free-source.md).
