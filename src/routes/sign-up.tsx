import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { submitSignUp } from "@/components/auth/auth-client";
import { AuthStatus } from "@/components/auth/auth-status";
import { PasswordField } from "@/components/auth/password-field";
import { useAuthChallenge } from "@/components/auth/use-auth-challenge";
import { useFocusAfterRender } from "@/components/auth/use-auth-notice";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

import type { AuthApiFailure } from "@/components/auth/auth-client";
import type { AuthNotice } from "@/components/auth/auth-status";
import type { ReactElement, SyntheticEvent } from "react";

const MINIMUM_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 30;

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
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const verificationReference = useRef<HTMLDivElement>(null);
  const { focusAfterRender } = useFocusAfterRender();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [verificationAddress, setVerificationAddress] = useState<string | null>(
    null
  );
  const [cooldown, setCooldown] = useState(0);
  const { csrf, notice, statusReference, announce } = useAuthChallenge({
    unavailableNotice: {
      tone: "error",
      title: "Sign-up is temporarily unavailable",
      message: "We could not start a secure sign-up. Try again in a moment.",
    },
  });

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
    const nextEmailError = describeEmailError(trimmedEmail, emailRef.current);
    const nextPasswordError =
      password.length < MINIMUM_PASSWORD_LENGTH
        ? `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
        : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      // Focus waits for the commit that marks the field invalid, so the screen
      // reader reads the error with the control instead of before it.
      focusAfterRender(nextEmailError ? emailRef : passwordRef);
      return;
    }

    await send(false);
  };

  return (
    <AppShell>
      <div className="auth-page">
        <section className="auth-card" aria-labelledby="sign-up-heading">
          <header className="auth-card__header">
            <h1 id="sign-up-heading" className="auth-card__heading">
              Create your teacher account
            </h1>
            <p className="auth-card__lede">
              A school or class must be assigned to your account before the
              workspace opens. Your school administrator sets that up, so
              signing up does not grant access on its own.
            </p>
          </header>

          {verificationAddress ? (
            <div
              ref={verificationReference}
              className="auth-verification"
              tabIndex={-1}
            >
              <Notice tone="info" title="Check your email">
                <p>
                  We sent a verification link to{" "}
                  <bdi className="auth-verification__address" dir="ltr">
                    {verificationAddress}
                  </bdi>
                  . Open it to confirm the address, then wait for your school to
                  assign a class.
                </p>
                <p>
                  Addresses already on file receive exactly this message, so
                  nothing here reveals whether an account exists.
                </p>
              </Notice>
              <AuthStatus notice={notice} noticeRef={statusReference} />
              <div className="auth-actions">
                <Button
                  type="button"
                  variant="secondary"
                  className="auth-form__submit"
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
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <AuthStatus notice={notice} noticeRef={statusReference} />

              <Field
                label="School email address"
                error={emailError ?? undefined}
              >
                <input
                  ref={emailRef}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
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
                autoComplete="new-password"
                help={`At least ${MINIMUM_PASSWORD_LENGTH} characters. No symbols or capital letters are required — paste and a password manager work normally.`}
                error={passwordError}
                minLength={MINIMUM_PASSWORD_LENGTH}
                disabled={isPending}
                inputRef={passwordRef}
                onValueChange={setPassword}
              />

              <Button
                type="submit"
                className="auth-form__submit"
                disabled={isPending || csrf === null}
              >
                {isPending ? "Creating account…" : "Create account"}
              </Button>
            </form>
          )}

          {verificationAddress ? null : (
            <p className="auth-links">
              <span>
                Already have an account?{" "}
                <Link className="text-link" to="/login">
                  Sign in
                </Link>
              </span>
            </p>
          )}

          <p className="auth-note">
            <ShieldCheck aria-hidden="true" />
            <span>
              Teacher accounts only. Learner accounts come from a teacher
              invitation inside the workspace.
            </span>
          </p>
        </section>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/sign-up")({
  head: () => ({ meta: [{ title: "Create a teacher account | Scholé" }] }),
  component: SignUpPage,
});
