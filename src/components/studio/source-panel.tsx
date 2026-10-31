import {
  AlertTriangle,
  Check,
  FileText,
  FileWarning,
  Info,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import { isJsonObject, readResponseJson } from "@/lib/http";
import { cn } from "@/lib/utilities";
import { Button } from "@/components/ui/button";
import { csrfHeaderName } from "@/shared/identity-contract";
import {
  SOURCE_MAX_EXTRACTED_CHARS,
  SOURCE_MAX_FILE_BYTES,
  SOURCE_MAX_PDF_PAGES,
  publicSourceSnapshotSchema,
} from "@/shared/source-contract";
import type { PublicSourceSnapshot } from "@/shared/source-contract";

import type {
  ChangeEvent,
  ComponentType,
  Dispatch,
  RefObject,
  SyntheticEvent,
} from "react";

export interface BoundSource {
  readonly id: string;
  readonly fileName: string;
}

interface SourcePanelProperties {
  readonly csrf: string;
  readonly onUnauthorized: () => void;
  readonly onBoundSnapshotChange: (source: BoundSource | null) => void;
  readonly boundSource: BoundSource | null;
}

const SOURCES_ENDPOINT = "/api/lessons/sources";

const ACCEPTED_FORMATS = ".pdf, .txt, .md, .markdown";
const DELETE_CONFIRM_WINDOW_MS = 4000;
const GENERIC_SOURCE_FAILURE_MESSAGE =
  "The source could not be processed. Try again.";
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * 1024;

const characterLimitLabel = SOURCE_MAX_EXTRACTED_CHARS.toLocaleString("en");

const charLimitMessage = `Corrected text is limited to ${characterLimitLabel} characters. Shorten the text; nothing was truncated.`;

const formatBytes = (bytes: number): string => {
  return bytes < MEGABYTE
    ? `${Math.max(1, Math.round(bytes / KILOBYTE))} KB`
    : `${(bytes / MEGABYTE).toFixed(1)} MB`;
};

const GAP_SEVERITY: Record<string, "error" | "warning" | "info"> = {
  "missing-prerequisites": "error",
  "scanned-page": "error",
  "broken-math": "warning",
  encoding: "error",
  "parser-fault": "error",
  "unverified-external-alignment": "info",
};

type ListOutcome =
  | { readonly kind: "list"; readonly snapshots: PublicSourceSnapshot[] }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "error" };

const readSnapshotList = (payload: unknown): PublicSourceSnapshot[] => {
  if (!isJsonObject(payload) || !Array.isArray(payload.snapshots)) {
    return [];
  }
  const valid: PublicSourceSnapshot[] = [];
  for (const candidate of payload.snapshots) {
    const parsed = publicSourceSnapshotSchema.safeParse(candidate);
    if (parsed.success) {
      valid.push(parsed.data);
    }
  }
  return valid;
};

const readSourceList = async (csrf: string): Promise<ListOutcome> => {
  let response: Response;
  try {
    response = await fetch(SOURCES_ENDPOINT, {
      headers: { [csrfHeaderName]: csrf },
    });
  } catch {
    return { kind: "error" };
  }
  if (response.status === 401) {
    return { kind: "unauthorized" };
  }
  if (!response.ok) {
    return { kind: "error" };
  }
  const payload = await readResponseJson(response);
  return { kind: "list", snapshots: readSnapshotList(payload) };
};

const cancelAnyExtracting = async (
  csrf: string,
  onUnauthorized: () => void
): Promise<void> => {
  const outcome = await readSourceList(csrf);
  if (outcome.kind === "unauthorized") {
    onUnauthorized();
    return;
  }
  if (outcome.kind !== "list") {
    return;
  }
  const extracting = outcome.snapshots.find(
    (candidate) => candidate.state === "extracting"
  );
  if (!extracting) {
    return;
  }
  try {
    await fetch(`${SOURCES_ENDPOINT}/${extracting.id}/cancel`, {
      method: "POST",
      headers: { [csrfHeaderName]: csrf },
    });
  } catch {
    // The stale extraction is swept server-side; nothing else to do here.
  }
};

