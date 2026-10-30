import {
  Outlet,
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Info, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useId, useState } from "react";

import {
  clearPendingMembershipHandoff,
  submitSignIn,
  writePendingMembershipHandoff,
} from "@/components/auth/auth-client";
import { AuthBrand } from "@/components/auth/auth-brand";
import { AuthStatus } from "@/components/auth/auth-status";
import { PasswordField } from "@/components/auth/password-field";
import { useAuthChallenge } from "@/components/auth/use-auth-challenge";
import { Button } from "@/components/ui/button";

import type { AuthApiFailure } from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { ReactElement, SyntheticEvent } from "react";

/**
One message for every failed credential check; account existence stays private.
*/
const GENERIC_CREDENTIAL_MESSAGE =
  "Check your email address and password, then try again.";

const SIGN_IN_FAILURE_TITLE = "Sign-in could not be completed";

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
  const emailId = useId();
  const emailHintId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const {
    csrf,
    unavailable: challengeUnavailable,
    notice,
    statusReference,
    announce,
  } = useAuthChallenge({
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
    const nextEmailError =
      trimmedEmail === "" ? "Enter your email address." : null;
    const nextPasswordError = password === "" ? "Enter your password." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      const firstInvalid = nextEmailError ? emailId : undefined;
      if (firstInvalid) {
        const invalidField = document.querySelector<HTMLElement>(
          `#${firstInvalid}`
        );
        invalidField?.focus();
      }
      return;
    }

    setIsPending(true);
    announce(null);
    // A previous tab session may have left another account's school list here.
    clearPendingMembershipHandoff();
    const result = await submitSignIn({ email: trimmedEmail, password }, csrf);

    if (!result.ok) {
      setIsPending(false);
      announce(describeSignInFailure(result.error));
      // The email stays in state, so it remains filled in after a failure.
      return;
    }

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
        "Edu-Canvas does not issue password resets itself. Your school administrator can restore access to your account.",
    });
  };

  return (
    <main className="auth-shell" aria-labelledby="login-heading">
      <div className="auth-frame">
        <AuthBrand />
        <section className="auth-card">
          <header className="auth-card__header">
            <h1 id="login-heading" className="auth-heading">
              Sign in to Edu-Canvas
            </h1>
            <p className="auth-lede">
              Use the email address and password your school set up for you.
            </p>
          </header>

          {challengeUnavailable ? (
            <p className="field__hint">
              You can still read this page; signing in will resume once the
              service is reachable.
            </p>
          ) : null}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthStatus notice={notice} noticeRef={statusReference} />

            <div className="field">
              <label className="field__label" htmlFor={emailId}>
                Email address
              </label>
              <input
                id={emailId}
                className="field__input"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                aria-label="Email address"
                aria-invalid={emailError !== null}
                aria-describedby={`${emailHintId}${
                  emailError ? ` ${emailErrorId}` : ""
                }`}
                required
                disabled={isPending}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
              <p className="field__hint" id={emailHintId}>
                Learner accounts come from a teacher invitation.
              </p>
              {emailError ? (
                <p className="field__error" id={emailErrorId}>
                  {emailError}
                </p>
              ) : null}
            </div>

            <PasswordField
              label="Password"
              name="password"
              value={password}
              autoComplete="current-password"
              invalid={passwordError !== null}
              describedBy={passwordError ? passwordErrorId : undefined}
              disabled={isPending}
              onValueChange={setPassword}
            />
            {passwordError ? (
              <p className="field__error" id={passwordErrorId}>
                {passwordError}
              </p>
            ) : null}

            <div className="auth-actions">
              <Button
                type="submit"
                className="auth-submit"
                disabled={isSubmitDisabled}
              >
                <LogIn aria-hidden="true" />
                {isPending ? "Signing in…" : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-link"
                onClick={showForgotPassword}
              >
                Forgot password?
              </Button>
            </div>
          </form>

          <p className="auth-links">
            <span>
              New to Edu-Canvas?{" "}
              <Link className="text-link" to="/sign-up">
                Create a teacher account
              </Link>
            </span>
            <span className="auth-links__aside">
              <UserPlus aria-hidden="true" />
              Teacher accounts only
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
    </main>
  );
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in | Edu-Canvas" }] }),
});
