import { randomUUIDv7 } from "node:crypto";

// Time-ordered keys. Same-ms IDs are not ordered; sort by date columns.
export const createId = (): string => randomUUIDv7();
