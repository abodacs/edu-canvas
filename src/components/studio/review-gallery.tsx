import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { LessonPreview } from "@/components/a2ui/lesson-preview";
import { Button } from "@/components/ui/button";
import { variantPurposeLabels } from "@/shared/a2ui-contract";
import { reversePathTargetId } from "@/shared/publication-contract";
import { ApprovalState, WarningAcknowledgements } from "./review-shared";
import {
  targetKey,
  variantKindLabels,
  warningsForTarget,
} from "./review-utilities";

import type { RefObject } from "react";
import type { ReviewPack } from "@/shared/publication-contract";

const reversePathKey = targetKey("reverse-path", reversePathTargetId);

const BlockerList = ({
  blockers,
}: {
  readonly blockers: readonly string[];
}) => {
  const items = blockers.map((blocker) => <li key={blocker}>{blocker}</li>);
  return <ul className="review-blockers">{items}</ul>;
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

  return (
    <>
      <header className="review-gallery__header">
        <p className="studio-kicker">Review and publish</p>
        <h2 id="review-heading" ref={headingRef} tabIndex={-1}>
          Approve every screen before students see the pack
        </h2>
        <p>
          Revision {review.version.revision} ·{" "}
          {review.version.gateVerdict === "pass"
            ? "validation passed"
            : "validation found warnings"}{" "}
          · {review.version.approvals.length} of 5 approvals
        </p>
      </header>

      <LessonPreview
        key={review.version.id}
        requestId={review.requestId}
        previewVersionId={review.version.id}
        catalogVersion={review.provenance.catalogVersion ?? undefined}
      />

      <section className="review-gallery" aria-labelledby="screens-heading">
        <h3 id="screens-heading">Four screens</h3>
        <ul className="review-card-grid">
          {review.draft.variants.map((variant, index) => {
            const isApproved = approvedTargets.has(
              targetKey("variant", variant.id)
            );
            return (
              <li key={variant.id}>
                <article className="review-card">
                  <p className="studio-kicker">
                    {variantPurposeLabels[index] ?? "Screen"}
                  </p>
                  <h4>{variant.title}</h4>
                  <p>{variant.instructions}</p>
                  <dl>
                    <div>
                      <dt>Interaction</dt>
                      <dd>{variantKindLabels[variant.kind]}</dd>
                    </div>
                    <div>
                      <dt>Pieces</dt>
                      <dd>
                        {variant.sourceItems.length} →{" "}
                        {variant.targetItems.length}
                      </dd>
                    </div>
                  </dl>
                  <ApprovalState
                    approved={isApproved}
                    label={`screen ${variant.title}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenVariant(variant.id)}
                  >
                    Review screen <ArrowRight aria-hidden="true" />
                  </Button>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="review-reverse" aria-labelledby="reverse-heading">
        <div className="review-reverse__header">
          <div>
            <h3 id="reverse-heading">Reverse reasoning path</h3>
            <p>{review.learningPath?.rationale}</p>
          </div>
          <ApprovalState
            approved={approvedTargets.has(reversePathKey)}
            label="reverse reasoning path"
          />
        </div>
        <ol>
          {review.learningPath?.steps.map((step) => {
            return (
              <li key={`${step.nodeId}-${step.role}`}>
                <strong>{step.role === "target" ? "Target" : "Before"}</strong>
                <span>{step.label}</span>
                <span>{step.screenPurpose}</span>
              </li>
            );
          })}
        </ol>
        <ReverseApproval
          warnings={reverseWarnings}
          approved={approvedTargets.has(reversePathKey)}
          busy={busy}
          onApprove={onApproveReverse}
        />
      </section>

      <footer className="review-gallery__footer">
        <div>
          <h3>Publish gate</h3>
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
    </>
  );
};
