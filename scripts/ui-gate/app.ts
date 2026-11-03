/**
Boots the built server against a scratch PostgreSQL database for browser checks.

Shared by `verify:student-probe`, `verify:ui` and the design-census capture so
every browser check starts the app the same way: migrate, seed, spawn
`.output/server/index.mjs` in the development composition with the
deterministic identity provider, and drop the database afterwards.
*/
/* eslint-disable no-await-in-loop -- health polling is sequential by design. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import postgres from "postgres";

import type { ChildProcess } from "node:child_process";

export const defaultDatabaseUrl =
  "postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas";
export const serverEntry = ".output/server/index.mjs";
const startupTimeoutMs = 60_000;
const healthPollMs = 250;

export const run = async (
  command: string,
  commandArguments: readonly string[],
  environment: NodeJS.ProcessEnv
): Promise<string> => {
  const child = spawn(command, commandArguments, {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const [code] = (await once(child, "close")) as [number | null];
  if (code !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} exited ${String(code)}: ${stderr.slice(-2000)}`
    );
  }
  return stdout;
};

export const freePort = async (): Promise<number> => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  await once(server, "close");
  return port;
};

const isHealthy = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
};

export const waitForHealth = async (baseUrl: string): Promise<void> => {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(baseUrl)) {
      return;
    }
    await delay(healthPollMs);
  }
  throw new Error(`The server did not become healthy at ${baseUrl}.`);
};

export const scratchDatabaseUrl = (baseUrl: string, name: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.href;
};

export const loadEnvironmentFile = (): void => {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }
};

const ignoreNotice = (): void => {
  // Server notices (such as "database does not exist, skipping") are not
  // check evidence.
};

export interface ScratchApp {
  readonly baseUrl: string;
  /** stdout of each extra seed script, in order. */
  readonly seedOutputs: readonly string[];
}

export type ScratchAppOutcome =
  | { readonly kind: "skipped"; readonly reason: string }
  | { readonly kind: "missing-build" }
  | { readonly kind: "ran"; readonly value: number };

/**
Run `body` against a freshly migrated and seeded app, then tear everything
down. Returns "skipped" when PostgreSQL is unreachable so each caller decides
whether a skip is a failure.
*/
export const withScratchApp = async (
  options: { readonly prefix: string; readonly seedScripts: readonly string[] },
  body: (app: ScratchApp) => Promise<number>
): Promise<ScratchAppOutcome> => {
  if (!existsSync(serverEntry)) {
    return { kind: "missing-build" };
  }
  const baseDatabaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
  const admin = postgres(baseDatabaseUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: ignoreNotice,
  });
  try {
    await admin`select 1`;
  } catch {
    await admin.end();
    return {
      kind: "skipped",
      reason: `PostgreSQL unreachable at ${new URL(baseDatabaseUrl).host}`,
    };
  }

  const scratchName = `${options.prefix}_${process.pid}_${Date.now()}`;
  await admin.unsafe(`create database ${scratchName}`);
  const databaseUrl = scratchDatabaseUrl(baseDatabaseUrl, scratchName);
  let server: ChildProcess | undefined;
  try {
    const port = await freePort();
    const baseUrl = `http://localhost:${port}`;
    // The development composition lets the deterministic identity provider
    // sign synthetic accounts in; CI's preview values never reach the child.
    const environment: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      APP_ENV: "development",
      SYNTHETIC_DATA_ONLY: "true",
      DATABASE_URL: databaseUrl,
      META_API_KEY: "browser-check-unused",
      AUTH_PROVIDER: "deterministic",
      AUTH_PUBLIC_ORIGIN: baseUrl,
      PORT: String(port),
      HOST: "127.0.0.1",
    };
    for (const script of [
      "scripts/database-migrate.ts",
      "scripts/database-seed.ts",
    ]) {
      await run(process.execPath, ["--import", "tsx", script], environment);
    }
    const seedOutputs: string[] = [];
    for (const script of options.seedScripts) {
      seedOutputs.push(
        await run(process.execPath, ["--import", "tsx", script], environment)
      );
    }

    server = spawn(process.execPath, [serverEntry], {
      env: environment,
      stdio: "ignore",
    });
    await waitForHealth(baseUrl);
    return { kind: "ran", value: await body({ baseUrl, seedOutputs }) };
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
    }
    await admin.unsafe(`drop database if exists ${scratchName} with (force)`);
    await admin.end();
  }
};
