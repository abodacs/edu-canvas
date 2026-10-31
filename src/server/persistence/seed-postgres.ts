import postgres from "postgres";

import { syntheticSeed } from "../seed-data";

import { withFoundationBootstrapLock } from "./bootstrap-lock.mjs";

export const seedFoundationDatabase = async (
  databaseUrl: string
): Promise<void> => {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });

  try {
    await withFoundationBootstrapLock(sql, async () => {
      await sql.begin(async (transaction) => {
        await transaction`select set_config('app.tenant_id', ${syntheticSeed.tenant.id}, true)`;

        await transaction`
          insert into tenants (id, slug, name, synthetic_data_only)
          values (${syntheticSeed.tenant.id}, ${syntheticSeed.tenant.slug}, ${syntheticSeed.tenant.name}, true)
          on conflict (id) do update set
            slug = excluded.slug,
            name = excluded.name,
            synthetic_data_only = true
        `;

        await Promise.all(
          syntheticSeed.identities.map((identity) => {
            return transaction`
              insert into identities (id, tenant_id, role, display_name, demo_handle, is_active)
              values (
                ${identity.id},
                ${syntheticSeed.tenant.id},
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
            `;
          })
        );

        await transaction`
          insert into standards (id, tenant_id, code, name, subject, grade_band)
          values (
            ${syntheticSeed.standard.id},
            ${syntheticSeed.tenant.id},
            ${syntheticSeed.standard.code},
            ${syntheticSeed.standard.name},
            ${syntheticSeed.standard.subject},
            ${syntheticSeed.standard.gradeBand}
          )
          on conflict (id) do update set
            code = excluded.code,
            name = excluded.name,
            subject = excluded.subject,
            grade_band = excluded.grade_band
        `;

        await Promise.all(
          syntheticSeed.graphNodes.map((node) => {
            return transaction`
              insert into prerequisite_nodes (id, tenant_id, standard_id, label, sequence)
              values (
                ${node.id},
                ${syntheticSeed.tenant.id},
                ${syntheticSeed.standard.id},
                ${node.label},
                ${node.sequence}
              )
              on conflict (id) do update set
                standard_id = excluded.standard_id,
                label = excluded.label,
                sequence = excluded.sequence
            `;
          })
        );

        await Promise.all(
          syntheticSeed.graphEdges.map((edge) => {
            return transaction`
              insert into prerequisite_edges (tenant_id, prerequisite_id, successor_id)
              values (${syntheticSeed.tenant.id}, ${edge.prerequisiteId}, ${edge.successorId})
              on conflict (tenant_id, prerequisite_id, successor_id) do nothing
            `;
          })
        );

        await transaction`
          insert into activities (id, tenant_id, slug, standard_id, title, status)
          values (
            ${syntheticSeed.activity.id},
            ${syntheticSeed.tenant.id},
            ${syntheticSeed.activity.slug},
            ${syntheticSeed.standard.id},
            ${syntheticSeed.activity.title},
            ${syntheticSeed.activity.status}
          )
          on conflict (id) do update set
            slug = excluded.slug,
            standard_id = excluded.standard_id,
            title = excluded.title,
            status = excluded.status
        `;

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
            ${syntheticSeed.activityVersion.id},
            ${syntheticSeed.tenant.id},
            ${syntheticSeed.activity.id},
            ${syntheticSeed.activityVersion.versionNumber},
            ${syntheticSeed.activityVersion.catalogVersion},
            ${syntheticSeed.activityVersion.graphVersion},
            ${JSON.stringify(syntheticSeed.activityVersion.publicContent)}::jsonb,
            ${JSON.stringify(syntheticSeed.activityVersion.answerKey)}::jsonb
          )
          on conflict (id) do nothing
        `;

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
            ${syntheticSeed.attempt.id},
            ${syntheticSeed.tenant.id},
            ${syntheticSeed.activityVersion.id},
            ${syntheticSeed.attempt.studentId},
            ${JSON.stringify(syntheticSeed.attempt.eventLog)}::jsonb,
            ${syntheticSeed.attempt.score},
            now()
          )
          on conflict (id) do nothing
        `;
      });
    });
  } finally {
    await sql.end({ timeout: 3 });
  }
};
