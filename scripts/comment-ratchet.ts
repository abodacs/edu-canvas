// Pure ceiling arithmetic and comment classification for
// scripts/verify-comments.ts (AgDR-0019: src/ is comment-free).
//
// The check counts comment lines per file, so the ceiling is clamped per file
// too: `--update` may lower a file's count, never raise it. A file that grew
// keeps its previous ceiling, so regenerating the budget cannot launder a
// regression into it.

export type Counts = Record<string, number>;

export interface ClampResult {
  readonly files: Counts;
  /** Files whose current count exceeds the ceiling; their old entry was kept. */
  readonly refused: readonly string[];
}

export const totalOf = (perFile: Counts | undefined): number =>
  Object.values(perFile ?? {}).reduce((sum, value) => sum + value, 0);

export const clampCeiling = (
  previous: Counts | undefined,
  current: Counts
): ClampResult => {
  const files: Counts = {};
  const refused: string[] = [];
  for (const [file, now] of Object.entries(current)) {
    const before = previous?.[file];
    if (before !== undefined && now > before) {
      refused.push(`${file}: ${before} -> ${now}`);
      files[file] = before;
    } else {
      files[file] = now;
    }
  }
  return { files, refused };
};

// Machine directives are contracts the toolchain reads, not prose for humans.
// They stay outside the comment ban until their suppression is fixed at the
// source; the verify script reports them separately so the residue stays
// visible.
const DIRECTIVE =
  /^\s*(?:@ts-(?:expect-error|ignore|nocheck|check)\b|@deprecated\b|webpackChunkName\b|(?:eslint|oxlint|biome|prettier|stylelint|vitest|c8|v8|depcruise|node)[\s-]*(?:disable|ignore)(?:[-\s]*(?:next-)?line)?\b|prettier-ignore\b|@__PURE__\b|(?:c8|v8|istanbul)\s+ignore\b|sentry-ignore\b)/u;

export const isDirectiveComment = (text: string): boolean =>
  DIRECTIVE.test(text.replace(/^[^\w@]+/u, ""));
