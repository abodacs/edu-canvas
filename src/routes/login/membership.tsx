import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  clearPendingMembershipHandoff,
  readPendingMembershipHandoff,
  submitMembership,
} from "@/components/auth/auth-client";
import { AuthStatus } from "@/components/auth/auth-status";
import { membershipCopy } from "@/components/auth/membership-copy";
import { MembershipRadio } from "@/components/auth/membership-radio";
import { useAuthNotice } from "@/components/auth/use-auth-notice";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";

import type {
  AuthApiFailure,
  MembershipOption,
} from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { KeyboardEvent, ReactElement } from "react";

type HandoffState =
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
      return { tone: "error", ...membershipCopy.errors.rateLimited };
    }
    case "AUTH_UNAVAILABLE": {
      return { tone: "error", ...membershipCopy.errors.unavailable };
    }
    case "CSRF_REJECTED": {
      return { tone: "error", ...membershipCopy.errors.csrfRejected };
    }
    default: {
      return { tone: "error", ...membershipCopy.errors.classUnavailable };
    }
  }
};

const MembershipPage = (): ReactElement => {
  const navigate = useNavigate();
  const { notice, statusReference, announce } = useAuthNotice();

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
  // The first class is the choice the teacher came in with until they pick
  // another; preselecting it keeps the submit enabled and matches the picker
  // they were shown. A pending choice with no classes still needs a selection.
  const [selected, setSelected] = useState<string | null>(() => {
    if (handoff.phase !== "ready") {
      return null;
    }
    return handoff.memberships.at(0)?.membershipId ?? null;
  });
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (handoff.phase === "expired") {
      clearPendingMembershipHandoff();
    }
  }, [handoff.phase]);

  // This screen is a client-side step after the sign-in form, so the browser
  // has removed the trigger and left focus on the body. Move it to the page so
  // the next Tab continues from here; `#main` already has the focus style.
  useEffect(() => {
    document.querySelector<HTMLElement>("#main")?.focus();
  }, []);

  const expire = useCallback((): void => {
    clearPendingMembershipHandoff();
    setHandoff({ phase: "expired" });
    announce(null);
  }, [announce]);

  const continueWithMembership = useCallback(async (): Promise<void> => {
    if (isPending || selected === null || handoff.phase !== "ready") {
      return;
    }
    setIsPending(true);
    announce(null);
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
    announce(failure);
  }, [announce, expire, handoff, isPending, navigate, selected]);

  if (handoff.phase === "expired") {
    return (
      <AppShell>
        <div className="auth-page">
          <section className="auth-card" aria-labelledby="membership-heading">
            <h1 id="membership-heading" className="auth-card__heading">
              {membershipCopy.expiredHeading}
            </h1>
            <p className="auth-card__lede">{membershipCopy.expiredLede}</p>
            <div className="auth-actions">
              <Button
                type="button"
                className="auth-form__submit"
                onClick={() => {
                  void navigate({ to: "/login" });
                }}
              >
                {membershipCopy.signInAgain}
              </Button>
            </div>
          </section>
        </div>
      </AppShell>
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
    <AppShell>
      <div className="auth-page">
        <section className="auth-card" aria-labelledby="membership-heading">
          <header className="auth-card__header">
            <h1 id="membership-heading" className="auth-card__heading">
              {membershipCopy.heading}
            </h1>
            <p className="auth-card__lede">{membershipCopy.lede}</p>
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
              <legend className="membership-fieldset__legend">
                {membershipCopy.legend}
              </legend>
              <div className="membership-options">
                {handoff.memberships.map((membership) => {
                  return (
                    <MembershipRadio
                      key={membership.membershipId}
                      name="membership"
                      value={membership.membershipId}
                      checked={selected === membership.membershipId}
                      classLabel={membership.tenantName}
                      role={roleLabel(membership.role)}
                      disabled={isPending}
                      onSelect={setSelected}
                      onActivateKey={handleActivateKey}
                    />
                  );
                })}
              </div>
            </fieldset>

            <Button
              type="submit"
              className="auth-form__submit"
              disabled={isPending || selected === null}
            >
              Open workspace
            </Button>
            <Button
              type="button"
              variant="link"
              className="auth-form__cancel"
              disabled={isPending}
              onClick={cancel}
            >
              Cancel
            </Button>
          </form>

          <p className="auth-note">
            <span>{membershipCopy.note}</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/login/membership")({
  head: () => ({ meta: [{ title: membershipCopy.pageTitle }] }),
  component: MembershipPage,
});
