import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Entry-point gate for issue #98.
 *
 * Every HTTP route under `src/routes/api` is classified. Public authentication
 * and health routes are allowed to be anonymous; every other route is a private
 * entry point and must reach a server delivery module that resolves the caller's
 * session. A new private route that forgets authentication fails this check,
 * which is the "unregistered private handler" guard the specification requires.
 *
 * Limits: this is a static check over route files, not a runtime proof. It does
 * not classify referents (drafts, rosters, publications) — those ownership
 * checks live in each delivery module and are asserted by the PT matrix.
 */

const { join, relative } = path;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const apiRoot = join(projectRoot, "src", "routes", "api");

/**
Routes that intentionally serve anonymous callers.
*/
const publicRoutePrefixes = new Set(["auth", "health", "readiness"]);

const serverImportPattern = /from\s+['"](?<specifier>@\/server\/[^'"]+)['"]/gu;
const sessionResolutionMarkers = ["resolveRequestSession", "resolveActor"];

const listRouteFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listRouteFiles(entryPath);
      }
      return entry.name.endsWith(".ts") ? [entryPath] : [];
    })
  );
  return nested.flat();
};

const resolveServerModule = (specifier: string): string => {
  const base = join(projectRoot, "src", specifier.replace(/^@\//u, ""));
  return (
    [base, `${base}.ts`, `${base}.tsx`].find((candidate) =>
      existsSync(candidate)
    ) ?? base
  );
};

const isPublicRoute = (routePath: string): boolean => {
  const segments = routePath.split(/[\\/]/u);
  const head =
    segments.length > 1 ? segments[0] : routePath.replace(/\.tsx?$/u, "");
  return head !== undefined && publicRoutePrefixes.has(head);
};

const issues: string[] = [];

if (existsSync(apiRoot)) {
  const routeFiles = await listRouteFiles(apiRoot);

  await Promise.all(
    routeFiles.map(async (routeFile) => {
      const routePath = relative(apiRoot, routeFile);
      if (isPublicRoute(routePath)) {
        return;
      }

      const contents = await readFile(routeFile, "utf-8");
      const specifiers = contents
        .matchAll(serverImportPattern)
        .map((match) => match.groups?.specifier)
        .filter((specifier): specifier is string => Boolean(specifier))
        .toArray();

      if (specifiers.length === 0) {
        issues.push(
          `api/${routePath} is a private route but imports no server delivery module.`
        );
        return;
      }

      const resolutions = await Promise.all(
        specifiers.map(async (specifier) => {
          const modulePath = resolveServerModule(specifier);
          if (!existsSync(modulePath)) {
            return false;
          }
          const source = await readFile(modulePath, "utf-8");
          return sessionResolutionMarkers.some((marker) =>
            source.includes(marker)
          );
        })
      );
      const resolvesSession = resolutions.some(Boolean);

      if (!resolvesSession) {
        issues.push(
          `api/${routePath} reaches server code that never resolves a session (${specifiers.join(
            ", "
          )}).`
        );
      }
    })
  );

  if (issues.length > 0) {
    console.error("FAIL identity surface");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `PASS identity surface: ${routeFiles.length} API routes classified; every private route resolves a session.`
    );
  }
} else {
  console.error("FAIL identity surface: src/routes/api does not exist.");
  process.exitCode = 1;
}
