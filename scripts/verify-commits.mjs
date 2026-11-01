/**
 * Fails when a commit in the range credits a coding assistant as co-author.
 *
 * CONTRIBUTING.md keeps the human contributor as the author of record. Coding
 * agents add `Co-authored-by:` trailers by default, so the rule needs a check,
 * not a paragraph. CI runs this over the pull request's commits; run the same
 * command locally before pushing.
 *
 * Usage: node scripts/verify-commits.mjs [<range>]
 *        Default range: origin/main..HEAD
 */

import { execFileSync } from "node:child_process";

const DEFAULT_RANGE = "origin/main..HEAD";
const GIT_BINARY = "/usr/bin/git";
const NO_OFFENDERS = 0;
const RANGE_ARGUMENT = 2;
const FAILURE = 1;
/*
 * Unit and record separators: git prints them, and commit text cannot contain them.
 */
const FIELD = "\u{1F}";
const RECORD = "\u{1E}";
const NEWLINE = /\r?\n/u;
/**
 * Named assistants only, so bot trailers such as dependabot are not matched.
 */
const ASSISTANT_TRAILER =
  /^co-authored-by:.*\b(?:claude|codex|commandcode|cursor|copilot|gemini|devin|aider|windsurf|openai)\b/imu;

const readCommits = (range) => {
  const output = execFileSync(
    GIT_BINARY,
    ["log", `--format=%h${FIELD}%s${FIELD}%B${RECORD}`, range],
    { encoding: "utf-8" }
  );

  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [shortSha, subject, body] = record.split(FIELD);
      return { body, shortSha, subject };
    });
};

const firstLine = (text) => {
  const [line = ""] = text.split(NEWLINE);
  return line;
};

const range = process.argv[RANGE_ARGUMENT] ?? DEFAULT_RANGE;
const offenders = readCommits(range).filter((commit) =>
  ASSISTANT_TRAILER.test(commit.body)
);

if (offenders.length === NO_OFFENDERS) {
  console.log(`✅ No assistant co-author trailers in ${range}`);
} else {
  const details = offenders
    .map((commit) => `  ${commit.shortSha} ${firstLine(commit.subject)}`)
    .join("\n");
  console.error(
    `❌ Remove the assistant co-author trailer from ${offenders.length} commit(s) in ${range}:\n${details}\n\nCONTRIBUTING.md: the human contributor is the author of record.\nFix: git rebase --interactive <base>, delete each "Co-authored-by:" line, then force-push.`
  );
  process.exitCode = FAILURE;
}
