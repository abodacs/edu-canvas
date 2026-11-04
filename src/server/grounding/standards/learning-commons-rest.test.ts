import { describe, expect, it } from "vitest";

import {
  createLearningCommonsAdapter,
  createLearningCommonsRestTransport,
} from "./learning-commons-rest";
import { PILOT_STANDARD_REGISTRY } from "./pilot-registry";
import { GROUNDING_TEXT_LIMITS } from "./types";
import {
  createRecordedLearningCommonsTransport,
  recordedColdRuns,
} from "./fixtures/learning-commons-replay";

import type {
  LearningCommonsTransport,
  ProviderResponse,
} from "./learning-commons-rest";

const NOW = "2026-11-04T12:00:00.000Z";

const createAdapter = (transport: LearningCommonsTransport) => {
  return createLearningCommonsAdapter({
    transport,
    now: () => NOW,
  });
};

const response = (body: unknown, status = 200): ProviderResponse => {
  return { status, body };
};

const pilotEntries = PILOT_STANDARD_REGISTRY.entries.filter((entry) => {
  return entry.kind === "pilot";
});

const lookupRun = (jurisdiction: string, statementCode: string) => {
  return recordedColdRuns.find((run) => {
    return (
      run.row.jurisdiction === jurisdiction && run.row.code === statementCode
    );
  });
};

