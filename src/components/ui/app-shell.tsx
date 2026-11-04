import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { SyntheticDataMarker } from "@/components/ui/synthetic-data-marker";
import { cn } from "@/lib/utilities";

import type { LinkProps } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

type ShellDestination = NonNullable<LinkProps["to"]>;

export interface AppShellNavItem {
  readonly to: ShellDestination;
  readonly label: string;
}

export interface AppShellIdentity {
  readonly displayName: string;
  /** Tenant and role, read as one line after the name. */
  readonly context: string;
  /** Decorative; the name is the accessible text. */
  readonly initials: string;
}

export interface AppShellCrumb {
  readonly label: string;
  readonly to?: ShellDestination;
}

export interface AppShellProps {
  /** Primary destinations. An empty list renders no nav (signed-out and error states). */
  readonly nav?: readonly AppShellNavItem[];
  readonly identity?: AppShellIdentity | null;
  readonly onSignOut?: () => void;
  readonly isSigningOut?: boolean;
  readonly crumbs?: readonly AppShellCrumb[];
  readonly width?: "default" | "wide";
  readonly children: ReactNode;
}

const noNavigation: readonly AppShellNavItem[] = [];
const noCrumbs: readonly AppShellCrumb[] = [];

const PrimaryNav = ({
  items,
}: {
  readonly items: readonly AppShellNavItem[];
}): ReactElement => {
  return (
    <nav className="app-bar__nav" aria-label="Primary">
      <ul>
        {items.map((item) => {
          return (
            <li key={item.to}>
              <Link
                className="text-link app-bar__link"
                to={item.to}
                activeOptions={{ includeSearch: false }}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

const Crumbs = ({
  crumbs,
}: {
  readonly crumbs: readonly AppShellCrumb[];
}): ReactElement => {
  const lastIndex = crumbs.length - 1;
  return (
    <nav className="app-crumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((crumb, index) => {
          const isCurrent = index === lastIndex;
          return (
            <li key={`${crumb.label}:${crumb.to ?? ""}`}>
              {isCurrent || crumb.to === undefined ? (
                <span aria-current={isCurrent ? "page" : undefined}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  className="text-link"
                  to={crumb.to}
                  // Exact, search included: an ancestor crumb on the same path
                  // is never announced as the current page.
                  activeOptions={{ exact: true, includeSearch: true }}
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

/**
The signed-in chrome every app page shares: brand, primary nav, identity, sign-out, optional breadcrumbs, the page's single `<main id="main">`, and the synthetic-data caption.

Invariant: a page that adopts the shell renders no `<main>` of its own. The skip link lives in `__root.tsx`, not here, so it is the document's first focusable element whether or not the page uses the shell.
*/
export const AppShell = ({
  nav = noNavigation,
  identity = null,
  onSignOut,
  isSigningOut = false,
  crumbs = noCrumbs,
  width = "default",
  children,
}: AppShellProps): ReactElement => {
  return (
    <div className="app-shell app-frame">
      <div className={cn("page-frame", "app-frame__page")} data-width={width}>
        <header className="app-bar">
          <BrandMark className="app-bar__brand" />
          {nav.length > 0 ? <PrimaryNav items={nav} /> : null}
          {identity ? (
            <div className="app-bar__account">
              <span className="who">
                <span className="who__avatar" aria-hidden="true">
                  {identity.initials}
                </span>
                <span className="who__text">
                  <span className="who__name">{identity.displayName}</span>
                  <span className="who__context">{identity.context}</span>
                </span>
              </span>
              {onSignOut ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="app-bar__signout"
                  disabled={isSigningOut}
                  onClick={onSignOut}
                >
                  <LogOut aria-hidden="true" />
                  {isSigningOut ? "Signing out…" : "Sign out"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>
        {crumbs.length > 0 ? <Crumbs crumbs={crumbs} /> : null}
        <main id="main" className="app-frame__main" tabIndex={-1}>
          {children}
        </main>
        <SyntheticDataMarker
          variant="caption"
          as="p"
          className="app-frame__caption"
        />
      </div>
    </div>
  );
};
