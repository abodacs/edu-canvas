import { ArrowRight, CircleAlert, Plus } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";

import type { ReactElement } from "react";

import { useAuthSession } from "@/components/auth/use-auth-session";
import { BrandMark } from "@/components/ui/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { SyntheticDataMarker } from "@/components/ui/synthetic-data-marker";
import { cn } from "@/lib/utilities";

import { ClosingScene, HeroScene } from "@/components/landing/scene";
import { StudioPreview } from "@/components/landing/studio-preview";

/**
The sign-out hand-off lands on `?signedOut=1` (#168 P2-5), so the exit is
confirmed by the page itself and refreshes or shares never carry the banner.
*/
const handOffSearch = (
  search: Record<string, unknown>
): { signedOut?: boolean } =>
  search.signedOut === "1" ? { signedOut: true } : {};

const pathStops = [
  {
    key: "objective",
    you: true,
    title: "You write the objective",
    detail: "Plain words and a grade. Add your own source file if you want.",
    who: "Your call",
    icon: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  },
  {
    key: "drafts",
    you: false,
    title: "Scholé drafts and checks",
    detail:
      "Four variants, checked for structure, curriculum fit and safety before you see them.",
    who: "Automatic",
    icon: <path d="M5 12l4 4 10-10" />,
  },
  {
    key: "approve",
    you: true,
    title: "You review and approve",
    detail: "Edit one section at a time. An approved version never changes.",
    who: "Your call",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  {
    key: "practise",
    you: false,
    title: "Your student practises",
    detail:
      "One focused activity, graded on the server, with a reason for what comes next.",
    who: "After you publish",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
  },
] as const;

const ledgerGains = [
  {
    key: "time",
    title: "Your evening back",
    detail:
      "Start from four checked drafts instead of a blank page. We're aiming for about three minutes from objective to approved lesson. That's a target, not a measured result.",
    icon: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6" />
      </>
    ),
  },
  {
    key: "reason",
    title: "A reason for every step",
    detail:
      "Each lesson shows what comes before it, what comes next, and why, so you can explain it to a parent or a colleague.",
    icon: (
      <>
        <path d="M4 6h10M4 12h16M4 18h7" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="15" cy="18" r="2" />
      </>
    ),
  },
  {
    key: "control",
    title: "Nothing slips past you",
    detail:
      "Warnings stay visible until you acknowledge them. Students only ever see a version you approved.",
    icon: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
] as const;

const receiptLines = [
  {
    key: "structure",
    tone: "ok",
    line: "Structure fits the lesson format",
    note: "Every section present and in order",
    icon: <path d="M5 12l4 4 10-10" />,
  },
  {
    key: "standard",
    tone: "ok",
    line: "Matches 4.NF.A.1",
    note: "Source: Learning Commons snapshot",
    icon: <path d="M5 12l4 4 10-10" />,
  },
  {
    key: "gap",
    tone: "warn",
    line: "Prerequisite gap: unit fractions",
    note: "Shown to you, not hidden",
    icon: (
      <>
        <path d="M12 4 2 20h20z" />
        <path d="M12 10v4M12 17v.01" />
      </>
    ),
  },
  {
    key: "blocked",
    tone: "stop",
    line: "Answer key didn't match the diagram",
    note: "Blocked. This draft will never reach a student.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 8l8 8M16 8l-8 8" />
      </>
    ),
  },
] as const;

const faqItems = [
  {
    key: "scope",
    question: "What can I teach with it today?",
    answer:
      "Grade 4 equivalent fractions (Common Core 4.NF.A.1), in English. We'd rather do one topic properly than many topics loosely. More grades and topics come next.",
  },
  {
    key: "edit",
    question: "Can I change what it writes?",
    answer:
      "Yes. Edit any section, or reject a variant entirely. Each edit makes a new version, and once you approve a version it never changes behind your back.",
  },
  {
    key: "wrong",
    question: "What if a draft is wrong?",
    answer:
      "Drafts that fail a check are blocked before you preview them. Anything less serious shows up as a warning you have to acknowledge before publishing.",
  },
  {
    key: "privacy",
    question: "Does student data go to the AI?",
    answer:
      "No student names or images reach the model. For now Scholé runs on synthetic data and demo accounts only.",
  },
  {
    key: "cost",
    question: "What does it cost?",
    answer:
      "Pricing isn't decided yet. When it is, it will be published here before launch.",
  },
  {
    key: "students",
    question: "Do my students need an account?",
    answer:
      "A student opens the link you assign and does one focused activity. The answers are graded on the server, so nobody can fake a score.",
  },
] as const;

