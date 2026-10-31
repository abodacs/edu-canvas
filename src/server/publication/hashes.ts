import { hashCanonicalJson } from "@/server/safety/artifact-gate";

/**
The publication domain hashes the same canonical JSON as the artifact gate.
One owner for the canonicalizer keeps artifact and publication hashes comparable byte for byte.
*/
export const createCanonicalHash = (value: unknown): string =>
  hashCanonicalJson(value);
