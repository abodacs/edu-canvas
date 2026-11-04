import { z } from "zod";

/**
 * A standards pack is versioned curriculum data: the standard, the provenance
 * of its source, its prerequisite graph, its components, its answer rules, the
 * screens and catalogs it may render, and the provider's prompt frame.
 *
 * The schema is strict. A pack is data, not a code branch, so an unknown field
 * is a mistake rather than an extension point, and a pack version must differ
 * from the graph version it embeds: editing the graph produces a new pack, not
 * a silent in-place change. See #217 and the research record at
 * docs/research/standards-generalization/README.md.
 */

export const standardsPackSourceKinds = [
  "learning-commons",
  "primary-text",
  "hand-authored",
] as const;

const identifierSchema = z.string().trim().min(1).max(120);
const copySchema = (maximum: number) => z.string().trim().min(1).max(maximum);

const unverifiedVerdictSchema = z.enum(["warning", "hard_block"]);

const curriculumNodeSchema = z.strictObject({
  id: identifierSchema,
  label: copySchema(240),
  sequence: z.number().int().min(0),
  screenPurposeId: identifierSchema,
  screenPurpose: copySchema(500),
  labelAr: copySchema(240).optional(),
  screenPurposeAr: copySchema(500).optional(),
});

const curriculumEdgeSchema = z.strictObject({
  prerequisiteId: identifierSchema,
  successorId: identifierSchema,
});

const standardsPackComponentSchema = z.strictObject({
  id: identifierSchema,
  kind: z.enum(["skill", "concept", "problem"]),
  text: copySchema(2000),
  bounds: z.record(identifierSchema, z.number()).optional(),
});

const answerRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("fraction-equivalence"),
    unverifiedVerdict: unverifiedVerdictSchema,
  }),
  z.strictObject({
    kind: z.literal("whole-number-expression"),
    problems: z
      .array(
        z.strictObject({
          text: copySchema(2000),
          answer: z.number(),
        })
      )
      .min(1),
    unverifiedVerdict: unverifiedVerdictSchema,
  }),
  z.strictObject({
    kind: z.literal("text-evidence"),
    passage: copySchema(5000),
    unverifiedVerdict: unverifiedVerdictSchema,
  }),
  z.strictObject({
    kind: z.literal("teacher-review"),
    unverifiedVerdict: z.literal("warning"),
  }),
]);

const standardsPackSourceSchema = z.strictObject({
  kind: z.enum(standardsPackSourceKinds),
  citation: copySchema(2000),
  license: copySchema(240).optional(),
  retrievedAt: copySchema(120).optional(),
  contentHash: copySchema(240).optional(),
  groundingId: identifierSchema.optional(),
});

const standardsPackGraphSchema = z.strictObject({
  version: identifierSchema,
  targetNodeId: identifierSchema,
  nodes: z.array(curriculumNodeSchema).min(1),
  edges: z.array(curriculumEdgeSchema),
});

const standardsPackPromptFrameSchema = z.strictObject({
  taskLine: copySchema(500),
  sourceGroupLabel: copySchema(240),
  targetGroupLabel: copySchema(240),
  sourceItemCount: z.number().int().min(1).max(100),
  targetItemCount: z.number().int().min(1).max(100),
});

const standardsPackReferenceSchema = z.strictObject({
  id: identifierSchema,
  version: identifierSchema,
  source: copySchema(500),
  targets: z.array(copySchema(240)).min(1),
  prompt: copySchema(1000),
});

export const standardsPackSchema = z
  .strictObject({
    tenantId: identifierSchema,
    id: identifierSchema,
    packVersion: identifierSchema,
    subject: copySchema(120),
    grade: z.number().int().min(0).max(12),
    standardId: identifierSchema,
    standardCode: identifierSchema,
    source: standardsPackSourceSchema,
    graph: standardsPackGraphSchema,
    components: z.array(standardsPackComponentSchema).min(1),
    answerRules: z.array(answerRuleSchema).min(1),
    allowedScreenPatterns: z.array(z.literal("matching")).min(1),
    allowedCatalogs: z.array(identifierSchema).min(1),
    promptFrame: standardsPackPromptFrameSchema,
    reference: standardsPackReferenceSchema.optional(),
  })
  .refine((pack) => pack.packVersion !== pack.graph.version, {
    message: "A standards pack version must differ from its graph version.",
    path: ["packVersion"],
  });

export type StandardsPack = z.infer<typeof standardsPackSchema>;
export type StandardsPackSourceKind = (typeof standardsPackSourceKinds)[number];
export type AnswerRule = z.infer<typeof answerRuleSchema>;
export type CurriculumNode = z.infer<typeof curriculumNodeSchema>;
export type CurriculumEdge = z.infer<typeof curriculumEdgeSchema>;