const proofFacts = [
  {
    key: "standard",
    fact: "Common Core 4.NF.A.1",
    detail: "Every draft is matched to the standard it claims.",
  },
  {
    key: "sources",
    fact: "Learning Commons sources",
    detail: "Each generation stores the source it used. CC BY 4.0.",
  },
  {
    key: "gate",
    fact: "A safety gate, not a promise",
    detail: "Unsafe drafts are blocked before you preview them.",
  },
  {
    key: "answers",
    fact: "Answers stay on the server",
    detail: "Students can't see the key or submit their own score.",
  },
] as const;

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const TeacherHome = (): ReactElement => {
  // #168 P1-4: once the tab's session resolves as active, the header and the
  // hero hand the teacher their workspace instead of advertising a sign-in.
  const session = useAuthSession();
  const hasActiveSession = session.phase === "active" && session.projection;
  const isSignedOutArrival = Route.useSearch().signedOut === true;

  const primaryCta = hasActiveSession ? (
    <Link className={cn(buttonVariants({ size: "lg" }))} to="/workspace">
      Open your workspace
      <ArrowRight aria-hidden="true" className="flip" />
    </Link>
  ) : (
    <Link className={cn(buttonVariants({ size: "lg" }))} to="/sign-up">
      Create a teacher account
    </Link>
  );

  return (
    <main
      id="main"
      tabIndex={-1}
      className="app-shell landing"
      aria-labelledby="page-title"
    >
      {isSignedOutArrival ? (
        <output className="signed-out">
          <CircleAlert aria-hidden="true" />
          You&rsquo;re signed out. Your drafts are saved for next time.
        </output>
      ) : null}

      <section className="hero" aria-labelledby="page-title">
        <div className="scene" aria-hidden="true">
          <HeroScene />
        </div>

        <header className="landing-top">
          <BrandMark withTagline />
          <nav aria-label="Page">
            <a href="#how">How it works</a>
            <a href="#checked">What&rsquo;s checked</a>
            <a href="#questions">Questions</a>
            {hasActiveSession ? (
              <Link
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" })
                )}
                to="/workspace"
              >
                Open workspace
              </Link>
            ) : (
              <Link
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" })
                )}
                to="/login"
              >
                Sign in
              </Link>
            )}
          </nav>
        </header>

        <div className="pitch">
          <h1 id="page-title" className="hero-headline">
            Turn one learning objective into a lesson your students{" "}
            <em>understand</em>.
          </h1>
          <p className="lede">
            For Grades 3–6 teachers. Write one objective, get four lesson
            variants checked against the standard and a safety gate, and approve
            exactly what your students see.
          </p>
          <div className="cta">
            {primaryCta}
            <a className="text-link" href="#how">
              See how it works
              <ArrowRight aria-hidden="true" className="flip" />
            </a>
          </div>
          <p className="fine">Grade 4 equivalent fractions today · English</p>
        </div>

        <StudioPreview />
      </section>

      <ul className="proof" aria-label="What you can check for yourself">
        {proofFacts.map((item) => (
          <li key={item.key}>
            <b>{item.fact}</b>
            {item.detail}
          </li>
        ))}
      </ul>

      <section className="wrap block" id="how" aria-labelledby="how-h">
        <h2 id="how-h">One loop, and you decide at every turn.</h2>
        <ol className="path">
          {pathStops.map((stop) => (
            <li key={stop.key} className={stop.you ? "you" : undefined}>
              <span className="node" aria-hidden="true">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  strokeWidth="2.6"
                  {...strokeProps}
                >
                  {stop.icon}
                </svg>
              </span>
              <h3>{stop.title}</h3>
              <p>{stop.detail}</p>
              <span className="who-does">{stop.who}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap block" id="checked" aria-labelledby="gain-h">
        <h2 id="gain-h">Less time drafting. Every decision explained.</h2>
        <div className="gains">
          <ul className="ledger">
            {ledgerGains.map((gain) => (
              <li key={gain.key}>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  aria-hidden="true"
                  {...strokeProps}
                >
                  {gain.icon}
                </svg>
                <b>{gain.title}</b>
                <span>{gain.detail}</span>
              </li>
            ))}
          </ul>

          <aside
            className="card lift receipt"
            aria-label="Example check results for one draft (illustration)"
          >
            <header>
              <h3>Checks on variant C</h3>
              <span className="pill">Illustration</span>
            </header>
            <ul>
              {receiptLines.map((entry) => (
                <li key={entry.key} className={entry.tone}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    strokeWidth="2.6"
                    aria-hidden="true"
                    {...strokeProps}
                  >
                    {entry.icon}
                  </svg>
                  <span>
                    {entry.line}
                    <small>{entry.note}</small>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="wrap block" id="questions" aria-labelledby="faq-h">
        <h2 id="faq-h">Questions teachers ask first</h2>
        <div className="faq">
          <div>
            {faqItems.slice(0, 3).map((item) => (
              <details key={item.key} open={item.key === "scope"}>
                <summary>
                  {item.question}
                  <Plus aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <div>
            {faqItems.slice(3).map((item) => (
              <details key={item.key}>
                <summary>
                  {item.question}
                  <Plus aria-hidden="true" />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="close" aria-labelledby="close-h">
        <div className="scene" aria-hidden="true">
          <ClosingScene />
        </div>
        <div className="inner">
          <h2 id="close-h">Bring tomorrow&rsquo;s objective.</h2>
          <p className="lede">
            One sentence is enough. You review four checked variants, and
            nothing reaches a student until you say so.
          </p>
          <div className="cta">{primaryCta}</div>
          {hasActiveSession ? null : (
            <p className="fine">
              Already have one? <Link to="/login">Sign in</Link>
            </p>
          )}
        </div>
        <footer className="site-foot">
          <span className="brand">
            <svg viewBox="0 0 26 26" fill="currentColor" aria-hidden="true">
              <path d="M2 8 13 2l11 6v2H2z" />
              <rect x="4" y="11" width="3" height="10" />
              <rect x="11.5" y="11" width="3" height="10" />
              <rect x="19" y="11" width="3" height="10" />
              <rect x="2" y="22" width="22" height="2.5" />
            </svg>
            Scholé
          </span>
          <span>Grades 3–6 · Grade 4 equivalent fractions today</span>
          <SyntheticDataMarker as="span">
            Standards from Learning Commons (CC BY 4.0) · Synthetic data only
          </SyntheticDataMarker>
        </footer>
      </section>
    </main>
  );
};

export const Route = createFileRoute("/")({
  component: TeacherHome,
  validateSearch: handOffSearch,
});
