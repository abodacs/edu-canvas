import type { ReactElement, ReactNode } from "react";

interface SkipLinkProps {
  /** The one landmark every document exposes; see AppShell. */
  readonly href?: "#main";
  readonly children?: ReactNode;
}

/**
The first focusable element of every document. `__root.tsx` renders it once, before the route, so it always precedes the page's own controls. Its target is the single `<main id="main">` the route or the shell owns.
*/
export const SkipLink = ({
  href = "#main",
  children = "Skip to content",
}: SkipLinkProps): ReactElement => {
  return (
    <a className="skip-link" href={href}>
      {children}
    </a>
  );
};
