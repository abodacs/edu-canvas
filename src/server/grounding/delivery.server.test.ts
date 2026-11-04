import { describe, expect, it } from "vitest";

import { syntheticSeed } from "@/server/seed-data";

import { resolveStandardPack } from "./delivery.server";

const sharedTenantId = "tenant_real_school";

describe("source delivery: standards pack resolution", () => {
  it("reports a pack for a standard the registry resolves", () => {
    expect(
      resolveStandardPack(syntheticSeed.standard.id, sharedTenantId)
    ).toBeTruthy();
    expect(resolveStandardPack("4.OA.A.3", sharedTenantId)).toBeTruthy();
  });

  it("reports no pack for an unknown standard instead of a false positive", () => {
    expect(resolveStandardPack("5.NBT.A.1", sharedTenantId)).toBeFalsy();
  });
});
