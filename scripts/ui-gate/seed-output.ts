/**
The typed stdout contract of the browser-gate seeds. Each seed prints one JSON
line last; `verify:ui` and `census:capture` read both through this module so a
missing or reshaped field fails loudly instead of yielding an empty request id.
*/
import { z } from "zod";

const idSchema = z.string().min(1);

const learnerLinkSchema = z
  .object({ assignment: idSchema, variant: idSchema })
  .strict();

/** scripts/student-probe/seed.ts: one published pack per language. */
export const probeSeedOutputSchema = z
  .object({ en: learnerLinkSchema, ar: learnerLinkSchema })
  .strict();

const draftOf = <State extends string>(state: State) =>
  z.object({ requestId: idSchema, state: z.literal(state) }).strict();

/**
scripts/ui-gate/seed.ts: one draft per gate view state. Publishing mutates a
draft, so the `published` view gets one approved draft per viewport and the
`publish` view keeps its own.
*/
export const gateSeedOutputSchema = z
  .object({
    teacher: z
      .object({ email: z.string().min(1), membership: z.string().min(1) })
      .strict(),
    drafts: z
      .object({
        readyForReview: draftOf("ready-for-review"),
        approvedForPublish: draftOf("ready-for-review"),
        approvedForPublishedDesktop: draftOf("ready-for-review"),
        approvedForPublishedPhone: draftOf("ready-for-review"),
        blockedValidation: draftOf("blocked-by-validation"),
        blockedModeration: draftOf("blocked-by-moderation"),
      })
      .strict(),
  })
  .strict();

export type ProbeSeedOutput = z.infer<typeof probeSeedOutputSchema>;
export type GateSeedOutput = z.infer<typeof gateSeedOutputSchema>;
export type GateDraftName = keyof GateSeedOutput["drafts"];

/**
The last non-empty line of one seed's stdout, parsed as JSON. Earlier lines
(library notices) are never evidence.
*/
const lastJsonLine = (stdout: string | undefined, seed: string): unknown => {
  const line = (stdout ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .findLast((entry) => entry.length > 0);
  if (line === undefined) {
    throw new Error(`${seed} printed no output line.`);
  }
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new Error(`${seed} printed a line that is not JSON.`);
  }
};

const parseWith = <Output>(
  schema: z.ZodType<Output>,
  stdout: string | undefined,
  seed: string
): Output => {
  const parsed = schema.safeParse(lastJsonLine(stdout, seed));
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join(".") || "(root)")
      .join(", ");
    throw new Error(`${seed} printed an unexpected shape at: ${fields}.`);
  }
  return parsed.data;
};

export const parseProbeSeedOutput = (stdout: string | undefined) =>
  parseWith(probeSeedOutputSchema, stdout, "scripts/student-probe/seed.ts");

export const parseGateSeedOutput = (stdout: string | undefined) =>
  parseWith(gateSeedOutputSchema, stdout, "scripts/ui-gate/seed.ts");

/** The seeds both gates run, in order; `readSeedOutputs` reads them by position. */
export const gateSeedScripts = [
  "scripts/student-probe/seed.ts",
  "scripts/ui-gate/seed.ts",
] as const;

export interface SeedOutputs {
  readonly probe: ProbeSeedOutput;
  readonly gate: GateSeedOutput;
  /** The English learner link as a `/learn` query string. */
  readonly learnerQuery: string;
}

export const readSeedOutputs = (stdouts: readonly string[]): SeedOutputs => {
  const probe = parseProbeSeedOutput(stdouts[0]);
  return {
    probe,
    gate: parseGateSeedOutput(stdouts[1]),
    learnerQuery: `assignment=${probe.en.assignment}&variant=${probe.en.variant}`,
  };
};