interface PanelState {
  readonly snapshot: PublicSourceSnapshot | null;
  readonly extractingName: string | null;
  readonly error: string | null;
  readonly repairDraft: string | null;
  readonly repairError: string | null;
  readonly reviewOpen: boolean;
  readonly skillsConfirmed: boolean;
  readonly confirmingDelete: boolean;
  readonly announcement: string;
}

type PanelAction =
  | {
      readonly type: "restored";
      readonly snapshot: PublicSourceSnapshot | null;
    }
  | { readonly type: "upload-started"; readonly fileName: string }
  | { readonly type: "upload-failed"; readonly message: string }
  | {
      readonly type: "upload-finished";
      readonly snapshot: PublicSourceSnapshot;
    }
  | { readonly type: "cancelled" }
  | { readonly type: "repair-opened" }
  | { readonly type: "repair-closed" }
  | { readonly type: "repair-changed"; readonly value: string }
  | { readonly type: "repair-error"; readonly message: string }
  | {
      readonly type: "repair-finished";
      readonly snapshot: PublicSourceSnapshot;
    }
  | { readonly type: "review-toggled" }
  | { readonly type: "skills-changed"; readonly value: boolean }
  | {
      readonly type: "review-finished";
      readonly snapshot: PublicSourceSnapshot;
    }
  | { readonly type: "delete-armed" }
  | { readonly type: "delete-disarmed" }
  | { readonly type: "deleted" }
  | { readonly type: "announced"; readonly message: string };

const initialPanelState: PanelState = {
  snapshot: null,
  extractingName: null,
  error: null,
  repairDraft: null,
  repairError: null,
  reviewOpen: false,
  skillsConfirmed: false,
  confirmingDelete: false,
  announcement: "",
};

const closeTransient = (state: PanelState): PanelState => {
  return {
    ...state,
    repairDraft: null,
    repairError: null,
    reviewOpen: false,
    skillsConfirmed: false,
  };
};

const finishedAnnouncement = (snapshot: PublicSourceSnapshot): string => {
  return snapshot.state === "complete"
    ? "Extraction complete. Review the source to use it for generation."
    : "Extraction finished with gaps that need repair.";
};

const panelReducer = (state: PanelState, action: PanelAction): PanelState => {
  switch (action.type) {
    case "restored": {
      return { ...state, snapshot: action.snapshot };
    }
    case "upload-started": {
      return {
        ...closeTransient(state),
        snapshot: null,
        extractingName: action.fileName,
        error: null,
        announcement: `Reading ${action.fileName}.`,
      };
    }
    case "upload-failed": {
      return {
        ...state,
        extractingName: null,
        error: action.message,
        announcement: "The upload was not completed.",
      };
    }
    case "upload-finished": {
      return {
        ...closeTransient(state),
        snapshot: action.snapshot,
        extractingName: null,
        announcement: finishedAnnouncement(action.snapshot),
      };
    }
    case "cancelled": {
      return {
        ...closeTransient(state),
        extractingName: null,
        snapshot: null,
        announcement: "Extraction cancelled.",
      };
    }
    case "repair-opened": {
      return { ...closeTransient(state), repairDraft: "" };
    }
    case "repair-closed": {
      return { ...state, repairDraft: null, repairError: null };
    }
    case "repair-changed": {
      return { ...state, repairDraft: action.value, repairError: null };
    }
    case "repair-error": {
      return { ...state, repairError: action.message };
    }
    case "repair-finished": {
      return {
        ...closeTransient(state),
        snapshot: action.snapshot,
        announcement: finishedAnnouncement(action.snapshot),
      };
    }
    case "review-toggled": {
      return { ...state, reviewOpen: !state.reviewOpen };
    }
    case "skills-changed": {
      return { ...state, skillsConfirmed: action.value };
    }
    case "review-finished": {
      return {
        ...closeTransient(state),
        snapshot: action.snapshot,
        announcement: "Source reviewed. Your next draft will use it.",
      };
    }
    case "delete-armed": {
      return { ...state, confirmingDelete: true };
    }
    case "delete-disarmed": {
      return { ...state, confirmingDelete: false };
    }
    case "deleted": {
      return {
        ...closeTransient(state),
        snapshot: null,
        confirmingDelete: false,
        announcement: "Source deleted.",
      };
    }
    case "announced": {
      return { ...state, announcement: action.message };
    }
    default: {
      return state;
    }
  }
};

