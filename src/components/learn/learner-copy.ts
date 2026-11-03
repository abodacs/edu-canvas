import type { LessonLanguage } from "@/shared/generation-contract";
import type { LearnerAttemptResponse } from "@/shared/learner-contract";

type Correctness = LearnerAttemptResponse["correctness"];

/**
#9: the learner page speaks one language at a time, chosen by the pack's
approved language (the issue's default locus; there is no student toggle).
Every fixed template the learner sees lives here, so the two languages cannot drift apart field by field. Approved copy from the pack is never translated.
*/
export interface LearnerCopy {
  readonly direction: "ltr" | "rtl";
  readonly headingFallback: string;
  readonly sourceHeadingFallback: string;
  readonly targetHeadingFallback: string;
  readonly matchedSuffix: string;
  readonly progress: (matched: number, total: number) => string;
  readonly submit: string;
  readonly checking: string;
  readonly clear: string;
  readonly retry: string;
  readonly score: (input: {
    readonly score: number;
    readonly correct: number;
    readonly required: number;
    readonly correctness: Correctness;
  }) => string;
  readonly outcome: Readonly<Record<Correctness, string>>;
  readonly repeatNotice: string;
  readonly revealHeading: string;
  readonly pairJoiner: string;
  readonly pairCorrect: string;
  readonly pairNotYet: string;
  readonly stillToMatch: string;
  readonly listSeparator: string;
  readonly nextHeading: string;
  readonly nextWaiting: string;
  readonly nextReady: string;
  readonly attemptLimit: string;
  readonly stale: string;
  readonly forbidden: string;
  readonly unavailable: string;
}

const english: LearnerCopy = {
  direction: "ltr",
  headingFallback: "Matching",
  sourceHeadingFallback: "Fractions",
  targetHeadingFallback: "Equivalents",
  matchedSuffix: " · matched",
  progress: (matched, total) => `${matched} of ${total} matched.`,
  submit: "Done",
  checking: "Checking…",
  clear: "Clear matches",
  retry: "Try again",
  score: ({ score, correct, required, correctness }) =>
    `Score ${score}. ${correct} of ${required} correct (${correctness}).`,
  outcome: {
    correct: "You matched every pair.",
    partial: "Some matches are still missing.",
    incorrect: "Not every match is right yet.",
  },
  repeatNotice:
    "This check repeats from the start. Your first response stays on record.",
  revealHeading: "Your check",
  pairJoiner: "to",
  pairCorrect: "Correct",
  pairNotYet: "Not yet",
  stillToMatch: "Still to match:",
  listSeparator: ", ",
  nextHeading: "What next",
  nextWaiting: "Your teacher is choosing the next activity.",
  nextReady: "Your next approved activity is ready.",
  attemptLimit:
    "You have used all three tries for this activity. Your teacher can help from here.",
  stale: "This submission is out of date. Reload the page.",
  forbidden: "This assignment does not belong to your account.",
  unavailable: "The activity is unavailable. Try again.",
};

const arabicCorrectness: Readonly<Record<Correctness, string>> = {
  correct: "صحيحة",
  partial: "جزئية",
  incorrect: "غير صحيحة",
};

const arabic: LearnerCopy = {
  direction: "rtl",
  headingFallback: "مطابقة",
  sourceHeadingFallback: "الكسور",
  targetHeadingFallback: "الكسور المكافئة",
  matchedSuffix: " · تمت مطابقته",
  progress: (matched, total) => `تمت مطابقة ${matched} من ${total}.`,
  submit: "تم",
  checking: "جارٍ التحقق…",
  clear: "مسح المطابقات",
  retry: "حاول مرة أخرى",
  score: ({ score, correct, required, correctness }) =>
    `الدرجة ${score}. ${correct} من ${required} صحيحة (${arabicCorrectness[correctness]}).`,
  outcome: {
    correct: "طابقت كل الأزواج.",
    partial: "بعض المطابقات ما زالت ناقصة.",
    incorrect: "ليست كل المطابقات صحيحة بعد.",
  },
  repeatNotice: "يبدأ هذا التحقق من البداية. تبقى إجابتك الأولى محفوظة.",
  revealHeading: "نتيجة تحققك",
  pairJoiner: "مع",
  pairCorrect: "صحيح",
  pairNotYet: "ليس بعد",
  stillToMatch: "ما زال للمطابقة:",
  listSeparator: "، ",
  nextHeading: "ما التالي",
  nextWaiting: "معلمك يختار النشاط التالي.",
  nextReady: "نشاطك التالي المعتمد جاهز.",
  attemptLimit:
    "استخدمت المحاولات الثلاث لهذا النشاط. يمكن لمعلمك مساعدتك من هنا.",
  stale: "هذه الإجابة لم تعد محدّثة. أعد تحميل الصفحة.",
  forbidden: "هذا النشاط لا يخص حسابك.",
  unavailable: "النشاط غير متاح الآن. حاول مرة أخرى.",
};

/**
A version stored before approved copy existed has no language; it keeps the document's English default.
*/
export const learnerCopyFor = (language: LessonLanguage | null): LearnerCopy =>
  language === "ar" ? arabic : english;

/**
The graded line, shared by the result panel and the live announcement.
*/
export const scoreLine = (
  copy: LearnerCopy,
  result: LearnerAttemptResponse
): string => {
  return copy.score({
    score: result.score,
    correct: result.correctMatches,
    required: result.requiredMatches,
    correctness: result.correctness,
  });
};
