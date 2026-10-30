import {
  Link,
  Navigate,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { AccountHeader } from "@/components/auth/account-header";
import { SessionExpiryBanner } from "@/components/auth/session-expiry-banner";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { useSessionExpiry } from "@/components/auth/use-session-expiry";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utilities";

import { TeacherStudio } from "@/components/studio/teacher-studio";
import type { ReactElement } from "react";

/**
 * A neutral state that never renders private content. Used while the session is unresolved and while the server re-confirms it after a visibility return, reconnect, or back/forward navigation.
 */
const WorkspaceStatus = ({
  title,
  message,
  onRetry,
}: {
  readonly title: string;
  readonly message: string;
  readonly onRetry?: () => void;
}): ReactElement => {
  return (
    <main
      className="app-shell app-shell--teacher"
      aria-labelledby="workspace-status-heading"
    >
      <div className="page-frame page-frame--teacher">
        <div className="workspace-status">
          <span className="workspace-status__mark" aria-hidden="true">
            EC
          </span>
          <h1 id="workspace-status-heading" className="auth-heading">
            {title}
          </h1>
          <output className="auth-lede">{message}</output>
          {onRetry ? (
            <div className="auth-actions">
              <Button type="button" className="auth-submit" onClick={onRetry}>
                Try again
              </Button>
              <Link className="text-link" to="/login">
                Sign in again
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
};

const SessionEnded = (): ReactElement => {
  return (
    <main
      className="app-shell app-shell--teacher"
      aria-labelledby="session-ended-heading"
    >
      <div className="page-frame page-frame--teacher">
        <div className="workspace-status" role="alert">
          <span className="workspace-status__mark" aria-hidden="true">
            <ShieldAlert />
          </span>
          <h1 id="session-ended-heading" className="auth-heading">
            Your session ended
          </h1>
          <p className="auth-lede">
            Private content is hidden now. Anything that was unsent has been
            cleared, and nothing was submitted twice.
          </p>
          <div className="auth-actions">
            <Link
              className={cn(
                buttonVariants({ size: "lg" }),
                "cta-primary min-h-11"
              )}
              to="/login"
              replace
            >
              Sign in again
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

const WorkspacePage = (): ReactElement => {
  const navigate = useNavigate();
  const session = useAuthSession();
  const bannerReference = useRef<HTMLDivElement>(null);
  const contentReference = useRef<HTMLDivElement>(null);

  const expiry = useSessionExpiry({
    idleExpiresAt: session.projection?.session.idleExpiresAt ?? null,
    absoluteExpiresAt: session.projection?.session.absoluteExpiresAt ?? null,
    csrf: session.csrf,
    isActive: session.phase === "active",
    onExpired: session.markExpired,
    onRenewed: session.applyRenewal,
  });

  const { isWarningVisible } = expiry;

  const handleRetry = (): void => {
    session.revalidate();
  };

  useEffect(() => {
    if (isWarningVisible) {
      bannerReference.current?.focus();
    }
  }, [isWarningVisible]);

  if (session.phase === "loading") {
    return (
      <WorkspaceStatus
        title="Opening your workspace"
        message="Confirming your session with the server…"
      />
    );
  }

  if (session.phase === "unavailable") {
    return (
      <WorkspaceStatus
        title="We could not confirm your session"
        message="The workspace stays hidden until the server confirms it. Try again, or sign in again."
        onRetry={handleRetry}
      />
    );
  }

  if (session.phase === "unauthenticated") {
    return session.wasExpired ? (
      <SessionEnded />
    ) : (
      <Navigate to="/login" replace />
    );
  }

  const { projection, csrf, generation } = session;
  if (!projection || csrf === null || generation === null) {
    return (
      <WorkspaceStatus
        title="We could not confirm your session"
        message="The workspace stays hidden until the server confirms it. Try again, or sign in again."
        onRetry={handleRetry}
      />
    );
  }

  const handleSignOut = async (): Promise<void> => {
    const isSignedOut = await session.signOut();
    if (isSignedOut) {
      await navigate({ to: "/", replace: true });
    }
  };

  const handleDismissWarning = (): void => {
    expiry.dismissWarning();
    const prompt = document.querySelector("#lesson-prompt");
    const focusTarget: HTMLElement | null =
      prompt instanceof HTMLElement ? prompt : contentReference.current;
    focusTarget?.focus();
  };

  const handleContinue = (): void => {
    expiry.continueSession();
  };

  const handleUnauthorized = (): void => {
    session.markExpired();
  };

  const header = (
    <AccountHeader
      displayName={projection.actor.displayName}
      tenantName={projection.actor.tenantName}
      roleLabel={projection.actor.role === "teacher" ? "Teacher" : "Student"}
      isSigningOut={session.isSigningOut}
      onSignOut={handleSignOut}
    />
  );

  if (projection.actor.role !== "teacher") {
    return (
      <main
        className="app-shell app-shell--teacher"
        aria-labelledby="learner-heading"
      >
        <div className="page-frame page-frame--teacher">
          {header}
          <div className="workspace-status">
            <h1 id="learner-heading" className="auth-heading">
              Your lessons open from a teacher invitation
            </h1>
            <p className="auth-lede">
              This account is a learner account, so the lesson studio is not
              part of it yet. Your teacher shares lessons with you directly.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--teacher">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <div className="page-frame page-frame--teacher">
        {header}
        {isWarningVisible ? (
          <SessionExpiryBanner
            bannerRef={bannerReference}
            isContinuing={expiry.isContinuing}
            error={expiry.continueError}
            onContinue={handleContinue}
            onDismiss={handleDismissWarning}
          />
        ) : null}
        <div
          id="workspace-content"
          ref={contentReference}
          className="workspace-content"
          // Hidden from assistive tech and inert while the server re-confirms the
          // session, so a stale view can never be read or acted on.
          inert={session.isRevalidating}
          aria-hidden={session.isRevalidating}
          tabIndex={-1}
        >
          <TeacherStudio
            key={generation}
            csrf={csrf}
            generation={generation}
            onUnauthorized={handleUnauthorized}
          />
        </div>
        {session.isRevalidating ? (
          <output className="workspace-revalidating">
            Checking your session…
          </output>
        ) : null}
      </div>
    </main>
  );
};

export const Route = createFileRoute("/workspace")({
  head: () => ({ meta: [{ title: "Teacher studio | Edu-Canvas" }] }),
  component: WorkspacePage,
});