const GAP_ICONS: Record<"error" | "warning" | "info", ComponentType> = {
  error: FileWarning,
  warning: AlertTriangle,
  info: Info,
};

const formatPageNote = (pages: readonly number[] | undefined): string => {
  if (!pages || pages.length === 0) {
    return "";
  }
  const suffix = pages.length > 1 ? "s" : "";
  return ` (page${suffix} ${pages.join(", ")})`;
};

const GapAlert = ({
  code,
  message,
  pages,
  onDismiss,
}: {
  readonly code: string;
  readonly message: string;
  readonly pages?: readonly number[];
  readonly onDismiss?: () => void;
}) => {
  const severity = GAP_SEVERITY[code] ?? "warning";
  const Icon = GAP_ICONS[severity];
  const pageNote = formatPageNote(pages);
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span>
        <strong>{message}</strong>
        {pageNote}
      </span>
      {onDismiss ? (
        <button
          type="button"
          className="source-alert__dismiss"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
          <span className="sr-only">Dismiss this notice</span>
        </button>
      ) : null}
    </>
  );

  if (severity === "error") {
    return (
      <p className="source-alert source-alert--error" role="alert">
        {content}
      </p>
    );
  }
  return (
    <output className={cn("source-alert", `source-alert--${severity}`)}>
      {content}
    </output>
  );
};

const ExtractionProgress = ({
  fileName,
  onCancel,
}: {
  readonly fileName: string;
  readonly onCancel: () => void;
}) => {
  return (
    <output className="source-panel__progress" aria-live="polite">
      <span className="source-panel__progress-name">
        <FileText aria-hidden="true" /> {fileName}
      </span>
      <progress aria-label="Reading the file" />
      <button type="button" className="source-panel__cancel" onClick={onCancel}>
        <X aria-hidden="true" /> Cancel
      </button>
    </output>
  );
};

const SourceEmptyState = ({
  isSyntheticConfirmed,
  confirmError,
  onConfirmChange,
  onFileChosen,
}: {
  readonly isSyntheticConfirmed: boolean;
  readonly confirmError: string | null;
  readonly onConfirmChange: (isChecked: boolean) => void;
  readonly onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
}) => {
  return (
    <div className="source-panel__empty">
      <label className="source-panel__choose">
        <Upload aria-hidden="true" />
        <span>Choose a file</span>
        <input
          type="file"
          accept={ACCEPTED_FORMATS}
          className="sr-only"
          aria-label="Choose a source file to upload"
          onChange={onFileChosen}
        />
      </label>
      <label className="source-panel__confirm">
        <input
          type="checkbox"
          checked={isSyntheticConfirmed}
          aria-label="This material is synthetic"
          onChange={(event) => {
            onConfirmChange(event.target.checked);
          }}
        />
        <span>This material is synthetic. No real student data.</span>
      </label>
      {confirmError ? (
        <p className="source-alert source-alert--error" role="alert">
          <FileWarning aria-hidden="true" />
          <span>{confirmError}</span>
        </p>
      ) : null}
    </div>
  );
};

