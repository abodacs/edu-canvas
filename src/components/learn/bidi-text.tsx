import type { ReactNode } from "react";

import type { LearnerCopy } from "./learner-copy";

const latinRunPattern = /[A-Za-z\d][\w./:-]*/gu;
const trailingSeparators = new Set([".", "/", ":", "-"]);
const rightToLeftLetterPattern = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

const trimTrailingSeparators = (token: string): string => {
  let end = token.length;
  while (end > 1 && trailingSeparators.has(token.charAt(end - 1))) {
    end -= 1;
  }
  return token.slice(0, end);
};

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
