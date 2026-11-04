import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";

import { purposeLabel, stageStatus } from "./purpose-copy";
import type { ProgressAttempt, ProgressRun } from "@/shared/progress-contract";
import type { ReactNode } from "react";

/**
 * #8 teacher progress surfaces. Evidence-first and read-only: every string is
 * either stored server data rendered verbatim (the decision reason) or a fixed
 * local template. Nothing here recomputes, rewrites, or classifies a result,
 * and every screen labels the view observational, never a mastery diagnosis.
 */

export const ProvisionalNotice = () => {
  return (
    <p className="progress-provisional" role="note">
      Observational evidence from stored learner work. This is not a mastery
      diagnosis.
    </p>
  );
};

export const ProgressLoading = () => {
  return (
    <section className="progress-state" aria-labelledby="progress-loading-h">
      <h1 id="progress-loading-h">Lesson results</h1>
      <p>Loading results…</p>
    </section>
  );
};

export const ProgressEmpty = () => {
  return (
    <section className="progress-state" aria-labelledby="progress-empty-h">
      <h1 id="progress-empty-h">No learner results yet</h1>
      <p>
        Results appear here after a learner opens an assigned lesson and
        submits. Nothing is shown until then.
      </p>
    </section>
  );
};

export const ProgressPermission = ({
  actions = null,
}: {
  readonly actions?: ReactNode;
}) => {
  return (
    <section className="progress-state" aria-labelledby="progress-permission-h">
      <h1 id="progress-permission-h">Teacher sign-in required</h1>
      <p>
        Lesson results open for teacher accounts. Results from other tenants and
        other teachers stay hidden.
      </p>
      {actions}
    </section>
  );
};

export const ProgressMissingRun = ({
  actions = null,
}: {
  readonly actions?: ReactNode;
}) => {
  return (
    <section className="progress-state" aria-labelledby="progress-missing-h">
      <h1 id="progress-missing-h">This result is not on your roster</h1>
      <p>
        The lesson or learner was not assigned by you, or the link is out of
        date. Your own assigned results are in the list below.
      </p>
      {actions}
    </section>
  );
};

