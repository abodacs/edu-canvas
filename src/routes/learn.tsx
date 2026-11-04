/* eslint-disable react-doctor/no-fetch-in-effect, unicorn/try-complexity -- The board starts only after the session hook resolves, and each handler owns one network call with its own recovery. The retry reset clears the whole submission at once, so the states change together by design. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "@/components/auth/use-auth-session";
import { AppShell } from "@/components/ui/app-shell";
import { initialsFor } from "@/components/ui/app-shell-navigation";
import { BidiText } from "@/components/learn/bidi-text";
import {
  BoardActions,
  MatchingColumns,
  ResultPanel,
} from "@/components/learn/learn-board";
import {
  NextActivityCard,
  RepeatEvaluationNotice,
} from "@/components/learn/learn-surfaces";
import { learnerCopyFor, scoreLine } from "@/components/learn/learner-copy";
import { csrfHeaderName } from "@/shared/identity-contract";
import {
  learnerAttemptResponseSchema,
  learnerErrorResponseSchema,
  learnerRunResponseSchema,
} from "@/shared/learner-contract";
import type {
  LearnerAttemptResponse,
  LearnerRunResponse,
} from "@/shared/learner-contract";
import type { LearnerCopy } from "@/components/learn/learner-copy";

type Phase = "loading" | "ready" | "saving" | "done" | "error";

/**
A fetch rejection carries no HTTP status; the sentinel picks the network failure message.
*/
const statusNetworkFailure = 0;
const statusUnauthorized = 401;
const statusForbidden = 403;
const statusConflict = 409;
const signInMessage = "Sign in as a student to open this assignment.";

const messageFor = (
  copy: LearnerCopy,
  status: number,
  code?: string
): string => {
  if (code === "ATTEMPT_LIMIT_REACHED") {
    return copy.attemptLimit;
  }
  const byStatus: Readonly<Record<number, string>> = {
    [statusUnauthorized]: signInMessage,
    [statusForbidden]: copy.forbidden,
    [statusConflict]: copy.stale,
  };
  return byStatus[status] ?? copy.unavailable;
};

