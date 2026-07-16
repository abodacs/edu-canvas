import postgres from 'postgres'

import { readServerConfig } from '@/server/config'
import { demoSeed } from '@/server/seed-data'

import { withFoundationBootstrapLock } from './db-lock'

function getDatabaseUrl(): string {
  const config = readServerConfig(process.env)
  if (config.issues.length > 0 || !config.databaseUrl) {
    console.error(
      JSON.stringify(
        {
          message:
            'Database seeding requires a valid DATABASE_URL and synthetic mode.',
          issues: config.issues,
        },
        null,
        2,
      ),
    )
    throw new Error('Database seed configuration is invalid.')
  }

  return config.databaseUrl
}

async function main() {
  const sql = postgres(getDatabaseUrl(), {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  })

  try {
    await withFoundationBootstrapLock(sql, async () => {
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${demoSeed.tenant.id}, true)`

        await transaction`
        insert into tenants (id, slug, name, synthetic_data_only)
        values (${demoSeed.tenant.id}, ${demoSeed.tenant.slug}, ${demoSeed.tenant.name}, true)
        on conflict (id) do update set
          slug = excluded.slug,
          name = excluded.name,
          synthetic_data_only = true
      `

        for (const identity of demoSeed.identities) {
          await transaction`
          insert into identities (id, tenant_id, role, display_name, demo_handle, is_active)
          values (
            ${identity.id},
            ${demoSeed.tenant.id},
            ${identity.role},
            ${identity.displayName},
            ${identity.demoHandle},
            true
          )
          on conflict (id) do update set
            role = excluded.role,
            display_name = excluded.display_name,
            demo_handle = excluded.demo_handle,
            is_active = true
        `
        }

        await transaction`
        insert into standards (id, tenant_id, code, name, subject, grade_band)
        values (
          ${demoSeed.standard.id},
          ${demoSeed.tenant.id},
          ${demoSeed.standard.code},
          ${demoSeed.standard.name},
          ${demoSeed.standard.subject},
          ${demoSeed.standard.gradeBand}
        )
        on conflict (id) do update set
          code = excluded.code,
          name = excluded.name,
          subject = excluded.subject,
          grade_band = excluded.grade_band
      `

        for (const node of demoSeed.graphNodes) {
          await transaction`
          insert into prerequisite_nodes (id, tenant_id, standard_id, label, sequence)
          values (
            ${node.id},
            ${demoSeed.tenant.id},
            ${demoSeed.standard.id},
            ${node.label},
            ${node.sequence}
          )
          on conflict (id) do update set
            standard_id = excluded.standard_id,
            label = excluded.label,
            sequence = excluded.sequence
        `
        }

        for (const edge of demoSeed.graphEdges) {
          await transaction`
          insert into prerequisite_edges (tenant_id, prerequisite_id, successor_id)
          values (${demoSeed.tenant.id}, ${edge.prerequisiteId}, ${edge.successorId})
          on conflict (tenant_id, prerequisite_id, successor_id) do nothing
        `
        }

        await transaction`
        insert into activities (id, tenant_id, slug, standard_id, title, status)
        values (
          ${demoSeed.activity.id},
          ${demoSeed.tenant.id},
          ${demoSeed.activity.slug},
          ${demoSeed.standard.id},
          ${demoSeed.activity.title},
          ${demoSeed.activity.status}
        )
        on conflict (id) do update set
          slug = excluded.slug,
          standard_id = excluded.standard_id,
          title = excluded.title,
          status = excluded.status
      `

        await transaction`
          insert into activity_versions (
          id,
          tenant_id,
          activity_id,
          version_number,
          catalog_version,
          graph_version,
          public_content,
          answer_key
        )
        values (
          ${demoSeed.activityVersion.id},
          ${demoSeed.tenant.id},
          ${demoSeed.activity.id},
          ${demoSeed.activityVersion.versionNumber},
          ${demoSeed.activityVersion.catalogVersion},
          ${demoSeed.activityVersion.graphVersion},
          ${JSON.stringify(demoSeed.activityVersion.publicContent)}::jsonb,
          ${JSON.stringify(demoSeed.activityVersion.answerKey)}::jsonb
        )
          on conflict (id) do nothing
        `

        await transaction`
          insert into attempts (
          id,
          tenant_id,
          activity_version_id,
          student_id,
          event_log,
          score,
          submitted_at
        )
        values (
          ${demoSeed.attempt.id},
          ${demoSeed.tenant.id},
          ${demoSeed.activityVersion.id},
          ${demoSeed.attempt.studentId},
          ${JSON.stringify(demoSeed.attempt.eventLog)}::jsonb,
          ${demoSeed.attempt.score},
          now()
        )
          on conflict (id) do nothing
        `
      })
    })

    console.log(`Seeded ${demoSeed.tenant.slug} idempotently.`)
  } finally {
    await sql.end({ timeout: 3 })
  }
}

await main()
