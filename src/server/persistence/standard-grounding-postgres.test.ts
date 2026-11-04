import { describe, expect, it } from "vitest";

import { hydrateStandardGroundingRow } from "./standard-grounding-postgres";
import type { GroundingRow } from "./standard-grounding-postgres";

const validRow: GroundingRow = {
  id: "grounding_1",
  tenant_id: "tenant_1",
  request_key: "request_1",
  input_hash: "a".repeat(64),
  registry_version: "pilot-registry-v1",
  framework_id: "ccss-math",
  jurisdiction: "Multi-State",
  statement_code: "4.NF.A.1",
  subject: "Mathematics",
  grade: 4,
  standard_id: "case-1",
  description: "Explain equivalent fractions.",
  description_hash: "b".repeat(64),
  components: [{ id: "component-1", text: "Recognise equivalent fractions." }],
  prerequisites: [
    {
      statementCode: "3.NF.A.3",
      jurisdiction: "Multi-State",
      matchType: "exact",
      alignmentScore: 1,
    },
  ],
  prerequisite_resolution: "direct",
  gaps: [{ code: "skills-missing", message: "Empty is reported." }],
  provenance: {
    license: "CC BY 4.0",
    attribution: "Learning Commons Knowledge Graph",
    sourceLink: "https://www.learningcommons.org/",
    retrievedAt: "2026-11-04T12:00:00.000Z",
  },
  content_hash: "c".repeat(64),
  retrieval_attempt: 1,
  retrieved_at: "2026-11-04T12:00:00.000Z",
  predecessor_grounding_id: null,
  created_at: "2026-11-04T12:00:00.000Z",
};

describe("standard grounding row hydration", () => {
  it("decodes a valid persisted row", () => {
    const record = hydrateStandardGroundingRow(validRow);

    expect(record).toMatchObject({
      id: "grounding_1",
      prerequisiteResolution: "direct",
      components: [{ id: "component-1" }],
      gaps: [{ code: "skills-missing" }],
    });
  });

  it("fails closed instead of fabricating a record from malformed JSON", () => {
    expect(() =>
      hydrateStandardGroundingRow({
        ...validRow,
        prerequisites: [{ statementCode: 1 }],
      })
    ).toThrow(/malformed/u);

    expect(() =>
      hydrateStandardGroundingRow({
        ...validRow,
        provenance: null,
      })
    ).toThrow(/malformed/u);

    expect(() =>
      hydrateStandardGroundingRow({
        ...validRow,
        prerequisite_resolution: "guessed",
      })
    ).toThrow(/malformed/u);
  });
});
