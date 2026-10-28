import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, School } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearPendingMembershipHandoff,
  readPendingMembershipHandoff,
  submitMembership,
} from "@/components/auth/auth-client";
import { AuthBrand } from "@/components/auth/auth-brand";
import { AuthStatus } from "@/components/auth/auth-status";
import { MembershipRadio } from "@/components/auth/membership-radio";
import { Button } from "@/components/ui/button";

import type {
  AuthApiFailure,
  MembershipOption,
} from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { KeyboardEvent, ReactElement } from "react";

type HandoffState =
  | { readonly phase: "loading" }
  | {
      readonly phase: "ready";
      readonly csrf: string;
      readonly memberships: readonly MembershipOption[];
    }
  | { readonly phase: "expired" };

const roleLabel = (role: "teacher" | "student"): string =>
  role === "teacher" ? "Teacher" : "Student";

const describeMembershipFailure = (
  failure: AuthApiFailure
): AuthNotice | "expired" => {
  switch (failure.code) {
    case "UNAUTHENTICATED": {
      return "expired";
    }
    case "RATE_LIMITED": {
      return {
        tone: "error",
        title: "Too many attempts",
        message:
          "Wait a few minutes before choosing a school again. If you are still blocked, contact your school administrator.",
      };
    }
    case "AUTH_UNAVAILABLE": {
      return {
        tone: "error",
        title: "We could not confirm that choice",
        message: "The service is briefly unavailable. Try again in a moment.",
      };
    }
    case "CSRF_REJECTED": {
      return {
        tone: "error",
        title: "This page needs to be reloaded",
        message:
          "For your safety we stopped that request. Reload the page and sign in again.",
      };
    }
    default: {
      return {
        tone: "error",
        title: "That school is not available for this sign-in",
        message:
          "Choose one of the schools listed for your account, or sign in again.",
      };
    }
  }
};

const MembershipPage = (): ReactElement => {
  const navigate = useNavigate();
  const statusReference = useRef<HTMLDivElement>(null);
  const focusNoticeReference = useRef(false);

  // The handoff is same-tab module memory, so it can be resolved in the initial
  // state instead of an effect. A full page load always starts with an empty
  // store, so the server and the first client render agree.
  const [handoff, setHandoff] = useState<HandoffState>(() => {
    const stored = readPendingMembershipHandoff();
    if (!stored || Date.parse(stored.expiresAt) <= Date.now()) {
      return { phase: "expired" };
    }
    return {
      phase: "ready",
      csrf: stored.csrf,
      memberships: stored.memberships,
    };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<AuthNotice | null>(null);

  useEffect(() => {
    if (handoff.phase === "expired") {
      clearPendingMembershipHandoff();
    }
  }, [handoff.phase]);

  useEffect(() => {
    if (!(notice && focusNoticeReference.current)) {
      return;
    }

    focusNoticeReference.current = false;
    statusReference.current?.focus();
  }, [notice]);

  const expire = useCallback((): void => {
    clearPendingMembershipHandoff();
    setHandoff({ phase: "expired" });
    setNotice(null);
  }, []);

  const continueWithMembership = useCallback(async (): Promise<void> => {
    if (isPending || selected === null || handoff.phase !== "ready") {
      return;
    }
    setIsPending(true);
    setNotice(null);
    const result = await submitMembership(selected, handoff.csrf);
    if (result.ok) {
      clearPendingMembershipHandoff();
      await navigate({ to: "/workspace" });
      return;
    }
    setIsPending(false);
    const failure = describeMembershipFailure(result.error);
    if (failure === "expired") {
      expire();
      return;
    }
    focusNoticeReference.current = true;
    setNotice(failure);
  }, [expire, handoff, isPending, navigate, selected]);

  if (handoff.phase === "loading") {
    return (
      <main className="auth-shell" aria-labelledby="membership-heading">
        <div className="auth-frame">
          <AuthBrand />
          <section className="auth-card">
            <h1 id="membership-heading" className="auth-heading">
              Choose your school
            </h1>
            <output className="auth-lede">Loading your schools…</output>
          </section>
        </div>
      </main>
    );
  }

  if (handoff.phase === "expired") {
    return (
      <main className="auth-shell" aria-labelledby="membership-heading">
        <div className="auth-frame">
          <AuthBrand />
          <section className="auth-card">
            <h1 id="membership-heading" className="auth-heading">
              This sign-in expired
            </h1>
            <p className="auth-lede">
              Choosing a school has a five-minute window. Nothing was changed,
              so you can start again.
            </p>
            <div className="auth-actions">
              <Button
                type="button"
                className="auth-submit"
                onClick={() => {
                  void navigate({ to: "/login" });
                }}
              >
                Sign in again
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const handleActivateKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (selected === null || isPending) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    // Space on a different option moves the selection, as a native radio does.
    // Enter — and Space on the current choice — continues.
    if (event.key === " " && event.currentTarget.value !== selected) {
      return;
    }
    event.preventDefault();
    void continueWithMembership();
  };

  const cancel = (): void => {
    clearPendingMembershipHandoff();
    void navigate({ to: "/login" });
  };

  return (
    <main className="auth-shell" aria-labelledby="membership-heading">
      <div className="auth-frame">
        <AuthBrand />
        <section className="auth-card">
          <header className="auth-card__header">
            <p className="eyebrow auth-eyebrow">
              <School aria-hidden="true" /> One more step
            </p>
            <h1 id="membership-heading" className="auth-heading">
              Choose your school
            </h1>
            <p className="auth-lede">
              Your account belongs to more than one school. Pick the one you
              want to work in; you can sign in again to switch.
            </p>
          </header>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void continueWithMembership();
            }}
          >
            <AuthStatus notice={notice} noticeRef={statusReference} />

            <fieldset className="membership-fieldset">
              <legend className="field__label">School and role</legend>
              <div className="membership-options">
                {handoff.memberships.map((membership) => {
                  return (
                    <MembershipRadio
                      key={membership.membershipId}
                      name="membership"
                      value={membership.membershipId}
                      checked={selected === membership.membershipId}
                      school={membership.tenantName}
                      role={roleLabel(membership.role)}
                      disabled={isPending}
                      onSelect={setSelected}
                      onActivateKey={handleActivateKey}
                    />
                  );
                })}
              </div>
            </fieldset>

            <div className="auth-actions">
              <Button
                type="submit"
                className="auth-submit"
                disabled={isPending || selected === null}
              >
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-link"
                disabled={isPending}
                onClick={cancel}
              >
                Cancel
              </Button>
            </div>
          </form>

          <p className="auth-note">
            <span>
              Cancelling forgets this pending choice. Nothing is shared with the
              schools you do not open, and the pending link expires on its own
              after five minutes.
            </span>
          </p>

          <p className="auth-links">
            <span>
              Need a different account?{" "}
              <Link className="text-link" to="/login">
                Sign in again
              </Link>
            </span>
          </p>
        </section>
      </div>
    </main>
  );
};

export const Route = createFileRoute("/login/membership")({
  component: MembershipPage,
});
