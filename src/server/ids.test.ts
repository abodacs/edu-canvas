import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createId } from "./ids";

const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const createdTimeOf = (id: string): number =>
  Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);

describe(createId, () => {
  it("returns a bare UUIDv7 with no prefix or separator", () => {
    const id = createId();

    expect(id).toMatch(uuidV7Pattern);
    expect(id).not.toContain("_");
    expect(id).toHaveLength(36);
  });

  it("embeds the creation time from the system clock", () => {
    const before = Date.now();
    const id = createId();
    const after = Date.now();

    expect(createdTimeOf(id)).toBeGreaterThanOrEqual(before);
    expect(createdTimeOf(id)).toBeLessThanOrEqual(after);
  });

  it("sorts later IDs after earlier ones across milliseconds", async () => {
    const first = createId();

    await delay(5);
    const second = createId();

    expect(createdTimeOf(second)).toBeGreaterThan(createdTimeOf(first));
    expect(second.localeCompare(first)).toBeGreaterThan(0);
  });

  it("keeps the random part for identity, not just time", () => {
    const ids = Array.from({ length: 1000 }, () => createId());
    const unique = new Set(ids);

    expect(unique.size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(uuidV7Pattern);
    }
  });
});
