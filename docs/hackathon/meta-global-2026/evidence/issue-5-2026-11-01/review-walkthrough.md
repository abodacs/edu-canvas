# Issue #5 review walkthrough — 2026-11-01

- Branch: `impl/5-review-publish` at the review-fix commit, based on `main` `36ba6c8`.
- Environment: `APP_ENV=development`, `DEMO_MODE=true`, empty `DATABASE_URL` (seeded in-memory store), `AUTH_PROVIDER=deterministic`, `AUTH_PUBLIC_ORIGIN=http://127.0.0.1:3007`.
- Driver: `playwright-core` 1.55.0 with cached Chromium 1248, headless.

## Steps and observations

1. Sign in as `amira.north@example.test`; the membership page lists three schools.
2. Select **Edu-Canvas Synthetic Classroom**; the workspace opens.
3. Prompt `equivalent fractions for grade 4`, choose **Create lesson**; the draft reaches `ready-for-review`.
4. Choose **Review and publish this pack**; the URL becomes `/workspace?review=<requestId>` and the gallery shows four screens and `0 of 5 approvals`.
5. Open the first screen, replace the first hint with `Equivalent fractions name the same amount.`, choose **Save edits and revalidate**; the gallery reports `Revision 2 saved and revalidated. Approvals start again.`
6. Approve all four screens (acknowledging each warning) and the reverse reasoning path; the gallery shows `5 of 5 approvals`.
7. Reload the page. The persisted review reopens as `Revision 2 · validation passed · 5 of 5 approvals`.
8. Choose **Continue to publish**, confirm the approved sequence, select `Omar Nabil`, and choose **Publish and assign**. The success panel says **The pack is published and assigned** and shows the publication and assignment identifiers.

Screenshots were captured on the build host under `/tmp/ec5-ui/` (`01-membership` through `07-published`, plus `05b-after-reload`). They are host artefacts, not committed.

## Limits

- The seeded store is in-process, so this walk proves the surface and the gate, not restart persistence. `pnpm test:database` proves the PostgreSQL adapter, forced RLS, append-only triggers, unique keys, and read-back.
- The walk observed `GET /api/lessons/sources` returning 403 from the existing source panel. The source seam uses the mutation guard on a GET; it is pre-existing and outside #5.
