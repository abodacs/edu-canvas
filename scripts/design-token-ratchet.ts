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
