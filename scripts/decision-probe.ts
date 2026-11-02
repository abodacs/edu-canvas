import { decideNextActivity } from "../src/server/learner/decision";
import { buildReveal } from "../src/server/learner/reveal";

const rationale =
  "Both fractions describe the same part because equal parts keep the same value when both numbers are multiplied by the same factor.";

const standardA = "variant-standard-a";
const standardB = "variant-standard-b";
const challenge = "variant-challenge";
const sourceHalf = "source-half";
const sourceThirds = "source-thirds";
const targetHalf = "target-half";
const targetThirds = "target-thirds";

const outcome = decideNextActivity({
  assignedActivityId: standardA,
  independent: { assisted: false, correctness: "correct" },
  guided: null,
  activities: [
    { activityId: standardA, kind: "standard" },
    { activityId: standardB, kind: "standard" },
    { activityId: challenge, kind: "challenge" },
  ],
});

const reveal = buildReveal({
  items: [
    { id: sourceHalf, label: "1/2" },
    { id: sourceThirds, label: "2/3" },
    { id: targetHalf, label: "2/4" },
    { id: targetThirds, label: "4/6" },
  ],
  relationships: [
    { correctTargetIds: [targetHalf], itemId: sourceHalf },
    { correctTargetIds: [targetThirds], itemId: sourceThirds },
  ],
  pairs: [
    { sourceId: sourceHalf, targetId: targetHalf },
    { sourceId: sourceThirds, targetId: targetThirds },
  ],
  correctness: "correct",
  feedback: {
    correct: "Yes. Both names describe the same part.",
    incorrect: "Not yet. Multiply both parts by the same number.",
  },
  rationale,
  language: "en",
});

process.stdout.write(JSON.stringify({ outcome, reveal }));
