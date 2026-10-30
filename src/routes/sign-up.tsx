import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { submitSignUp } from "@/components/auth/auth-client";
import { AuthBrand } from "@/components/auth/auth-brand";
import { AuthStatus } from "@/components/auth/auth-status";
import { PasswordField } from "@/components/auth/password-field";
import { useAuthChallenge } from "@/components/auth/use-auth-challenge";
import { Button } from "@/components/ui/button";

import type { AuthApiFailure } from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { ReactElement, SyntheticEvent } from "react";

const MINIMUM_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 30;

const noCleanup = (): void => {
  // No timer was scheduled for this pass, so there is nothing to release.
};

const describeSignUpFailure = (failure: AuthApiFailure): AuthNotice => {
  switch (failure.code) {
    case "RATE_LIMITED": {
      return {
        tone: "error",
        title: "Too many attempts",
        message:
          "Wait a few minutes before trying again. If this keeps happening, contact your school administrator.",
      };
    }
    case "AUTH_UNAVAILABLE": {
      return {
        tone: "error",
        title: "Sign-up is temporarily unavailable",
        message: "We could not reach the sign-up service. Try again shortly.",
      };
    }
    case "CSRF_REJECTED": {
      return {
        tone: "error",
        title: "This page needs to be reloaded",
        message:
          "For your safety we stopped that request. Reload the page and try again.",
      };
    }
    case "INVALID_INPUT": {
      return {
        tone: "error",
        title: "Check the details you entered",
        message:
          "Use a valid email address and a password of at least eight characters.",
      };
    }
    default: {
      return {
        tone: "error",
        title: "We could not complete that request",
        message: "Check the details you entered, then try again.",
      };
    }
  }
};

const SignUpPage = (): ReactElement => {
  const emailId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const verificationReference = useRef<HTMLOutputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [verificationAddress, setVerificationAddress] = useState<string | null>(
    null
  );
  const [cooldown, setCooldown] = useState(0);
  const pendingFocusReference = useRef<string | null>(null);
  const { csrf, notice, statusReference, announce } = useAuthChallenge({
    unavailableNotice: {
      tone: "error",
      title: "Sign-up is temporarily unavailable",
      message: "We could not start a secure sign-up. Try again in a moment.",
    },
  });

  useEffect(() => {
    const pendingFocus = pendingFocusReference.current;
    if (pendingFocus === null) {
      return;
    }

    pendingFocusReference.current = null;
    document
      .querySelector<HTMLElement>(`#${CSS.escape(pendingFocus)}`)
      ?.focus();
  }, [emailError, passwordError]);

  useEffect(() => {
    if (cooldown <= 0) {
      return noCleanup;
    }
    const timer = window.setTimeout(() => {
      setCooldown((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [cooldown]);

  useEffect(() => {
    if (verificationAddress) {
      verificationReference.current?.focus();
    }
  }, [verificationAddress]);

  const send = useCallback(
    async (isResend: boolean): Promise<void> => {
      if (csrf === null) {
        return;
      }
      setIsPending(true);
      announce(null);
      const result = await submitSignUp(
        { email: email.trim(), password },
        csrf
      );
      setIsPending(false);

      if (!result.ok) {
        announce(describeSignUpFailure(result.error));
        return;
      }

      setVerificationAddress(result.data.email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (!isResend) {
        return;
      }

      announce({
        tone: "info",
        title: "Verification email sent again",
        message: "Check your inbox for the newest link.",
      });
    },
    [announce, csrf, email, password]
  );

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (isPending || csrf === null) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError =
      trimmedEmail === "" ? "Enter your email address." : null;
    const nextPasswordError =
      password.length < MINIMUM_PASSWORD_LENGTH
        ? `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
        : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      // The error element does not exist until React commits this update.
      pendingFocusReference.current = nextEmailError
        ? emailId
        : passwordErrorId;
      return;
    }

    await send(false);
  };

  return (
    <main className="auth-shell" aria-labelledby="sign-up-heading">
      <div className="auth-frame">
        <AuthBrand />
        <section className="auth-card">
          <header className="auth-card__header">
            <h1 id="sign-up-heading" className="auth-heading">
              Create a teacher account
            </h1>
            <p className="auth-lede">
              A school or class must be assigned to your account before the
              workspace opens. Your school administrator sets that up, so
              signing up does not grant access on its own.
            </p>
          </header>

          {verificationAddress ? (
            <output
              ref={verificationReference}
              className="verification-panel"
              tabIndex={-1}
            >
              <h2 className="verification-panel__heading">
                <MailCheck aria-hidden="true" /> Check your email
              </h2>
              <p>
                We sent a verification link to{" "}
                <span className="verification-panel__address">
                  {verificationAddress}
                </span>
                . Open it to confirm the address, then wait for your school to
                assign a class.
              </p>
              <p className="field__hint">
                Addresses already on file receive exactly this message, so
                nothing here reveals whether an account exists.
              </p>
              <div className="auth-actions">
                <Button
                  type="button"
                  variant="outline"
                  className="auth-submit"
                  disabled={isPending || cooldown > 0}
                  onClick={() => {
                    void send(true);
                  }}
                >
                  {cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : "Resend verification email"}
                </Button>
                <Link className="text-link" to="/login">
                  Back to sign in
                </Link>
              </div>
            </output>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <AuthStatus notice={notice} noticeRef={statusReference} />

              <div className="field">
                <label className="field__label" htmlFor={emailId}>
                  School email address
                </label>
                <input
                  id={emailId}
                  className="field__input"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  aria-label="School email address"
                  aria-invalid={emailError !== null}
                  aria-describedby={emailError ? emailErrorId : undefined}
                  required
                  disabled={isPending}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
                {emailError ? (
                  <p className="field__error" id={emailErrorId} tabIndex={-1}>
                    {emailError}
                  </p>
                ) : null}
              </div>

              <PasswordField
                label="Password"
                name="password"
                value={password}
                autoComplete="new-password"
                invalid={passwordError !== null}
                describedBy={passwordError ? passwordErrorId : undefined}
                minLength={MINIMUM_PASSWORD_LENGTH}
                disabled={isPending}
                onValueChange={setPassword}
              />
              <p className="field__hint">
                At least {MINIMUM_PASSWORD_LENGTH} characters. No symbols or
                capital letters are required — paste and a password manager work
                normally.
              </p>
              {passwordError ? (
                <p className="field__error" id={passwordErrorId} tabIndex={-1}>
                  {passwordError}
                </p>
              ) : null}

              <div className="auth-actions">
                <Button
                  type="submit"
                  className="auth-submit"
                  disabled={isPending || csrf === null}
                >
                  <UserPlus aria-hidden="true" />
                  {isPending ? "Creating account…" : "Create account"}
                </Button>
              </div>
            </form>
          )}

          <p className="auth-links">
            <span>
              Already have an account?{" "}
              <Link className="text-link" to="/login">
                Sign in
              </Link>
            </span>
          </p>

          <p className="auth-note">
            <ShieldCheck aria-hidden="true" />
            <span>
              Teacher accounts only. Learner accounts come from a teacher
              invitation inside the workspace.
            </span>
          </p>
        </section>
      </div>
    </main>
  );
};

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Create a teacher account | Edu-Canvas" }] }),
  component: SignUpPage,
});
