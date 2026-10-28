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
      aria-label="Edu-Canvas home"
    >
      <span className="brand-mark" aria-hidden="true">
        EC
      </span>
      <span>
        <span className="brand-name">Edu-Canvas</span>
        <span className="brand-subtitle">lessons that land</span>
      </span>
    </Link>
  );
};
