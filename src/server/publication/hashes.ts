import { hashCanonicalJson } from "@/server/safety/artifact-gate";

export const createCanonicalHash = (value: unknown): string =>
  hashCanonicalJson(value);
