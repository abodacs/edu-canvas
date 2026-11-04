import { standardsPackRegistry } from "@/server/curriculum/registry";
import { syntheticSeed } from "@/server/seed-data";

import { createCurriculumContextFromPack } from "./semantic-validation-contract";

import type { NormalizedGenerationRequest } from "./provider";
import type { VersionedCurriculumContext } from "./semantic-validation-contract";

/**
 * Test and fixture helper: resolve the registered pack for the requested
 * standard and fail loudly when none exists. Production resolves through
 * `resolveCurriculumContext` and returns `undefined` instead.
 *
 * This module is test support, not runtime composition. It keeps the seed
 * tenant as the default so a test never has to name one, and it lives outside
 * the production modules so generation no longer imports seed data.
 */
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
