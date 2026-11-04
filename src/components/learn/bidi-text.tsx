import type { ReactNode } from "react";

import type { LearnerCopy } from "./learner-copy";

// A run of Latin letters, digits, and the separators a code or fraction uses:
// "4.NF.A.1", "1/2", "3". Trailing separators are trimmed below, so a sentence
// period stays with the Arabic text.
const latinRunPattern = /[A-Za-z\d][\w./:-]*/gu;
const trailingSeparators = new Set([".", "/", ":", "-"]);
// Any strong right-to-left letter: Hebrew, Arabic, Syriac, Thaana, NKo, and
// the Arabic presentation forms.
const rightToLeftLetterPattern = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

const trimTrailingSeparators = (token: string): string => {
  let end = token.length;
  while (end > 1 && trailingSeparators.has(token.charAt(end - 1))) {
    end -= 1;
  }
  return token.slice(0, end);
};

/**
In a right-to-left run, a token such as "4.NF.A.1" mixes weak and strong characters, and the bidi algorithm reorders its neutral dots against the Arabic text around it. Each Latin or numeric token is isolated with `<bdi>`, so it keeps its own left-to-right order without changing the Arabic base direction. Text with no right-to-left letter is isolated as one run. Left-to-right pages pass text through untouched.
*/
export const BidiText = ({
  text,
  direction,
}: {
  readonly text: string;
  readonly direction: LearnerCopy["direction"];
}): ReactNode => {
  if (direction === "ltr") {
    return text;
  }
  // A whole left-to-right sentence (approved copy written in English) is one
  // run. Isolating it word by word would let the Arabic base direction
  // reverse the word order, so it is isolated once.
  if (!rightToLeftLetterPattern.test(text)) {
    return <bdi dir="ltr">{text}</bdi>;
  }
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(latinRunPattern)) {
    const token = trimTrailingSeparators(match[0]);
    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index));
    }
    parts.push(
      <bdi dir="ltr" key={match.index}>
        {token}
      </bdi>
    );
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts;
};