const ReviewBlock = ({
  snapshot,
  reviewOpen,
  skillsConfirmed,
  skillsError,
  onToggle,
  onSkillsChange,
  onConfirm,
}: {
  readonly snapshot: PublicSourceSnapshot;
  readonly reviewOpen: boolean;
  readonly skillsConfirmed: boolean;
  readonly skillsError: string | null;
  readonly onToggle: () => void;
  readonly onSkillsChange: (isChecked: boolean) => void;
  readonly onConfirm: () => void;
}) => {
  const toggleLabel = reviewOpen
    ? "Hide the extracted text"
    : "Review the extracted text";

  return (
    <div className="source-panel__review">
      <button
        type="button"
        className="source-panel__review-toggle"
        aria-expanded={reviewOpen}
        onClick={onToggle}
      >
        {toggleLabel}
      </button>
      {reviewOpen ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable extracted text is a valid tab stop. */}
          <pre className="source-panel__text" tabIndex={0}>
            {snapshot.extractedText}
          </pre>
          <label className="source-panel__confirm">
            <input
              type="checkbox"
              checked={skillsConfirmed}
              aria-label="The source covers the required skills"
              onChange={(event) => {
                onSkillsChange(event.target.checked);
              }}
            />
            <span>
              The source covers the required skills for this standard.
            </span>
          </label>
          {skillsError ? (
            <p className="source-alert source-alert--error" role="alert">
              <FileWarning aria-hidden="true" />
              <span>{skillsError}</span>
            </p>
          ) : null}
          <Button type="button" size="sm" onClick={onConfirm}>
            <ShieldCheck aria-hidden="true" /> Confirm review
          </Button>
        </>
      ) : null}
    </div>
  );
};