describe("Learning Commons REST resolution pipeline (issue 218)", () => {
  it.each(pilotEntries)(
    "resolves $id from the recorded evidence",
    async (entry) => {
      const adapter = createAdapter(createRecordedLearningCommonsTransport());
      const resolution = await adapter.resolve({
        jurisdiction: entry.jurisdiction,
        statementCode: entry.statementCode,
      });
      const run = lookupRun(entry.jurisdiction, entry.statementCode);
      if (!run) {
        throw new Error("Recorded run missing.");
      }

      expect(resolution).toMatchObject({
        standardId: run.resolvedStandard.caseIdentifierUUID,
        statementCode: entry.statementCode,
        jurisdiction: entry.jurisdiction,
        prerequisiteResolution: entry.prerequisiteResolution,
        gaps: [],
      });
      expect({
        componentCount: resolution.components.length,
        prerequisites: resolution.prerequisites.map((prerequisite) => {
          return prerequisite.statementCode;
        }),
      }).toStrictEqual({
        componentCount: run.componentFacts?.componentCount ?? 0,
        prerequisites: run.progression?.statementCodes,
      });
      expect({
        contentHash: resolution.contentHash,
        descriptionHash: resolution.descriptionHash,
      }).toStrictEqual({
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        descriptionHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
    }
  );

  it("records provenance with a safe link and the retrieval time", async () => {
    const adapter = createAdapter(createRecordedLearningCommonsTransport());
    const resolution = await adapter.resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.provenance).toStrictEqual({
      license: "CC BY 4.0",
      attribution: "Learning Commons Knowledge Graph",
      sourceLink: "https://www.learningcommons.org/",
      retrievedAt: NOW,
    });
  });

  it("keeps the content hash stable when only retrieval time changes", async () => {
    const first = await createAdapter(
      createRecordedLearningCommonsTransport()
    ).resolve({ jurisdiction: "Multi-State", statementCode: "4.NF.A.1" });
    const laterAdapter = createLearningCommonsAdapter({
      transport: createRecordedLearningCommonsTransport(),
      now: () => "2026-11-05T12:00:00.000Z",
    });
    const later = await laterAdapter.resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(later.contentHash).toBe(first.contentHash);
    expect(later.provenance.retrievedAt).not.toBe(first.provenance.retrievedAt);
  });

  it("pretends no unsafe or arbitrary provider link crosses the adapter", async () => {
    const unsafeSourceLink = ["java", "script:alert(1)"].join("");
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "Bind a fraction.",
                jurisdiction: "Multi-State",
                sourceLink: unsafeSourceLink,
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () => {
        return Promise.resolve(
          response({
            learning_components: [
              { description: "Component", identifier: "component-1" },
            ],
          })
        );
      },
      findProgression: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                alignmentScore: 1,
                jurisdiction: "Multi-State",
                matchType: "exact",
                statementCode: "3.NF.A.3",
              },
            ],
          })
        );
      },
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.provenance.sourceLink).toBe(
      "https://www.learningcommons.org/"
    );
    expect(resolution.provenance.sourceLink).not.toContain("javascript");
  });

  it("bounds description and component text", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "d".repeat(GROUNDING_TEXT_LIMITS.description + 50),
                jurisdiction: "Multi-State",
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () => {
        return Promise.resolve(
          response({
            learning_components: [
              {
                description: "c".repeat(GROUNDING_TEXT_LIMITS.component + 50),
                identifier: "component-1",
              },
            ],
          })
        );
      },
      findProgression: () => {
        return Promise.resolve(response({ standards: [] }));
      },
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.description).toHaveLength(
      GROUNDING_TEXT_LIMITS.description
    );
    expect(resolution.description?.endsWith("…")).toBeTruthy();
    expect(resolution.components[0]?.text).toHaveLength(
      GROUNDING_TEXT_LIMITS.component
    );
    expect(resolution.components[0]?.text.endsWith("…")).toBeTruthy();
  });

  it("reports framework ambiguity instead of guessing", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "One",
                jurisdiction: "Multi-State",
                statementCode: "4.NF.A.1",
              },
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-2",
                description: "Two",
                jurisdiction: "Multi-State",
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () => {
        throw new Error("Components must not run after ambiguity.");
      },
      findProgression: () => {
        throw new Error("Progression must not run after ambiguity.");
      },
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "framework-ambiguous"
    );
  });

  it("reports an empty component list as skills-missing, never as none", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "Standard",
                jurisdiction: "Multi-State",
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () =>
        Promise.resolve(response({ learning_components: [] })),
      findProgression: () => Promise.resolve(response({ standards: [] })),
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.components).toStrictEqual([]);
    expect(resolution.gaps.map((gap) => gap.code)).toContain("skills-missing");
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "prerequisites-unavailable"
    );
  });

  it("reports an inexact crosswalk and does not present its rows as prerequisites", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "Standard",
                jurisdiction: "California",
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () => {
        return Promise.resolve(
          response({
            learning_components: [
              { description: "Component", identifier: "component-1" },
            ],
          })
        );
      },
      findProgression: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                alignmentScore: 0.8,
                jurisdiction: "California",
                matchType: "inexact",
                statementCode: "3.NF.A.3",
              },
            ],
          })
        );
      },
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "California",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.prerequisiteResolution).toBe("unavailable");
    expect(resolution.prerequisites).toStrictEqual([]);
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "crosswalk-inexact"
    );
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "prerequisites-unavailable"
    );
  });

  it("marks a not-current standard without hiding its data", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                academicSubject: "Mathematics",
                caseIdentifierUUID: "case-1",
                description: "Standard",
                isCurrent: false,
                jurisdiction: "Multi-State",
                statementCode: "4.NF.A.1",
              },
            ],
          })
        );
      },
      findComponents: () => {
        return Promise.resolve(
          response({
            learning_components: [
              { description: "Component", identifier: "component-1" },
            ],
          })
        );
      },
      findProgression: () => {
        return Promise.resolve(
          response({
            standards: [
              {
                alignmentScore: 1,
                jurisdiction: "Multi-State",
                matchType: "exact",
                statementCode: "3.NF.A.3",
              },
            ],
          })
        );
      },
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBe("case-1");
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "standard-not-current"
    );
  });

  it("turns a malformed provider body into a stated gap, not an exception", async () => {
    const transport: LearningCommonsTransport = {
      findStandard: () => Promise.resolve(response({ standards: "nope" })),
      findComponents: () =>
        Promise.resolve(response({ learning_components: 7 })),
      findProgression: () => Promise.resolve(response({ standards: 7 })),
    };

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toContain("standard-absent");
  });

  it("builds fixed REST requests and refuses an arbitrary origin", async () => {
    const calls: { url: string; apiKey: string | null }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({
        url: String(input),
        apiKey: new Headers(init?.headers).get("x-api-key"),
      });
      return Promise.resolve(Response.json({ standards: [] }, { status: 200 }));
    };
    const transport = createLearningCommonsRestTransport({
      apiKey: "fixture-key",
      fetchImpl,
    });

    const standard = await transport.findStandard(
      { jurisdiction: "Multi-State", statementCode: "4.NF.A.1" },
      {}
    );
    await transport.findComponents({ caseIdentifierUUID: "case id" }, {});

    expect(standard).toStrictEqual({
      status: 200,
      body: { standards: [] },
    });
    expect(calls).toStrictEqual([
      {
        url: "https://api.learningcommons.org/knowledge-graph/v0/academic-standards?statementCode=4.NF.A.1&jurisdiction=Multi-State&limit=5",
        apiKey: "fixture-key",
      },
      {
        url: "https://api.learningcommons.org/knowledge-graph/v0/academic-standards/case%20id/learning-components",
        apiKey: "fixture-key",
      },
    ]);
    expect(() => {
      return createLearningCommonsRestTransport({
        apiKey: "fixture-key",
        origin: "https://evil.example/knowledge-graph/v0",
      });
    }).toThrow(/fixed HTTPS API origin/u);
  });

  it("reports the recorded ELA boundary as prerequisites-unavailable", async () => {
    const adapter = createAdapter(createRecordedLearningCommonsTransport());
    const resolution = await adapter.resolve({
      jurisdiction: "Multi-State",
      statementCode: "RI.5.2",
    });

    expect(resolution.standardId).toBe("recorded-ela-ri-5-2");
    expect(resolution.prerequisiteResolution).toBe("unavailable");
    expect(resolution.prerequisites).toStrictEqual([]);
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "prerequisites-unavailable"
    );
  });
});
