import { syntheticSeed } from "@/server/seed-data";
import { A2UI_CATALOG_VERSION } from "@/shared/a2ui-contract";

import {
  sharedStandardsPackTenantId,
  standardsPackSchema,
} from "./standards-pack";

import type { StandardsPack } from "./standards-pack";

const tenantId = sharedStandardsPackTenantId;

/**
 * Today's seeded equivalent-fractions content expressed as a shared standards
 * pack. The graph, target node, catalog and standard identity mirror
 * `syntheticSeed`, so resolving this pack changes no observable verdict. The
 * pack is a template pinned to the shared tenant, not to the seeded tenant, so
 * a real signed-in classroom can resolve it without reading another tenant's
 * private data.
 */
export const fractionEquivalencePack: StandardsPack = standardsPackSchema.parse(
  {
    tenantId,
    id: "pack_ccss_4_nf_a_01_v1",
    packVersion: "4.NF.A.1-v1",
    subject: "Mathematics",
    grade: 4,
    standardId: syntheticSeed.standard.id,
    standardCode: syntheticSeed.standard.code,
    source: {
      kind: "hand-authored",
      citation:
        "Common Core State Standards 4.NF.A.1, expressed as the Scholé seeded equivalent-fractions fixture.",
    },
    graph: {
      version: syntheticSeed.activityVersion.graphVersion,
      targetNodeId: "graph_node_equivalent_fractions",
      nodes: syntheticSeed.graphNodes,
      edges: syntheticSeed.graphEdges,
    },
    components: [
      {
        id: "component_equal_parts",
        kind: "concept",
        text: "A whole can be divided into equal parts.",
      },
      {
        id: "component_name_fractions",
        kind: "skill",
        text: "Name a fraction as a number of equal parts of one whole.",
      },
      {
        id: "component_equivalent_names",
        kind: "skill",
        text: "Recognise two different fraction names for the same part of a whole.",
      },
    ],
    answerRules: [
      { kind: "fraction-equivalence", unverifiedVerdict: "warning" },
    ],
    allowedScreenPatterns: ["matching"],
    allowedCatalogs: [A2UI_CATALOG_VERSION],
    promptFrame: {
      taskLine:
        "Match each fraction with another name for the same part of a whole.",
      sourceGroupLabel: "Fractions to match",
      targetGroupLabel: "Possible equivalent fractions",
      sourceItemCount: 3,
      targetItemCount: 3,
    },
    reference: {
      id: syntheticSeed.activityVersion.id,
      version: String(syntheticSeed.activityVersion.versionNumber),
      source: syntheticSeed.activityVersion.publicContent.source,
      targets: [...syntheticSeed.activityVersion.publicContent.targets],
      prompt: syntheticSeed.activityVersion.publicContent.prompt,
    },
  }
);

/**
 * 4.OA.A.3 multistep word problems as a matching lesson: a two-node graph
 * (3.OA.D.8 → 4.OA.A.3) and a whole-number-expression answer rule. This is the
 * first pack whose standard is not equivalent fractions.
 */
export const multistepWordProblemsPack: StandardsPack =
  standardsPackSchema.parse({
    tenantId,
    id: "pack_ccss_4_oa_a_03_v1",
    packVersion: "4.OA.A.3-v1",
    subject: "Mathematics",
    grade: 4,
    standardId: "standard_ccss_4_oa_a_03",
    standardCode: "4.OA.A.3",
    source: {
      kind: "primary-text",
      citation:
        "Common Core State Standards 4.OA.A.3: Solve multistep word problems posed with whole numbers and having whole-number answers using the four operations, including problems in which remainders must be interpreted. Represent these problems using equations with a letter standing for the unknown quantity.",
    },
    graph: {
      version: "operations-word-problems-v1",
      targetNodeId: "graph_node_multistep_word_problems",
      nodes: [
        {
          id: "graph_node_two_step_word_problems",
          label: "Solve two-step word problems (3.OA.D.8)",
          sequence: 1,
          screenPurposeId: "screen_purpose_two_step",
          screenPurpose: "Write an equation for a two-step word problem.",
        },
        {
          id: "graph_node_multistep_word_problems",
          label: "Solve multistep word problems (4.OA.A.3)",
          sequence: 2,
          screenPurposeId: "screen_purpose_multistep",
          screenPurpose: "Match a multistep word problem to its equation.",
        },
      ],
      edges: [
        {
          prerequisiteId: "graph_node_two_step_word_problems",
          successorId: "graph_node_multistep_word_problems",
        },
      ],
    },
    components: [
      {
        id: "component_two_step_operations",
        kind: "skill",
        text: "Solve two-step word problems using the four operations.",
      },
      {
        id: "component_remainder",
        kind: "concept",
        text: "Interpret a remainder in a whole-number answer.",
      },
      {
        id: "component_equation_unknown",
        kind: "skill",
        text: "Represent a multistep problem with an equation and a letter for the unknown quantity.",
      },
    ],
    answerRules: [
      {
        kind: "whole-number-expression",
        problems: [
          {
            text: "Sam has 4 boxes with 6 pencils in each box. He gives away 5 pencils. How many pencils are left?",
            answer: 19,
          },
          {
            text: "A class of 27 students sits at tables of 4. How many tables are needed so everyone has a seat?",
            answer: 7,
          },
          {
            text: "Mia buys 3 packs of 8 stickers and gets 7 more from a friend. How many stickers does she have?",
            answer: 31,
          },
        ],
        unverifiedVerdict: "warning",
      },
    ],
    allowedScreenPatterns: ["matching"],
    allowedCatalogs: [A2UI_CATALOG_VERSION],
    promptFrame: {
      taskLine:
        "Match each multistep word problem with the equation that represents it.",
      sourceGroupLabel: "Word problems",
      targetGroupLabel: "Equations",
      sourceItemCount: 3,
      targetItemCount: 3,
    },
  });

export const builtInStandardsPacks: readonly StandardsPack[] = [
  fractionEquivalencePack,
  multistepWordProblemsPack,
];
