# UX redesign stack

The redesign ships as foundation PRs and a set of page slices that run in parallel. This page is the contract each slice works to: what it owns, what it must not touch, and how it proves it is done.

Approval still comes from the [implementation gate](teacher-ui.md#implementation-gate). A slice starts only when its row there reads **approved**.

## The foundation

The first foundation (`feat/ux-foundation`, #196) is merged. It delivered:

- **One stylesheet per surface.** `src/styles.css` only imports `src/styles/*.css`. Two slices never edit the same file.
- **The token layer** (AgDR-0017 slices 1a and 1b) in `src/styles/tokens.css`. This covers the type roles, spacing, radii, divider ladder, shadow, focus ring, scene palette, clay primary and serif headings.
- **`BrandMark`** in `src/components/ui/brand-mark.tsx`. It is the only brand lockup.
- **The gate.** `pnpm verify:ui [routes]` and `pnpm census:capture` run on the shared boot in `scripts/ui-gate/`. CI runs both.

The #197 foundation adds the file ownership map below, the typed primitives and app shell, the `publish.css` split, and the seeded review, publish and blocked views in the gate. Slices start when its contracts PR merges.

### Foundation-only files

A slice may import these but never edits them. If a slice needs a change, it goes in a small foundation follow-up PR that every slice then rebases onto.

- `src/styles.css`, `src/styles/tokens.css`, `src/styles/base.css`
- `src/components/ui/*` (primitives, shell, `BrandMark`, and their tests)
- `src/components/a2ui/*` (renderer, `lesson-preview`, `fraction-diagram`, `math-text`). Math changes stay with #116.
- `src/components/auth/use-auth-session.ts`, `use-session-expiry.ts`, `session-expiry-banner.tsx`
- `src/routes/__root.tsx`
- `src/server/seed-data.ts`, `src/server/persistence/*`
- `scripts/ui-gate/*` (including the gate seed), `scripts/student-probe/*`, `scripts/verify-ui.ts`, `scripts/design-census-capture.ts`, and the three budget files
- `scripts/ux-ownership.json`, `scripts/ux-ownership.ts`, `scripts/verify-ux-ownership.ts`

The exception: a slice may _lower_ a budget with `--update`.

### File ownership

Each file has one owner. `—` means the foundation deletes the file.

| File / glob | Owner |
| --- | --- |
| `src/styles.css`, `src/styles/tokens.css`, `src/styles/base.css` | Foundation |
| `src/components/ui/*`, `src/components/a2ui/*` | Foundation |
| `src/routes/__root.tsx` | Foundation |
| `src/components/auth/account-header.tsx` | — (replaced by `AppShell`) |
| `src/components/auth/*` (the remaining files), `src/routes/login.tsx`, `src/routes/sign-up.tsx`, `src/routes/login/*`, `src/styles/auth.css` | Sign-in |
| `src/routes/index.tsx`, `src/styles/landing.css`, `src/components/landing/*` | Landing |
| `src/routes/workspace.tsx`, `src/components/studio/teacher-studio.tsx`, `source-panel.tsx`, `validation-diagnostics*`, `moderation-recovery*`, `src/styles/{studio,generation,source,workspace}.css` | Studio |
| `src/components/studio/review-studio.tsx`, `review-gallery.tsx`, `review-shared.tsx`, `review-utilities.ts`, `variant-editor.tsx`, `src/styles/review.css`, `src/styles/a2ui.css` | Review |
| `src/components/studio/publish-confirmation.tsx`, `src/styles/publish.css` | Publish |
| `src/routes/dashboard.tsx`, `src/components/dashboard/*`, `src/styles/progress.css` | Dashboard |
| `src/routes/learn.tsx`, `src/components/learn/*`, `src/styles/learn.css` | Learn |
| `src/server/seed-data.ts`, `src/server/persistence/*` | Foundation (no slice edits) |
| `scripts/ui-gate/*`, `scripts/student-probe/*`, `scripts/verify-ui.ts`, `scripts/design-census-capture.ts`, budget JSON | Foundation |
| `docs/product/ux-redesign-stack.md` | Foundation |

Class names are a read-only contract. A slice may put another slice's class on a mount element, but only the owning stylesheet changes the rule.

`scripts/ux-ownership.json` is the machine-readable form of this table, and `pnpm verify:ux-ownership` checks it. The check fails when a tracked file matches two owners, an owner pattern matches no tracked file, or a deleted path is still tracked. A pattern that a slice creates later is listed under `pending` with its reason. Files that no owner claims, such as server modules outside the list, are allowed and reported as notes.

## Slices

| Slice | Mock | Owns | Views in `verify:ui` | Notes |
| --- | --- | --- | --- | --- |
| Landing | `0-landing.html` | see [File ownership](#file-ownership) | `/` | Halftone scene and Studio window live here (one consumer). Pricing in the mock is a placeholder; do not ship it. No app shell (decision 3). |
| Sign-in | `5-sign-in.html` | see [File ownership](#file-ownership) | `/login`, `/sign-up` |  |
| Studio | `1-studio.html`, `6-errors.html` | see [File ownership](#file-ownership) | `/workspace`, `blocked-validation`, `blocked-moderation` | Removes the `--teacher-*` palette (AgDR-0016) and the three low-contrast labels in today's budget. Status tones come from `Badge`. |
| Review | `2-review.html` | see [File ownership](#file-ownership) | `review` |  |
| Publish | `3-publish.html` | see [File ownership](#file-ownership) | `publish`, `published` | Owns `publish.css`, so it runs in parallel with Review. |
| Dashboard | `4-dashboard.html` | see [File ownership](#file-ownership) | `/dashboard` |  |
| Learn | `7-learn.html` | see [File ownership](#file-ownership) | `/learn` | `pnpm verify:student-probe` must stay at 90/90 or better. |

Run one named view with `pnpm verify:ui --view <key>`; a bare path runs every view under it.

`8-state-matrix.html` is not a slice. Each slice covers the states it lists for its own surface.

Branch each slice as `feat/ux-<slice>` from `main`.

## Done means

Every slice PR shows all of these:

1. **Approved.** Its row in [teacher-ui.md](teacher-ui.md#approved-scope-2026-11-02) reads approved.
2. **Skills used.** Load `/impeccable` to build the surface against its mock and audit it before review. Load `/modern-web-guidance` for platform practice and `/emil-design-eng` for every motion decision. The PR body names the impeccable audit result.
3. **Gate.** `pnpm verify:ui <its routes and views>` is within budget. If a count fell, the PR runs `--update` and commits the lower budget. The PR body puts the desktop and phone screenshots beside the mock's capture in `.impeccable/mocks/screens/captures/`.
4. **Ratchets hold.** `pnpm verify:design-tokens` holds; counts in the slice's own stylesheet should fall. `pnpm census:capture && pnpm verify:design-census -- .scratch/ui-gate/census.json` holds.
5. **Scope.** `pnpm verify:ux-ownership --diff main --slice <name>` passes: the diff touches only the slice's owned files and their tests.
6. **Full check.** `pnpm check` is green.
