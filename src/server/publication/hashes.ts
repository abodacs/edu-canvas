import { createHash } from "node:crypto";

const compareKeys = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const canonicalize = (value: unknown): string => {
  if (value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries: string[] = [];
    for (const key of Object.keys(record).toSorted(compareKeys)) {
      const entry = record[key];
      if (entry !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalize(entry)}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
The same canonical JSON shape the artifact gate hashes. A publication hash and an artifact hash are therefore comparable byte for byte.
*/
export const createCanonicalHash = (value: unknown): string => {
  return createHash("sha256")
    .update(canonicalize(value), "utf-8")
    .digest("hex");
};
