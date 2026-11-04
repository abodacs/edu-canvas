import { describe, expect, it } from "vitest";

import {
  parseGateSeedOutput,
  parseProbeSeedOutput,
  readSeedOutputs,
} from "./seed-output";

const draft = (requestId: string, state: string) => ({ requestId, state });

const gateOutput = () => ({
  teacher: {
    email: "amira.north@example.test",
    membership: "membership_amira_demo",
  },
  drafts: {
    readyForReview: draft("req_review", "ready-for-review"),
    approvedForPublish: draft("req_publish", "ready-for-review"),
    approvedForPublishedDesktop: draft("req_pub_desktop", "ready-for-review"),
    approvedForPublishedPhone: draft("req_pub_phone", "ready-for-review"),
    blockedValidation: draft("req_validation", "blocked-by-validation"),
    blockedModeration: draft("req_moderation", "blocked-by-moderation"),
  },
});

const probeOutput = {
  en: { assignment: "assign_en", variant: "variant_en" },
  ar: { assignment: "assign_ar", variant: "variant_ar" },
};

describe(parseGateSeedOutput, () => {
  it("reads the last JSON line and ignores earlier notices", () => {
    const stdout = `notice: migrating\n${JSON.stringify(gateOutput())}\n\n`;
    expect(parseGateSeedOutput(stdout).drafts.blockedModeration).toStrictEqual(
      draft("req_moderation", "blocked-by-moderation")
    );
  });

  it("rejects a missing draft", () => {
    const output = gateOutput();
    const { blockedValidation: _omitted, ...drafts } = output.drafts;
    expect(() =>
      parseGateSeedOutput(JSON.stringify({ ...output, drafts }))
    ).toThrow(/drafts\.blockedValidation/u);
  });

  it("rejects an extra field", () => {
    expect(() =>
      parseGateSeedOutput(JSON.stringify({ ...gateOutput(), cookie: "x" }))
    ).toThrow(/unexpected shape/u);
  });

  it("rejects a draft whose state drifted", () => {
    const output = gateOutput();
    output.drafts.blockedModeration = draft("req_m", "ready-for-review");
    expect(() => parseGateSeedOutput(JSON.stringify(output))).toThrow(
      /drafts\.blockedModeration\.state/u
    );
  });

  it("rejects a malformed or empty line", () => {
    expect(() => parseGateSeedOutput("{not json")).toThrow(/not JSON/u);
    expect(() => parseGateSeedOutput("")).toThrow(/no output line/u);
  });
});

describe(readSeedOutputs, () => {
  it("reads each seed by position and derives the learner query", () => {
    const outputs = readSeedOutputs([
      JSON.stringify(probeOutput),
      JSON.stringify(gateOutput()),
    ]);
    expect({
      learnerQuery: outputs.learnerQuery,
      review: outputs.gate.drafts.readyForReview.requestId,
    }).toStrictEqual({
      learnerQuery: "assignment=assign_en&variant=variant_en",
      review: "req_review",
    });
  });

  it("fails when the gate seed output is absent", () => {
    expect(() => readSeedOutputs([JSON.stringify(probeOutput)])).toThrow(
      /scripts\/ui-gate\/seed\.ts printed no output line/u
    );
  });

  it("keeps the probe parser strict too", () => {
    expect(() =>
      parseProbeSeedOutput(JSON.stringify({ en: probeOutput.en }))
    ).toThrow(/ar/u);
  });
});
