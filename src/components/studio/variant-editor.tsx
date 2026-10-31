import { ArrowLeft, Pencil, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { variantPurposeLabels } from "@/shared/a2ui-contract";
import { ApprovalState, WarningAcknowledgements } from "./review-shared";
import {
  areValuesFilled,
  variantKindLabels,
  warningsForTarget,
} from "./review-utilities";

import type {
  PublicationEdit,
  ReviewPack,
} from "@/shared/publication-contract";

const replaceAt = (
  values: readonly string[],
  index: number,
  value: string
): string[] =>
  values.map((current, position) => (position === index ? value : current));

const buildEdits = (
  variant: ReviewPack["draft"]["variants"][number],
  sourceLabels: readonly string[],
  targetLabels: readonly string[],
  hint: string,
  feedbackCorrect: string,
  feedbackIncorrect: string
): PublicationEdit[] => {
  const edits: PublicationEdit[] = [];

  for (const [index, item] of variant.sourceItems.entries()) {
    const value = sourceLabels[index]?.trim() ?? "";
    if (value !== item.label) {
      edits.push({ variantId: variant.id, field: "sourceItem", index, value });
    }
  }
  for (const [index, item] of variant.targetItems.entries()) {
    const value = targetLabels[index]?.trim() ?? "";
    if (value !== item.label) {
      edits.push({ variantId: variant.id, field: "targetItem", index, value });
    }
  }
  if (hint.trim() !== variant.hints[0]) {
    edits.push({
      variantId: variant.id,
      field: "hint",
      index: 0,
      value: hint.trim(),
    });
  }
  if (feedbackCorrect.trim() !== variant.feedback.correct) {
    edits.push({
      variantId: variant.id,
      field: "feedbackCorrect",
      value: feedbackCorrect.trim(),
    });
  }
  if (feedbackIncorrect.trim() !== variant.feedback.incorrect) {
    edits.push({
      variantId: variant.id,
      field: "feedbackIncorrect",
      value: feedbackIncorrect.trim(),
    });
  }
  return edits;
};

export const VariantEditor = ({
  review,
  variantId,
  busy,
  onBack,
  onApprove,
  onSave,
}: {
  readonly review: ReviewPack;
  readonly variantId: string;
  readonly busy: boolean;
  readonly onBack: () => void;
  readonly onApprove: (codes: string[]) => void;
  readonly onSave: (edits: PublicationEdit[]) => void;
}) => {
  const variant = review.draft.variants.find(
    (candidate) => candidate.id === variantId
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const [sourceLabels, setSourceLabels] = useState<string[]>(
    () => variant?.sourceItems.map((item) => item.label) ?? []
  );
  const [targetLabels, setTargetLabels] = useState<string[]>(
    () => variant?.targetItems.map((item) => item.label) ?? []
  );
  const [hint, setHint] = useState(variant?.hints[0] ?? "");
  const [feedbackCorrect, setFeedbackCorrect] = useState(
    variant?.feedback.correct ?? ""
  );
  const [feedbackIncorrect, setFeedbackIncorrect] = useState(
    variant?.feedback.incorrect ?? ""
  );
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  if (!variant) {
    return null;
  }

  const index = review.draft.variants.findIndex(
    (candidate) => candidate.id === variant.id
  );
  const warnings = warningsForTarget(
    review.version.findings,
    "variant",
    variant.id
  );
  const approved = review.version.approvals.some((approval) => {
    return (
      approval.targetKind === "variant" && approval.targetId === variant.id
    );
  });
  const acknowledgedSet = new Set(acknowledged);
  const allWarningsAcknowledged = warnings.every((warning) =>
    acknowledgedSet.has(warning.code)
  );
  const valuesAreFilled = areValuesFilled([
    ...sourceLabels,
    ...targetLabels,
    hint,
    feedbackCorrect,
    feedbackIncorrect,
  ]);

  return (
    <section className="review-variant" aria-labelledby="variant-heading">
      <div className="review-variant__topline">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Back to the gallery
        </Button>
        <ApprovalState approved={approved} label={`screen ${variant.id}`} />
      </div>

      <header>
        <p className="studio-kicker">
          {variantPurposeLabels[index] ?? "Screen review"}
        </p>
        <h2 id="variant-heading" ref={heading} tabIndex={-1}>
          {variant.title}
        </h2>
        <p>{variant.instructions}</p>
        <p className="review-variant__meta">
          {variantKindLabels[variant.kind]} · {variant.sourceItems.length}{" "}
          matching pieces · revision {review.version.revision}
        </p>
      </header>

      <div className="review-variant__columns">
        <fieldset className="review-edit-group">
          <legend>Source pieces</legend>
          {variant.sourceItems.map((item, itemIndex) => {
            return (
              <label key={item.id} className="review-edit-field">
                <span>Source {itemIndex + 1}</span>
                <input
                  type="text"
                  aria-label={`Source piece ${itemIndex + 1}`}
                  value={sourceLabels[itemIndex] ?? ""}
                  maxLength={400}
                  onChange={(event) => {
                    setSourceLabels(
                      replaceAt(sourceLabels, itemIndex, event.target.value)
                    );
                  }}
                />
              </label>
            );
          })}
        </fieldset>

        <fieldset className="review-edit-group">
          <legend>Target pieces</legend>
          {variant.targetItems.map((item, itemIndex) => {
            return (
              <label key={item.id} className="review-edit-field">
                <span>Target {itemIndex + 1}</span>
                <input
                  type="text"
                  aria-label={`Target piece ${itemIndex + 1}`}
                  value={targetLabels[itemIndex] ?? ""}
                  maxLength={400}
                  onChange={(event) => {
                    setTargetLabels(
                      replaceAt(targetLabels, itemIndex, event.target.value)
                    );
                  }}
                />
              </label>
            );
          })}
        </fieldset>
      </div>

      <label className="review-edit-field">
        <span>First hint</span>
        <input
          type="text"
          aria-label="First hint"
          value={hint}
          maxLength={400}
          onChange={(event) => setHint(event.target.value)}
        />
      </label>

      <div className="review-variant__columns">
        <label className="review-edit-field">
          <span>Feedback when correct</span>
          <input
            type="text"
            aria-label="Feedback when correct"
            value={feedbackCorrect}
            maxLength={400}
            onChange={(event) => setFeedbackCorrect(event.target.value)}
          />
        </label>
        <label className="review-edit-field">
          <span>Feedback when incorrect</span>
          <input
            type="text"
            aria-label="Feedback when incorrect"
            value={feedbackIncorrect}
            maxLength={400}
            onChange={(event) => setFeedbackIncorrect(event.target.value)}
          />
        </label>
      </div>

      <p className="review-variant__hint">
        <Pencil aria-hidden="true" /> Saving an edit creates a new immutable
        revision and revalidates the whole pack. Every approval starts again.
      </p>

      <div className="review-variant__actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !valuesAreFilled}
          onClick={() => {
            onSave(
              buildEdits(
                variant,
                sourceLabels,
                targetLabels,
                hint,
                feedbackCorrect,
                feedbackIncorrect
              )
            );
          }}
        >
          Save edits and revalidate
        </Button>
      </div>

      <WarningAcknowledgements
        findings={warnings}
        acknowledged={acknowledged}
        onChange={setAcknowledged}
      />

      <div className="review-variant__approve">
        <Button
          type="button"
          disabled={busy || approved || !allWarningsAcknowledged}
          onClick={() => onApprove(acknowledged)}
        >
          <ShieldCheck aria-hidden="true" />
          {approved ? "Screen approved" : "Approve this screen"}
        </Button>
        {allWarningsAcknowledged ? null : (
          <p className="review-variant__hint">
            Acknowledge each warning before approving this screen.
          </p>
        )}
      </div>
    </section>
  );
};
