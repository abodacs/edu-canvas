// Pure ownership rules for scripts/verify-ux-ownership.ts.
//
// The UX redesign runs as parallel slices. Each file has at most one owner, so
// two slices never edit the same file (docs/product/ux-redesign-stack.md). The
// functions here take the map and a file list and return issues; they never
// read git or the disk, so the tests drive them with fixtures.

import path from "node:path";

import { z } from "zod";

export const foundationOwner = "foundation";

export const ownershipMapSchema = z
  .object({
    note: z.string(),
    owners: z.record(z.string(), z.array(z.string().min(1))),
    /** Patterns allowed to match no tracked file yet, with the reason. */
    pending: z.record(z.string(), z.string().min(1)).default({}),
    /** Paths that must no longer be tracked. */
    deleted: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type OwnershipMap = z.infer<typeof ownershipMapSchema>;

const matches = (file: string, pattern: string): boolean =>
  file === pattern || path.matchesGlob(file, pattern);

/** Every owner whose patterns claim the file, in map order. */
export const ownersOf = (map: OwnershipMap, file: string): string[] =>
  Object.entries(map.owners)
    .filter(([, patterns]) =>
      patterns.some((pattern) => matches(file, pattern))
    )
    .map(([owner]) => owner);

/**
 * Structural issues in the map, measured against the tracked file list:
 * a pattern listed twice, a file claimed by two owners, a pattern that claims
 * nothing (unless pending), a stale pending entry, a deleted path that is
 * still tracked or still owned.
 */
export const mapIssues = (
  map: OwnershipMap,
  trackedFiles: readonly string[]
): string[] => {
  const issues: string[] = [];
  const seenPatterns = new Map<string, string>();

  for (const [owner, patterns] of Object.entries(map.owners)) {
    for (const pattern of patterns) {
      const previous = seenPatterns.get(pattern);
      if (previous === undefined) {
        seenPatterns.set(pattern, owner);
      } else {
        issues.push(
          `pattern ${pattern} is listed twice (${previous}, ${owner}); keep one owner.`
        );
      }

      const claimsAFile = trackedFiles.some((file) => matches(file, pattern));
      const isPending = Object.hasOwn(map.pending, pattern);
      if (!claimsAFile && !isPending) {
        issues.push(
          `pattern ${pattern} (${owner}) matches no tracked file; a rename dropped it, so update the map.`
        );
      }
      if (claimsAFile && isPending) {
        issues.push(
          `pattern ${pattern} is listed in pending but now matches tracked files; remove the pending entry.`
        );
      }
    }
  }

  for (const pattern of Object.keys(map.pending)) {
    if (!seenPatterns.has(pattern)) {
      issues.push(`pending pattern ${pattern} belongs to no owner.`);
    }
  }

  for (const file of trackedFiles) {
    const owners = ownersOf(map, file);
    if (owners.length > 1) {
      issues.push(
        `${file} matches ${owners.length} owners: ${owners.join(", ")}.`
      );
    }
  }

  for (const file of map.deleted) {
    if (trackedFiles.includes(file)) {
      issues.push(`${file} is listed as deleted but is still tracked.`);
    }
    const owners = ownersOf(map, file);
    if (owners.length > 0) {
      issues.push(
        `${file} is listed as deleted but ${owners.join(", ")} still claims it.`
      );
    }
  }

  return issues;
};

/**
 * The `git diff` arguments a slice check reads. `--no-renames` reports a move
 * as a delete of the old path plus an add of the new one, so moving a file out
 * of a foundation path is judged against the owner of the path it left, not
 * only the one it reached.
 */
export const sliceDiffArguments = (base: string): readonly string[] => [
  "diff",
  "--name-only",
  "--no-renames",
  `${base}...HEAD`,
];

export interface DiffVerdict {
  /** Changed files another owner claims; any entry fails the check. */
  readonly violations: readonly string[];
  /** Changed files no owner claims; reported, never fatal. */
  readonly unowned: readonly string[];
}

/**
 * Judges a slice branch's changed files. A file the slice owns passes; a file
 * the foundation or another slice owns is a violation; a deleted path the
 * foundation removes counts as foundation-owned.
 */
export const judgeSliceDiff = (
  map: OwnershipMap,
  slice: string,
  changedFiles: readonly string[]
): DiffVerdict => {
  if (!Object.hasOwn(map.owners, slice) || slice === foundationOwner) {
    const slices = Object.keys(map.owners).filter(
      (owner) => owner !== foundationOwner
    );
    throw new Error(
      `unknown slice "${slice}"; expected one of: ${slices.join(", ")}.`
    );
  }

  const violations: string[] = [];
  const unowned: string[] = [];
  for (const file of changedFiles) {
    const owners = map.deleted.includes(file)
      ? [foundationOwner]
      : ownersOf(map, file);
    if (owners.length === 0) {
      unowned.push(file);
    } else if (!owners.includes(slice)) {
      violations.push(
        `${file} is owned by ${owners.join(", ")}, not ${slice}.`
      );
    }
  }
  return { violations, unowned };
};
