import { describe, expect, it } from "vitest";

import {
  appendVersionInput,
  assignInput,
  buildLoop,
  chooseInput,
  createRecordFixture,
  groundingInput,
  publishInput,
  recordAttemptInput,
  recordHintInput,
  startRunInput,
} from "./records-fixtures";
import type { RecordFixture } from "./records-fixtures";
import type { Actor } from "../identity/types";

type Action =
  | "store-grounding"
  | "append-version"
  | "publish"
  | "assign"
  | "start-run"
  | "record-hint"
  | "record-attempt"
  | "choose"
  | "read-authoring"
  | "read-evidence"
  | "read-lesson";

type ActorKind =
  | "teacher"
  | "student"
  | "foreign-teacher"
  | "foreign-student"
  | "revoked-teacher"
  | "revoked-student"
  | "none";

interface PolicyCase {
  readonly tag: string;
  readonly description: string;
  readonly action: Action;
  readonly actorKind: ActorKind;
  readonly expected: "allow" | "forbidden" | "unauthenticated";
}

const teacherActions: readonly Action[] = [
  "store-grounding",
  "append-version",
  "publish",
  "assign",
  "choose",
  "read-authoring",
  "read-evidence",
];

const studentActions: readonly Action[] = [
  "start-run",
  "record-hint",
  "record-attempt",
  "read-lesson",
];

const actorFor = (fixture: RecordFixture, kind: ActorKind): Actor => {
  switch (kind) {
    case "teacher": {
      return fixture.teacher;
    }
    case "student": {
      return fixture.student;
    }
    case "foreign-teacher": {
      return fixture.foreignTeacher;
    }
    case "foreign-student": {
      return fixture.foreignStudent;
    }
    case "revoked-teacher": {
      return fixture.revokedTeacher;
    }
    case "revoked-student": {
      return fixture.revokedStudent;
    }
    case "none": {
      return undefined as unknown as Actor;
    }
    default: {
      throw new Error(`Unknown actor kind: ${kind}`);
    }
  }
};

const prepareCall = async (
  action: Action,
  suffix: string
): Promise<{
  readonly fixture: RecordFixture;
  readonly call: (actor: Actor) => Promise<unknown>;
}> => {
  const fixture = createRecordFixture();
  const operationKey = `policy-call-${suffix}`;
  const setup = `policy-setup-${suffix}`;

  switch (action) {
    case "store-grounding": {
      const input = groundingInput(operationKey);
      return {
        fixture,
        call: (actor) => fixture.records.storeGrounding(actor, input),
      };
    }
    case "append-version": {
      const loop = await buildLoop(fixture, setup, "grounding");
      const input = appendVersionInput(
        operationKey,
        loop.groundingId,
        `policy-${suffix}`
      );
      return {
        fixture,
        call: (actor) => fixture.records.appendVersion(actor, input),
      };
    }
    case "publish": {
      const loop = await buildLoop(fixture, setup, "version");
      const input = publishInput(operationKey, loop.versionId);
      return {
        fixture,
        call: (actor) => fixture.records.publish(actor, input),
      };
    }
    case "assign": {
      const loop = await buildLoop(fixture, setup, "publication");
      const input = assignInput(operationKey, loop.publicationId);
      return { fixture, call: (actor) => fixture.records.assign(actor, input) };
    }
    case "start-run": {
      const loop = await buildLoop(fixture, setup, "assignment");
      const input = startRunInput(operationKey, loop.assignmentId);
      return {
        fixture,
        call: (actor) => fixture.records.startRun(actor, input),
      };
    }
    case "record-hint": {
      const loop = await buildLoop(fixture, setup, "run");
      const input = recordHintInput(operationKey, loop.runId);
      return {
        fixture,
        call: (actor) => fixture.records.recordHint(actor, input),
      };
    }
    case "record-attempt": {
      const loop = await buildLoop(fixture, setup, "hint");
      const input = recordAttemptInput(operationKey, loop.runId, loop.hintId);
      return {
        fixture,
        call: (actor) => fixture.records.recordAttempt(actor, input),
      };
    }
    case "choose": {
      const loop = await buildLoop(fixture, setup, "attempt");
      const input = chooseInput(
        operationKey,
        loop.runId,
        loop.revision,
        loop.evidenceHash
      );
      return { fixture, call: (actor) => fixture.records.choose(actor, input) };
    }
    case "read-authoring": {
      const loop = await buildLoop(fixture, setup, "version");
      return {
        fixture,
        call: (actor) => {
          return fixture.records.readAuthoring(actor, {
            kind: "version",
            versionId: loop.versionId,
          });
        },
      };
    }
    case "read-evidence": {
      const loop = await buildLoop(fixture, setup, "attempt");
      return {
        fixture,
        call: (actor) =>
          fixture.records.readEvidence(actor, { runId: loop.runId }),
      };
    }
    case "read-lesson": {
      const loop = await buildLoop(fixture, setup, "run");
      return {
        fixture,
        call: (actor) =>
          fixture.records.readLesson(actor, { runId: loop.runId }),
      };
    }
    default: {
      throw new Error("Unknown action");
    }
  }
};

