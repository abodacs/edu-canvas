import { describe, expect, it } from "vitest";

import {
  LEARNING_COMMONS_PAGE_BOUNDS,
  createLearningCommonsAdapter,
  createLearningCommonsRestTransport,
} from "./learning-commons-rest";
import { PILOT_STANDARD_REGISTRY } from "./pilot-registry";
import { GROUNDING_TEXT_LIMITS } from "./types";
import {
  createRecordedLearningCommonsTransport,
  RECORDED_STANDARDS,
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

const page = (
  data: readonly unknown[],
  nextCursor: string | null = null
): ProviderResponse => {
  return {
    status: 200,
    body: {
      data,
      pagination: {
        limit: 100,
        nextCursor,
        hasMore: nextCursor !== null,
      },
    },
  };
};

const response = (body: unknown, status = 200): ProviderResponse => {
  return { status, body };
};

const standardRow = (overrides: Record<string, unknown> = {}) => {
  return {
    caseIdentifierUUID: "case-1",
    statementCode: "4.NF.A.1",
    description: "Standard description.",
    jurisdiction: "Multi-State",
    ...overrides,
  };
};

const createTransport = (
  overrides: Partial<LearningCommonsTransport> = {}
): LearningCommonsTransport => {
  return {
    findFrameworks: () => {
      return Promise.resolve(
        page([{ caseIdentifierUUID: "framework-1", isCurrent: true }])
      );
    },
    findStandardsPage: () => Promise.resolve(page([standardRow()])),
    findComponentsPage: () => {
      return Promise.resolve(
        page([{ description: "Component", identifier: "component-1" }])
      );
    },
    findPrerequisitesPage: () => {
      return Promise.resolve(
        page([{ jurisdiction: "Multi-State", statementCode: "3.NF.A.3" }])
      );
    },
    findCrosswalks: () => Promise.resolve(page([])),
    ...overrides,
  };
};

const pilotEntries = PILOT_STANDARD_REGISTRY.entries.filter((entry) => {
  return entry.kind === "pilot";
});

const recorded = (jurisdiction: string, statementCode: string) => {
  const standard = RECORDED_STANDARDS.find((candidate) => {
    return (
      candidate.jurisdiction === jurisdiction &&
      candidate.statementCode === statementCode
    );
  });
  if (!standard) {
    throw new Error("Recorded standard missing.");
  }
  return standard;
};

describe("Learning Commons REST resolution pipeline (issue 218)", () => {
  it.each(pilotEntries)(
    "resolves $id from the recorded live shape",
    async (entry) => {
      const adapter = createAdapter(createRecordedLearningCommonsTransport());
      const resolution = await adapter.resolve({
        jurisdiction: entry.jurisdiction,
        statementCode: entry.statementCode,
      });
      const live = recorded(entry.jurisdiction, entry.statementCode);
      const livePrerequisites = live.crosswalk
        ? recorded("Multi-State", live.statementCode).prerequisites
        : live.prerequisites;

      expect(resolution).toMatchObject({
        standardId: live.caseIdentifierUUID,
        statementCode: entry.statementCode,
        jurisdiction: entry.jurisdiction,
        gaps: [],
      });
      expect(resolution.prerequisiteResolution).toBe(
        live.crosswalk ? "crosswalk" : "direct"
      );
      expect(resolution.components).toHaveLength(live.componentCount);
      expect(
        resolution.prerequisites.map((prerequisite) => {
          return prerequisite.statementCode;
        })
      ).toStrictEqual(
        livePrerequisites.map((prerequisite) => prerequisite.statementCode)
      );
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

  it("resolves an exact code that appears on page two", async () => {
    const cursors: (string | undefined)[] = [];
    const transport = createTransport({
      findStandardsPage: ({ cursor }) => {
        cursors.push(cursor);
        if (cursor === undefined) {
          return Promise.resolve(
            page([standardRow({ statementCode: "recorded-filler" })], "page-2")
          );
        }
        return Promise.resolve(page([standardRow()]));
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(cursors).toStrictEqual([undefined, "page-2"]);
    expect(resolution.standardId).toBe("case-1");
    expect(resolution.gaps).toStrictEqual([]);
  });

  it("stops a paginated scan at the page cap and claims no absence", async () => {
    let calls = 0;
    const transport = createTransport({
      findStandardsPage: () => {
        calls += 1;
        return Promise.resolve(
          page(
            [standardRow({ statementCode: "not-the-code" })],
            `cursor-${calls}`
          )
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(calls).toBe(LEARNING_COMMONS_PAGE_BOUNDS.standardPagesPerFramework);
    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "unsupported-envelope",
    ]);
  });

  it("treats hasMore without a cursor as a bounded malformed pager", async () => {
    let calls = 0;
    const transport = createTransport({
      findStandardsPage: () => {
        calls += 1;
        return Promise.resolve(
          response({
            data: [standardRow({ statementCode: "not-the-code" })],
            pagination: { hasMore: true, nextCursor: null },
          })
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(calls).toBe(1);
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "unsupported-envelope",
    ]);
  });

  it("reports an absent framework without inventing a standard", async () => {
    const transport = createTransport({
      findFrameworks: () => Promise.resolve(page([])),
      findStandardsPage: () => {
        throw new Error("Standards must not run without a framework.");
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "standard-absent",
    ]);
  });

  it("reports framework ambiguity when one framework repeats the code", async () => {
    const transport = createTransport({
      findFrameworks: () => {
        return Promise.resolve(
          page([{ caseIdentifierUUID: "framework-1", isCurrent: true }])
        );
      },
      findStandardsPage: () => {
        return Promise.resolve(
          page([
            standardRow({ caseIdentifierUUID: "case-1" }),
            standardRow({ caseIdentifierUUID: "case-2" }),
          ])
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "framework-ambiguous",
    ]);
  });

  it("prefers a direct prerequisite path when the provider returns rows", async () => {
    const resolution = await createAdapter(
      createRecordedLearningCommonsTransport()
    ).resolve({ jurisdiction: "Multi-State", statementCode: "4.NF.A.1" });

    expect(resolution.prerequisiteResolution).toBe("direct");
    expect(resolution.prerequisites).toMatchObject([
      { statementCode: "4.OA.A.2", matchType: "direct", alignmentScore: 1 },
      { statementCode: "3.NF.A.3", matchType: "direct", alignmentScore: 1 },
    ]);
  });

  it("falls back to the exact crosswalk for a state standard", async () => {
    const resolution = await createAdapter(
      createRecordedLearningCommonsTransport()
    ).resolve({ jurisdiction: "California", statementCode: "4.NF.A.1" });

    expect(resolution.standardId).toBe("5ebefbed-d7cc-11e8-824f-0242ac160002");
    expect(resolution.prerequisiteResolution).toBe("crosswalk");
    expect(resolution.gaps).toStrictEqual([]);
    expect(
      resolution.prerequisites.map((prerequisite) => {
        return [prerequisite.statementCode, prerequisite.matchType];
      })
    ).toStrictEqual([
      ["4.OA.A.2", "crosswalk"],
      ["3.NF.A.3", "crosswalk"],
    ]);
  });

  it("uses the best inexact crosswalk and states that it is inexact", async () => {
    const transport = createTransport({
      findFrameworks: () => {
        return Promise.resolve(
          page([{ caseIdentifierUUID: "framework-ca", isCurrent: true }])
        );
      },
      findStandardsPage: () => {
        return Promise.resolve(
          page([standardRow({ jurisdiction: "California" })])
        );
      },
      findPrerequisitesPage: ({ standardCaseIdentifierUUID }) => {
        if (standardCaseIdentifierUUID === "case-1") {
          return Promise.resolve(page([]));
        }
        return Promise.resolve(
          page([{ jurisdiction: "Multi-State", statementCode: "3.NF.A.3" }])
        );
      },
      findCrosswalks: () => {
        return Promise.resolve(
          page([
            {
              caseIdentifierUUID: "ccss-1",
              statementCode: "4.NF.A.1",
              jurisdiction: "Multi-State",
              jaccard: 0.8,
            },
          ])
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "California",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.prerequisiteResolution).toBe("crosswalk");
    expect(resolution.prerequisites).toMatchObject([
      {
        statementCode: "3.NF.A.3",
        matchType: "crosswalk-inexact",
        alignmentScore: 0.8,
      },
    ]);
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "crosswalk-inexact"
    );
  });

  it("reports the recorded ELA boundary as zero components and no prerequisites", async () => {
    const adapter = createAdapter(createRecordedLearningCommonsTransport());
    const resolution = await adapter.resolve({
      jurisdiction: "Multi-State",
      statementCode: "RI.5.2",
    });

    expect(resolution.standardId).toBe("6b36c8ef-d7cc-11e8-824f-0242ac160002");
    expect(resolution.components).toStrictEqual([]);
    expect(resolution.prerequisiteResolution).toBe("unavailable");
    expect(resolution.prerequisites).toStrictEqual([]);
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "skills-missing",
      "prerequisites-unavailable",
    ]);
  });

  it("keeps an empty component list as skills-missing, never as none", async () => {
    const transport = createTransport({
      findComponentsPage: () => Promise.resolve(page([])),
      findPrerequisitesPage: () => Promise.resolve(page([])),
    });

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

  it("joins component pages instead of truncating at the first page", async () => {
    const transport = createTransport({
      findComponentsPage: ({ cursor }) => {
        if (cursor === undefined) {
          return Promise.resolve(
            page(
              [{ description: "First", identifier: "component-1" }],
              "components-2"
            )
          );
        }
        return Promise.resolve(
          page([{ description: "Second", identifier: "component-2" }])
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(
      resolution.components.map((component) => component.id)
    ).toStrictEqual(["component-1", "component-2"]);
  });

  it("keeps a 404 components response visible instead of reading it as skills-missing", async () => {
    const transport = createTransport({
      findComponentsPage: () => {
        return Promise.resolve(response({ message: "Not Found" }, 404));
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "unsupported-envelope"
    );
    expect(resolution.gaps.map((gap) => gap.code)).not.toContain(
      "skills-missing"
    );
  });

  it("keeps a 401 prerequisites response visible instead of reading it as unavailable", async () => {
    const transport = createTransport({
      findPrerequisitesPage: () => {
        return Promise.resolve(response({ message: "Unauthorized" }, 401));
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "unsupported-envelope"
    );
    expect(resolution.gaps.map((gap) => gap.code)).not.toContain(
      "prerequisites-unavailable"
    );
    expect(resolution.prerequisiteResolution).toBe("unavailable");
  });

  it("marks a not-current standard without hiding its data", async () => {
    const transport = createTransport({
      findStandardsPage: () => {
        return Promise.resolve(page([standardRow({ isCurrent: false })]));
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBe("case-1");
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "standard-not-current"
    );
  });

  it("bounds description and component text", async () => {
    const transport = createTransport({
      findStandardsPage: () => {
        return Promise.resolve(
          page([
            standardRow({
              description: "d".repeat(GROUNDING_TEXT_LIMITS.description + 50),
            }),
          ])
        );
      },
      findComponentsPage: () => {
        return Promise.resolve(
          page([
            {
              description: "c".repeat(GROUNDING_TEXT_LIMITS.component + 50),
              identifier: "component-1",
            },
          ])
        );
      },
    });

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

  it("keeps unsafe or arbitrary provider links out of provenance", async () => {
    const unsafeSourceLink = ["java", "script:alert(1)"].join("");
    const transport = createTransport({
      findStandardsPage: () => {
        return Promise.resolve(
          page([standardRow({ sourceLink: unsafeSourceLink })])
        );
      },
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.provenance.sourceLink).toBe(
      "https://www.learningcommons.org/"
    );
    expect(resolution.provenance.sourceLink).not.toContain("javascript");
  });

  it("turns a malformed provider body into a stated gap, not an exception", async () => {
    const transport = createTransport({
      findFrameworks: () => Promise.resolve(response({ data: "nope" })),
    });

    const resolution = await createAdapter(transport).resolve({
      jurisdiction: "Multi-State",
      statementCode: "4.NF.A.1",
    });

    expect(resolution.standardId).toBeNull();
    expect(resolution.gaps.map((gap) => gap.code)).toContain(
      "unsupported-envelope"
    );
  });

  it("keeps a raw provider payload out of the provider error", async () => {
    const secret = "raw-provider-payload-secret";
    const transport = createTransport({
      findFrameworks: () => Promise.resolve(response({ secret }, 503)),
    });

    let caught: unknown;
    try {
      await createAdapter(transport).resolve({
        jurisdiction: "Multi-State",
        statementCode: "4.NF.A.1",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("503");
    expect((caught as Error).cause).toBeUndefined();
    expect(JSON.stringify(caught)).not.toContain(secret);
  });

  it("does not borrow another envelope's facts for an unsupported jurisdiction", async () => {
    const resolution = await createAdapter(
      createRecordedLearningCommonsTransport()
    ).resolve({ jurisdiction: "Atlantis", statementCode: "4.NF.A.1" });

    expect(resolution.subject).toBe("Unknown");
    expect(resolution.grade).toBe(4);
    expect(resolution.gaps.map((gap) => gap.code)).toStrictEqual([
      "unsupported-envelope",
    ]);
  });

  it("builds fixed REST requests and refuses an arbitrary origin", async () => {
    const calls: {
      url: string;
      apiKey: string | null;
      redirect: RequestRedirect | undefined;
    }[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({
        url: String(input),
        apiKey: new Headers(init?.headers).get("x-api-key"),
        redirect: init?.redirect,
      });
      return Promise.resolve(
        Response.json(
          { data: [], pagination: { hasMore: false, nextCursor: null } },
          { status: 200 }
        )
      );
    };
    const transport = createLearningCommonsRestTransport({
      apiKey: "fixture-key",
      fetchImpl,
    });

    await transport.findFrameworks(
      { jurisdiction: "Multi-State", academicSubject: "Mathematics" },
      {}
    );
    await transport.findStandardsPage(
      { frameworkCaseIdentifierUUID: "fw id", cursor: "cur" },
      {}
    );
    await transport.findComponentsPage(
      { standardCaseIdentifierUUID: "case id" },
      {}
    );
    await transport.findPrerequisitesPage(
      { standardCaseIdentifierUUID: "case id" },
      {}
    );
    await transport.findCrosswalks(
      {
        standardCaseIdentifierUUID: "case id",
        jurisdiction: "Multi-State",
      },
      {}
    );

    expect(calls.map((call) => call.url)).toStrictEqual([
      "https://api.learningcommons.org/knowledge-graph/v0/standards-frameworks?jurisdiction=Multi-State&academicSubject=Mathematics&limit=100",
      "https://api.learningcommons.org/knowledge-graph/v0/academic-standards?standardsFrameworkCaseIdentifierUUID=fw+id&limit=1000&cursor=cur",
      "https://api.learningcommons.org/knowledge-graph/v0/academic-standards/case%20id/learning-components?limit=100",
      "https://api.learningcommons.org/knowledge-graph/v0/academic-standards/case%20id/prerequisites?limit=100",
      "https://api.learningcommons.org/knowledge-graph/v0/academic-standards/case%20id/crosswalks?jurisdiction=Multi-State&limit=100",
    ]);
    expect(calls.map((call) => call.apiKey)).toStrictEqual([
      "fixture-key",
      "fixture-key",
      "fixture-key",
      "fixture-key",
      "fixture-key",
    ]);
    expect(calls.map((call) => call.redirect)).toStrictEqual([
      "error",
      "error",
      "error",
      "error",
      "error",
    ]);
    expect(() => {
      return createLearningCommonsRestTransport({
        apiKey: "fixture-key",
        origin: "https://evil.example/knowledge-graph/v0",
      });
    }).toThrow(/fixed HTTPS API origin/u);
  });
});
