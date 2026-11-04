import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { LessonPreview } from "@/components/a2ui/lesson-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { variantPurposeLabels } from "@/shared/a2ui-contract";
import { reversePathTargetId } from "@/shared/publication-contract";
import { ApprovalState, WarningAcknowledgements } from "./review-shared";
import {
  targetKey,
  variantKindLabels,
  warningsForTarget,
} from "./review-utilities";

import type { RefObject } from "react";
import type { BadgeTone } from "@/components/ui/badge";
import type { ReviewPack } from "@/shared/publication-contract";

const reversePathKey = targetKey("reverse-path", reversePathTargetId);

const learnerStateByKind = {
  standard: "Ready for the core idea",
  scaffold: "Needs a guided step",
  challenge: "Ready to stretch",
} as const;

const BlockerList = ({
  blockers,
}: {
  readonly blockers: readonly string[];
}) => {
  const items = blockers.map((blocker) => <li key={blocker}>{blocker}</li>);
  return <ul className="review-blockers">{items}</ul>;
};

const screenStatus = (
  approved: boolean,
  blocked: boolean,
  warningCount: number
): { readonly tone: BadgeTone; readonly label: string } => {
  if (approved) {
    return { tone: "ok", label: "Approved" };
  }
  if (blocked) {
    return { tone: "stop", label: "Blocked" };
  }
  if (warningCount > 0) {
    return {
      tone: "warn",
      label: `${warningCount} warning${warningCount === 1 ? "" : "s"}`,
    };
  }
  return { tone: "idle", label: "Not approved" };
};

/* eslint-disable unicorn/prefer-default-parameters -- All four props are required; the rule misreads the single object parameter. */
const ReverseApproval = ({
  warnings,
  approved,
  busy,
  onApprove,
}: {
  readonly warnings: ReturnType<typeof warningsForTarget>;
  readonly approved: boolean;
  readonly busy: boolean;
  readonly onApprove: (codes: string[]) => void;
}) => {
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const acknowledgedSet = new Set(acknowledged);
  const allAcknowledged = warnings.every((warning) =>
    acknowledgedSet.has(warning.code)
  );

  return (
    <div className="review-reverse__approval">
      <WarningAcknowledgements
        findings={warnings}
        acknowledged={acknowledged}
        onChange={setAcknowledged}
      />
      <Button
        type="button"
        disabled={busy || approved || !allAcknowledged}
        onClick={() => onApprove(acknowledged)}
      >
        <ShieldCheck aria-hidden="true" />
        {approved ? "Reverse path approved" : "Approve the reverse path"}
      </Button>
    </div>
  );
};
/* eslint-enable unicorn/prefer-default-parameters */