const readErrorCode = async (
  response: Response
): Promise<string | undefined> => {
  try {
    return learnerErrorResponseSchema.parse(await response.json()).code;
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

/**
#9: where focus goes after an action removes or disables the focused control. Pairing disables every target, Done unmounts itself, and Try again or Clear resets the board, so each names its landing place instead of dropping focus to the document body.
*/
type FocusTarget = "first-source" | "next-source" | "reveal" | "error";

const focusSelectors: Readonly<Record<"first-source" | "next-source", string>> =
  {
    "first-source": "[data-source]",
    "next-source": "[data-source][data-paired='false']",
  };

interface LearnerRunState {
  readonly phase: Phase;
  readonly run: LearnerRunResponse | null;
  readonly result: LearnerAttemptResponse | null;
  readonly error: string | null;
  readonly announcement: string;
  readonly copy: LearnerCopy;
}

/**
The run's network lifecycle: start, submit, and retry. It owns the phase and the single announcement the page's live region reads.
*/
const useLearnerRun = (input: {
  readonly assignment: string;
  readonly variant: string;
  readonly csrf: string;
  readonly requestFocus: (target: FocusTarget) => void;
}) => {
  const { assignment, variant, csrf, requestFocus } = input;
  const [phase, setPhase] = useState<Phase>("loading");
  const [run, setRun] = useState<LearnerRunResponse | null>(null);
  const [result, setResult] = useState<LearnerAttemptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const copy = learnerCopyFor(run?.lesson.language ?? null);

  // One start shape for the page load and the retry replay; the idempotent
  // operation key returns the same run with its current revision.
  const postStartRun = (): Promise<Response> => {
    return post("/api/learner/runs", csrf, {
      operationKey: `start-${assignment}-${variant}`,
      assignedVariantId: variant,
      assignmentId: assignment,
    });
  };

  const fail = (message: string): void => {
    setError(message);
    setAnnouncement(message);
    setPhase("error");
    requestFocus("error");
  };

  useEffect(() => {
    let isCurrent = true;
    const start = async (): Promise<void> => {
      try {
        const response = await postStartRun();
        if (!isCurrent) {
          return;
        }
        if (!response.ok) {
          fail(messageFor(copy, response.status));
          return;
        }
        setRun(learnerRunResponseSchema.parse(await response.json()));
        setPhase("ready");
      } catch {
        if (isCurrent) {
          fail(messageFor(copy, statusNetworkFailure));
        }
      }
    };
    void start();
    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- postStartRun reads the same search params as the effect.
  }, [assignment, variant, csrf]);

  const submit = async (attempt: {
    readonly run: LearnerRunResponse;
    readonly itemId: string;
    readonly pairs: Readonly<Record<string, string>>;
  }): Promise<void> => {
    setPhase("saving");
    setAnnouncement(copy.checking);
    try {
      const response = await post("/api/learner/attempts", csrf, {
        operationKey: `attempt-${attempt.run.runId}-${attempt.run.runRevision}`,
        assistanceEventIds: [],
        assistanceState: "none",
        expectedRunRevision: attempt.run.runRevision,
        itemId: attempt.itemId,
        pairs: toPairList(attempt.pairs),
        priorAttemptId: null,
        runId: attempt.run.runId,
      });
      if (!response.ok) {
        fail(messageFor(copy, response.status, await readErrorCode(response)));
        return;
      }
      const graded = learnerAttemptResponseSchema.parse(await response.json());
      setResult(graded);
      setAnnouncement(
        `${scoreLine(copy, graded)} ${copy.outcome[graded.correctness]}`
      );
      setPhase("done");
      requestFocus("reveal");
    } catch {
      fail(messageFor(copy, statusNetworkFailure));
    }
  };

  // #7: a retry appends evidence; the stored first response and decision stay.
  // The replayed start returns the current run revision, so the next submit is
  // never stale.
  const retry = async (onReset: () => void): Promise<void> => {
    setPhase("saving");
    try {
      const response = await postStartRun();
      if (!response.ok) {
        fail(messageFor(copy, response.status, await readErrorCode(response)));
        return;
      }
      setRun(learnerRunResponseSchema.parse(await response.json()));
      onReset();
      setResult(null);
      setPhase("ready");
      requestFocus("first-source");
    } catch {
      fail(messageFor(copy, statusNetworkFailure));
    }
  };

  const state: LearnerRunState = {
    phase,
    run,
    result,
    error,
    announcement,
    copy,
  };
  return { state, submit, retry, announce: setAnnouncement };
};

/**
Moves focus once the render that removed or disabled the focused control has committed. The request lives in a ref: it is not shown, only consumed.
*/
const useFocusAfterRender = () => {
  const pending = useRef<FocusTarget | null>(null);
  const boardReference = useRef<HTMLElement>(null);
  const revealHeadingReference = useRef<HTMLHeadingElement>(null);
  const errorReference = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const target = pending.current;
    if (target === null) {
      return;
    }
    pending.current = null;
    if (target === "reveal") {
      revealHeadingReference.current?.focus();
      return;
    }
    if (target === "error") {
      errorReference.current?.focus();
      return;
    }
    const board = boardReference.current;
    const candidate =
      board?.querySelector<HTMLButtonElement>(focusSelectors[target]) ??
      board?.querySelector<HTMLButtonElement>(".learn-submit");
    candidate?.focus();
  });

  return {
    requestFocus: (target: FocusTarget) => {
      pending.current = target;
    },
    boardReference,
    revealHeadingReference,
    errorReference,
  };
};

/**
The assigned section's items split into the two columns, with headings.
*/
const deriveBoard = (run: LearnerRunResponse, copy: LearnerCopy) => {
  const section = run.lesson.sections.find(
    (candidate) => candidate.id === run.lesson.assignedSectionId
  );
  const items = section?.items ?? [];
  return {
    section,
    sources: items.filter((item) => item.role === "source"),
    targets: items.filter((item) => item.role !== "source"),
    sourceHeading:
      run.lesson.columns?.sourceLabel ?? copy.sourceHeadingFallback,
    targetHeading:
      run.lesson.columns?.targetLabel ?? copy.targetHeadingFallback,
  };
};

