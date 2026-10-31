import { useEffect, useRef } from "react";

import type {
  LessonLanguage,
  PublicDiagnosticsRollup,
  PublicGenerationDiagnostic,
  RecoveryAction,
} from "@/shared/generation-contract";

type RecoveryScope = "screen" | "flow";

/**
 * The label states what the control does. Both regenerate actions request a new generation; they never claim to replace a single screen.
 */
const recoveryLabel = (recovery: RecoveryAction): string => {
  switch (recovery) {
    case "edit": {
      return "Edit this lesson";
    }
    case "replace": {
      return "Regenerate this lesson";
    }
    case "retry": {
      return "Try again";
    }
    default: {
      const exhaustive: never = recovery;
      throw new Error(`Unhandled recovery action: ${exhaustive}`);
    }
  }
};

const findingKey = (
  finding: PublicGenerationDiagnostic,
  scope: RecoveryScope
): string => {
  return [
    scope,
    finding.code,
    finding.field ?? "draft",
    finding.variantId ?? "",
    finding.nodeId ?? "",
    finding.message,
  ].join("|");
};

const screenLabel = (variantId: string, index: number): string => {
  const suffix = variantId.split("-").at(-1) ?? "";
  return /^\d+$/u.test(suffix) ? `Screen ${suffix}` : `Screen ${index + 1}`;
};

const fieldLabel = (field: string | undefined): string | undefined => {
  if (!field) {
    return undefined;
  }
  const segment = field.split(".").at(-1) ?? field;
  const spaced = segment
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, "$<lower> $<upper>")
    .replaceAll(/[_-]+/gu, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const summaryText = (rollup: PublicDiagnosticsRollup): string => {
  const screens = rollup.affectedScreens.length;

  if (screens === 0) {
    return "The whole lesson needs a fix before it can continue.";
  }

  const hasFlow = rollup.flow.length > 0;
  if (hasFlow) {
    return `${screens} screen${screens === 1 ? "" : "s"} and the whole lesson need a fix before this lesson can continue.`;
  }
  return `${screens} screen${screens === 1 ? " needs" : "s need"} a fix before this lesson can continue.`;
};

const announcementKey = (
  requestId: string,
  rollup: PublicDiagnosticsRollup
): string => {
  return [
    requestId,
    rollup.verdict,
    rollup.affectedScreens.join("|"),
    rollup.flow.length,
  ].join(":");
};

interface ValidationFindingProperties {
  readonly finding: PublicGenerationDiagnostic;
  readonly onRecover: (action: RecoveryAction) => void;
}

const ValidationFinding = ({
  finding,
  onRecover,
}: ValidationFindingProperties) => {
  const recovery = finding.recovery ?? "edit";
  const label = fieldLabel(finding.field);

  return (
    <li className="validation-diagnostics__finding">
      <div>
        {label ? (
          <span className="validation-diagnostics__field">{label}</span>
        ) : null}
        <p>{finding.message}</p>
      </div>
      <button
        type="button"
        className="validation-diagnostics__action"
        onClick={() => onRecover(recovery)}
      >
        {recoveryLabel(recovery)}
      </button>
    </li>
  );
};

export interface ValidationDiagnosticsProperties {
  readonly rollup: PublicDiagnosticsRollup;
  readonly requestId: string;
  readonly direction: "ltr" | "rtl";
  readonly language: LessonLanguage;
  readonly onRecover: (action: RecoveryAction, variantId?: string) => void;
}

/**
 * The blocked-by-validation panel. It names the affected screen for every finding and offers one native action per finding, so Enter and Space work without a key handler. The single live region is written once per blocked request, never on a re-render.
 */
export const ValidationDiagnostics = ({
  rollup,
  requestId,
  direction,
  language,
  onRecover,
}: ValidationDiagnosticsProperties) => {
  const headingReference = useRef<HTMLHeadingElement>(null);
  const announcementReference = useRef<HTMLOutputElement>(null);
  const announcedKeyReference = useRef<string | null>(null);
  const focusedRequestReference = useRef<string | null>(null);
  const summary = summaryText(rollup);
  const currentAnnouncementKey = announcementKey(requestId, rollup);

  useEffect(() => {
    if (focusedRequestReference.current === requestId) {
      return;
    }
    focusedRequestReference.current = requestId;
    headingReference.current?.focus();
  }, [requestId]);

  useEffect(() => {
    const region = announcementReference.current;
    if (!region || announcedKeyReference.current === currentAnnouncementKey) {
      return () => {
        // Nothing was announced, so there is nothing to clean up.
      };
    }
    announcedKeyReference.current = currentAnnouncementKey;

    if (region.textContent === summary) {
      // Identical text produces no DOM change, so clear it for one frame.
      region.textContent = "";
      const frame = window.requestAnimationFrame(() => {
        region.textContent = summary;
      });
      return () => window.cancelAnimationFrame(frame);
    }

    region.textContent = summary;
    return () => {
      // The announcement stays in place until the next blocked request.
    };
  }, [currentAnnouncementKey, summary]);

  return (
    <section
      id="validation-diagnostics"
      className="validation-diagnostics"
      aria-labelledby="validation-diagnostics-heading"
      dir={direction}
      lang={language}
    >
      <output
        className="sr-only"
        id="validation-diagnostics-announcement"
        aria-live="polite"
        aria-atomic="true"
        ref={announcementReference}
      />
      <h3
        id="validation-diagnostics-heading"
        tabIndex={-1}
        ref={headingReference}
      >
        Some screens need a fix before students see this lesson.
      </h3>
      <p id="validation-diagnostics-summary">{summary}</p>

      {rollup.screens.map((screen, screenIndex) => {
        const headingId = `validation-diagnostics-screen-${screenIndex}`;
        return (
          <div
            key={screen.variantId}
            className="validation-diagnostics__screen"
          >
            <h4 id={headingId}>{screenLabel(screen.variantId, screenIndex)}</h4>
            <ul
              className="validation-diagnostics__findings"
              aria-labelledby={headingId}
            >
              {screen.findings.map((finding) => {
                return (
                  <ValidationFinding
                    key={findingKey(finding, "screen")}
                    finding={finding}
                    onRecover={(action) => onRecover(action, screen.variantId)}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}

      {rollup.flow.length > 0 ? (
        <div className="validation-diagnostics__screen">
          <h4 id="validation-diagnostics-flow">Whole lesson</h4>
          <ul
            className="validation-diagnostics__findings"
            aria-labelledby="validation-diagnostics-flow"
          >
            {rollup.flow.map((finding) => {
              return (
                <ValidationFinding
                  key={findingKey(finding, "flow")}
                  finding={finding}
                  onRecover={(action) => onRecover(action)}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
