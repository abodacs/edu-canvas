import { z } from "zod";

import type {
  AdvisoryReviewAgent,
  AdvisoryReviewAgentOptions,
} from "./advisory-review-contract";
import type {
  SemanticAgentRecommendation,
  SemanticValidationInput,
} from "./semantic-validation-contract";

/**
#223: the Meta-backed advisory reviewer.

It asks for warnings about learning quality only. The request schema has no
field for an answer key, a grade, or a block, and the response parser clamps any
verdict the model still returns to a warning. The reviewer never grounds, grades,
authors answer keys, or touches the deterministic gate.
*/

const advisoryReviewResponseSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            verdict: z.enum(["pass", "warning", "hard_block"]),
            field: z.string(),
            reason: z.string(),
            variantId: z.string().nullable().optional(),
            recommendation: z.string().nullable().optional(),
          })
          .strict()
      )
      .max(8),
  })
  .strict();

/**
The response JSON schema the provider must satisfy. A strict schema requires
every property to be listed in `required`, so the two optional fields are
required and nullable instead of absent.
*/
const advisoryRecommendationsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["verdict", "field", "reason", "variantId", "recommendation"],
        properties: {
          verdict: { type: "string", enum: ["pass", "warning", "hard_block"] },
          field: {
            type: "string",
            enum: [
              "draft",
              "title",
              "instructions",
              "sourceItems",
              "targetItems",
              "hints",
              "feedback",
              "accessibilityMetadata",
              "learningPath",
            ],
          },
          variantId: { type: ["string", "null"] },
          reason: { type: "string", maxLength: 240 },
          recommendation: { type: ["string", "null"], maxLength: 240 },
        },
      },
    },
  },
} as const;

const itemList = (items: readonly { label: string }[]): string => {
  return items.map((item, index) => `${index + 1}. ${item.label}`).join("\n");
};

/**
The prompt carries only the sanitized draft and pack-derived context. The
advisory input clone already dropped relationships, so the reviewer never sees
the answer pairs.
*/
export const buildAdvisoryReviewPrompt = (
  input: SemanticValidationInput
): string => {
  const { context, draft, path } = input;
  const variants = draft.variants
    .map((variant) => {
      return [
        `Variant ${variant.id} (${variant.kind}): ${variant.title}`,
        `Instructions: ${variant.instructions}`,
        `Source items:\n${itemList(variant.sourceItems)}`,
        `Target items:\n${itemList(variant.targetItems)}`,
        `Distractor items:\n${itemList(variant.distractorItems) || "(none)"}`,
        `Hints: ${variant.hints.join(" | ")}`,
        `Feedback: correct "${variant.feedback.correct}" / incorrect "${variant.feedback.incorrect}"`,
      ].join("\n");
    })
    .join("\n\n");

  const pathLine = path
    ? `Learning path node ids: ${path.nodeIds.join(" -> ")}`
    : "Learning path node ids: (not provided)";

  return [
    "You are an advisory reviewer for a Grade 3-6 matching lesson draft.",
    "Review the draft for learning quality only: clarity, age-appropriate language, distractor quality, hint usefulness, feedback usefulness, and whether the screens repeat one interaction without a progression.",
    "You are NOT grading. You do not know the intended answers and you must not write, guess, or restate an answer key, a solution, or a correction.",
    "You cannot block, approve, publish, or change the draft. Your only output is advisory warnings for a teacher.",
    "",
    `Standard: ${context.standardCode} (grade ${context.grade}, pack ${context.packVersion}).`,
    `Target node: ${context.targetNodeId}.`,
    `Task: ${context.promptFrame?.taskLine ?? "match each item to the item it goes with"}.`,
    pathLine,
    "",
    variants,
    "",
    "Return at most 4 recommendations. Use verdict `warning` only when a teacher should look at something specific; otherwise return an empty list. Never use `hard_block`.",
  ].join("\n");
};

const extractResponseJson = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  if ("output_text" in body && typeof body.output_text === "string") {
    return JSON.parse(body.output_text) as unknown;
  }
  if (!("output" in body) || !Array.isArray(body.output)) {
    return undefined;
  }
  for (const item of body.output) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("content" in item) ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (const content of item.content) {
      if (
        typeof content === "object" &&
        content !== null &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        return JSON.parse(content.text) as unknown;
      }
    }
  }
  return undefined;
};

const parseRecommendations = (
  body: unknown
): readonly SemanticAgentRecommendation[] => {
  const parsed = advisoryReviewResponseSchema.safeParse(
    extractResponseJson(body)
  );
  if (!parsed.success) {
    throw new Error("The advisory reviewer returned malformed content.");
  }

  return parsed.data.recommendations.map((recommendation) => {
    return {
      // The response type still admits a block verdict so a provider that
      // disobeys is downgraded here instead of failing the whole review.
      verdict: recommendation.verdict === "pass" ? "pass" : "warning",
      code: "AGENT_RECOMMENDATION",
      field: recommendation.field,
      reason: recommendation.reason,
      ...(recommendation.variantId && {
        variantId: recommendation.variantId,
      }),
      ...(recommendation.recommendation && {
        recommendation: recommendation.recommendation,
      }),
    };
  });
};

export const createMetaAdvisoryReviewAgent = (
  options: AdvisoryReviewAgentOptions
): AdvisoryReviewAgent => {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.meta.ai/v1";

  return {
    provider: "meta",
    model: options.model,
    version: options.version,

    async review(input, signal) {
      const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
      const combined = AbortSignal.any([signal, timeoutSignal]);
      let response: Response;
      try {
        response = await fetchImplementation(
          `${baseUrl.replace(/\/$/u, "")}/responses`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: options.model,
              input: buildAdvisoryReviewPrompt(input),
              text: {
                format: {
                  type: "json_schema",
                  name: "edu_canvas_advisory_review",
                  strict: true,
                  schema: advisoryRecommendationsJsonSchema,
                },
              },
            }),
            signal: combined,
          }
        );
      } catch {
        throw new Error("The advisory reviewer could not be reached.");
      }

      if (!response.ok) {
        throw new Error("The advisory reviewer rejected the request.");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error(
          "The advisory reviewer returned an unreadable response."
        );
      }

      return parseRecommendations(body);
    },
  };
};
