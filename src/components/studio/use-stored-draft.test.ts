import { describe, expect, it } from "vitest";

import { loadStoredDraft } from "./use-stored-draft";

import type { StoredDraftRead } from "@/lib/stored-draft-client";
import type { StoredGenerationResult } from "@/shared/generation-contract";

const stored = {
  prompt: "equivalent fractions for grade 4",
  result: { requestId: "req_1", state: "blocked-by-validation" },
} as unknown as StoredGenerationResult;

/** Records every flag change and handler call, in order. */
const recorder = () => {
  const events: string[] = [];
  return {
    events,
    setOpening: (isOpening: boolean) => {
      events.push(`opening:${String(isOpening)}`);
    },
    handlers: () => ({
      onReset: () => {
        events.push("reset");
      },
      onDraft: (draft: StoredGenerationResult) => {
        events.push(`draft:${draft.result.requestId}`);
      },
      onUnauthorized: () => {
        events.push("unauthorized");
      },
      onUnavailable: (message: string) => {
        events.push(`unavailable:${message}`);
      },
    }),
  };
};

const readAs = (outcome: StoredDraftRead) => (): Promise<StoredDraftRead> =>
  Promise.resolve(outcome);

describe(loadStoredDraft, () => {
  it("opens, clears the previous result, then delivers the draft", async () => {
    const record = recorder();
    await loadStoredDraft({
      requestId: "req_1",
      read: readAs({ kind: "draft", stored }),
      signal: new AbortController().signal,
      ...record,
    });
    expect(record.events).toStrictEqual([
      "opening:true",
      "reset",
      "opening:false",
      "draft:req_1",
    ]);
  });

  it("clears the opening flag when the link goes away", async () => {
    const record = recorder();
    await loadStoredDraft({
      requestId: undefined,
      read: () => {
        throw new Error("no read without a link");
      },
      signal: new AbortController().signal,
      ...record,
    });
    expect(record.events).toStrictEqual(["opening:false"]);
  });

  it("changes nothing after its read is aborted mid-flight", async () => {
    const record = recorder();
    const controller = new AbortController();
    await loadStoredDraft({
      requestId: "req_1",
      read: () => {
        // The link changed (or the composer unmounted) while reading.
        controller.abort();
        return Promise.resolve({ kind: "draft", stored });
      },
      signal: controller.signal,
      ...record,
    });
    expect(record.events).toStrictEqual(["opening:true", "reset"]);
  });

  it("routes an expired session and an unavailable draft", async () => {
    const unauthorized = recorder();
    await loadStoredDraft({
      requestId: "req_1",
      read: readAs({ kind: "unauthorized" }),
      signal: new AbortController().signal,
      ...unauthorized,
    });
    const unavailable = recorder();
    await loadStoredDraft({
      requestId: "req_1",
      read: readAs({ kind: "unavailable", message: "Not available." }),
      signal: new AbortController().signal,
      ...unavailable,
    });
    expect([
      unauthorized.events.at(-1),
      unavailable.events.at(-1),
    ]).toStrictEqual(["unauthorized", "unavailable:Not available."]);
  });
});
