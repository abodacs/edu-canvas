import { z } from "zod";

import { componentIdSchema, safeTextSchema } from "@/shared/a2ui-contract";
import { isAllowedLatexInput } from "@/shared/latex-mathml";

// #116: authoring shape for a fractions-v2 lesson. Generation cannot emit
// this draft yet (providerDraftSchema stays matching-domain); the fraction
// compiler validates this contract at the preview boundary, and the provider
// path that produces it lands with the broader U4 lane.

const latexStemSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => isAllowedLatexInput(value), {
    message: "The stem uses a command or character outside the LaTeX subset.",
  });

const fractionSectionSchema = z
  .strictObject({
    sectionId: componentIdSchema,
    purpose: safeTextSchema,
    stem: latexStemSchema,
    stemTextEquivalent: safeTextSchema.optional(),
    diagramLabel: safeTextSchema,
    denominator: z.number().int().min(1).max(12),
    numerator: z.number().int().min(0).max(12),
    advanceLabel: safeTextSchema.optional(),
  })
  .refine((section) => section.numerator <= section.denominator, {
    message: "The section numerator exceeds its denominator.",
  });

export const fractionLessonDraftSchema = z.strictObject({
  requestId: componentIdSchema,
  standardId: componentIdSchema,
  grade: z.number().int().min(3).max(6),
  language: z.enum(["en", "ar"]),
  direction: z.enum(["ltr", "rtl"]),
  title: safeTextSchema,
  sections: z.array(fractionSectionSchema).min(1).max(12),
});

export type FractionLessonDraft = z.infer<typeof fractionLessonDraftSchema>;
export type FractionSection = z.infer<typeof fractionSectionSchema>;