const RepairForm = ({
  state,
  onChange,
  onBlurValidate,
  onSubmit,
  onCancel,
}: {
  readonly state: PanelState;
  readonly onChange: (value: string) => void;
  readonly onBlurValidate: (value: string) => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onCancel: () => void;
}) => {
  const draftLength =
    state.repairDraft === null
      ? 0
      : [...state.repairDraft].length.toLocaleString("en");

  return (
    <form className="source-panel__repair" onSubmit={onSubmit}>
      <label htmlFor="corrected-source-text">
        Corrected text for this source
      </label>
      <textarea
        id="corrected-source-text"
        aria-label="Corrected text for this source"
        rows={6}
        value={state.repairDraft ?? ""}
        aria-invalid={state.repairError !== null}
        aria-describedby={
          state.repairError ? "corrected-source-text-error" : undefined
        }
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onFocus={() => {
          // Refocusing clears the message (Showing-input-error checklist).
          onChange(state.repairDraft ?? "");
        }}
        onBlur={(event) => {
          onBlurValidate(event.target.value);
        }}
      />
      <span className="source-panel__counter">
        {draftLength}/{characterLimitLabel}
      </span>
      {state.repairError ? (
        <p
          id="corrected-source-text-error"
          className="source-alert source-alert--error"
          role="alert"
        >
          <FileWarning aria-hidden="true" />
          <span>{state.repairError}</span>
        </p>
      ) : null}
      <div className="source-panel__repair-actions">
        <Button type="submit" size="sm">
          <Check aria-hidden="true" /> Save corrected text
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

const validateRepairDraft = (value: string): string | null => {
  if (value.trim().length === 0) {
    return "Enter the corrected text, or replace the file instead.";
  }
  return [...value].length > SOURCE_MAX_EXTRACTED_CHARS
    ? charLimitMessage
    : null;
};

const SnapshotResult = ({
  snapshot,
  state,
  skillsError,
  onRepairOpened,
  onRepairChanged,
  onRepairBlurred,
  onRepairSubmitted,
  onRepairCancelled,
  onReviewToggled,
  onSkillsChanged,
  onReviewConfirmed,
  onGapDismissed,
  onFileChosen,
  onDelete,
}: {
  readonly snapshot: PublicSourceSnapshot;
  readonly state: PanelState;
  readonly skillsError: string | null;
  readonly onRepairOpened: () => void;
  readonly onRepairChanged: (value: string) => void;
  readonly onRepairBlurred: (value: string) => void;
  readonly onRepairSubmitted: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly onRepairCancelled: () => void;
  readonly onReviewToggled: () => void;
  readonly onSkillsChanged: (isChecked: boolean) => void;
  readonly onReviewConfirmed: () => void;
  readonly onGapDismissed: () => void;
  readonly onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onDelete: () => void;
}) => {
  const isRepairable =
    snapshot.state === "partial" || snapshot.state === "failed";
  const deleteLabel = state.confirmingDelete ? "Confirm delete?" : "Delete";

  return (
    <div className="source-panel__result">
      <p className="source-panel__meta">
        <span>{snapshot.fileFormat.toUpperCase()}</span>
        <span>{formatBytes(snapshot.fileSizeBytes)}</span>
        {snapshot.pageCount ? <span>{snapshot.pageCount} pages</span> : null}
        <span
          className={cn(
            "source-state-chip",
            `source-state-chip--${snapshot.state}`
          )}
        >
          {snapshot.state}
          {snapshot.reviewedAt ? ", reviewed" : ""}
        </span>
      </p>

      {snapshot.state === "failed" && snapshot.failureMessage ? (
        <GapAlert code="parser-fault" message={snapshot.failureMessage} />
      ) : null}

      {snapshot.state === "failed"
        ? null
        : snapshot.gaps.map((gap) => {
            const isInformational =
              gap.code === "unverified-external-alignment";
            const canDismiss =
              isInformational && !snapshot.alignmentAcknowledgedAt;
            return (
              <GapAlert
                key={gap.code}
                code={gap.code}
                message={gap.message}
                pages={gap.pages}
                onDismiss={canDismiss ? onGapDismissed : undefined}
              />
            );
          })}

      {snapshot.state === "complete" && !snapshot.reviewedAt ? (
        <ReviewBlock
          snapshot={snapshot}
          reviewOpen={state.reviewOpen}
          skillsConfirmed={state.skillsConfirmed}
          skillsError={skillsError}
          onToggle={onReviewToggled}
          onSkillsChange={onSkillsChanged}
          onConfirm={onReviewConfirmed}
        />
      ) : null}

      {isRepairable && state.repairDraft === null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRepairOpened}
        >
          <RefreshCw aria-hidden="true" /> Enter corrected text
        </Button>
      ) : null}

      {isRepairable && state.repairDraft !== null ? (
        <RepairForm
          state={state}
          onChange={onRepairChanged}
          onBlurValidate={onRepairBlurred}
          onSubmit={onRepairSubmitted}
          onCancel={onRepairCancelled}
        />
      ) : null}

      {snapshot.state === "complete" && snapshot.reviewedAt ? (
        <p className="source-panel__bound-note">
          <Check aria-hidden="true" /> Reviewed. Your next draft uses this
          source.
        </p>
      ) : null}

      <div className="source-panel__actions">
        <label className="source-panel__choose source-panel__choose--secondary">
          <Upload aria-hidden="true" /> Replace file
          <input
            type="file"
            accept={ACCEPTED_FORMATS}
            className="sr-only"
            aria-label="Replace the source file"
            onChange={onFileChosen}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "source-panel__delete",
            state.confirmingDelete && "source-panel__delete--confirm"
          )}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          {deleteLabel}
        </Button>
      </div>
    </div>
  );
};

/**
The dedicated source panel (#114): upload, gap states, repair, and review live
in one place; the draft composer stays prompt-only. Generation binds to a
reviewed, complete snapshot through `onBoundSnapshotChange`.
*/
const repairProblem = (
  dispatch: Dispatch<PanelAction>,
  message: string
): void => {
  dispatch({ type: "repair-error", message });
};