export const ProgressServerError = ({
  onRetry,
}: {
  readonly onRetry: () => void;
}) => {
  return (
    <section className="progress-state" aria-labelledby="progress-error-h">
      <h1 id="progress-error-h">Results are unavailable right now</h1>
      <p>
        The server could not read the stored results. Nothing was changed. Try
        again.
      </p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
};

export const ProgressStale = () => {
  return (
    <Notice tone="info">
      New learner activity since you opened this page. The list below is the
      current record; history never changes.
    </Notice>
  );
};

const assistedCopy = (attempt: ProgressAttempt): string => {
  return attempt.assistanceState === "hinted" ||
    attempt.assistanceEventIds.length > 0
    ? "with help"
    : "on their own";
};

/**
The needs-you panel: the runs whose stored decision routed the learner to another supported example. Only stored decisions appear here; the panel owns the routing filter so callers cannot mislabel a run.
*/
export const NeedsYouPanel = ({
  runs,
  onOpen,
}: {
  readonly runs: readonly ProgressRun[];
  readonly onOpen: (runId: string) => void;
}) => {
  const needsYou = runs.filter(
    (run) => run.decision !== null && run.decision.purpose === "scaffold"
  );
  if (needsYou.length === 0) {
    return null;
  }
  return (
    <section className="progress-needs" aria-labelledby="progress-needs-h">
      <h2 id="progress-needs-h" className="progress-section-h">
        Needs you · {needsYou.length}
      </h2>
      <ul className="progress-needs-list">
        {needsYou.map((run) => {
          return (
            <li key={run.runId}>
              <div>
                <b>Learner {run.learnerId}</b>
                <span>{run.decision?.reason ?? ""}</span>
              </div>
              <Button
                className="progress-open"
                variant="secondary"
                type="button"
                onClick={() => {
                  onOpen(run.runId);
                }}
              >
                See results
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export const ProgressTable = ({
  runs,
  onOpen,
}: {
  readonly runs: readonly ProgressRun[];
  readonly onOpen: (runId: string) => void;
}) => {
  return (
    <section className="progress-results" aria-labelledby="progress-table-h">
      <h2 id="progress-table-h" className="progress-section-h">
        All results
      </h2>
      <Card className="progress-table-card">
        <table className="progress-table">
          <thead>
            <tr>
              <th scope="col">Learner</th>
              <th scope="col">Status</th>
              <th scope="col">Results so far</th>
              <th scope="col">Next step</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const first = run.attempts[0] ?? null;
              const latest = run.attempts.at(-1) ?? null;
              const status = stageStatus(run.stage);
              const attemptWord =
                run.attempts.length === 1 ? "attempt" : "attempts";
              return (
                <tr key={run.runId}>
                  <td className="progress-learner" data-label="Learner">
                    Learner {run.learnerId}
                  </td>
                  <td data-label="Status">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {first ? (
                      <span className="progress-meta">
                        First response: {first.correctness}
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Results so far">
                    {latest
                      ? `${run.attempts.length} ${attemptWord} · latest score ${latest.score}`
                      : "Not started"}
                  </td>
                  <td className="progress-next" data-label="Next step">
                    {run.decision === null
                      ? "Waiting for evidence"
                      : purposeLabel(run.decision.purpose)}
                  </td>
                  <td className="progress-action">
                    <Button
                      className="progress-open"
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        onOpen(run.runId);
                      }}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
};

const AttemptRow = ({ attempt }: { readonly attempt: ProgressAttempt }) => {
  return (
    <li className="progress-attempt" data-ordinal={attempt.ordinal}>
      <span>
        {attempt.ordinal === 1
          ? "First response"
          : `Retry ${attempt.ordinal - 1}`}
      </span>
      <span>
        Item {attempt.itemId} scored {attempt.score} ({attempt.correctness},{" "}
        {assistedCopy(attempt)})
      </span>
    </li>
  );
};

/**
The per-run detail: attempts in order (first response, assistance, retries
kept distinct), then the stored decision with its rule version and evidence
hash, then the read-only preview of the assigned approved screen.
*/
export const RunDetail = ({ run }: { readonly run: ProgressRun }) => {
  return (
    <Card
      as="section"
      className="progress-detail"
      aria-labelledby="progress-detail-h"
    >
      <h2 id="progress-detail-h" className="progress-section-h">
        Results for learner {run.learnerId}
      </h2>
      <ProvisionalNotice />

      <h3>Attempts</h3>
      {run.attempts.length === 0 ? (
        <p>No attempt is recorded yet.</p>
      ) : (
        <ul className="progress-attempts">
          {/* eslint-disable-next-line unicorn/consistent-arrow-return-style -- prettier keeps the single-statement body multiline; the rule and the formatter disagree about this shape. */}
          {run.attempts.map((attempt) => (
            <AttemptRow key={attempt.attemptId} attempt={attempt} />
          ))}
        </ul>
      )}

      <h3>Why this next activity</h3>
      {run.decision === null ? (
        <p>
          No decision is stored yet. The server records one with the first
          submission.
        </p>
      ) : (
        <div className="progress-decision">
          <p className="progress-purpose">
            {purposeLabel(run.decision.purpose)}
          </p>
          <p className="progress-reason">{run.decision.reason}</p>
          <p className="progress-provenance">
            <output>
              Rule {run.decision.ruleVersion} · evidence{" "}
              {run.decision.evidenceHash}
            </output>
          </p>
        </div>
      )}

      <h3>Assigned screen preview</h3>
      {run.preview === null ? (
        <p>The approved screen for this run is not available to preview.</p>
      ) : (
        <details className="progress-preview">
          <summary>Open a read-only preview of the approved screen</summary>
          <p className="progress-preview-title">{run.preview.section.title}</p>
          <p>{run.preview.section.body}</p>
          {run.preview.columns === null ? null : (
            <p className="progress-preview-columns">
              {run.preview.columns.sourceLabel} to{" "}
              {run.preview.columns.targetLabel}
            </p>
          )}
          <ul className="progress-preview-items">
            {/* eslint-disable-next-line unicorn/consistent-arrow-return-style -- prettier keeps the single-statement body multiline; the rule and the formatter disagree about this shape. */}
            {run.preview.section.items?.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
};
