import type { BadgeTone } from "@/components/ui/badge";
import type { PublicGenerationResult } from "@/shared/generation-contract";

/*
The Studio board's pure rules: how notes group, what a ready variant's status
pill says, and how the board names its count. Kept apart from the component so
they are tested directly.
*/

type Diagnostics = PublicGenerationResult["diagnostics"];

/** Two findings are the same note when code and message match. */
const diagnosticKey = (diagnostic: Diagnostics[number]): string =>
  `${diagnostic.code}:${diagnostic.message}`;

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const FIRST_CARD_LETTER = "A".codePointAt(0) ?? 65;

const TEACHER_REVIEW_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  "PREREQUISITE_PACK_MISSING",
  "PREREQUISITE_PATH_MISSING",
  "LEARNING_PATH_BLOCKED",
  "CURRICULUM_TENANT_MISMATCH",
  "CURRICULUM_CONTEXT_MISMATCH",
  "CURRICULUM_GRAPH_VERSION_UNSUPPORTED",
]);

export const isTeacherReviewDiagnostic = (code: string): boolean =>
  TEACHER_REVIEW_DIAGNOSTIC_CODES.has(code);

const DIAGNOSTIC_SEVERITY_LABELS: Record<
  Diagnostics[number]["severity"],
  string
> = {
  error: "Review this",
  warning: "Worth noticing",
};

const getDiagnosticLabel = (diagnostic: Diagnostics[number]): string => {
  return TEACHER_REVIEW_DIAGNOSTIC_CODES.has(diagnostic.code)
    ? "Teacher review"
    : DIAGNOSTIC_SEVERITY_LABELS[diagnostic.severity];
};

export interface GroupedDiagnostic {
  readonly key: string;
  readonly label: string;
  readonly variantNames: string[];
  readonly message: string;
}

/**
 * Identical findings across variants collapse into one note that names the
 * variants it describes, so a draft with structurally repeated variants never
 * prints the same sentence twice (#168 P1-1).
 */
export const groupDiagnostics = (
  diagnostics: Diagnostics,
  variantNameById: ReadonlyMap<string, string>
): GroupedDiagnostic[] => {
  const byKey = new Map<string, GroupedDiagnostic>();
  const groups: GroupedDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    const variantName = diagnostic.variantId
      ? variantNameById.get(diagnostic.variantId)
      : undefined;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: getDiagnosticLabel(diagnostic),
        variantNames: [],
        message: diagnostic.message,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    if (variantName && !group.variantNames.includes(variantName)) {
      group.variantNames.push(variantName);
    }
  }
  return groups;
};

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

/** "Four variants to review": the board heading names the real count. */
export const boardHeading = (count: number): string => {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} variant${count === 1 ? "" : "s"} to review`;
};

export interface VariantStatus {
  readonly tone: BadgeTone;
  readonly label: string;
}

/**
 * A ready variant's status pill. The words carry the meaning: a variant with
 * notes from the checks says how many, so tone is never the only signal.
 */
export const variantStatus = (
  variantId: string,
  diagnostics: Diagnostics
): VariantStatus => {
  const distinct = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.variantId === variantId) {
      distinct.add(diagnosticKey(diagnostic));
    }
  }
  const notes = distinct.size;
  if (notes === 0) {
    return { tone: "ok", label: "Ready to review" };
  }
  return {
    tone: "warn",
    label: `Ready · ${plural(notes, "note")}`,
  };
};

/** Cards are lettered A, B, C… so a note and a card can name each other. */
export const variantLetter = (index: number): string =>
  String.fromCodePoint(FIRST_CARD_LETTER + index);

/**
 * The line beside the board heading. Every variant in a ready draft passed the
 * gate; the line says how many carry notes, so it never contradicts a card.
 */
export const readyCountLine = (
  variants: readonly { readonly id: string }[],
  diagnostics: Diagnostics
): string => {
  const withNotes = variants.filter(
    (variant) => variantStatus(variant.id, diagnostics).tone === "warn"
  ).length;
  const ready = `${variants.length} ready`;
  return withNotes === 0 ? ready : `${ready} · ${withNotes} with notes`;
};
