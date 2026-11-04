import { readDatabaseBootstrapConfig, readServerConfig } from "@/server/config";
import { seedFoundationDatabase } from "@/server/persistence/seed-postgres";
import { syntheticSeed } from "@/server/seed-data";

import { seedDashboardProgress } from "./dashboard-seed";

const getDatabaseUrl = (): string => {
  const config = readDatabaseBootstrapConfig(process.env);
  if (config.issues.length > 0 || !config.databaseUrl) {
    console.error(
      JSON.stringify(
        {
          message:
            "Database seeding requires a valid DATABASE_URL and synthetic data mode.",
          issues: config.issues,
        },
        null,
        2
      )
    );
    throw new Error("Database seed configuration is invalid.");
  }

  return config.databaseUrl;
};

await seedFoundationDatabase(getDatabaseUrl());

// The dashboard fixture needs the development identity provider and the
// deterministic lesson provider. Preview and production seeds keep only the
// curriculum foundation; a deployed environment must never sign a synthetic
// account in.
const config = readServerConfig();
const dashboardEnabled =
  config.appEnv === "development" &&
  config.auth.provider === "deterministic" &&
  config.issues.length === 0;
if (dashboardEnabled) {
  const seeded = await seedDashboardProgress(config);
  console.log(
    `Seeded ${syntheticSeed.tenant.slug} and ${seeded.runs} dashboard runs idempotently.`
  );
} else {
  console.log(
    `Seeded ${syntheticSeed.tenant.slug} idempotently; dashboard fixture skipped outside the development composition.`
  );
}
