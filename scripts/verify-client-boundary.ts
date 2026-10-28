import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { join } = path;

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDirectory = join(projectRoot, ".output", "public");
const forbiddenTokens = [
  "answerKey",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "postgresql://",
  "SENTRY_DSN",
  "AUTH_SESSION_SECRET",
  "AUTH_CREDENTIAL_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "edu-canvas-development-only-session-secret",
  "SENTRY_AUTH_TOKEN",
  "@sentry/node",
  "observability.server",
  "edu-canvas.server-error.v1",
  "sendDefaultPii",
  "identity_demo_student",
];
const entries = await readdir(publicDirectory, { recursive: true });

await Promise.all(
  entries.map(async (entry) => {
    const entryPath = join(publicDirectory, entry);
    let contents: string;
    try {
      contents = await readFile(entryPath, "utf-8");
    } catch {
      return;
    }

    for (const token of forbiddenTokens) {
      if (contents.includes(token)) {
        throw new Error(
          `Client boundary violation: ${token} found in ${entry}.`
        );
      }
    }
  })
);

console.log("PASS client bundle contains no server-only secret/key markers.");
