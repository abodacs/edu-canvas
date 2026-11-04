import { builtInStandardsPacks } from "./built-in-packs";
import {
  sharedStandardsPackTenantId,
  standardsPackSchema,
} from "./standards-pack";

import type { StandardsPack } from "./standards-pack";

/**
 * A standards pack is resolved by tenant and standard, never by a global
 * fallback. A pack is visible when it belongs to the tenant or when it is a
 * shared template; another tenant's private pack is never visible. The
 * registry holds parsed packs, rejects an ambiguous
 * `(tenant, standard, version)` pair, and returns one exact version: the
 * requested one, or the highest version when the caller does not pin one.
 */

export interface StandardsPackLookup {
  tenantId: string;
  /** A standard id or standard code, such as `standard_ccss_4_nf_a_01` or `4.NF.A.1`. */
  standard: string;
  /** Return exactly this pack version instead of the highest one. */
  packVersion?: string;
}

export interface StandardsPackRegistry {
  readonly packs: readonly StandardsPack[];
  resolve: (lookup: StandardsPackLookup) => StandardsPack | undefined;
}

const compareText = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const versionSegments = (value: string): string[] => {
  return value.split(/(?<digits>\d+)/u).filter((segment) => segment.length > 0);
};

/**
 * A deterministic natural ordering: numeric segments compare as numbers, so
 * `v9` sorts before `v10`, and text segments compare by code unit rather than
 * by the host locale.
 */
export const comparePackVersions = (left: string, right: string): number => {
  const leftSegments = versionSegments(left);
  const rightSegments = versionSegments(right);
  const length = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < length; index += 1) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];
    if (leftSegment === undefined) {
      return -1;
    }
    if (rightSegment === undefined) {
      return 1;
    }

    const leftIsNumeric = /^\d+$/u.test(leftSegment);
    const rightIsNumeric = /^\d+$/u.test(rightSegment);
    const difference =
      leftIsNumeric && rightIsNumeric
        ? Number(leftSegment) - Number(rightSegment)
        : compareText(leftSegment, rightSegment);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

const comparePacks = (left: StandardsPack, right: StandardsPack): number => {
  return (
    compareText(left.tenantId, right.tenantId) ||
    compareText(left.standardId, right.standardId) ||
    comparePackVersions(left.packVersion, right.packVersion) ||
    compareText(left.id, right.id)
  );
};

const identity = (
  pack: StandardsPack,
  standard: "standardId" | "standardCode"
): string => {
  return [pack.tenantId, pack[standard], pack.packVersion].join("\u0000");
};

const assertUniquePackVersions = (packs: readonly StandardsPack[]): void => {
  const claimed = new Map<string, StandardsPack>();
  for (const pack of packs) {
    for (const standard of ["standardId", "standardCode"] as const) {
      const key = identity(pack, standard);
      const owner = claimed.get(key);
      if (owner && owner !== pack) {
        throw new Error(
          `Two standards packs claim ${pack.tenantId}/${pack[standard]} version ${pack.packVersion}.`
        );
      }
      claimed.set(key, pack);
    }
  }
};

/**
 * The support check for a request that names no tenant. Only a shared template
 * may answer it; another tenant's private pack must never make a standard
 * "supported" for everyone.
 */
export const resolveSharedStandardPack = (
  packs: readonly StandardsPack[],
  standard: string
): StandardsPack | undefined => {
  return packs.find((pack) => {
    return (
      pack.tenantId === sharedStandardsPackTenantId &&
      (pack.standardId === standard || pack.standardCode === standard)
    );
  });
};

export const createStandardsPackRegistry = (
  packs: readonly StandardsPack[]
): StandardsPackRegistry => {
  const parsed = packs.map((pack) => standardsPackSchema.parse(pack));
  assertUniquePackVersions(parsed);
  const ordered = parsed.toSorted(comparePacks);

  const resolve = (lookup: StandardsPackLookup): StandardsPack | undefined => {
    const matches = ordered.filter((pack) => {
      return (
        (pack.tenantId === lookup.tenantId ||
          pack.tenantId === sharedStandardsPackTenantId) &&
        (pack.standardId === lookup.standard ||
          pack.standardCode === lookup.standard)
      );
    });

    // A tenant-owned pack overrides the shared template for its standard. The
    // template is a starting point, never a second opinion beside the tenant's
    // own curriculum data.
    const owned = matches.filter((pack) => pack.tenantId === lookup.tenantId);
    const candidates = owned.length > 0 ? owned : matches;

    if (lookup.packVersion !== undefined) {
      return candidates.find((pack) => pack.packVersion === lookup.packVersion);
    }

    return candidates.at(-1);
  };

  return { packs: ordered, resolve };
};

export const standardsPackRegistry = createStandardsPackRegistry(
  builtInStandardsPacks
);
