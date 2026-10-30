# Blocked generation recovery: state specification

| Field | Value |
| --- | --- |
| Issue | [#119](https://github.com/abodacs/edu-canvas/issues/119) |
| Revision | 2026-10-31 |
| Code baseline | commit `7847d46`; the cited source files are identical on this branch |
| Status | Specification. No runtime change in this ticket. |
| Surface owner | [#115](https://github.com/abodacs/edu-canvas/issues/115); the recovery base landed in [#10](https://github.com/abodacs/edu-canvas/issues/10) |
| Category-code owner | [#132](https://github.com/abodacs/edu-canvas/issues/132); code names are provisional |
| Evidence | Source read at `7847d46`; one-off probe of the real `createDefaultContentSafety` on 14 objectives |

The [teacher UI implementation gate](../product/teacher-ui.md#implementation-gate) blocks UI implementation without explicit approval. This document is design material. It does not authorize a build.

## 1. Purpose and scope

A Grade 4 teacher submits a benign mathematics objective. Safety review blocks it. The teacher must keep the objective, keep any saved draft, understand the block at category level, and submit a revised request. One false positive costs one revision, not the work.

In scope: both block moments, panel anatomy, copy per category code, variants with and without a draft, the post-revision contract, the five failure classes, copy rules, and benign-math evidence.

Out of scope: detection rules (#132), UI implementation (#115), keyboard focus and announcements (ticket 02 of this series), provider moderation, and any change under `src/`.

Evidence limit: no UI exists for this state today. No statement here records runtime UI behavior.

## 2. Block moments

Moderation blocks at two moments. Both persist state `blocked-by-moderation` ([service.ts](../../src/server/generation/service.ts):51) and one `MODERATION_BLOCKED` diagnostic.

| Moment | Check | Position | Draft | Persisted record |
| --- | --- | --- | --- | --- |
| Input block | `checkPrompt` (`service.ts:722`) | Before the first provider call | Does not exist | `blocked-by-moderation`, no draft |
| Output block | `checkGeneratedContent` (`service.ts:758`) | After the first provider response, before validation and persistence | Withheld | `blocked-by-moderation`, no draft |
| Correction block | `checkGeneratedContent` (`service.ts:826`) | After the one correction call | Withheld | `blocked-by-moderation`, no draft |

Verified facts:

- `checkPrompt` runs after the claim and before `runProviderCall` (`service.ts:722`, then `:746-753`). A prompt block makes zero provider calls; the conformance test at `service-conformance.test.ts:746-785` asserts this.
- `checkGeneratedContent` runs before `validateProviderDraft` and `acceptDraft` (`service.ts:758-769`). `finishAttempt` stores `draft: null` for a blocked outcome (`:444-468`). Nothing reaches preview.
- A moderation block is not an error response. It is a persisted attempt result with `retry.available: false` ([projection.ts](../../src/server/generation/projection.ts):47-52).
- An output block never triggers a correction call (`service.ts:758-769`; test `:816-839`).

The panel treats both moments the same. The variant differs only in whether an earlier draft exists (section 5).

## 3. Panel anatomy

The panel replaces the result area for `blocked-by-moderation`. Elements appear in this order.

| # | Element | Required content | Rule |
| --- | --- | --- | --- |
| 1 | Title | "Let’s reshape that request." | Reuse the #10 title ([teacher-studio.tsx](../../src/components/studio/teacher-studio.tsx):122); do not invent a second title |
| 2 | Category explanation | The sentence for the block's code (section 4) | Names the category, never a provider reason |
| 3 | Preserved objective | The exact prompt text of the blocked request | Byte-for-byte; no paraphrase, no truncation, no highlight of suspect words |
| 4 | Earlier-draft note | "Your earlier draft is unchanged." | Only when an earlier draft exists |
| 5 | Request reference | "Request " followed by the `requestId` | The public id is already in the contract ([generation-contract.ts](../../src/shared/generation-contract.ts):117-118) |
| 6 | Diagnostic reference | "Category: " followed by the code, plus the diagnostic code | Code names are provisional until #132 |
| 7 | Action | One button: "Revise request" | Returns to the objective field with the text intact |
| 8 | Retry control | None | `retry.available` is false; do not render "Try that again" (`teacher-studio.tsx:639-645`) |

Rules:

- Keep the objective text unchanged. The teacher edits it; the panel never rewrites it.
- One action only. No provider switch, no fixture substitution, no send-for-review, no "start over".
- Do not use the raw server diagnostic as the explanation. The input diagnostic says "…before trying again" (`service.ts:726`), and moderation copy must not (section 8). Map the state to the section 4 copy; keep the diagnostic code as reference.
- The explanation is not a verdict on the mathematics. An objective can be valid Grade 4 mathematics and still blocked.
- Focus return and live-region announcements belong to the keyboard contract (ticket 02). Today's fallback announcement reads "Generation state: blocked by moderation" (`teacher-studio.tsx:149-163`); it is technical and must not ship.

## 4. Copy per category code

The codes are provisional. [#132](https://github.com/abodacs/edu-canvas/issues/132) owns the names; its default decision fixes `personal-data` and `harmful-content`. No provider moderation contract is verified, so this document invents no provider code and no provider reason.

| Code (provisional) | Teacher label | Explanation | Action |
| --- | --- | --- | --- |
| `personal-data` | Information about a real person | "This request seems to include information about a real person, such as a name, email address, or student identifier. Lesson requests use made-up examples. Describe the fraction goal instead." | "Revise request" |
| `harmful-content` | Content that could harm students | "This request seems to ask for content that could harm students. Describe the Grade 4 fraction goal and a safe classroom example instead." | "Revise request" |

Shared elements: title "Let’s reshape that request."; action "Revise request"; reference line "Request <id>. Category: <code>."

Rules:

- Name the category, not a provider reason.
- Do not name the matched phrase. The factory returns only `{ allowed }` ([service.ts](../../src/server/generation/service.ts):62-64), so no match detail exists. Copy that names a phrase would be invented.
- Never use "try again", "retry", "resubmit", or "same request" in moderation copy.
- An unknown code gets the generic sentence "This request was blocked by safety review. Describe the fraction goal in different words." Do not print an unknown code to the teacher.
- Do not promise that the revised request succeeds.

## 5. Variants

### Variant A: no draft, input block on a first request

- The composer keeps its text. The panel shows the same text as the preserved objective.
- The blocked request appears once in the request list with its state, request reference, and `MODERATION_BLOCKED`.
- "Revise request" returns to the objective field. Prompt, grade, standard, language, and difficulty stay as entered; ticket 02 owns focus and selection.
- The blocked request cannot open a preview.

### Variant B: existing draft, output block on a later request

- The earlier `ready-for-review` draft stays visible and unchanged. It is a different record with its own `requestId`.
- The new request is its own record, with state `blocked-by-moderation` and no draft.
- The panel shows the earlier-draft note, the new request reference, and the category.
- The request list shows both records: the earlier draft and the blocked request with its diagnostic. Neither replaces the other.
- "Revise request" returns to the objective field with the blocked prompt. The earlier draft stays untouched.
- The blocked attempt made one provider call and no correction call (`service.ts:758-769`; test `:816-839`).

Empty and loading are not moderation states. An empty list is the normal create flow. Loading is `generating` with an honest wait message. #115 owns both.

## 6. Post-revision contract

A revised request is a new generation request, not a retry.

| Requirement | Contract | Verified at `7847d46` |
| --- | --- | --- |
| Changed request | The prompt differs from the blocked prompt | The same prompt under a new key is refused with `MODERATION_REVISION_REQUIRED` (`service.ts:889-899`; test `:746-785`) |
| New operation key | A new idempotency key; an implicit key includes the prompt (`service.ts:140-152`) | A revised prompt without a link succeeds as a new request (test `:788-810`) |
| Link to the blocked request | `retryOfRequestId` equals the blocked `requestId` ([generation-contract.ts](../../src/shared/generation-contract.ts):38) | Rejected today: `DRAFT_NOT_RETRYABLE` |
| Prior record preserved | The blocked record keeps its state, diagnostics, and null draft | `finishAttempt` writes a new record; the blocked record is never mutated (`service.ts:444-468`) |
| No unchanged retry | No retry affordance and no automatic resubmission | `retry.available: false` (`projection.ts:47-52`); the service refuses the same request hash |

### Verified gap: the link field

`retryOfRequestId` accepts only retryable states. `isRetryableState` allows `failed-retryable` and `blocked-by-validation`, not `blocked-by-moderation` (`service.ts:280-281`). The retry path also requires identical metadata, including the prompt (`:291-313`, `:911-923`).

A one-off probe on the seeded service confirms both halves. Safety rejects prompts that contain "unsafe"; the blocked id is `draft_probe_1`.

```text
revised prompt + retryOfRequestId(blocked): DRAFT_NOT_RETRYABLE — "This draft is not in a state that can be retried."
revised prompt without retryOfRequestId: ready-for-review, id draft_probe_2
```

Consequence: #119 requires `retryOfRequestId` to link back. Today the server rejects that field for a moderation-blocked referent. #115 cannot satisfy the link requirement alone. One of these must happen before wiring:

- allow a revision relation from `blocked-by-moderation` with a changed prompt, or
- add an explicit revision field that does not reuse the retry rule.

This document does not choose between them. It records that the gap exists, needs a service change, and must not be faked in the client. Until then, the panel shows the request reference and does not send a link the server rejects.

Also: a same-hash request is refused even with a new key and before any retry check (`service.ts:889-899`). The error code is `MODERATION_REVISION_REQUIRED`, not a moderation state. #115 must map this error to the same panel, not to a generic error.

## 7. Five failure classes

Only moderation gets revise-request copy. Only retryable failures get the retry control.

| Failure class | State at `7847d46` | Teacher-visible reason | Action | Retry |
| --- | --- | --- | --- | --- |
| Moderation | `blocked-by-moderation` | Category copy (section 4); diagnostic `MODERATION_BLOCKED` | "Revise request" | No |
| Timeout | `failed-retryable` | `GENERATION_DEADLINE_EXCEEDED` ("The generation deadline expired before the draft finished. Try this draft again.") or `PROVIDER_TIMEOUT` ("The lesson provider timed out. Try again.") | "Try that again" with a new operation key | Yes |
| Quota | `failed-retryable` | No quota-specific code exists. Provider `rate-limit` maps to `PROVIDER_RATE_LIMIT` with the provider `safeMessage` | "Try that again" with a new operation key | Yes |
| Validation block | `blocked-by-validation` | Validator diagnostics (gate and curriculum) | Review the diagnostics, then "Try that again" | Yes |
| Preview disconnect | `ready-for-review`, unchanged | Preview status `disconnected`: "The preview connection was interrupted. Check your connection and try again." | Open the preview again | No generation retry |

Sources:

- Deadline code and message: `service.ts:60`, `:221-225`. Per-call timeout: `:235-240`.
- Provider failure mapping: `service.ts:249-258`; retryable kinds: `:262-268`.
- Validation retry copy: `projection.ts:36-44`. Retryable states: `service.ts:280-281`.
- Preview statuses and copy: [lesson-preview.tsx](../../src/components/a2ui/lesson-preview.tsx):21-32, `:96-99` (preview timeout), `:137-141` (incomplete payload), `:166-177` (disconnect).

Distinctions:

- Quota is not moderation and not validation. It must not offer "Revise request". No quota code exists today; do not invent one.
- Validation is retryable with the same request metadata. It must not offer "Revise request", and its copy must not claim a safety block.
- A preview disconnect never changes the generation record. The draft stays `ready-for-review`.
- Preview timeout and preview blocked are preview-local too. They are not generation timeouts.

## 8. Copy rules

1. Honest. State that safety review blocked the request. Do not claim the mathematics is wrong.
2. No unsafe loop. Moderation copy never offers the same request again. The UI never resubmits without a teacher edit.
3. No invented reason. Do not name a provider, a provider code, a classifier, or a matched phrase. Only #132 codes appear.
4. No provider content. Public messages exclude raw provider requests, prompts, and responses.
5. No secrets or private answer data. Do not show API detail, internal ids beyond the request reference, tenant ids, hashes, or stack traces.
6. Preserve the teacher's words. The objective block repeats the prompt exactly; the explanation is separate.
7. Category level only. The explanation names the category of information, not the token that matched.
8. One voice. The title, explanation, and action are identical for input and output blocks.
9. No promise. Do not say or imply that the next attempt will pass.
10. No silent substitution. Never change providers, swap a fixture, or relax the check to unblock.
11. Keep "Revise request" verbatim. It is the single action name; ticket 02 relies on it for focus return.

Strings that violate these rules today: `service.ts:726` and `:897` ("before trying again"). They are server messages. The panel must not present them as moderation copy. #115 should map `blocked-by-moderation` and `MODERATION_REVISION_REQUIRED` to the section 4 copy.

## 9. Benign-math evidence

All objectives are Grade 4 equivalent-fractions requests (`4.NF.A.1`) and benign classroom requests. Four contain a name, an identifier, or an email address to test the #132 personal-data boundary.

Probe, run from the repository root at `7847d46` with Node 26.8.1 and tsx 4.23.1:

```bash
node --import tsx -e '
const prompts = [
  "Grade 4 equivalent fractions lesson for 4.NF.A.1: show that 1/2 equals 2/4 and 4/8 with fraction strips.",
  "Help my class see why 3/4 and 6/8 name the same amount using a number line from 0 to 1.",
  "Students compare 1/3 and 2/6 with fraction circles, then explain why the two fractions are equal.",
  "Use a recipe with 1/2 cup and 2/4 cup of flour. Which is more? Explain with a model.",
  "Warm-up: which fractions equal 1/2 - 2/4, 3/6, or 4/6? Justify with a drawing.",
  "Small group work on 4.NF.A.1 with number lines split into eighths and fourths.",
  "Explain why multiplying numerator and denominator by the same number keeps the fraction equal, using 2/3 and 4/6.",
  "Practice set: find three fractions equivalent to 3/5 using multiplication.",
  "Exit ticket: shade 1/2, 2/4, and 4/8 of the same rectangle and compare the shaded areas.",
  "Model equivalent fractions with a pizza cut into 4 and 8 slices; students match 2/4 to 4/8.",
  "My student Amara needs extra practice finding equivalent fractions for 2/5.",
  "My student Samir wrote 2/3 = 3/4. What misconception does that show and how do I redirect?",
  "Group A (ID 4471) works on 1/2 and 2/4; group B works on 3/4 and 6/8.",
  "Send the fraction check to ayesha.khan@example.edu and review results with the class."
];
import("./src/server/generation/service.ts").then((m) => {
  const safety = m.createDefaultContentSafety();
  const rows = prompts.map((p, i) => ({ n: i + 1, allowed: safety.checkPrompt(p).allowed, prompt: p }));
  console.log(JSON.stringify(rows, null, 2));
  console.log("allowed=" + rows.filter((r) => r.allowed).length + "/" + rows.length);
});
'
```

The command imports the real `createDefaultContentSafety` (`service.ts:198-211`). No mock, no fixture, no environment values.

Output: `allowed=14/14`; every row returned `{"allowed": true}`.

| # | Objective | Current verdict | Expected verdict | #132 personal-data rules likely block |
| --- | --- | --- | --- | --- |
| 1 | Grade 4 equivalent fractions lesson for 4.NF.A.1: show that 1/2 equals 2/4 and 4/8 with fraction strips. | Allowed | Allowed | No |
| 2 | Help my class see why 3/4 and 6/8 name the same amount using a number line from 0 to 1. | Allowed | Allowed | No |
| 3 | Students compare 1/3 and 2/6 with fraction circles, then explain why the two fractions are equal. | Allowed | Allowed | No |
| 4 | Use a recipe with 1/2 cup and 2/4 cup of flour. Which is more? Explain with a model. | Allowed | Allowed | No |
| 5 | Warm-up: which fractions equal 1/2 - 2/4, 3/6, or 4/6? Justify with a drawing. | Allowed | Allowed | No |
| 6 | Small group work on 4.NF.A.1 with number lines split into eighths and fourths. | Allowed | Allowed | No |
| 7 | Explain why multiplying numerator and denominator by the same number keeps the fraction equal, using 2/3 and 4/6. | Allowed | Allowed | No |
| 8 | Practice set: find three fractions equivalent to 3/5 using multiplication. | Allowed | Allowed | No |
| 9 | Exit ticket: shade 1/2, 2/4, and 4/8 of the same rectangle and compare the shaded areas. | Allowed | Allowed | No |
| 10 | Model equivalent fractions with a pizza cut into 4 and 8 slices; students match 2/4 to 4/8. | Allowed | Allowed | No |
| 11 | My student Amara needs extra practice finding equivalent fractions for 2/5. | Allowed | Allowed | Yes, a name appears |
| 12 | My student Samir wrote 2/3 = 3/4. What misconception does that show and how do I redirect? | Allowed | Allowed | Yes, a name appears |
| 13 | Group A (ID 4471) works on 1/2 and 2/4; group B works on 3/4 and 6/8. | Allowed | Allowed | Yes, an identifier-like token appears |
| 14 | Send the fraction check to ayesha.khan@example.edu and review results with the class. | Allowed | Allowed | Yes, an email address appears |

Conclusions:

- All 14 objectives pass today. No benign-math false positive exists against the current four patterns (`service.ts:114-119`).
- The risk is future coverage. Four of 14 realistic phrasings would likely hit #132's personal-data rules. Those blocks are intended, so the recovery path in this document carries the cost.
- This evidence supports #132's default (block plus revised input) over silent redaction. A redacted name changes the teacher's request and hides the personal-data lesson. Block plus category-level revision keeps the teacher in control.
- No provider moderation was exercised. All four patterns are deterministic; no network call occurs.

Limitations:

- One factory at one revision. Another revision invalidates the verdicts.
- The probe calls `checkPrompt` only. `checkGeneratedContent` stringifies the draft and runs the same four patterns (`service.ts:201-210`), so the same rules apply to output.
- Teacher behavior is not measured. The panel copy is unvalidated with teachers.

## Open items and owners

| Item | Owner | Default until answered |
| --- | --- | --- |
| Category code names and the `ContentSafetyResult` shape | #132 | Use `personal-data` and `harmful-content`; treat the names as provisional |
| `retryOfRequestId` link from a blocked request | Service change, unassigned | Show the request reference; do not send the link |
| Panel rendering, diagnostic mapping, live-region copy | #115 | Follow sections 3, 4, and 8 |
| Keyboard focus return and announcements | Ticket 02 | "Revise request" returns focus to the objective field |
| Provider moderation contract | #132 open decision | No provider code or reason in copy |
