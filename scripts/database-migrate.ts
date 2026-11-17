import { readDatabaseBootstrapConfig } from "@/server/config";

import { runDatabaseMigrations } from "./database-migrate-runtime.mjs";

const getDatabaseUrl = (): string => {
  const config = readDatabaseBootstrapConfig(process.env);
  const { databaseUrl } = config;
  if (
    config.issues.length > 0 ||
    databaseUrl === undefined ||
    databaseUrl === ""
  ) {
    console.error(
      JSON.stringify(
        {
          message:
            "Database migration requires a valid DATABASE_URL and synthetic data mode.",
          issues: config.issues,
        },
        null,
        2
      )
    );
    throw new Error("Database migration configuration is invalid.");
  }

  return databaseUrl;
};

const main = async () => {
  await runDatabaseMigrations(getDatabaseUrl());
};

await main();
