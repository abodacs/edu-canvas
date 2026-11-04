import { describe, expect, it } from "vitest";

import { syntheticSeed } from "@/server/seed-data";
import { A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";

import {
  builtInStandardsPacks,
  fractionEquivalencePack,
  multistepWordProblemsPack,
} from "./built-in-packs";
import { createStandardsPackRegistry, standardsPackRegistry } from "./registry";
import { standardsPackSchema } from "./standards-pack";

import type { StandardsPack } from "./standards-pack";

const seedTenantId = syntheticSeed.tenant.id;

const withOverrides = (overrides: Partial<StandardsPack>): StandardsPack => {
  return standardsPackSchema.parse({
    ...fractionEquivalencePack,
    ...overrides,
  });
};

describe("standards pack schema", () => {
  it("accepts the built-in packs", () => {
    expect(() =>
      standardsPackSchema.parse(fractionEquivalencePack)
    ).not.toThrow();
    expect(() =>
      standardsPackSchema.parse(multistepWordProblemsPack)
    ).not.toThrow();
  });

  it("rejects an unknown field at the top level", () => {
    const candidate = {
      ...fractionEquivalencePack,
      untrustedField: "smuggled",
    };

    expect(() => standardsPackSchema.parse(candidate)).toThrow(
      /invalid|unrecognized|must differ/iu
    );
  });

  it("rejects an unknown field nested in the graph", () => {
    const candidate = {
      ...fractionEquivalencePack,
      graph: {
        ...fractionEquivalencePack.graph,
        untrustedField: "smuggled",
      },
    };

    expect(() => standardsPackSchema.parse(candidate)).toThrow(
      /invalid|unrecognized|must differ/iu
    );
  });

  it("requires a pack version distinct from the graph version", () => {
    const candidate = {
      ...fractionEquivalencePack,
      packVersion: fractionEquivalencePack.graph.version,
    };

    expect(() => standardsPackSchema.parse(candidate)).toThrow(
      /invalid|unrecognized|must differ/iu
    );
  });

  it("requires a source kind and citation", () => {
    const withoutCitation = {
      ...fractionEquivalencePack,
      source: { kind: "hand-authored" as const },
    };
    const unknownKind = {
      ...fractionEquivalencePack,
      source: {
        ...fractionEquivalencePack.source,
        kind: "vibes",
      },
    };

    expect(() => standardsPackSchema.parse(withoutCitation)).toThrow(
      /invalid|unrecognized|must differ/iu
    );
    expect(() => standardsPackSchema.parse(unknownKind)).toThrow(
      /invalid|unrecognized|must differ/iu
    );
  });
});

describe("built-in standards packs", () => {
  it("expresses today's 4.NF.A.1 seed content", () => {
    const pack = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: "4.NF.A.1",
    });

    expect(pack).toBeDefined();
    expect(
      pack && {
        standardId: pack.standardId,
        standardCode: pack.standardCode,
        graphVersion: pack.graph.version,
        targetNodeId: pack.graph.targetNodeId,
        nodeIds: pack.graph.nodes.map((node) => node.id),
        edges: pack.graph.edges,
        allowedCatalogs: pack.allowedCatalogs,
        allowedScreenPatterns: pack.allowedScreenPatterns,
        answerRules: pack.answerRules,
      }
    ).toStrictEqual({
      standardId: syntheticSeed.standard.id,
      standardCode: syntheticSeed.standard.code,
      graphVersion: syntheticSeed.activityVersion.graphVersion,
      targetNodeId: "graph_node_equivalent_fractions",
      nodeIds: syntheticSeed.graphNodes.map((node) => node.id),
      edges: syntheticSeed.graphEdges.map((edge) => ({ ...edge })),
      allowedCatalogs: [A2UI_CATALOG_VERSION],
      allowedScreenPatterns: ["matching"],
      answerRules: [
        { kind: "fraction-equivalence", unverifiedVerdict: "warning" },
      ],
    });
  });

  it("declares the 4.OA.A.3 two-node prerequisite graph and matching frame", () => {
    const pack = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: "4.OA.A.3",
    });

    expect(pack).toBeDefined();
    expect(
      pack && {
        graphVersion: pack.graph.version,
        targetNodeId: pack.graph.targetNodeId,
        nodeIds: pack.graph.nodes.map((node) => node.id),
        edges: pack.graph.edges,
        sourceKind: pack.source.kind,
        answerRules: pack.answerRules,
        allowedScreenPatterns: pack.allowedScreenPatterns,
        allowedCatalogs: pack.allowedCatalogs,
      }
    ).toStrictEqual({
      graphVersion: "operations-word-problems-v1",
      targetNodeId: "graph_node_multistep_word_problems",
      nodeIds: [
        "graph_node_two_step_word_problems",
        "graph_node_multistep_word_problems",
      ],
      edges: [
        {
          prerequisiteId: "graph_node_two_step_word_problems",
          successorId: "graph_node_multistep_word_problems",
        },
      ],
      sourceKind: "primary-text",
      answerRules: multistepWordProblemsPack.answerRules,
      allowedScreenPatterns: ["matching"],
      allowedCatalogs: [A2UI_CATALOG_VERSION],
    });
  });

  it("keeps both packs in the built-in registry", () => {
    expect(
      builtInStandardsPacks.map((pack) => pack.standardCode)
    ).toStrictEqual(["4.NF.A.1", "4.OA.A.3"]);
  });
});

