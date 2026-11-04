import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { variantPurposeLabels } from "@/shared/a2ui-contract";
import { reversePathTargetId } from "@/shared/publication-contract";
import { targetKey, variantKindLabels } from "./review-utilities";

import type { RefObject } from "react";
import type { ReviewPack } from "@/shared/publication-contract";

export interface PublishedSummary {
  readonly publicationId: string;
  readonly assignmentId: string;
  readonly learnerName: string;
  readonly learnerAssignmentId: string | null;
  readonly learnerVariantId: string | null;
}

interface RowStatus {
  readonly tone: "warn" | "stop";
  readonly label: string;
}

const rowStatus = (approved: boolean, blocked: boolean): RowStatus | null => {
  if (blocked) {
    return { tone: "stop", label: "Not available" };
  }
  return approved ? null : { tone: "warn", label: "Not approved" };
};

const PublishedOutcome = ({
  review,
  published,
  headingRef,
  onClose,
}: {
  readonly review: ReviewPack;
  readonly published: PublishedSummary;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onClose: () => void;
}) => {
  // A publish that cites no reviewed source has no canonical record to assign,
  // so it produces no learner activity. The heading and the link both read one
  // value, so they cannot disagree about whether there is something to open.
  const { learnerAssignmentId, learnerVariantId } = published;
  const learnerLink =
    learnerAssignmentId && learnerVariantId
      ? { assignment: learnerAssignmentId, variant: learnerVariantId }
      : null;
  const assignedIndex = Math.max(
    review.draft.variants.findIndex(
      (variant) => variant.id === learnerVariantId
    ),
    0
  );
  const assignedVariant = review.draft.variants[assignedIndex];

  return (
    <section className="publish-published" aria-labelledby="published-heading">
      <Badge tone={learnerLink ? "ok" : "idle"}>
        {learnerLink ? "Published and assigned" : "Published"}
      </Badge>
      <h2 id="published-heading" ref={headingRef} tabIndex={-1}>
        {learnerLink
          ? "The pack is published and assigned"
          : "The pack is published"}
      </h2>
      {learnerLink ? (
        <p className="publish-published__lede">
          {published.learnerName} now has the reviewed pack. The published
          version cannot change; a later edit starts a new revision.
        </p>
      ) : (
        <p className="publish-published__lede">
          {`The reviewed pack is stored for ${published.learnerName}, but this review cites no source material, so the learner runtime has no activity to open. Generate the next draft from a source, then publish it to create the learner link.`}
        </p>
      )}

      {learnerLink && assignedVariant ? (
        <ul
          className="publish-published__groups"
          aria-label="What the learner opens"
        >
          <li className="publish-published__group">
            <strong>
              {variantPurposeLabels[assignedIndex] ?? "Screen"} ·{" "}
              {assignedVariant.title}
            </strong>
            <span>{published.learnerName}</span>
          </li>
        </ul>
      ) : null}

      <dl className="publish-published__records">
        <div>
          <dt>Publication</dt>
          <dd>{published.publicationId}</dd>
        </div>
        <div>
          <dt>Pack assignment</dt>
          <dd>{published.assignmentId}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{review.version.revision}</dd>
        </div>
      </dl>

      <div className="publish-published__actions">
        <Button type="button" variant="secondary" onClick={onClose}>
          Back to the studio
        </Button>
        {learnerLink ? (
          <a
            className="text-link"
            href={`/learn?assignment=${learnerLink.assignment}&variant=${learnerLink.variant}`}
          >
            Open the learner activity <ArrowRight aria-hidden="true" />
          </a>
        ) : null}
      </div>

      <p className="publish-published__note">
        The published version cannot change; a later edit starts a new revision.
      </p>
    </section>
  );
};

