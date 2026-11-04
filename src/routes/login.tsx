import {
  Outlet,
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Info, LogIn, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

import {
  clearPendingMembershipHandoff,
  submitSignIn,
  writePendingMembershipHandoff,
} from "@/components/auth/auth-client";
import { AuthStatus } from "@/components/auth/auth-status";
import { PasswordField } from "@/components/auth/password-field";
import { useAuthChallenge } from "@/components/auth/use-auth-challenge";
import { useFocusAfterRender } from "@/components/auth/use-auth-notice";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

import type { AuthApiFailure } from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { ReactElement, SyntheticEvent } from "react";

/**
One message for every failed credential check; account existence stays private.
*/
const GENERIC_CREDENTIAL_MESSAGE =
  "Check your email address and password, then try again.";

const SIGN_IN_FAILURE_TITLE = "Sign-in could not be completed";

const INVALID_EMAIL_MESSAGE =
  "Enter a full email address, like name@school.org.";

const describeEmailError = (
  value: string,
  input: HTMLInputElement | null
): string | null => {
  if (value === "") {
    return "Enter your email address.";
  }
  return input?.validity.typeMismatch ? INVALID_EMAIL_MESSAGE : null;
};

const describeSignInFailure = (failure: AuthApiFailure): AuthNotice => {
  switch (failure.code) {
    case "RATE_LIMITED": {
      return {
        tone: "error",
        title: "Too many sign-in attempts",
        message:
          "Wait a few minutes before trying again. If you are still locked out, contact your school administrator.",
      };
    }
    case "AUTH_UNAVAILABLE": {
      return {
        tone: "error",
        title: "Sign-in is temporarily unavailable",
        message:
          "We could not reach the sign-in service. Try again in a few moments.",
      };
    }
    case "ACCESS_NOT_PROVISIONED": {
      return {
        tone: "error",
        title: "This account is not set up yet",
        message:
          "Contact your school administrator to finish setting up this account.",
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
    case "FORBIDDEN": {
      return {
        tone: "error",
        title: SIGN_IN_FAILURE_TITLE,
        message:
          "Your account cannot open the workspace right now. Contact your school administrator.",
      };
    }
    default: {
      return {
        tone: "error",
        title: SIGN_IN_FAILURE_TITLE,
        message: GENERIC_CREDENTIAL_MESSAGE,
      };
    }
  }
};

const LoginPage = (): ReactElement => {
  const navigate = useNavigate();
  // `/login/membership` is a child of this route in the file-based tree, so this
  // component owns the parent segment. It renders the sign-in card only on
  // `/login` and hands the child route its own screen, without minting a second
  // pre-auth challenge that would invalidate the pending one.
  const isMembershipRoute = useRouterState({
    select: (state) => state.location.pathname === "/login/membership",
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { focusAfterRender } = useFocusAfterRender();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const { csrf, notice, statusReference, announce } = useAuthChallenge({
    enabled: !isMembershipRoute,
    unavailableNotice: {
      tone: "error",
      title: "Sign-in is temporarily unavailable",
      message: "We could not start a secure sign-in. Try again in a moment.",
    },
  });

  if (isMembershipRoute) {
    return <Outlet />;
  }

  const isSubmitDisabled = isPending || csrf === null;

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (isSubmitDisabled) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = describeEmailError(trimmedEmail, emailRef.current);
    const nextPasswordError = password === "" ? "Enter your password." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      // Focus waits for the commit that marks the field invalid, so the screen
      // reader reads the error with the control instead of before it.
      focusAfterRender(nextEmailError ? emailRef : passwordRef);
      return;
    }

    setIsPending(true);
    announce(null);
    // A previous tab session may have left another account's class list here.
    clearPendingMembershipHandoff();
    const result = await submitSignIn({ email: trimmedEmail, password }, csrf);

    if (!result.ok) {
      setIsPending(false);
      announce(describeSignInFailure(result.error));
      // The email stays in state, so it remains filled in after a failure.
      return;
    }

    // Sign-in succeeded, so the submit is no longer pending whether the session
    // is active or the caller must choose a class. This route stays mounted
    // while `/login/membership` renders, so a stale flag would leave the form
    // disabled after the teacher cancels the class choice.
    setIsPending(false);

    if (result.data.status === "active") {
      await navigate({ to: "/workspace" });
      return;
    }

    if (result.data.status === "membership-required") {
      writePendingMembershipHandoff({
        csrf,
        memberships: result.data.memberships.map((membership) => {
          return {
            membershipId: membership.membershipId,
            tenantName: membership.tenantName,
            role: membership.role,
          };
        }),
        expiresAt: result.data.expiresAt,
      });
      await navigate({ to: "/login/membership" });
      return;
    }

    setIsPending(false);
    announce({
      tone: "error",
      title: SIGN_IN_FAILURE_TITLE,
      message: GENERIC_CREDENTIAL_MESSAGE,
    });
  };

  const showForgotPassword = (): void => {
    announce({
      tone: "info",
      title: "Contact your school administrator",
      message:
        "Scholé does not issue password resets itself. Your school administrator can restore access to your account.",
    });
  };

  return (
    <AppShell>
      <div className="auth-page">
        <section className="auth-card" aria-labelledby="login-heading">
          <header className="auth-card__header">
            <h1 id="login-heading" className="auth-card__heading">
              Welcome back
            </h1>
            <p className="auth-card__lede">
              Use the email address and password your school set up for you.
            </p>
          </header>

          <AuthStatus notice={notice} noticeRef={statusReference} />

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <Field
              label="Email address"
              help="Learner accounts come from a teacher invitation."
              error={emailError ?? undefined}
            >
              <input
                ref={emailRef}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                required
                disabled={isPending}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </Field>

            <PasswordField
              label="Password"
              name="password"
              value={password}
              autoComplete="current-password"
              error={passwordError}
              disabled={isPending}
              inputRef={passwordRef}
              onValueChange={setPassword}
              action={
                <button
                  type="button"
                  className="text-link"
                  onClick={showForgotPassword}
                >
                  Forgot password?
                </button>
              }
            />

            <Button
              type="submit"
              className="auth-form__submit"
              disabled={isSubmitDisabled}
            >
              <LogIn aria-hidden="true" />
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="auth-links">
            <span>
              New to Scholé?{" "}
              <Link className="text-link" to="/sign-up">
                Create a teacher account
              </Link>
            </span>
          </p>

          <p className="auth-note">
            <ShieldCheck aria-hidden="true" />
            <span>
              Private drafts stay private. Your password is never stored in the
              browser, and no student data reaches the model.
            </span>
          </p>

          <p className="auth-note auth-note--quiet">
            <Info aria-hidden="true" />
            <span>
              Learner accounts do not sign in here. They join through a teacher
              invitation.
            </span>
          </p>
        </section>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in | Scholé" }] }),
});
