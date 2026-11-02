/* eslint-disable react-doctor/no-fetch-in-effect, unicorn/try-complexity, react-doctor/prefer-useReducer -- The board starts only after the session hook resolves, and each handler owns one network call with its own recovery. The retry reset clears the whole submission at once, so the states change together by design. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/use-auth-session";
import {
  NextActivityCard,
  RevealReport,
} from "@/components/learn/learn-surfaces";
import { csrfHeaderName } from "@/shared/identity-contract";
import {
  learnerAttemptResponseSchema,
  learnerRunResponseSchema,
} from "@/shared/learner-contract";
import type {
  LearnerAttemptResponse,
  LearnerRunResponse,
} from "@/shared/learner-contract";

type Phase = "loading" | "ready" | "saving" | "done" | "error";

const messageByStatus: Readonly<Record<number, string>> = {
  401: "Sign in as a student to open this assignment.",
  403: "This assignment does not belong to your account.",
  409: "This submission is out of date. Reload the page.",
};

const messageByCode: Readonly<Record<string, string>> = {
  ATTEMPT_LIMIT_REACHED:
    "You have used all three tries for this activity. Your teacher can help from here.",
};

const messageFor = (status: number, code?: string): string => {
  const byCode = code === undefined ? undefined : messageByCode[code];
  return (
    byCode ??
    messageByStatus[status] ??
    "The activity is unavailable. Try again."
  );
};

const readErrorCode = async (
  response: Response
): Promise<string | undefined> => {
  try {
    const parsed = (await response.json()) as { code?: unknown };
    return typeof parsed.code === "string" ? parsed.code : undefined;
  } catch {
    return undefined;
  }
};

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
  const [run, setRun] = useState<LearnerRunResponse | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<LearnerAttemptResponse | null>(null);
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
        setRun(learnerRunResponseSchema.parse(await response.json()));
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

  const section =
    run.lesson.sections.find(
      (candidate) => candidate.id === run.lesson.assignedSectionId
    ) ?? run.lesson.sections[0];
  const items = section?.items ?? [];
  const sources = items.filter((item) => item.role === "source");
  const targets = items.filter((item) => item.role !== "source");
  const pairCount = Object.keys(pairs).length;
  const sourceHeading = run.lesson.columns?.sourceLabel ?? "Fractions";
  const targetHeading = run.lesson.columns?.targetLabel ?? "Equivalents";

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
        setError(messageFor(response.status, await readErrorCode(response)));
        setPhase("error");
        return;
      }
      setResult(learnerAttemptResponseSchema.parse(await response.json()));
      setPhase("done");
    } catch {
      setError(messageFor(0));
      setPhase("error");
    }
  };

  // #7: a retry appends evidence; the stored first response and decision stay.
  // The replayed start returns the current run revision, so the next submit is
  // never stale.
  const retry = async (): Promise<void> => {
    setPhase("saving");
    try {
      const response = await post("/api/learner/runs", csrf, {
        operationKey: `start-${assignment}-${variant}`,
        assignedVariantId: variant,
        assignmentId: assignment,
      });
      if (!response.ok) {
        setError(messageFor(response.status, await readErrorCode(response)));
        setPhase("error");
        return;
      }
      setRun(learnerRunResponseSchema.parse(await response.json()));
      setPairs({});
      setActiveSource(null);
      setResult(null);
      setPhase("ready");
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
          <h2 className="learn-column-heading">{sourceHeading}</h2>
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
          <h2 className="learn-column-heading">{targetHeading}</h2>
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
        <div className="learn-result-panel">
          <output className="learn-result">
            Score {result.score}. {result.correctMatches} of{" "}
            {result.requiredMatches} correct ({result.correctness}).
          </output>
          <RevealReport reveal={result.reveal} />
          <NextActivityCard activity={result.nextActivity} />
          <button
            className="learn-retry"
            type="button"
            onClick={() => {
              void retry();
            }}
          >
            Try again
          </button>
        </div>
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

      {phase !== "done" && run.lesson.nextActivity ? (
        <NextActivityCard activity={run.lesson.nextActivity} />
      ) : null}
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
