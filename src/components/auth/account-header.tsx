import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";

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
      <BrandMark className="studio-brand" />
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
