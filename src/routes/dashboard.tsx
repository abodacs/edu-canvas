/* eslint-disable react-doctor/no-fetch-in-effect, unicorn/try-complexity -- the board fetches once the session hook resolves; each dispatch owns one network call with its own recovery. */
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useReducer } from "react";

import { AccountHeader } from "@/components/auth/account-header";
import { useAuthSession } from "@/components/auth/use-auth-session";
import {
  NeedsYouPanel,
  ProgressEmpty,
  ProgressLoading,
  ProgressMissingRun,
  ProgressPermission,
  ProgressServerError,
  ProgressStale,
  ProgressTable,
  RunDetail,
} from "@/components/dashboard/dashboard-surfaces";
import { teacherProgressResponseSchema } from "@/shared/progress-contract";
import type { TeacherProgressResponse } from "@/shared/progress-contract";
import type { ReactElement } from "react";

/**
A fetch rejection carries no HTTP status; the sentinel stands for the network failure.
*/
const statusNetworkFailure = 0;

type ProgressState =
  | { readonly phase: "loading" }
  | {
      readonly phase: "ready";
      readonly data: TeacherProgressResponse;
      readonly stale: boolean;
      readonly checking: boolean;
    }
  | { readonly phase: "error"; readonly status: number };

type ProgressAction =
  | { readonly type: "refresh" }
  | { readonly type: "loaded"; readonly data: TeacherProgressResponse }
  | { readonly type: "failed"; readonly status: number };

/**
The refresh compares the stored run revisions it knew with the ones it received. Any change — a new attempt, a new run, a new decision — turns the stale marker on; the record itself is never rewritten by this view.
*/
const hasNewActivity = (
  previous: TeacherProgressResponse,
  next: TeacherProgressResponse
): boolean => {
  const before = new Map(previous.runs.map((run) => [run.runId, run.revision]));
  return (
    next.runs.some((run) => before.get(run.runId) !== run.revision) ||
    next.runs.length !== previous.runs.length
  );
};

const progressReducer = (
  state: ProgressState,
  action: ProgressAction
): ProgressState => {
  switch (action.type) {
    case "refresh": {
      return state.phase === "ready"
        ? { ...state, checking: true }
        : { phase: "loading" };
    }
    case "loaded": {
      const isStale =
        state.phase === "ready" && hasNewActivity(state.data, action.data);
      return {
        phase: "ready",
        data: action.data,
        stale: isStale,
        checking: false,
      };
    }
    case "failed": {
      return { phase: "error", status: action.status };
    }
    default: {
      return state;
    }
  }
};

const DashboardBoard = ({
  selectedRunId,
  onOpenRun,
}: {
  readonly selectedRunId: string | null;
  readonly onOpenRun: (runId: string) => void;
}): ReactElement => {
  const [state, dispatch] = useReducer(progressReducer, {
    phase: "loading",
  });

  const refresh = async (): Promise<void> => {
    dispatch({ type: "refresh" });
    try {
      const response = await fetch("/api/teacher/progress");
      if (!response.ok) {
        dispatch({ type: "failed", status: response.status });
        return;
      }
      dispatch({
        type: "loaded",
        data: teacherProgressResponseSchema.parse(await response.json()),
      });
    } catch {
      dispatch({ type: "failed", status: statusNetworkFailure });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (state.phase === "error") {
    return state.status === 401 || state.status === 403 ? (
      <ProgressPermission
        actions={
          <Link className="text-link" to="/login">
            Sign in
          </Link>
        }
      />
    ) : (
      <ProgressServerError
        onRetry={() => {
          void refresh();
        }}
      />
    );
  }
  if (state.phase === "loading") {
    return <ProgressLoading />;
  }

  const { runs } = state.data;
  const selected = runs.find((run) => run.runId === selectedRunId) ?? null;

  return (
    <>
      <p className="progress-asof">
        Results as of {state.data.fetchedAt}.{" "}
        <button
          className="progress-refresh"
          type="button"
          disabled={state.checking}
          onClick={() => {
            void refresh();
          }}
        >
          {state.checking ? "Checking for new results…" : "Refresh"}
        </button>
      </p>
      {state.stale ? <ProgressStale /> : null}
      {selectedRunId !== null && selected === null ? (
        <ProgressMissingRun />
      ) : null}
      {selected === null ? (
        <NeedsYouPanel
          runs={runs}
          onOpen={(runId) => {
            onOpenRun(runId);
          }}
        />
      ) : null}
      {runs.length === 0 ? <ProgressEmpty /> : null}
      {selected === null && runs.length > 0 ? (
        <ProgressTable
          runs={runs}
          onOpen={(runId) => {
            onOpenRun(runId);
          }}
        />
      ) : null}
      {selected ? <RunDetail run={selected} /> : null}
    </>
  );
};

const DashboardPage = (): ReactElement => {
  const { run = null } = Route.useSearch();
  const navigate = Route.useNavigate();
  const session = useAuthSession();

  if (session.phase === "loading") {
    return (
      <main className="app-shell app-shell--teacher">
        <div className="page-frame page-frame--teacher">
          <ProgressLoading />
        </div>
      </main>
    );
  }
  if (session.phase === "unauthenticated" || !session.projection) {
    return <Navigate to="/login" replace />;
  }

  const { projection } = session;
  if (projection.actor.role !== "teacher") {
    return (
      <main className="app-shell app-shell--teacher">
        <div className="page-frame page-frame--teacher">
          <ProgressPermission
            actions={
              <Link className="text-link" to="/login">
                Sign in
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--teacher">
      <a className="skip-link" href="#dashboard-content">
        Skip to content
      </a>
      <div className="page-frame page-frame--teacher">
        <AccountHeader
          displayName={projection.actor.displayName}
          tenantName={projection.actor.tenantName}
          roleLabel="Teacher"
          isSigningOut={session.isSigningOut}
          onSignOut={() => {
            void session.signOut();
          }}
        />
        <div id="dashboard-content" className="workspace-content">
          <h1>Your lessons</h1>
          <p className="progress-lede">
            Start with what needs you. Everything else is below.
          </p>
          <nav className="progress-nav" aria-label="Workspace">
            <Link className="text-link" to="/workspace">
              Open the lesson studio
            </Link>
          </nav>
          <DashboardBoard
            selectedRunId={run}
            onOpenRun={(runId) => {
              void navigate({ search: { run: runId } });
            }}
          />
        </div>
      </div>
    </main>
  );
};

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { run?: string } => {
    return typeof search.run === "string" && search.run.length > 0
      ? { run: search.run }
      : {};
  },
  head: () => ({ meta: [{ title: "Lesson results | Scholé" }] }),
  component: DashboardPage,
});
