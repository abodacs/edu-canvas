import { describe, expect, it } from "vitest";

import { Route } from "./__root";

describe("root document metadata", () => {
  it("publishes a favicon link instead of falling back to /favicon.ico", async () => {
    const { head } = Route.options;
    if (!head) {
      throw new Error("The root route must define document metadata.");
    }

    // @ts-expect-error -- the head metadata reads only the route's static configuration; the loader info argument stays unused here.
    const content = await head({});

    expect(content.links ?? []).toContainEqual({
      rel: "icon",
      href: "/favicon.svg",
      type: "image/svg+xml",
    });
  });
});