interface SourcePanelContext {
  readonly csrf: string;
  readonly onUnauthorized: () => void;
  readonly dispatch: Dispatch<PanelAction>;
}

const sourceRequest = async (
  context: SourcePanelContext,
  input: string,
  init: RequestInit
): Promise<Response | null> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { [csrfHeaderName]: context.csrf, ...init.headers },
    });
  } catch {
    return null;
  }
  if (response.status === 401) {
    context.onUnauthorized();
    return null;
  }
  return response;
};

const applySourceResponse = async (
  context: SourcePanelContext,
  response: Response
): Promise<PublicSourceSnapshot | null> => {
  const payload = await readResponseJson(response);
  if (response.ok) {
    const parsed = publicSourceSnapshotSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }
  }
  const serverMessage =
    isJsonObject(payload) &&
    typeof payload.message === "string" &&
    payload.message.trim() !== ""
      ? payload.message
      : null;
  context.dispatch({
    type: "upload-failed",
    message: serverMessage ?? GENERIC_SOURCE_FAILURE_MESSAGE,
  });
  return null;
};

const startSourceExtraction = async (
  context: SourcePanelContext,
  file: File,
  isSyntheticConfirmed: boolean,
  abortReference: RefObject<AbortController | null>
): Promise<void> => {
  context.dispatch({ type: "upload-started", fileName: file.name });

  const body = new FormData();
  body.append("source", file);
  body.append("syntheticMaterialConfirmed", String(isSyntheticConfirmed));

  const controller = new AbortController();
  abortReference.current = controller;
  const response = await sourceRequest(context, SOURCES_ENDPOINT, {
    method: "POST",
    body,
    signal: controller.signal,
  });
  abortReference.current = null;

  if (!response) {
    context.dispatch({ type: "cancelled" });
    return;
  }
  const parsed = await applySourceResponse(context, response);
  if (parsed) {
    context.dispatch({ type: "upload-finished", snapshot: parsed });
  }
};

const submitSourceCorrection = async (
  context: SourcePanelContext,
  value: string,
  replacesSnapshotId: string | null
): Promise<void> => {
  const response = await sourceRequest(context, SOURCES_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      correctedText: value,
      ...(replacesSnapshotId && { replacesSnapshotId }),
    }),
  });
  if (!response) {
    return;
  }
  const parsed = await applySourceResponse(context, response);
  if (parsed) {
    context.dispatch({ type: "repair-finished", snapshot: parsed });
  }
};

const confirmSourceReview = async (
  context: SourcePanelContext,
  snapshotId: string,
  onReviewed: (snapshot: PublicSourceSnapshot) => void
): Promise<void> => {
  const response = await sourceRequest(
    context,
    `${SOURCES_ENDPOINT}/${snapshotId}/review`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requiredSkillsConfirmed: true,
        alignmentAcknowledged: true,
      }),
    }
  );
  if (!response) {
    return;
  }
  const parsed = await applySourceResponse(context, response);
  if (!parsed) {
    return;
  }

  context.dispatch({ type: "review-finished", snapshot: parsed });
  onReviewed(parsed);
};

const removeSourceSnapshot = async (
  context: SourcePanelContext,
  snapshotId: string
): Promise<void> => {
  await sourceRequest(context, `${SOURCES_ENDPOINT}/${snapshotId}/cancel`, {
    method: "POST",
  });
};

