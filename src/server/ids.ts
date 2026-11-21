import { randomUUIDv7 } from "node:crypto";

export const createId = (): string => randomUUIDv7();
