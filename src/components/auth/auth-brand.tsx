import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";

/**
The shared brand lockup for the public authentication surfaces.
*/
export const AuthBrand = (): ReactElement => {
  return (
    <Link
      className="brand-lockup auth-card__brand"
      to="/"
      aria-label="Scholé home"
    >
      <span className="brand-mark" aria-hidden="true">
        S
      </span>
      <span>
        <span className="brand-name">Scholé</span>
        <span className="brand-subtitle">teaching, returned to its origin</span>
      </span>
    </Link>
  );
};