const SourcePanelHeader = ({
  state,
  isSyntheticConfirmed,
  confirmError,
  onConfirmChange,
  onFileChosen,
  onCancelExtraction,
  focusTargetReference,
}: {
  readonly state: PanelState;
  readonly isSyntheticConfirmed: boolean;
  readonly confirmError: string | null;
  readonly onConfirmChange: (isChecked: boolean) => void;
  readonly onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onCancelExtraction: () => void;
  readonly focusTargetReference: RefObject<HTMLSpanElement | null>;
}) => {
  const { snapshot } = state;
  const heading = snapshot ? snapshot.fileName : "Start from a document";

  return (
    <>
      <div className="source-panel__heading">
        <p className="studio-kicker">A real source, bounded</p>
        <h3 id="source-panel-heading">
          {}
          <span tabIndex={-1} ref={focusTargetReference}>
            {heading}
          </span>
        </h3>
        <p className="source-panel__limits">
          Selectable-text PDF, TXT, or Markdown · up to{" "}
          {formatBytes(SOURCE_MAX_FILE_BYTES)}, {SOURCE_MAX_PDF_PAGES} pages,{" "}
          {characterLimitLabel} characters.
        </p>
      </div>

      {state.error ? (
        <p className="source-alert source-alert--error" role="alert">
          <FileWarning aria-hidden="true" />
          <span>{state.error}</span>
        </p>
      ) : null}

      {state.extractingName ? (
        <ExtractionProgress
          fileName={state.extractingName}
          onCancel={onCancelExtraction}
        />
      ) : null}

      {snapshot === null && state.extractingName === null ? (
        <SourceEmptyState
          isSyntheticConfirmed={isSyntheticConfirmed}
          confirmError={confirmError}
          onConfirmChange={onConfirmChange}
          onFileChosen={onFileChosen}
        />
      ) : null}
    </>
  );
};

