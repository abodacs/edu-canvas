import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { PublicationClientError } from "@/lib/publication-client";
import type { PublicationFinding } from "@/shared/publication-contract";

export const ErrorPanel = ({
  error,
  onDismiss,
}: {
  readonly error: PublicationClientError;
  readonly onDismiss: () => void;
}) => {
  return (
    <section
      className="review-error"
      role="alert"
      aria-labelledby="review-error-heading"
    >
      <div className="review-error__heading">
        <div>
          <h3 id="review-error-heading">That step did not go through</h3>
          <p>{error.message}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label="Dismiss the error"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {error.findings.length > 0 ? (
        <ul>
          {error.findings.map((finding) => {
            return (
              <li key={`${finding.code}-${finding.variantId ?? "flow"}`}>
                <strong>{finding.code}</strong>
                <span>{finding.reason}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error.detail ? (
        <p className="review-error__detail">{error.detail}</p>
      ) : null}
    </section>
  );
};

export const ApprovalState = ({
  approved,
  label,
}: {
  readonly approved: boolean;
  readonly label: string;
}) => {
  return (
    <span
      className={
        approved
          ? "review-approval review-approval--approved"
          : "review-approval"
      }
    >
      {approved ? <Check aria-hidden="true" /> : null}
      {approved ? "Approved" : "Not approved"}
      <span className="sr-only"> {label}</span>
    </span>
  );
};

export const WarningAcknowledgements = ({
  findings,
  acknowledged,
  onChange,
}: {
  readonly findings: readonly PublicationFinding[];
  readonly acknowledged: readonly string[];
  readonly onChange: (codes: string[]) => void;
}) => {
  if (findings.length === 0) {
    return null;
  }
  const acknowledgedSet = new Set(acknowledged);

  return (
    <fieldset className="review-warnings">
      <legend>Warnings you must acknowledge</legend>
      {findings.map((finding) => {
        const isChecked = acknowledgedSet.has(finding.code);
        return (
          <label key={finding.code} className="review-warning">
            <input
              type="checkbox"
              aria-label={`Acknowledge warning ${finding.code}`}
              checked={isChecked}
              onChange={() => {
                const next = new Set(acknowledgedSet);
                if (isChecked) {
                  next.delete(finding.code);
                } else {
                  next.add(finding.code);
                }
                onChange([...next]);
              }}
            />
            <span>
              <strong>{finding.code}</strong>
              {finding.reason}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};
