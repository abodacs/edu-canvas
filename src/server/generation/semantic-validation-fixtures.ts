import { standardsPackRegistry } from "@/server/curriculum/registry";
import { syntheticSeed } from "@/server/seed-data";

import { createCurriculumContextFromPack } from "./semantic-validation-contract";

import type { NormalizedGenerationRequest } from "./provider";
import type { VersionedCurriculumContext } from "./semantic-validation-contract";

export const createSyntheticCurriculumContext = (
  input: Pick<NormalizedGenerationRequest, "grade" | "language" | "standardId">,
  tenantId: string = syntheticSeed.tenant.id
): VersionedCurriculumContext => {
  const pack = standardsPackRegistry.resolve({
    tenantId,
    standard: input.standardId,
  });
  if (!pack) {
    throw new Error(
      `No standards pack resolves standard ${input.standardId} for tenant ${tenantId}.`
    );
  }
  return createCurriculumContextFromPack(pack, input, tenantId);
};