/**
The dedicated source panel (#114): upload, gap states, repair, and review live
in one place; the draft composer stays prompt-only. Generation binds to a
reviewed, complete snapshot through `onBoundSnapshotChange`.
*/
export const SourcePanel = ({
  csrf,
  onUnauthorized,
  onBoundSnapshotChange,
  boundSource,
}: SourcePanelProperties) => {
  const [state, dispatch] = useReducer(panelReducer, initialPanelState);
  const context: SourcePanelContext = { csrf, onUnauthorized, dispatch };
  const [isSyntheticConfirmed, setIsSyntheticConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const abortReference = useRef<AbortController | null>(null);
  const resultHeadingReference = useRef<HTMLSpanElement>(null);
  const boundReference = useRef<BoundSource | null>(boundSource);

  useEffect(() => {
    boundReference.current = boundSource;
  }, [boundSource]);

  /* eslint-disable react-doctor/no-fetch-in-effect -- mount-only restore of the teacher's own snapshots; the abort controller below owns cleanup. */
  /* eslint-disable react-hooks/exhaustive-deps -- restore once on mount; later changes come from this panel's own actions. */
  useEffect(() => {
    const controller = new AbortController();
    const restore = async (): Promise<void> => {
      let response: Response;
      try {
        response = await fetch(SOURCES_ENDPOINT, {
          headers: { [csrfHeaderName]: csrf },
        });
      } catch {
        return;
      }
      if (controller.signal.aborted) {
        return;
      }
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) {
        return;
      }
      const payload = await readResponseJson(response);
      const [latest] = readSnapshotList(payload);
      if (!latest) {
        return;
      }
      dispatch({ type: "restored", snapshot: latest });
      if (latest.state === "complete" && latest.reviewedAt) {
        onBoundSnapshotChange({ id: latest.id, fileName: latest.fileName });
      }
    };

    void restore();

    return () => {
      controller.abort();
      abortReference.current?.abort();
    };
    // eslint-enable react-doctor/no-fetch-in-effect, react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.confirmingDelete) {
        dispatch({ type: "delete-disarmed" });
      }
    }, DELETE_CONFIRM_WINDOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state.confirmingDelete]);

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!isSyntheticConfirmed) {
      setConfirmError(
        "Confirm the material is synthetic before choosing a file."
      );
      dispatch({
        type: "announced",
        message: "Confirmation needed before upload.",
      });
      return;
    }
    void startSourceExtraction(
      context,
      file,
      isSyntheticConfirmed,
      abortReference
    );
  };

  const cancelExtraction = (): void => {
    abortReference.current?.abort();
    dispatch({ type: "cancelled" });
    void cancelAnyExtracting(csrf, onUnauthorized);
  };

  const submitCorrectedText = (
    event: SyntheticEvent<HTMLFormElement>
  ): void => {
    event.preventDefault();
    const value = state.repairDraft ?? "";
    const validationError = validateRepairDraft(value);
    if (validationError !== null) {
      repairProblem(dispatch, validationError);
      return;
    }
    void submitSourceCorrection(context, value, state.snapshot?.id ?? null);
  };

  const confirmReview = (): void => {
    const current = state.snapshot;
    if (!current) {
      return;
    }
    if (!state.skillsConfirmed) {
      setSkillsError(
        "Confirm the source covers the required skills to finish review."
      );
      return;
    }
    setSkillsError(null);
    void confirmSourceReview(context, current.id, (reviewed) => {
      onBoundSnapshotChange({ id: reviewed.id, fileName: reviewed.fileName });
    });
  };

  const deleteSnapshot = (): void => {
    const current = state.snapshot;
    if (!current) {
      return;
    }
    if (!state.confirmingDelete) {
      dispatch({ type: "delete-armed" });
      return;
    }
    dispatch({ type: "deleted" });
    if (boundReference.current?.id === current.id) {
      onBoundSnapshotChange(null);
    }
    void removeSourceSnapshot(context, current.id);
  };

  const detachSource = (): void => {
    onBoundSnapshotChange(null);
    dispatch({
      type: "announced",
      message: "Source detached. Drafts will not use it.",
    });
  };

  const { snapshot } = state;

  return (
    <section
      className="source-panel"
      aria-labelledby="source-panel-heading"
      id="source-panel"
    >
      <output className="sr-only" aria-live="polite">
        {state.announcement}
      </output>

      <SourcePanelHeader
        state={state}
        isSyntheticConfirmed={isSyntheticConfirmed}
        confirmError={confirmError}
        onConfirmChange={(isChecked) => {
          setIsSyntheticConfirmed(isChecked);
          setConfirmError(null);
        }}
        onFileChosen={onFileChosen}
        onCancelExtraction={cancelExtraction}
        focusTargetReference={resultHeadingReference}
      />

      {snapshot ? (
        <SnapshotResult
          snapshot={snapshot}
          state={state}
          skillsError={skillsError}
          onRepairOpened={() => {
            dispatch({ type: "repair-opened" });
          }}
          onRepairChanged={(value) => {
            dispatch({ type: "repair-changed", value });
          }}
          onRepairCancelled={() => {
            dispatch({ type: "repair-closed" });
          }}
          onRepairBlurred={(value) => {
            const validationError = validateRepairDraft(value);
            if (validationError !== null && value.trim().length > 0) {
              repairProblem(dispatch, validationError);
            }
          }}
          onRepairSubmitted={submitCorrectedText}
          onReviewToggled={() => {
            dispatch({ type: "review-toggled" });
          }}
          onSkillsChanged={(isChecked) => {
            setSkillsError(null);
            dispatch({ type: "skills-changed", value: isChecked });
          }}
          onReviewConfirmed={confirmReview}
          onGapDismissed={() => {
            dispatch({
              type: "announced",
              message:
                "Alignment notice dismissed. It never certifies a match.",
            });
          }}
          onFileChosen={onFileChosen}
          onDelete={deleteSnapshot}
        />
      ) : null}

      {boundSource ? (
        <p className="source-panel__bound">
          <FileText aria-hidden="true" />
          <span>
            Drafts use <strong>{boundSource.fileName}</strong>.
          </span>
          <button type="button" onClick={detachSource}>
            Detach
            <span className="sr-only"> the source from the next draft</span>
          </button>
        </p>
      ) : null}
    </section>
  );
};
