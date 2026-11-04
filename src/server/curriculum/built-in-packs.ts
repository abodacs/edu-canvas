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
            rounding: "up",
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

/**
 * The verbatim CCSS primary text for RI.5.2 (thecorestandards.org mirror, the
 * same source as the research record). The pack's content hash is computed
 * from exactly this string.
 */
export const ri52PrimaryText =
  "Determine two or more main ideas of a text and explain how they are supported by key details; summarize the text.";

/**
 * The short passage a learner matches against. It is 265 characters, inside
 * the 500-character A2UI Text cap, and every source detail the fixture uses
 * appears verbatim in it.
 */
export const ri52Passage =
  "Bees carry pollen from one flower to the next. As they work, bees help plants make seeds. Farmers rent hives so their orchards produce more fruit. People depend on bees for food. Fewer wildflowers means bees have less to eat, so bees face threats to their survival.";

/**
 * RI.5.2 (English Language Arts, Grade 5) as a matching lesson. Learning
 * Commons resolves the standard but returns zero components and zero
 * prerequisites for ELA, so the skills and the Grade 4 prerequisite node are
 * authored by hand from the primary text. The source kind and citation record
 * that provenance; the pack never claims a Learning Commons prerequisite.
 */
export const ri52MainIdeaPack: StandardsPack = standardsPackSchema.parse({
  tenantId,
  id: "pack_ccss_ri_5_2_v1",
  packVersion: "RI.5.2-v1",
  subject: "English Language Arts",
  grade: 5,
  standardId: "standard_ccss_ri_5_2",
  standardCode: "RI.5.2",
  source: {
    kind: "primary-text",
    citation: `Common Core State Standards RI.5.2: ${ri52PrimaryText} Learning Commons resolves RI.5.2 but returns zero learning components and zero prerequisites for English Language Arts, so this pack's components and Grade 4 prerequisite node are authored by hand from this primary text.`,
    license: "CC BY 4.0",
    contentHash:
      "c307a0c11f923164714f77bd3ce7c2622c734d165d2d8a61a0d32a46cbd097b3",
  },
  graph: {
    version: "main-idea-detail-support-v1",
    targetNodeId: "graph_node_two_or_more_main_ideas",
    nodes: [
      {
        id: "graph_node_grade_four_main_idea",
        label: "Determine the main idea of a text (RI.4.2)",
        sequence: 1,
        screenPurposeId: "screen_purpose_main_idea",
        screenPurpose: "Choose the main idea of a short text.",
      },
      {
        id: "graph_node_two_or_more_main_ideas",
        label:
          "Determine two or more main ideas and supporting details (RI.5.2)",
        sequence: 2,
        screenPurposeId: "screen_purpose_main_ideas_details",
        screenPurpose: "Match each key detail to the main idea it supports.",
      },
    ],
    edges: [
      {
        prerequisiteId: "graph_node_grade_four_main_idea",
        successorId: "graph_node_two_or_more_main_ideas",
      },
    ],
  },
  components: [
    {
      id: "component_main_idea",
      kind: "skill",
      text: "Determine the main idea of a text.",
    },
    {
      id: "component_supporting_details",
      kind: "skill",
      text: "Explain how key details support a main idea.",
    },
    {
      id: "component_multiple_main_ideas",
      kind: "concept",
      text: "A text can develop more than one main idea.",
    },
  ],
  answerRules: [
    {
      kind: "text-evidence",
      passage: ri52Passage,
      unverifiedVerdict: "hard_block",
    },
    { kind: "teacher-review", unverifiedVerdict: "warning" },
  ],
  allowedScreenPatterns: ["matching"],
  allowedCatalogs: [A2UI_CATALOG_VERSION],
  promptFrame: {
    taskLine:
      "Match each key detail from the passage to the main idea it supports.",
    sourceGroupLabel: "Key details",
    targetGroupLabel: "Main ideas",
    sourceItemCount: 3,
    targetItemCount: 3,
  },
});

export const builtInStandardsPacks: readonly StandardsPack[] = [
  fractionEquivalencePack,
  multistepWordProblemsPack,
  ri52MainIdeaPack,
];
