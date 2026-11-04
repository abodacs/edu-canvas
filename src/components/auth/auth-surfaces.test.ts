import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuthStatus } from "./auth-status";
import { PasswordField } from "./password-field";

import type { AuthNotice } from "./auth-status";

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element);

const attribute = (markup: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="(?<value>[^"]*)"`, "u").exec(markup)?.groups?.value;

const ignoreValue = (): void => {
  // The static render never fires a change.
};

const notice = (tone: AuthNotice["tone"]): AuthNotice => {
  return {
    tone,
    title: "Sign-in could not be completed",
    message: "Check your email address and password, then try again.",
  };
};

const passwordField = (error?: string) =>
  render(
    createElement(PasswordField, {
      label: "Password",
      name: "password",
      value: "",
      autoComplete: "current-password",
      error,
      onValueChange: ignoreValue,
    })
  );

describe(AuthStatus, () => {
  it("renders a server failure as an alert with its copy", () => {
    const markup = render(
      createElement(AuthStatus, { notice: notice("error") })
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Sign-in could not be completed");
    expect(markup).toContain("Check your email address and password");
    expect(markup).not.toContain('role="status"');
  });

  it("renders an advisory as a polite status", () => {
    const markup = render(
      createElement(AuthStatus, { notice: notice("info") })
    );
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("alert");
  });

  it("renders nothing when there is no outcome", () => {
    expect(render(createElement(AuthStatus, { notice: null }))).toBe("");
  });

  it("renders the retry action as a real button", () => {
    const markup = render(
      createElement(AuthStatus, {
        notice: {
          ...notice("error"),
          actionLabel: "Try again",
          onAction: ignoreValue,
        },
      })
    );
    expect(markup).toMatch(
      /<button[^>]*type="button"[^>]*>[\s\S]*Try again[\s\S]*<\/button>/u
    );
  });
});

describe(PasswordField, () => {
  it("wires the label, input and reveal toggle to one id", () => {
    const markup = passwordField();
    const inputId = attribute(markup, "id");
    expect(inputId).toBeDefined();
    expect(attribute(markup, "for")).toBe(inputId);
    expect(attribute(markup, "aria-controls")).toBe(inputId);
  });

  it("names the reveal toggle and leaves it unpressed", () => {
    const markup = passwordField();
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("Show password");
    expect(markup).not.toContain("data-invalid");
  });

  it("marks the input invalid and points it at the error", () => {
    const markup = passwordField("Use at least 8 characters.");
    const inputId = attribute(markup, "id");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("Use at least 8 characters.");
    expect(attribute(markup, "aria-describedby")).toContain(
      `${inputId ?? ""}-error`
    );
    expect(markup).toContain(`id="${inputId ?? ""}-error"`);
  });

  it("never sets the input's name as its accessible name", () => {
    const markup = passwordField();
    expect(markup).not.toContain('aria-label="Password"');
  });
});
