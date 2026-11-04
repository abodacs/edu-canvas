import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { SessionExpiryBanner } from "@/components/auth/session-expiry-banner";
import { useAuthSession } from "@/components/auth/use-auth-session";
import { useSessionExpiry } from "@/components/auth/use-session-expiry";
import { AppShell } from "@/components/ui/app-shell";
import {
  initialsFor,
  teacherNavigation,
} from "@/components/ui/app-shell-navigation";
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
    <AppShell width="wide">
      <section
        className="workspace-status"
        aria-labelledby="workspace-status-heading"
      >
        <span className="workspace-status__mark" aria-hidden="true">
          S
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
      </section>
    </AppShell>
  );
};

const SessionEnded = (): ReactElement => {
  return (
    <AppShell width="wide">
      <section
        className="workspace-status"
        role="alert"
        aria-labelledby="session-ended-heading"
      >
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
      </section>
    </AppShell>
  );
};

const WorkspacePage = (): ReactElement => {
  const navigate = Route.useNavigate();
  const { review: reviewRequestId } = Route.useSearch();
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
    if (!isSignedOut) {
      return;
    }
    // #168 P2-5: the landing page confirms the exit through its search
    // parameter, so refreshes and shares never carry the banner.
    await navigate({ to: "/", replace: true, search: { signedOut: true } });
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

  const isTeacher = projection.actor.role === "teacher";
  const shellChrome = {
    identity: {
      displayName: projection.actor.displayName,
      context: `${projection.actor.tenantName} · ${isTeacher ? "Teacher" : "Student"}`,
      initials: initialsFor(projection.actor.displayName),
    },
    isSigningOut: session.isSigningOut,
    onSignOut: () => {
      void handleSignOut();
    },
  };

  if (!isTeacher) {
    return (
      <AppShell {...shellChrome} width="wide">
        <section className="workspace-status" aria-labelledby="learner-heading">
          <h1 id="learner-heading" className="auth-heading">
            Your lessons open from a teacher invitation
          </h1>
          <p className="auth-lede">
            This account is a learner account, so the lesson studio is not part
            of it yet. Your teacher shares lessons with you directly.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell {...shellChrome} nav={teacherNavigation} width="wide">
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
          reviewRequestId={reviewRequestId}
          onOpenReview={(requestId) => {
            void navigate({ search: { review: requestId } });
          }}
          onCloseReview={() => {
            void navigate({ search: {} });
          }}
          onUnauthorized={handleUnauthorized}
        />
      </div>
      {session.isRevalidating ? (
        <output className="workspace-revalidating">
          Checking your session…
        </output>
      ) : null}
    </AppShell>
  );
};

export const Route = createFileRoute("/workspace")({
  validateSearch: (search: Record<string, unknown>): { review?: string } => {
    return typeof search.review === "string" && search.review.length > 0
      ? { review: search.review }
      : {};
  },
  head: () => ({ meta: [{ title: "Teacher studio | Scholé" }] }),
  component: WorkspacePage,
});
