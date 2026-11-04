/**
Shared by the browser-gate seeds (scripts/student-probe/seed.ts and
scripts/ui-gate/seed.ts). Both run as child processes against a scratch
database only.

Known defect, flagged to the generation lane: `runAttempt` rebuilds the record
input without `sourceSnapshotId` (src/server/generation/service.ts), so the
claimed request row loses its reviewed source and publish never bridges a
learner assignment. The seeds restore the link on their own scratch row so the
learner path can be exercised; it changes nothing outside the scratch database.
Remove this module once the generation service keeps the field.
*/
import postgres from "postgres";

export const restoreSourceLink = async (
  databaseUrl: string,
  requestId: string,
  snapshotId: string
): Promise<void> => {
  const sql = postgres(databaseUrl, { max: 1 });
  // eslint-disable-next-line unicorn/prefer-dispose -- postgres.js exposes `end()`, not Symbol.asyncDispose.
  try {
    await sql`
      update lesson_draft_requests
      set source_snapshot_id = ${snapshotId}
      where id = ${requestId} and source_snapshot_id is null
    `;
  } finally {
    await sql.end();
  }
};
