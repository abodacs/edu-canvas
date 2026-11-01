import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { variantPurposeLabels } from "@/shared/a2ui-contract";
import { variantKindLabels } from "./review-utilities";

import type { ReviewPack } from "@/shared/publication-contract";

export interface PublishedSummary {
  readonly publicationId: string;
  readonly assignmentId: string;
  readonly learnerName: string;
  readonly learnerAssignmentId: string | null;
  readonly learnerVariantId: string | null;
}

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

  useEffect(() => {
    heading.current?.focus();
  }, []);

  if (published) {
    return (
      <section className="review-published" aria-labelledby="published-heading">
        <Check aria-hidden="true" className="review-published__mark" />
        <h2 id="published-heading" ref={heading} tabIndex={-1}>
          The pack is published and assigned
        </h2>
        <p>
          {published.learnerName} now has the reviewed pack. The published
          version cannot change; a later edit starts a new revision.
        </p>
        <dl>
          <div>
            <dt>Publication</dt>
            <dd>{published.publicationId}</dd>
          </div>
          <div>
            <dt>Assignment</dt>
            <dd>{published.assignmentId}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{review.version.revision}</dd>
          </div>
          {published.learnerAssignmentId && published.learnerVariantId ? (
            <div>
              <dt>Learner link</dt>
              <dd>
                <a
                  href={`/learn?assignment=${published.learnerAssignmentId}&variant=${published.learnerVariantId}`}
                >
                  Open the learner activity
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        <Button type="button" onClick={onClose}>
          Back to the studio <ArrowRight aria-hidden="true" />
        </Button>
      </section>
    );
  }

  return (
    <section className="review-confirm" aria-labelledby="confirm-heading">
      <div className="review-variant__topline">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Back to the gallery
        </Button>
      </div>
      <header>
        <p className="studio-kicker">Publish confirmation</p>
        <h2 id="confirm-heading" ref={heading} tabIndex={-1}>
          Publish this exact revision
        </h2>
        <p>
          Revision {review.version.revision} · artifact{" "}
          <code>{review.version.artifactHash.slice(0, 12)}</code> · validation{" "}
          {review.version.gateVerdict}
        </p>
      </header>

      <h3>Approved screen sequence</h3>
      <ol className="review-confirm__sequence">
        {review.draft.variants.map((variant, index) => {
          return (
            <li key={variant.id}>
              <strong>{variantPurposeLabels[index] ?? "Screen"}</strong>
              <span>{variant.title}</span>
              <span>{variantKindLabels[variant.kind]}</span>
            </li>
          );
        })}
        <li>
          <strong>Reverse reasoning path</strong>
          <span>{review.learningPath?.rationale ?? "Approved path"}</span>
          <span>{review.learningPath?.steps.length ?? 0} steps</span>
        </li>
      </ol>

      <label className="review-edit-field">
        <span>Assign to learner</span>
        <select
          aria-label="Assign to learner"
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
      </label>

      <div className="review-confirm__actions">
        <Button
          type="button"
          disabled={busy || !review.canPublish || !learnerId}
          onClick={() => onPublish(learnerId)}
        >
          <ShieldCheck aria-hidden="true" /> Publish and assign
        </Button>
        <p>
          Publishing writes one immutable publication and one assignment. A
          second click returns the same records.
        </p>
      </div>
    </section>
  );
};
