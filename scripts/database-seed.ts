import { readDatabaseBootstrapConfig } from "@/server/config";
import { seedFoundationDatabase } from "@/server/persistence/seed-postgres";
import { syntheticSeed } from "@/server/seed-data";

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
console.log(`Seeded ${syntheticSeed.tenant.slug} idempotently.`);
