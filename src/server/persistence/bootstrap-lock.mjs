const bootstrapLockName = 'edu-canvas:foundation-bootstrap'

/**
 * Serialize migration and seed processes so two deploys cannot bootstrap the
 * same database concurrently. The try-lock is deliberate: an operator gets a
 * fast, actionable failure instead of a deploy hanging behind an invisible
 * database lock.
 */
export async function withFoundationBootstrapLock(sql, work) {
  await sql`
    select set_config('statement_timeout', '30000', false),
           set_config('lock_timeout', '5000', false),
           set_config('idle_in_transaction_session_timeout', '60000', false)
  `

  const [lock] = await sql`
    select pg_try_advisory_lock(
      hashtextextended(${bootstrapLockName}, 0)
    ) as acquired
  `

  if (!lock.acquired) {
    throw new Error(
      'Another foundation migration or seed process is already running.',
    )
  }

  try {
    return await work()
  } finally {
    await sql`
      select pg_advisory_unlock(
        hashtextextended(${bootstrapLockName}, 0)
      )
    `
  }
}
