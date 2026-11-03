# UX redesign stack

The redesign ships as one foundation PR and a set of page slices that can run in parallel. This page is the contract each slice works to: what it owns, what it must not touch, and how it proves it is done.

Approval still comes from the [implementation gate](teacher-ui.md#implementation-gate). A slice starts only when its row there reads **approved**.

## The foundation (`feat/ux-foundation`)

Lands once, before any slice:

- **One stylesheet per surface.** `src/styles.css` only imports `src/styles/*.css`. Two slices never edit the same file.
- **The token layer** (AgDR-0017 slices 1a and 1b) in `src/styles/tokens.css`. This covers the type roles, spacing, radii, divider ladder, shadow, focus ring, scene palette, clay primary and serif headings.
- **`BrandMark`** in `src/components/ui/brand-mark.tsx`. It is the only brand lockup.
- **The gate.** `pnpm verify:ui [routes]` and `pnpm census:capture` run on the shared boot in `scripts/ui-gate/`. CI runs both.

### Shared files: foundation only

A slice never edits these. If one needs a change, it goes in a small foundation follow-up PR that every slice then rebases onto.

- `src/styles.css`, `src/styles/tokens.css`, `src/styles/base.css`
- `src/components/ui/*`
- `scripts/ui-gate/*`, `scripts/verify-ui.ts`, `scripts/design-census-capture.ts`, and the three budget files. The exception: a slice may _lower_ a budget with `--update`.

## Slices

| Slice | Mock | Owns | Routes in `verify:ui` | Notes |
| --- | --- | --- | --- | --- |
| Landing | `0-landing.html` | `src/routes/index.tsx`, `src/styles/landing.css`, new `src/components/landing/*` | `/` | Halftone scene and Studio window live here (one consumer). Pricing in the mock is a placeholder; do not ship it. |
| Sign-in | `5-sign-in.html` | `src/routes/login.tsx`, `src/routes/sign-up.tsx`, `src/routes/login/*`, `src/components/auth/*`, `src/styles/auth.css` | `/login`, `/sign-up` |  |
| Studio | `1-studio.html`, `6-errors.html` | `src/components/studio/*`, `src/styles/{studio,generation,source,workspace}.css` | `/workspace` | Removes the `--teacher-*` palette (AgDR-0016) and the three low-contrast labels in today's budget. Adds the status variants to `Badge`; that one change goes through the foundation, see above. |
| Review | `2-review.html` | review components, `src/styles/a2ui.css`, the review part of `src/styles/review.css` | `/workspace` | Review states are not in the gate yet; add a seeded review route to the gate first (foundation follow-up). |
| Publish | `3-publish.html` | publish components, the publish part of `src/styles/review.css` | `/workspace` | Shares `review.css` with Review. Run it after Review, or split the file in a foundation follow-up first. |
| Dashboard | `4-dashboard.html` | `src/components/dashboard/*`, `src/styles/progress.css` | `/dashboard` |  |
| Learn | `7-learn.html` | `src/components/learn/*`, `src/styles/learn.css` | `/learn` | `pnpm verify:student-probe` must stay at 90/90 or better. |

`8-state-matrix.html` is not a slice. Each slice covers the states it lists for its own surface.

Branch each slice as `feat/ux-<slice>` from `feat/ux-foundation`, and target that branch until the foundation merges.

## Done means

Every slice PR shows all of these:

1. **Approved.** Its row in [teacher-ui.md](teacher-ui.md#approved-scope-2026-11-02) reads approved.
2. **Skills used.** Load `/impeccable` to build the surface against its mock and audit it before review. Load `/modern-web-guidance` for platform practice and `/emil-design-eng` for every motion decision. The PR body names the impeccable audit result.
3. **Gate.** `pnpm verify:ui <its routes>` is within budget. If a count fell, the PR runs `--update` and commits the lower budget. The PR body puts the desktop and phone screenshots beside the mock's capture in `.impeccable/mocks/screens/captures/`.
4. **Ratchets hold.** `pnpm verify:design-tokens` holds; counts in the slice's own stylesheet should fall. `pnpm census:capture && pnpm verify:design-census -- .scratch/ui-gate/census.json` holds.
5. **Scope.** The diff touches only the slice's owned files and their tests.
6. **Full check.** `pnpm check` is green.