export const PublishConfirmation = ({
  review,
  busy,
  published,
  onBack,
  onPublish,
  onClose,
}: {
  readonly review: ReviewPack;
  readonly busy: boolean;
  readonly published: PublishedSummary | null;
  readonly onBack: () => void;
  readonly onPublish: (learnerId: string) => void;
  readonly onClose: () => void;
}) => {
  const [learnerId, setLearnerId] = useState(
    review.availableLearners[0]?.id ?? ""
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const learnerSelectId = useId();
  const summaryId = useId();

  useEffect(() => {
    heading.current?.focus();
  }, [published]);

  if (published) {
    return (
      <PublishedOutcome
        review={review}
        published={published}
        headingRef={heading}
        onClose={onClose}
      />
    );
  }

  const learnerName =
    review.availableLearners.find((learner) => learner.id === learnerId)
      ?.displayName ?? learnerId;
  const approvedTargets = new Set(
    review.version.approvals.map((approval) =>
      targetKey(approval.targetKind, approval.targetId)
    )
  );
  const reverseApproved = approvedTargets.has(
    targetKey("reverse-path", reversePathTargetId)
  );

  return (
    <section className="publish-confirm" aria-labelledby="confirm-heading">
      <div className="publish-confirm__topline">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Back to the gallery
        </Button>
      </div>

      <header className="publish-confirm__header">
        <h2 id="confirm-heading" ref={heading} tabIndex={-1}>
          Publish this exact revision
        </h2>
        <p className="publish-confirm__meta">
          Revision {review.version.revision} · artifact{" "}
          <span className="publish-confirm__hash">
            {review.version.artifactHash.slice(0, 12)}
          </span>{" "}
          · validation {review.version.gateVerdict}
        </p>
      </header>

      <section
        className="publish-confirm__section"
        aria-labelledby="publish-sequence-heading"
      >
        <h3
          id="publish-sequence-heading"
          className="publish-confirm__section-title"
        >
          Approved screen sequence
        </h3>
        <ul className="publish-sequence">
          {review.draft.variants.map((variant, index) => {
            const blocked = review.version.findings.some(
              (finding) =>
                finding.variantId === variant.id &&
                finding.verdict === "hard_block"
            );
            const status = rowStatus(
              approvedTargets.has(targetKey("variant", variant.id)),
              blocked
            );

            return (
              <li className="publish-sequence__row" key={variant.id}>
                <span className="publish-sequence__copy">
                  <strong>{variantPurposeLabels[index] ?? "Screen"}</strong>
                  <span>
                    {variant.title} · {variantKindLabels[variant.kind]} ·{" "}
                    {variant.sourceItems.length} → {variant.targetItems.length}{" "}
                    pieces
                  </span>
                </span>
                {status ? (
                  <Badge tone={status.tone}>{status.label}</Badge>
                ) : null}
              </li>
            );
          })}
          <li className="publish-sequence__row">
            <span className="publish-sequence__copy">
              <strong>Reverse reasoning path</strong>
              <span>
                {review.learningPath?.rationale ?? "Approved path"} ·{" "}
                {review.learningPath?.steps.length ?? 0} steps
              </span>
            </span>
            {reverseApproved ? null : <Badge tone="warn">Not approved</Badge>}
          </li>
        </ul>
      </section>

      <div className="publish-confirm__assign">
        <label htmlFor={learnerSelectId}>Assign to learner</label>
        <select
          id={learnerSelectId}
          value={learnerId}
          onChange={(event) => setLearnerId(event.target.value)}
        >
          {review.availableLearners.map((learner) => {
            return (
              <option key={learner.id} value={learner.id}>
                {learner.displayName}
              </option>
            );
          })}
        </select>
      </div>

      <p className="publish-confirm__summary" id={summaryId}>
        <strong>
          You&apos;re about to publish revision {review.version.revision} to{" "}
          {learnerName || "the selected learner"}.
        </strong>{" "}
        They open{" "}
        {review.draft.variants[0]
          ? `${variantPurposeLabels[0] ?? "Screen"} · ${review.draft.variants[0].title}`
          : "the reviewed pack"}{" "}
        as their next activity.
      </p>

      {review.publishBlockers.length > 0 ? (
        <div className="publish-confirm__blockers">
          <strong>Publishing is blocked until these are resolved</strong>
          <ul aria-label="Publish blockers">
            {review.publishBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="publish-confirm__footer">
        <p>
          Publishing writes one immutable publication and one assignment. A
          second click returns the same records.
        </p>
        <Button
          type="button"
          aria-describedby={summaryId}
          disabled={busy || !review.canPublish || !learnerId}
          onClick={() => onPublish(learnerId)}
        >
          <ShieldCheck aria-hidden="true" /> Publish and assign
        </Button>
      </div>
    </section>
  );
};
