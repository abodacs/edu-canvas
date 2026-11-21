import type { ReactElement, ReactNode } from "react";

interface SkipLinkProps {
  readonly href?: "#main";
  readonly children?: ReactNode;
}

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
