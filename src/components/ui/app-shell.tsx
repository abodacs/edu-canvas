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
  readonly context: string;
  readonly initials: string;
}

export interface AppShellCrumb {
  readonly label: string;
  readonly to?: ShellDestination;
}

export interface AppShellProps {
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
                className="app-bar__link"
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
                  className="app-crumbs__link"
                  to={crumb.to}
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
      <header className="app-bar">
        <div className="app-bar__inner" data-width={width}>
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
        </div>
      </header>
      <div className={cn("page-frame", "app-frame__page")} data-width={width}>
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