const LearnBoard = ({
  assignment,
  variant,
  csrf,
}: {
  readonly assignment: string;
  readonly variant: string;
  readonly csrf: string;
}) => {
  const {
    requestFocus,
    boardReference,
    revealHeadingReference,
    errorReference,
  } = useFocusAfterRender();
  const { state, submit, retry, announce } = useLearnerRun({
    assignment,
    variant,
    csrf,
    requestFocus,
  });
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const { phase, run, result, error, announcement, copy } = state;

  const liveRegion = <output className="sr-only">{announcement}</output>;

  if (phase === "error") {
    return (
      <>
        {liveRegion}
        <p
          className="learn-status learn-error"
          ref={errorReference}
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      </>
    );
  }
  if (!run) {
    return (
      <output className="learn-status" aria-busy="true">
        Opening your activity…
      </output>
    );
  }

  const { direction } = copy;
  const { section, sources, targets, sourceHeading, targetHeading } =
    deriveBoard(run, copy);
  const pairCount = Object.keys(pairs).length;

  const resetBoard = (): void => {
    setPairs({});
    setActiveSource(null);
    announce(copy.progress(0, sources.length));
  };

  const pairWith = (targetId: string): void => {
    if (activeSource === null) {
      return;
    }
    const next = { ...pairs, [activeSource]: targetId };
    setPairs(next);
    setActiveSource(null);
    announce(copy.progress(Object.keys(next).length, sources.length));
    requestFocus("next-source");
  };

  return (
    <section
      className="learn-card"
      aria-labelledby="learn-heading"
      dir={direction}
      lang={run.lesson.language ?? undefined}
      ref={boardReference}
    >
      {liveRegion}
      <h1 className="learn-title" id="learn-heading">
        <BidiText
          text={section?.title ?? copy.headingFallback}
          direction={direction}
        />
      </h1>
      {section?.body ? (
        <p className="learn-body">
          <BidiText text={section.body} direction={direction} />
        </p>
      ) : null}

      <MatchingColumns
        copy={copy}
        sourceHeading={sourceHeading}
        targetHeading={targetHeading}
        sources={sources}
        targets={targets}
        pairs={pairs}
        activeSource={activeSource}
        isLocked={phase === "saving" || phase === "done"}
        onSelectSource={setActiveSource}
        onSelectTarget={pairWith}
      />

      {phase === "ready" && run.lesson.firstResponseStatus === "submitted" ? (
        <RepeatEvaluationNotice copy={copy} />
      ) : null}

      {phase === "done" && result ? (
        <ResultPanel
          copy={copy}
          result={result}
          revealHeadingReference={revealHeadingReference}
          onRetry={() => {
            void retry(resetBoard);
          }}
        />
      ) : (
        <BoardActions
          copy={copy}
          progress={copy.progress(pairCount, sources.length)}
          isSaving={phase === "saving"}
          hasPairs={pairCount > 0}
          onSubmit={() => {
            void submit({ run, itemId: sources[0]?.id ?? "", pairs });
          }}
          onClear={() => {
            resetBoard();
            requestFocus("first-source");
          }}
        />
      )}

      {phase !== "done" && run.lesson.nextActivity ? (
        <NextActivityCard activity={run.lesson.nextActivity} copy={copy} />
      ) : null}
    </section>
  );
};

const LearnPage = () => {
  const { assignment, variant } = Route.useSearch();
  const navigate = Route.useNavigate();
  const session = useAuthSession();
  const { projection, csrf, phase } = session;

  if (phase === "loading") {
    return (
      <AppShell>
        <p className="learn-status">Checking your session…</p>
      </AppShell>
    );
  }
  if (!projection || projection.actor.role !== "student") {
    return (
      <AppShell>
        <p className="learn-status">
          Your lessons open from a teacher invitation.{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </AppShell>
    );
  }

  const handleSignOut = async (): Promise<void> => {
    if (await session.signOut()) {
      await navigate({ to: "/", replace: true, search: { signedOut: true } });
    }
  };
  const identity = {
    displayName: projection.actor.displayName,
    context: `${projection.actor.tenantName} · Student`,
    initials: initialsFor(projection.actor.displayName),
  };

  return (
    <AppShell
      identity={identity}
      isSigningOut={session.isSigningOut}
      onSignOut={() => {
        void handleSignOut();
      }}
    >
      {assignment && variant && csrf ? (
        <LearnBoard assignment={assignment} variant={variant} csrf={csrf} />
      ) : (
        <p className="learn-status">
          Open the link your teacher shared to start this activity.
        </p>
      )}
    </AppShell>
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