const rawCases: Omit<PolicyCase, "tag">[] = [];
const addCase = (
  description: string,
  action: Action,
  actorKind: ActorKind,
  expected: PolicyCase["expected"]
) => {
  rawCases.push({ description, action, actorKind, expected });
};

for (const action of teacherActions) {
  addCase(`Teacher × ${action}`, action, "teacher", "allow");
}
for (const action of studentActions) {
  addCase(`Teacher × ${action}`, action, "teacher", "forbidden");
}
for (const action of studentActions) {
  addCase(`Student × ${action}`, action, "student", "allow");
}
for (const action of teacherActions) {
  addCase(`Student × ${action}`, action, "student", "forbidden");
}
for (const action of teacherActions) {
  addCase(
    `Foreign teacher × ${action}`,
    action,
    "foreign-teacher",
    "forbidden"
  );
}
for (const action of studentActions) {
  addCase(
    `Foreign student × ${action}`,
    action,
    "foreign-student",
    "forbidden"
  );
}
addCase("Revoked teacher × publish", "publish", "revoked-teacher", "forbidden");
addCase(
  "Revoked student × read lesson",
  "read-lesson",
  "revoked-student",
  "forbidden"
);
for (const action of teacherActions) {
  addCase(`Unauthenticated × ${action}`, action, "none", "unauthenticated");
}
for (const action of studentActions) {
  addCase(`Unauthenticated × ${action}`, action, "none", "unauthenticated");
}

const cases: PolicyCase[] = rawCases.map((policyCase, index) => {
  return {
    ...policyCase,
    tag: `PT-${String(index + 1).padStart(2, "0")}`,
  };
});

/**
 * Focused-slice policy matrix: 11 implemented actions × role, cross-tenant, revocation, and unauthenticated cases. The design's StoreMatch, InvalidateMatch, and StoreBlocked rows belong to the deferred grounding and matching contract and are not implemented here.
 */
describe("record policy matrix", () => {
  it.each(cases)("$tag $description", async (policyCase) => {
    const { fixture, call } = await prepareCall(
      policyCase.action,
      policyCase.tag
    );
    const actor = actorFor(fixture, policyCase.actorKind);

    let outcome: { ok: boolean; value?: unknown; error?: unknown };
    try {
      outcome = { ok: true, value: await call(actor) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    const expected =
      policyCase.expected === "allow"
        ? { ok: true }
        : {
            ok: false,
            error: {
              code:
                policyCase.expected === "unauthenticated"
                  ? "UNAUTHENTICATED"
                  : "FORBIDDEN",
            },
          };

    expect(outcome).toMatchObject(expected);
  });
});