describe("standards pack registry", () => {
  it("resolves the same pack by standard id or code", () => {
    const byId = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: syntheticSeed.standard.id,
    });
    const byCode = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: syntheticSeed.standard.code,
    });

    expect(byId).toStrictEqual(fractionEquivalencePack);
    expect(byCode).toStrictEqual(fractionEquivalencePack);
  });

  it("is deterministic across repeated lookups", () => {
    const first = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: "4.NF.A.1",
    });
    const second = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: "4.NF.A.1",
    });

    expect(first).toBe(second);
  });

  it("resolves a shared template for any signed-in tenant", () => {
    expect(
      standardsPackRegistry.resolve({
        tenantId: "tenant_real_school",
        standard: "4.NF.A.1",
      })
    ).toStrictEqual(fractionEquivalencePack);
  });

  it("never resolves another tenant's private pack", () => {
    const privatePack = withOverrides({ tenantId: "tenant_someone_else" });
    const registry = createStandardsPackRegistry([
      fractionEquivalencePack,
      privatePack,
    ]);

    expect(
      registry.resolve({
        tenantId: "tenant_real_school",
        standard: "4.NF.A.1",
      })
    ).toStrictEqual(fractionEquivalencePack);
    expect(
      registry.resolve({
        tenantId: "tenant_someone_else",
        standard: "4.NF.A.1",
      })
    ).toStrictEqual(privatePack);
  });

  it("prefers a tenant-owned pack over the shared template", () => {
    const tenantPack = withOverrides({
      id: "pack_ccss_4_nf_a_01_tenant",
      tenantId: "tenant_real_school",
      packVersion: "4.NF.A.1-tenant-v1",
    });
    const registry = createStandardsPackRegistry([
      fractionEquivalencePack,
      tenantPack,
    ]);

    expect(
      registry.resolve({
        tenantId: "tenant_real_school",
        standard: "4.NF.A.1",
      })
    ).toStrictEqual(tenantPack);
    expect(
      registry.resolve({
        tenantId: "tenant_real_school",
        standard: "4.NF.A.1",
        packVersion: "4.NF.A.1-v1",
      })
    ).toBeUndefined();
  });

  it("resolves an unknown standard to undefined", () => {
    expect(
      standardsPackRegistry.resolve({
        tenantId: seedTenantId,
        standard: "5.NBT.A.1",
      })
    ).toBeUndefined();
  });

  it("keeps pack versions isolated", () => {
    const versionTwo = withOverrides({
      id: "pack_ccss_4_nf_a_01_v2",
      packVersion: "4.NF.A.1-v2",
    });
    const registry = createStandardsPackRegistry([
      fractionEquivalencePack,
      versionTwo,
    ]);

    expect(
      registry.resolve({
        tenantId: seedTenantId,
        standard: "4.NF.A.1",
        packVersion: "4.NF.A.1-v1",
      })
    ).toStrictEqual(fractionEquivalencePack);
    expect(
      registry.resolve({
        tenantId: seedTenantId,
        standard: "4.NF.A.1",
        packVersion: "4.NF.A.1-v2",
      })
    ).toStrictEqual(versionTwo);
    expect(
      registry.resolve({
        tenantId: seedTenantId,
        standard: "4.NF.A.1",
        packVersion: "4.NF.A.1-v3",
      })
    ).toBeUndefined();
    expect(
      registry.resolve({
        tenantId: seedTenantId,
        standard: "4.NF.A.1",
      })
    ).toStrictEqual(versionTwo);
  });

  it("rejects two packs claiming one tenant, standard and version", () => {
    const duplicate = withOverrides({ id: "pack_duplicate" });

    expect(() =>
      createStandardsPackRegistry([fractionEquivalencePack, duplicate])
    ).toThrow(/Two standards packs claim/u);
  });
});