export const ReviewGallery = ({
  review,
  busy,
  headingRef,
  onOpenVariant,
  onApproveReverse,
  onContinue,
}: {
  readonly review: ReviewPack;
  readonly busy: boolean;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onOpenVariant: (variantId: string) => void;
  readonly onApproveReverse: (codes: string[]) => void;
  readonly onContinue: () => void;
}) => {
  const approvedTargets = new Set(
    review.version.approvals.map((approval) =>
      targetKey(approval.targetKind, approval.targetId)
    )
  );
  const reverseWarnings = warningsForTarget(
    review.version.findings,
    "reverse-path",
    reversePathTargetId
  );
  const missingApprovalCount = review.publishBlockers.filter((blocker) =>
    blocker.startsWith("MISSING_")
  ).length;
  const totalApprovals = review.draft.variants.length + 1;
  const approvedCount = review.version.approvals.length;

  return (
    <div className="review-gallery">
      <header className="review-gallery__header">
        <div>
          <p className="kicker">Review and publish</p>
          <h1 id="review-heading" ref={headingRef} tabIndex={-1}>
            Approve every screen before students see the pack
          </h1>
        </div>
        <p>
          Approve only the screens you&apos;d use. Each learner gets one when
          you publish.
        </p>
      </header>

      <p className="review-gallery__count">
        <Badge tone={approvedCount === totalApprovals ? "ok" : "idle"}>
          {`${approvedCount} of ${totalApprovals} approvals`}
        </Badge>
        <span>
          Revision {review.version.revision} ·{" "}
          {review.version.gateVerdict === "pass"
            ? "validation passed"
            : "validation found warnings"}
          {review.provenance.editedAt ? " · edited" : ""}
        </span>
      </p>

      <ol className="review-rail" aria-label="Screens to review">
        {review.draft.variants.map((variant, index) => {
          const isApproved = approvedTargets.has(
            targetKey("variant", variant.id)
          );
          const warnings = warningsForTarget(
            review.version.findings,
            "variant",
            variant.id
          );
          const isBlocked = review.version.findings.some(
            (finding) =>
              finding.verdict === "hard_block" &&
              (!finding.variantId || finding.variantId === variant.id)
          );
          const status = screenStatus(isApproved, isBlocked, warnings.length);
          const purpose = variantPurposeLabels[index] ?? "Screen";

          return (
            <li key={variant.id}>
              <button
                type="button"
                className="review-rail__item"
                onClick={() => onOpenVariant(variant.id)}
              >
                <span className="review-rail__purpose">{purpose}</span>
                <span className="review-rail__title">{variant.title}</span>
                <span className="review-rail__meta">
                  {variantKindLabels[variant.kind]} ·{" "}
                  {learnerStateByKind[variant.kind]} ·{" "}
                  {variant.sourceItems.length} → {variant.targetItems.length}{" "}
                  pieces
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="sr-only">Review this screen</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="review-workbench">
        <div className="review-workbench__main">
          <h2 className="review-sr-heading sr-only">Lesson preview</h2>
          <LessonPreview
            key={review.version.id}
            requestId={review.requestId}
            previewVersionId={review.version.id}
            catalogVersion={review.provenance.catalogVersion ?? undefined}
          />
        </div>

        <aside
          className="review-workbench__side"
          aria-label="Evidence for this revision"
        >
          <Card className="review-evidence">
            <h2>Where this comes from</h2>
            <p>
              The standard and validation evidence attached to this revision.
            </p>
            <div className="review-evidence__standard">
              <span className="review-evidence__code">
                {review.draft.standardId}
              </span>
              <span>
                {review.provenance.catalogVersion ?? "No catalog pinned"}
              </span>
            </div>
            {review.version.findings.length > 0 ? (
              <ul className="review-evidence__list">
                {review.version.findings.map((finding) => {
                  return (
                    <li
                      className="review-evidence__finding"
                      key={`${finding.code}-${finding.variantId ?? "flow"}-${finding.field}`}
                    >
                      <Badge
                        tone={
                          finding.verdict === "hard_block" ? "stop" : "warn"
                        }
                      >
                        {finding.code}
                      </Badge>
                      <span>{finding.reason}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No warnings or blocks on this revision.</p>
            )}
            <details className="review-evidence__details">
              <summary>Generation record</summary>
              <dl>
                <div>
                  <dt>Provider</dt>
                  <dd>{review.provenance.provider}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{review.provenance.model}</dd>
                </div>
                <div>
                  <dt>Source snapshot</dt>
                  <dd>{review.provenance.sourceSnapshotId ?? "None cited"}</dd>
                </div>
              </dl>
            </details>
          </Card>

          <Card className="review-reverse">
            <div className="review-reverse__header">
              <div>
                <h2>Reverse reasoning path</h2>
                <p>
                  {review.learningPath?.rationale ??
                    "No learning path is attached to this revision."}
                </p>
              </div>
              <ApprovalState
                approved={approvedTargets.has(reversePathKey)}
                label="reverse reasoning path"
              />
            </div>
            {review.learningPath ? (
              <>
                <ol className="review-path">
                  {review.learningPath.steps.map((step) => {
                    return (
                      <li
                        data-role={step.role}
                        key={`${step.nodeId}-${step.role}`}
                      >
                        <span className="review-path__dot" aria-hidden="true" />
                        <span className="review-path__copy">
                          <span className="review-path__role">
                            {step.role === "target" ? "Target" : "Before"}
                          </span>
                          <strong>{step.label}</strong>
                          <span className="review-path__purpose">
                            {step.screenPurpose}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="review-reverse__next">
                  {review.learningPath.nextScreenRationale}
                </p>
              </>
            ) : null}
            <ReverseApproval
              warnings={reverseWarnings}
              approved={approvedTargets.has(reversePathKey)}
              busy={busy}
              onApprove={onApproveReverse}
            />
          </Card>
        </aside>
      </div>

      <footer className="review-gallery__footer">
        <div>
          <h2>Publish gate</h2>
          <p>
            {review.canPublish
              ? "Every screen and the reverse path are approved on this revision."
              : `${missingApprovalCount} approvals and warning acknowledgements are still needed.`}
          </p>
          {review.publishBlockers.length > 0 ? (
            <BlockerList blockers={review.publishBlockers} />
          ) : null}
        </div>
        <Button
          type="button"
          disabled={!review.canPublish || busy}
          onClick={onContinue}
        >
          Continue to publish <ArrowRight aria-hidden="true" />
        </Button>
      </footer>
    </div>
  );
};
