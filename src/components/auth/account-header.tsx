import { LogOut } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

import type { ReactElement } from "react";

interface AccountHeaderProperties {
  readonly displayName: string;
  readonly tenantName: string;
  readonly roleLabel: string;
  readonly isSigningOut: boolean;
  readonly onSignOut: () => void;
}

/**
 * The authenticated workspace chrome: brand, a read-only account label, and the sign-out control. It is a plain delivery component so every authenticated page can render the same reachable header.
 */
export const AccountHeader = ({
  displayName,
  tenantName,
  roleLabel,
  isSigningOut,
  onSignOut,
}: AccountHeaderProperties): ReactElement => {
  return (
    <header className="studio-nav">
      <Link className="studio-brand" to="/" aria-label="Edu-Canvas home">
        <span className="studio-brand__mark" aria-hidden="true">
          EC
        </span>
        <span className="studio-brand__name">Edu-Canvas</span>
      </Link>
      <div className="studio-nav__actions">
        <span className="account-identity">
          <span className="account-identity__name">{displayName}</span>
          <span className="account-identity__meta">
            {tenantName} · {roleLabel}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="account-signout"
          disabled={isSigningOut}
          onClick={onSignOut}
        >
          <LogOut aria-hidden="true" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
};
