import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { Chip, ChipGroup } from "./chip-group";
import type { ChipProps } from "./chip-group";
import { Field } from "./field";
import { Notice } from "./notice";
import { Steps } from "./steps";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

const attribute = (markup: string, name: string): string | undefined =>
  new RegExp(`${name}="(?<value>[^"]*)"`, "u").exec(markup)?.groups?.value;

const ignoreValue = (): void => {
  // The static render never fires a change.
};

type WithoutChildren<P> = P extends unknown ? Omit<P, "children"> : never;

/**
`createElement` with children as arguments. React's typing wants required
children in the props object, and the lint rule forbids that; one cast here
keeps every call site honest.
*/
const element = <P extends object>(
  type: ComponentType<P>,
  properties: WithoutChildren<P>,
  ...children: ReactNode[]
) =>
  createElement(
    type as unknown as ComponentType<WithoutChildren<P>>,
    properties,
    ...children
  );

const chip = (properties: WithoutChildren<ChipProps>, label: string) =>
  element(Chip, properties, label);

const radioGroup = (legend: string) =>
  element(
    ChipGroup,
    { mode: "radio", legend, value: "a", onValueChange: ignoreValue },
    chip({ value: "a" }, "A")
  );

const count = (markup: string, needle: string): number =>
  markup.split(needle).length - 1;

describe(Button, () => {
  it("marks a busy button without disabling it and keeps the label", () => {
    const markup = render(
      createElement(Button, { busy: true, size: "lg" }, "Publish")
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("data-busy");
    expect(markup).not.toMatch(/\sdisabled(?:=|\s|>)/u);
    expect(markup).toContain("Publish");
    expect(markup).toContain("h-9");
  });

  it("renders no busy state by default", () => {
    const markup = render(createElement(Button, null, "Save"));
    expect(markup).not.toContain("aria-busy");
    expect(markup).not.toContain("btn__spinner");
  });

  it("maps the deprecated aliases onto today's looks", () => {
    const outline = render(
      createElement(Button, { variant: "outline" }, "Back")
    );
    const secondary = render(
      createElement(Button, { variant: "secondary" }, "Back")
    );
    const legacy = render(createElement(Button, { variant: "default" }, "Go"));
    const primary = render(createElement(Button, null, "Go"));
    expect(attribute(outline, "class")).toBe(attribute(secondary, "class"));
    expect(attribute(outline, "class")).toContain("secondary");
    expect(attribute(legacy, "class")).toBe(attribute(primary, "class"));
    expect(attribute(primary, "class")).toContain("btn");
  });
});

describe(Card, () => {
  it("changes the element with `as` and keeps the card class", () => {
    const markup = render(
      createElement(Card, { as: "section", variant: "lift" }, "Body")
    );
    expect(markup).toMatch(/^<section[^>]*class="card lift"/u);
    expect(markup).not.toContain("role=");
  });
});

describe(Badge, () => {
  it("exposes the tone as data and keeps the text", () => {
    const markup = render(
      createElement(Badge, { tone: "warn" }, "Needs review")
    );
    expect(markup).toContain('data-tone="warn"');
    expect(markup).toContain("Needs review");
    expect(markup).toContain('class="pill"');
  });
});

describe(Field, () => {
  it("wires the help and error text to the control", () => {
    const markup = render(
      element(
        Field,
        { label: "Topic", help: "One sentence.", error: "Add a topic." },
        createElement("input", { type: "text" })
      )
    );
    const controlId = attribute(markup.slice(markup.indexOf("<input")), "id");
    expect(controlId).toBeTruthy();
    expect(markup).toContain(`for="${controlId}"`);
    const describedBy = attribute(
      markup.slice(markup.indexOf("<input")),
      "aria-describedby"
    );
    expect(describedBy?.split(" ")).toStrictEqual([
      `${controlId}-help`,
      `${controlId}-error`,
    ]);
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(/class="field"[^>]*data-invalid=""/u);
  });

  it("adds no invalid state or empty description to a plain field", () => {
    const markup = render(
      element(Field, { label: "Topic" }, createElement("input"))
    );
    expect(markup).not.toContain("aria-invalid");
    expect(markup).not.toContain("data-invalid");
    expect(markup).not.toContain("aria-describedby");
  });

  it("keeps a caller's aria-invalid when no error is shown", () => {
    const markup = render(
      element(
        Field,
        { label: "Topic" },
        createElement("input", { "aria-invalid": true })
      )
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).not.toContain("data-invalid");
  });

  it("respects an existing control id and marks required", () => {
    for (const tag of ["input", "textarea", "select"] as const) {
      const markup = render(
        element(
          Field,
          { label: "Grade", required: true },
          createElement(tag, { id: "grade" })
        )
      );
      expect(markup).toContain('for="grade"');
      expect(markup).toContain(`<${tag} id="grade"`);
      expect(markup).toContain('aria-required="true"');
    }
  });
});

describe(Notice, () => {
  it("announces a stop notice as an alert, atomically", () => {
    const markup = render(element(Notice, { tone: "stop" }, "Failed."));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-atomic="true"');
  });

  it("announces info and warn as status, never alert", () => {
    for (const tone of ["info", "warn"] as const) {
      const markup = render(element(Notice, { tone }, "Saved."));
      expect(markup).toContain('role="status"');
      expect(markup).not.toContain("alert");
    }
  });
});

describe(ChipGroup, () => {
  it("renders radio mode as a fieldset of native radios with one checked", () => {
    const markup = render(
      element(
        ChipGroup,
        {
          mode: "radio",
          legend: "Grade",
          value: "4",
          onValueChange: ignoreValue,
        },
        chip({ value: "3" }, "Grade 3"),
        chip({ value: "4" }, "Grade 4")
      )
    );
    expect(markup).toMatch(/^<fieldset[^>]*><legend[^>]*>Grade<\/legend>/u);
    expect(count(markup, 'type="radio"')).toBe(2);
    expect(count(markup, ' checked=""')).toBe(1);
    expect(markup).not.toContain("role=");
  });

  it("gives two radio groups distinct names", () => {
    const markup = render(
      createElement("div", null, radioGroup("First"), radioGroup("Second"))
    );
    const names = [...markup.matchAll(/name="(?<name>[^"]+)"/gu)].map(
      (match) => match.groups?.name
    );
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
  });

  it("renders toggle mode as pressed buttons", () => {
    const markup = render(
      element(
        ChipGroup,
        { mode: "toggle", legend: "Show" },
        chip({ value: "a", pressed: true }, "Hints"),
        chip({ value: "b", pressed: false }, "Answers")
      )
    );
    expect(count(markup, 'type="button"')).toBe(2);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
});

describe(Steps, () => {
  it("marks exactly the current step and names done steps in text", () => {
    const markup = render(
      createElement(Steps, {
        label: "Lesson progress",
        items: [
          { label: "Source", state: "done" },
          { label: "Review", state: "current" },
          { label: "Publish", state: "upcoming" },
        ],
      })
    );
    expect(markup).toMatch(/^<ol[^>]*aria-label="Lesson progress"/u);
    expect(count(markup, 'aria-current="step"')).toBe(1);
    expect(markup).toMatch(/data-state="current" aria-current="step">Review/u);
    expect(markup).toContain("Completed: </span>Source");
  });
});
