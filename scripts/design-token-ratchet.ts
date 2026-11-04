// Pure ceiling arithmetic for scripts/verify-design-tokens.ts.
//
// The check compares one total per rule, so the ceiling is clamped per rule
// too: `--update` may lower a rule's total, never raise it. A rule that grew
// keeps its previous per-file entries untouched, so rewriting the baseline
// cannot launder a regression into the new ceiling (AgDR-0017 §3).

export type Counts = Record<string, number>;

export const totalOf = (perFile: Counts | undefined): number =>
  Object.values(perFile ?? {}).reduce((sum, value) => sum + value, 0);

export interface ClampResult {
  readonly rules: Record<string, Counts>;
  /** Rules whose current total exceeds the ceiling; their old entries were kept. */
  readonly refused: readonly string[];
}

export const clampCeiling = (
  ruleIds: readonly string[],
  previous: Record<string, Counts> | undefined,
  current: Record<string, Counts>
): ClampResult => {
  const refused: string[] = [];
  const rules: Record<string, Counts> = {};
  for (const rule of ruleIds) {
    const now = current[rule] ?? {};
    const before = previous?.[rule];
    if (before !== undefined && totalOf(now) > totalOf(before)) {
      refused.push(`${rule}: ${totalOf(before)} -> ${totalOf(now)}`);
      rules[rule] = before;
    } else {
      rules[rule] = now;
    }
  }
  return { rules, refused };
};

// A literal time in a transition or animation escapes the reduced-motion
// collapse in base.css, which only rewrites the --duration-* tokens. Only the
// duration counts: in the transition and animation shorthands the first time
// in each comma-separated layer is the duration and the second is the delay,
// and a stagger offset is not a motion length.
const DURATION_PROPERTIES =
  /^(?:transition|transition-duration|animation|animation-duration)$/u;
const TIME_TOKEN = /^(?:\d*\.?\d+m?s|var\(--duration-[\w-]+\)|calc\(.*\))$/u;
const LITERAL_TIME = /^\d*\.?\d+m?s$/u;

/** Split on commas and spaces that are not inside parentheses. */
const splitTopLevel = (value: string, separator: RegExp): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    }
    if (depth === 0 && separator.test(character)) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

/** Number of layers whose duration is a literal time (0 when tokenised). */
export const literalDurationCount = (
  property: string,
  value: string
): number => {
  if (!DURATION_PROPERTIES.test(property)) {
    return 0;
  }
  return splitTopLevel(value, /,/u).filter((layer) => {
    const duration = splitTopLevel(layer, /\s/u).find((token) =>
      TIME_TOKEN.test(token)
    );
    return duration !== undefined && LITERAL_TIME.test(duration);
  }).length;
};

export const hasLiteralDuration = (property: string, value: string): boolean =>
  literalDurationCount(property, value) > 0;

/**
 * The scanner reads one line at a time, but a transition or animation with
 * several layers spans lines (`transition:` then one layer per line). Join
 * such a declaration with its continuation lines up to the closing `;` so the
 * whole value is classified once.
 */
export const joinDurationDeclarations = (
  lines: readonly string[]
): string[] => {
  const joined: string[] = [];
  let pending: string | null = null;
  for (const line of lines) {
    if (pending !== null) {
      if (line.includes("}")) {
        joined.push(pending, line);
        pending = null;
      } else {
        pending = `${pending} ${line}`;
        if (line.endsWith(";")) {
          joined.push(pending);
          pending = null;
        }
      }
      continue;
    }
    const colon = line.indexOf(":");
    const property = colon > 0 ? line.slice(0, colon).trim() : "";
    const opensDeclaration =
      DURATION_PROPERTIES.test(property) &&
      !line.endsWith(";") &&
      !line.includes("{") &&
      !line.includes("}");
    if (opensDeclaration) {
      pending = line;
    } else {
      joined.push(line);
    }
  }
  if (pending !== null) {
    joined.push(pending);
  }
  return joined;
};
