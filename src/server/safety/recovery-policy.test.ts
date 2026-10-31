import { describe, expect, it } from "vitest";

import {
  dominantRecovery,
  recoveryForCode,
  recoveryForFinding,
} from "./recovery-policy";

describe("recovery policy", () => {
  it("replaces an unknown or unsafe payload", () => {
    expect(
      [
        "UNKNOWN_COMPONENT",
        "UNKNOWN_ACTION",
        "UNSUPPORTED_CATALOG",
        "UNSAFE_PAYLOAD",
        "EXECUTABLE_CONTENT",
      ].map(recoveryForCode)
    ).toStrictEqual(["replace", "replace", "replace", "replace", "replace"]);
  });

  it("edits a schema, identifier, relationship, or math break", () => {
    expect(
      [
        "DUPLICATE_COMPONENT",
        "DUPLICATE_VARIANT_ID",
        "INVALID_CONTRACT",
        "INVALID_COMPONENT_ID",
        "TARGET_REUSED",
        "INVALID_MATH",
        "SOMETHING_NEW",
      ].map(recoveryForCode)
    ).toStrictEqual(["edit", "edit", "edit", "edit", "edit", "edit", "edit"]);
  });

  it("retries bounded infrastructure failures", () => {
    expect(
      [
        "ARTIFACT_GATE_UNAVAILABLE",
        "SEMANTIC_VALIDATION_UNAVAILABLE",
        "PROVIDER_TIMEOUT",
        "PREREQUISITE_PACK_MISSING",
        "PREREQUISITE_PATH_MISSING",
      ].map(recoveryForCode)
    ).toStrictEqual(["retry", "retry", "retry", "retry", "retry"]);
  });

  it("edits a warning even when its code would replace a hard block", () => {
    expect(recoveryForFinding("UNSAFE_PAYLOAD", "warning")).toBe("edit");
    expect(recoveryForFinding("UNSAFE_PAYLOAD", "hard_block")).toBe("replace");
  });

  it("keeps one priority order: retry, then replace, then edit", () => {
    expect(dominantRecovery(["edit", "replace", "retry"])).toBe("retry");
    expect(dominantRecovery(["edit", "replace"])).toBe("replace");
    expect(dominantRecovery(["edit"])).toBe("edit");
    expect(dominantRecovery([])).toBeNull();
  });
});
