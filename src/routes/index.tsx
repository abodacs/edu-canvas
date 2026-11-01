import {
  ArrowRight,
  Check,
  EyeOff,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useAuthSession } from "@/components/auth/use-auth-session";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utilities";

// Public marketing illustration of the seeded equivalent-fractions concept.
// Mirrors only the public fixture content. Never imports the server seed
// (the answer key is server-only and must not reach the client bundle).
const REVEAL_PROMPT =
  "Choose every fraction that names the same part of a whole.";
const REVEAL_SOURCE = "1/2";
const REVEAL_MATCHES = ["2/4", "3/6", "4/8"];
const REVEAL_DISTRACTOR = "2/3";

/**
The sign-out hand-off lands on `?signedOut=1` (#168 P2-5), so the exit is
confirmed by the page itself and refreshes or shares never carry the banner.
*/
const handOffSearch = (
  search: Record<string, unknown>
): { signedOut?: boolean } =>
  search.signedOut === "1" ? { signedOut: true } : {};

const primaryButtonClass = "cta-primary";

const TeacherHome = () => {
  // #168 P1-4: once the tab's session resolves as active, the header and the
  // hero hand the teacher their workspace instead of advertising a sign-in.
  const session = useAuthSession();
  const hasActiveSession = session.phase === "active" && session.projection;
  const isSignedOutArrival = Route.useSearch().signedOut === true;

  return (
    <main className="app-shell" aria-labelledby="page-title">
      <div className="page-frame">
        {isSignedOutArrival ? (
          <output className="sign-out-banner">
            You are signed out. Sign in again to return to your drafts.
          </output>
        ) : null}
        <header className="site-header">
          <Link className="brand-lockup" to="/" aria-label="Edu-Canvas home">
            <span className="brand-mark" aria-hidden="true">
              EC
            </span>
            <span>
              <span className="brand-name">Edu-Canvas</span>
              <span className="brand-subtitle">lessons that land</span>
            </span>
          </Link>
          {hasActiveSession ? (
            <div className="hero-actions site-header__actions">
              <span className="site-header__identity">
                Signed in as {session.projection?.actor.displayName}
              </span>
              <Link
                className={cn(buttonVariants({ size: "sm" }), "min-h-9")}
                to="/workspace"
              >
                <ArrowRight aria-hidden="true" />
                Open workspace
              </Link>
            </div>
          ) : (
            <div className="hero-actions site-header__actions">
              <Link
                className={cn(buttonVariants({ size: "sm" }), "min-h-9")}
                to="/login"
              >
                <LogIn aria-hidden="true" />
                Sign in
              </Link>
              <Link
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" })
                )}
                to="/sign-up"
              >
                Create account
              </Link>
            </div>
          )}
        </header>

        <section className="page-grid page-grid--hero">
          <div className="hero-copy">
            <p className="eyebrow">Built for teachers</p>
            <h1 id="page-title" className="hero-headline">
              Turn one sentence into a lesson your students understand.
            </h1>
            <p className="hero-description">
              Type a learning objective in English or Arabic. Approve four
              variants on one screen. Publish in about three minutes.
            </p>
            <div className="hero-actions">
              {hasActiveSession ? (
                <Link
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    primaryButtonClass
                  )}
                  to="/workspace"
                >
                  Open your workspace
                  <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      primaryButtonClass
                    )}
                    to="/login"
                  >
                    Sign in
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    className={cn(
                      buttonVariants({ variant: "outline", size: "lg" }),
                      "min-h-12"
                    )}
                    to="/sign-up"
                  >
                    <UserPlus aria-hidden="true" />
                    Create a teacher account
                  </Link>
                </>
              )}
            </div>
          </div>

          <RevealPreview />
        </section>

        <section className="metric" aria-label="Teacher preparation time">
          <p className="metric__lead">Less prep. More teaching.</p>
          <div className="metric__row">
            <div className="metric__cell metric__cell--from">
              <span className="metric__cell-label">Today</span>
              <strong className="metric__cell-value">≈ 30 min</strong>
            </div>
            <ArrowRight className="metric__arrow" aria-hidden="true" />
            <div className="metric__cell metric__cell--to">
              <span className="metric__cell-label">With Edu-Canvas</span>
              <strong className="metric__cell-value">≈ 3 min</strong>
            </div>
          </div>
          <p className="metric__note">
            Target metric. Median time, prompt to approved pack.
          </p>
        </section>

        <section className="control" aria-labelledby="control-heading">
          <h2 id="control-heading">You stay in charge.</h2>
          <ul className="control__list">
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>
                <strong>You approve every variant</strong> before any student
                sees it.
              </span>
            </li>
            <li>
              <LockKeyhole aria-hidden="true" />
              <span>
                <strong>The answer key stays on the server.</strong> Students
                can&rsquo;t submit a score.
              </span>
            </li>
            <li>
              <EyeOff aria-hidden="true" />
              <span>
                <strong>No student images or names</strong> reach the model.
              </span>
            </li>
          </ul>
        </section>

        <section className="cta-final" aria-labelledby="cta-final-heading">
          <div className="cta-final__inner">
            <h2 id="cta-final-heading">Draft your first lesson in minutes.</h2>
            <p className="cta-final__sub">
              One prompt. Four variants you approve. A student gets the idea.
            </p>
            <Link
              className={cn(buttonVariants({ size: "lg" }), primaryButtonClass)}
              to="/sign-up"
            >
              Create a teacher account
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <footer className="site-footer">
          <Link className="brand-lockup" to="/" aria-label="Edu-Canvas home">
            <span className="brand-mark" aria-hidden="true">
              EC
            </span>
            <span className="brand-name">Edu-Canvas</span>
          </Link>
          <p className="footer-note">
            Synthetic fixture data only. Built with Codex and GPT-5.6.
          </p>
        </footer>
      </div>
    </main>
  );
};

const RevealPreview = () => {
  return (
    <figure
      className="reveal"
      aria-label="Equivalent fractions connection reveal, illustrated"
    >
      <div className="reveal__head">
        <span className="reveal__tag">Equivalent fractions</span>
        <span className="reveal__std">Grade 4 · 4.NF.A.1</span>
      </div>

      <p className="reveal__prompt">{REVEAL_PROMPT}</p>

      <div className="reveal__source-row">
        <span className="reveal__source-label">Source</span>
        <span className="reveal__source">{REVEAL_SOURCE}</span>
      </div>

      <ul className="reveal__targets">
        {REVEAL_MATCHES.map((target) => {
          return (
            <li key={target} className="reveal__target is-correct">
              <span>{target}</span>
              <Check aria-hidden="true" />
            </li>
          );
        })}
        <li className="reveal__target is-distractor">
          <span>{REVEAL_DISTRACTOR}</span>
        </li>
      </ul>

      <div className="reveal__equal" aria-hidden="true">
        <div className="reveal__equal-labels">
          <span>1/2</span>
          <span>2/4</span>
          <span>3/6</span>
          <span>4/8</span>
        </div>
        <div className="reveal__equal-bar">
          <div className="reveal__equal-fill" />
        </div>
        <p className="reveal__equal-note">Same portion of the whole</p>
      </div>

      <p className="reveal__why">Different names, same amount.</p>

      <figcaption className="reveal__caption">
        Illustration of the seeded curriculum. Synthetic data only.
      </figcaption>
    </figure>
  );
};

export const Route = createFileRoute("/")({
  component: TeacherHome,
  validateSearch: handOffSearch,
});
