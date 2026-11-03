import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { cn } from "@/lib/utilities";

const brandTagline = "teaching, returned to its origin";

interface BrandMarkProperties {
  /** Show the tagline under the name (public pages). */
  readonly withTagline?: boolean;
  readonly className?: string;
}

/**
The Scholé lockup: a stoa glyph and the name, linking home.

The link's accessible name is its visible text, so speech-input users can say
what they see; the glyph is decorative.
*/
export const BrandMark = ({
  withTagline = false,
  className,
}: BrandMarkProperties): ReactElement => {
  return (
    <Link className={cn("brand-lockup", className)} to="/">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 26 26" fill="currentColor" focusable="false">
          <path d="M2 8 13 2l11 6v2H2z" />
          <rect x="4" y="11" width="3" height="10" />
          <rect x="11.5" y="11" width="3" height="10" />
          <rect x="19" y="11" width="3" height="10" />
          <rect x="2" y="22" width="22" height="2.5" />
        </svg>
      </span>
      <span>
        <span className="brand-name">Scholé</span>
        {withTagline ? (
          <span className="brand-subtitle">{brandTagline}</span>
        ) : null}
      </span>
    </Link>
  );
};
