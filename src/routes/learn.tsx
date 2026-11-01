/* eslint-disable react-doctor/no-fetch-in-effect, unicorn/try-complexity -- The board starts only after the session hook resolves, and each handler owns one network call with its own recovery. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/use-auth-session";
import { csrfHeaderName } from "@/shared/identity-contract";

interface LearnerItem {
  readonly id: string;
  readonly label: string;
  readonly role: "source" | "target" | "distractor";
}

interface LearnerSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly items?: readonly LearnerItem[];
}

interface RunResponse {
  readonly runId: string;
  readonly runRevision: number;
  readonly lesson: { readonly sections: readonly LearnerSection[] };
}

interface AttemptResponse {
  readonly score: number;
  readonly correctness: string;
  readonly correctMatches: number;
  readonly requiredMatches: number;
}

type Phase = "loading" | "ready" | "saving" | "done" | "error";

const messageByStatus: Readonly<Record<number, string>> = {
  401: "Sign in as a student to open this assignment.",
  403: "This assignment does not belong to your account.",
  409: "This submission is out of date. Reload the page.",
};

const messageFor = (status: number): string =>
  messageByStatus[status] ?? "The activity is unavailable. Try again.";

const post = (path: string, csrf: string, body: unknown): Promise<Response> => {
  return fetch(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", [csrfHeaderName]: csrf },
    method: "POST",
  });
};

const toPairList = (pairs: Readonly<Record<string, string>>) =>
  Object.entries(pairs).map(([sourceId, targetId]) => ({ sourceId, targetId }));

const LearnBoard = ({
  assignment,
  variant,
  csrf,
}: {
  readonly assignment: string;
  readonly variant: string;
  readonly csrf: string;
}) => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const start = async (): Promise<void> => {
      try {
        const response = await post("/api/learner/runs", csrf, {
          operationKey: `start-${assignment}-${variant}`,
          assignedVariantId: variant,
          assignmentId: assignment,
        });
        if (!isCurrent) {
          return;
        }
        if (!response.ok) {
          setError(messageFor(response.status));
          setPhase("error");
          return;
        }
        setRun((await response.json()) as RunResponse);
        setPhase("ready");
      } catch {
        if (isCurrent) {
          setError(messageFor(0));
          setPhase("error");
        }
      }
    };
    void start();
    return () => {
      isCurrent = false;
    };
  }, [assignment, variant, csrf]);

  if (phase === "error") {
    return <p className="learn-status">{error}</p>;
  }
  if (!run) {
    return <p className="learn-status">Opening your activity…</p>;
  }

  const [section] = run.lesson.sections;
  const items = section?.items ?? [];
  const sources = items.filter((item) => item.role === "source");
  const targets = items.filter((item) => item.role !== "source");
  const pairCount = Object.keys(pairs).length;

  const submit = async (): Promise<void> => {
    setPhase("saving");
    try {
      const response = await post("/api/learner/attempts", csrf, {
        operationKey: `attempt-${run.runId}-${run.runRevision}`,
        assistanceEventIds: [],
        assistanceState: "none",
        expectedRunRevision: run.runRevision,
        itemId: sources[0]?.id ?? "",
        pairs: toPairList(pairs),
        priorAttemptId: null,
        runId: run.runId,
      });
      if (!response.ok) {
        setError(messageFor(response.status));
        setPhase("error");
        return;
      }
      setResult((await response.json()) as AttemptResponse);
      setPhase("done");
    } catch {
      setError(messageFor(0));
      setPhase("error");
    }
  };

  return (
    <section className="learn-card" aria-labelledby="learn-heading">
      <h1 id="learn-heading">{section?.title ?? "Matching"}</h1>
      <p className="learn-body">{section?.body}</p>

      <div className="learn-board">
        <div>
          <h2 className="learn-column-heading">Fractions</h2>
          <ul className="learn-list">
            {sources.map((item) => {
              const isActive = activeSource === item.id;
              const isPaired = pairs[item.id] !== undefined;
              return (
                <li key={item.id}>
                  <button
                    aria-pressed={isActive}
                    className="learn-item"
                    type="button"
                    onClick={() => {
                      setActiveSource(item.id);
                    }}
                  >
                    {item.label}
                    {isPaired ? " · matched" : ""}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h2 className="learn-column-heading">Equivalents</h2>
          <ul className="learn-list">
            {targets.map((item) => {
              return (
                <li key={item.id}>
                  <button
                    className="learn-item"
                    disabled={activeSource === null}
                    type="button"
                    onClick={() => {
                      if (activeSource === null) {
                        return;
                      }
                      setPairs((current) => {
                        return {
                          ...current,
                          [activeSource]: item.id,
                        };
                      });
                      setActiveSource(null);
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="learn-status">
        {pairCount} of {sources.length} matched.
      </p>

      {phase === "done" && result ? (
        <output className="learn-result">
          Score {result.score}. {result.correctMatches} of{" "}
          {result.requiredMatches} correct ({result.correctness}).
        </output>
      ) : (
        <button
          className="learn-submit"
          disabled={phase === "saving" || pairCount === 0}
          type="button"
          onClick={() => {
            void submit();
          }}
        >
          {phase === "saving" ? "Checking…" : "Done"}
        </button>
      )}
    </section>
  );
};

const LearnPage = () => {
  const { assignment, variant } = Route.useSearch();
  const { projection, csrf, phase } = useAuthSession();

  if (phase === "loading") {
    return <p className="learn-status">Checking your session…</p>;
  }
  if (!projection || projection.actor.role !== "student") {
    return (
      <main className="app-shell">
        <p className="learn-status">
          Your lessons open from a teacher invitation.{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </main>
    );
  }
  if (!assignment || !variant || !csrf) {
    return (
      <main className="app-shell">
        <p className="learn-status">
          Open the link your teacher shared to start this activity.
        </p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <LearnBoard assignment={assignment} variant={variant} csrf={csrf} />
    </main>
  );
};

export const Route = createFileRoute("/learn")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      assignment:
        typeof search.assignment === "string" ? search.assignment : "",
      variant: typeof search.variant === "string" ? search.variant : "",
    };
  },
  component: LearnPage,
});
