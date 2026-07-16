import postgres from 'postgres'

import type { DemoCounts } from '@/shared/demo-contract'

import type { FoundationPersistence } from '../persistence'
import { demoSeed } from '../seed-data'

type SqlClient = ReturnType<typeof postgres>

function createSqlClient(databaseUrl: string): SqlClient {
  return postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    max_lifetime: 30,
    prepare: false,
  })
}

async function withDatabase<T>(
  databaseUrl: string,
  callback: (sql: SqlClient) => Promise<T>,
) {
  const sql = createSqlClient(databaseUrl)

  try {
    return await callback(sql)
  } finally {
    await sql.end({ timeout: 3 })
  }
}

export function createPostgresPersistence(
  databaseUrl: string,
): FoundationPersistence {
  return {
    kind: 'postgres',

    async check() {
      try {
        await withDatabase(databaseUrl, async (sql) => {
          await sql`select 1 as ok`
        })

        return {
          status: 'ready',
          kind: 'postgres',
          code: 'READY',
          message: 'PostgreSQL responded to the bounded readiness query.',
        }
      } catch {
        return {
          status: 'failed',
          kind: 'postgres',
          code: 'PERSISTENCE_UNAVAILABLE',
          message: 'PostgreSQL did not respond within the readiness timeout.',
        }
      }
    },

    async readDemoCounts(): Promise<DemoCounts> {
      const rows = await withDatabase(databaseUrl, async (sql) => {
        return sql.begin(async (transaction) => {
          await transaction`select set_config('app.tenant_id', ${demoSeed.tenant.id}, true)`

          return transaction`
            select
              (select count(*)::int from tenants where id = ${demoSeed.tenant.id}) as tenants,
              (select count(*)::int from identities where tenant_id = ${demoSeed.tenant.id}) as identities,
              (select count(*)::int from standards where tenant_id = ${demoSeed.tenant.id}) as standards,
              (select count(*)::int from prerequisite_nodes where tenant_id = ${demoSeed.tenant.id}) as "graphNodes",
              (select count(*)::int from prerequisite_edges where tenant_id = ${demoSeed.tenant.id}) as "graphEdges",
              (select count(*)::int from activities where tenant_id = ${demoSeed.tenant.id}) as activities,
              (select count(*)::int from activity_versions where tenant_id = ${demoSeed.tenant.id}) as "activityVersions",
              (select count(*)::int from attempts where tenant_id = ${demoSeed.tenant.id}) as attempts
          `
        })
      })

      const row = rows[0]

      return {
        tenants: Number(row.tenants),
        identities: Number(row.identities),
        standards: Number(row.standards),
        graphNodes: Number(row.graphNodes),
        graphEdges: Number(row.graphEdges),
        activities: Number(row.activities),
        activityVersions: Number(row.activityVersions),
        attempts: Number(row.attempts),
      }
    },
  }
}
