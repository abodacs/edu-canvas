# React Doctor triage

Initial scan: `npx react-doctor@latest --verbose`

- React Doctor: `0.7.8`
- Baseline score: `47/100`
- Findings: `19` warnings (`4` security, `3` performance, `12` maintainability)
- Parent branch: `implement`
- Scope: the Edu-Canvas implementation introduced by PR #25

The scan is treated as a set of hypotheses. Generated output and dependency code are not changed without a source-backed finding.

## Findings

| Finding                                 | Location                                           | Confidence | Disposition                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw SQL built outside parameter binding | `.output/server/_libs/postgres.mjs:1339`           | High       | False positive for application code. This is generated, untracked output from the `postgres` dependency's logical-replication support. Application SQL uses tagged templates with interpolated driver parameters. No source fix.                   |
| Weak cryptography in security context   | `.output/server/_libs/postgres.mjs:1031`           | High       | False positive for application code. This is generated `postgres` dependency code used for PostgreSQL authentication, not application token or password logic. No source fix.                                                                      |
| Missing `minimumReleaseAge`             | `pnpm-workspace.yaml` (absent)                     | Medium     | Needs repository-owner decision. This is a single-package repository with no workspace file; adding a workspace config only to satisfy the detector changes package topology. Defer until the pinned pnpm version and workspace policy are agreed. |
| Missing `trustPolicy`                   | `pnpm-workspace.yaml` (absent)                     | Medium     | Same as above. Do not add an unverified package-manager setting to a repository that does not currently use a workspace file.                                                                                                                      |
| Await inside an independent loop (3)    | `src/server/persistence/seed-postgres.ts:31,67,84` | High       | Fix. Identity, graph-node, and graph-edge inserts have no intra-group dependency; preserve the tenant/standard/graph ordering and run each group with `Promise.all` inside the existing transaction.                                               |
| Unused file                             | `src/components/ui/button.tsx`                     | High       | Fix. Repository-wide search found no import or entry-point reference. Remove the dead shadcn scaffold.                                                                                                                                             |
| Zod 3 schema API (5)                    | `src/shared/demo-contract.schema.ts:7,20,28,39,47` | High       | Fix. Replace `.object(...).strict()` with the Zod 4 `z.strictObject(...)` form while preserving strict parsing behavior.                                                                                                                           |
| Unused export                           | `src/server/health.server.ts:44`                   | High       | Fix. `getReadinessWithSeedSummary` has no imports; remove the dead helper rather than leave an unused local after dropping `export`.                                                                                                               |
| Unused dependency                       | `@tanstack/router-plugin`                          | High       | Fix. No source or Vite config reference exists. Remove the direct dependency and lockfile entry.                                                                                                                                                   |
| Unused dependency                       | `radix-ui`                                         | High       | Fix. No source reference exists; the app uses Base UI. Remove the direct dependency and lockfile entry.                                                                                                                                            |
| Large component                         | `src/routes/index.tsx:324` (`LandingPage`)         | High       | Fix. Extract the page sections into named components with explicit props; preserve the current DOM, copy, state transitions, and styling.                                                                                                          |
| Non-component export                    | `src/components/ui/badge.tsx:53`                   | High       | Fix. `badgeVariants` is only used by `Badge`; keep it module-local.                                                                                                                                                                                |
| Non-component exports                   | `src/components/ui/button.tsx:59`                  | High       | Resolved by removing the verified-unused file.                                                                                                                                                                                                     |

## Accessibility follow-up

The requested `content-visibility: auto` check found no matching declaration in tracked source or generated output. No off-screen content is currently placed inside a `content-visibility: auto` boundary, so no accessibility remediation or new optimization is being introduced. Keep this as a regression check if a future performance change adds `content-visibility`.

The motion pass retains the existing `prefers-reduced-motion: reduce` fallback and adds only comprehension-supporting feedback: current-value smoothing for the decorative pointer field, press response for lesson controls, and short state-entry transitions for hints and phase content. No `content-visibility` rule was added.

## Verification plan

1. Run focused checks after each fix group.
2. Run `pnpm check` and the existing smoke flow.
3. Re-run `npx react-doctor@latest --verbose --scope changed` and the full verbose scan.
4. Confirm the draft PR remains based on `implement` and contains only verified changes.

## Follow-up scans

The first structural pass reduced `LandingPage` but temporarily introduced eight `no-multi-comp` warnings because the extracted components still lived in `src/routes/index.tsx`. Those components now live in `src/components/landing/` with the route retained as a thin stateful composition root.

The final `npx react-doctor@latest --verbose --scope changed` scan is clean: `100/100`, no issues found.

The final verification also passed `pnpm build` and `pnpm smoke` against the built server: `/`, `/api/health`, `/api/readiness`, `/demo/teacher`, and `/demo/student` all returned `200`.

The final full scan reports four warnings, all already triaged above: the two generated `postgres` bundle findings and the two deferred `pnpm-workspace.yaml` policy checks. No source-code React Doctor findings remain.

The repository-wide `pnpm check` is also green: formatting, lint, typecheck, 26 tests, production build, client-boundary verification, and architecture verification.
