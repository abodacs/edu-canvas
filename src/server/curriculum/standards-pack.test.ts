import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { syntheticSeed } from "@/server/seed-data";
import { A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";

import {
  builtInStandardsPacks,
  fractionEquivalencePack,
  multistepWordProblemsPack,
  ri52MainIdeaPack,
  ri52Passage,
  ri52PrimaryText,
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
    expect(() => standardsPackSchema.parse(ri52MainIdeaPack)).not.toThrow();
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

  it("keeps the prompt-frame item counts inside the matching draft caps", () => {
    const tooFewSources = {
      ...fractionEquivalencePack,
      promptFrame: {
        ...fractionEquivalencePack.promptFrame,
        sourceItemCount: 2,
      },
    };
    const tooManyTargets = {
      ...fractionEquivalencePack,
      promptFrame: {
        ...fractionEquivalencePack.promptFrame,
        targetItemCount: 9,
      },
    };

    expect(() => standardsPackSchema.parse(tooFewSources)).toThrow(
      /promptFrame|item|sourceItemCount/iu
    );
    expect(() => standardsPackSchema.parse(tooManyTargets)).toThrow(
      /promptFrame|item|targetItemCount/iu
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

  it("keeps every pack in the built-in registry", () => {
    expect(
      builtInStandardsPacks.map((pack) => pack.standardCode)
    ).toStrictEqual(["4.NF.A.1", "4.OA.A.3", "RI.5.2"]);
  });
});

describe("RI.5.2 primary-text pack", () => {
  it("resolves with primary-text provenance, a content hash and matching only", () => {
    const pack = standardsPackRegistry.resolve({
      tenantId: seedTenantId,
      standard: "RI.5.2",
    });

    expect(pack).toBeDefined();
    expect(
      pack && {
        subject: pack.subject,
        grade: pack.grade,
        standardCode: pack.standardCode,
        sourceKind: pack.source.kind,
        contentHash: pack.source.contentHash,
        allowedScreenPatterns: pack.allowedScreenPatterns,
        allowedCatalogs: pack.allowedCatalogs,
      }
    ).toStrictEqual({
      subject: "English Language Arts",
      grade: 5,
      standardCode: "RI.5.2",
      sourceKind: "primary-text",
      contentHash:
        "c307a0c11f923164714f77bd3ce7c2622c734d165d2d8a61a0d32a46cbd097b3",
      allowedScreenPatterns: ["matching"],
      allowedCatalogs: [A2UI_CATALOG_VERSION],
    });
  });

  it("cites the verbatim primary text and hashes it", () => {
    const expectedHash = createHash("sha256")
      .update(ri52PrimaryText, "utf-8")
      .digest("hex");

    expect(ri52MainIdeaPack.source.citation).toContain(ri52PrimaryText);
    expect(ri52MainIdeaPack.source.citation).toContain(
      "authored by hand from this primary text"
    );
    expect(ri52MainIdeaPack.source.contentHash).toBe(expectedHash);
  });

  it("authors a Grade 4 prerequisite into a two-node path", () => {
    expect({
      targetNodeId: ri52MainIdeaPack.graph.targetNodeId,
      nodeIds: ri52MainIdeaPack.graph.nodes.map((node) => node.id),
      edges: ri52MainIdeaPack.graph.edges,
    }).toStrictEqual({
      targetNodeId: "graph_node_two_or_more_main_ideas",
      nodeIds: [
        "graph_node_grade_four_main_idea",
        "graph_node_two_or_more_main_ideas",
      ],
      edges: [
        {
          prerequisiteId: "graph_node_grade_four_main_idea",
          successorId: "graph_node_two_or_more_main_ideas",
        },
      ],
    });
  });

  it("declares text evidence as a hard block and the fit as teacher review", () => {
    expect(ri52MainIdeaPack.answerRules).toStrictEqual([
      {
        kind: "text-evidence",
        passage: ri52Passage,
        unverifiedVerdict: "hard_block",
      },
      { kind: "teacher-review", unverifiedVerdict: "warning" },
    ]);
  });

  it("keeps the passage within the A2UI Text cap", () => {
    expect(ri52Passage.length).toBeLessThanOrEqual(500);
    expect(ri52MainIdeaPack.promptFrame.taskLine.length).toBeLessThanOrEqual(
      500
    );
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
