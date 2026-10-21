# Edu-Canvas — Demo Video Script

> Source brief: [`docs/product-strategy.md`](product-strategy.md)  
> Submission target: narrated YouTube video, public or unlisted, under three minutes  
> Recording rule: show only behavior that is live in the build being submitted.

## Demo promise

Show one clear idea, not a platform tour:

```text
teacher's words → bounded lesson draft → visible review boundary → student understanding
```

The memorable product claim is: **Edu-Canvas helps a teacher turn a plain-language equivalent-fractions idea into a safe, reviewable visual lesson.** GPT-5.6 drafts the lesson on the server; validation and the teacher remain in control.

## DESIGN SYSTEM (REQUIRED)

- Platform: narrated browser screen recording, 16:9 at 1080p; desktop-first with one short mobile/Arabic RTL proof shot when that path is shipped.
- Theme: calm, encouraging, quietly intelligent; preserve the existing warm paper-and-ink product language.
- Visual hierarchy: live product first, one-line captions second, code and terminal evidence only as brief proof shots.
- Typography: zoom the browser until labels and diagnostics are readable in the exported video; never rely on tiny editor text.
- Audio: clean voiceover throughout; no music competing with narration or UI feedback.
- Motion: keep the cursor deliberate and pause after each state change; do not depend on animation to communicate a claim.

## Truth gate before recording

The current checkout has a strong teacher authoring slice, but it does not yet prove the full teacher-to-student loop. Choose the script below only after the relevant row is actually shipped and re-tested.

| Capability                                 | Repository evidence/status                                                                                           | Recording rule                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Teacher prompt → four variants             | Issue #3 is shipped; the seeded path returns two standard, one scaffold, and one challenge variant.                  | Safe to show.                                                                                                                                                |
| Canonical and semantic validation          | Issue #18 is shipped; warnings are teacher-visible and blocked drafts are withheld from the public projection.       | Safe to explain precisely.                                                                                                                                   |
| GPT-5.6 provider                           | The server-only adapter uses the Responses API and strict JSON Schema; clean demo mode uses a deterministic fixture. | If the video says “GPT-5.6 generated this,” record with `DEMO_MODE=false` and `OPENAI_MODEL=gpt-5.6`, or label the fixture honestly. Never show the API key. |
| Allowlisted A2UI preview                   | Issue #4 is shipped; the preview uses semantic DOM and catalog `matching-v1` / A2UI `v0.9.1`.                        | Safe to show as a teacher preview, not as a published learner activity.                                                                                      |
| Hard safety gate                           | Issue #28 remains open in the strategy snapshot.                                                                     | Do not say that the combined safety gate is live until it is merged and tested.                                                                              |
| Approval, publication, grading, adaptation | Issues #5–#11 remain downstream work in the strategy snapshot.                                                       | Do not show or claim these steps unless they exist in the submitted build.                                                                                   |
| Landing preview correctness                | Issue #27 records a distractor-only success-reveal bug.                                                              | Do not call the landing preview learner-safe until the fix is verified.                                                                                      |
| Data                                       | The demo is synthetic and seeded.                                                                                    | Say “synthetic demo data”; never imply real student data.                                                                                                    |

## Submission cut — use after the full loop is verified

Target runtime: **2:45**, hard stop at **2:55**. The table contains the exact story, visuals, and narration. Remove any row whose behavior is not present in the submitted commit.

| Time      | What to show                                                                                                                                                                 | Narration                                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Open the landing page. Hold on the teacher-first headline and the “one sentence” promise.                                                                                    | “Teachers should not have to build a worksheet before they can teach an idea. Edu-Canvas starts with the teacher’s own words and keeps the teacher in charge.”                                                                                                  |
| 0:15–0:35 | Open `/demo/teacher`. Leave the seeded prompt visible or type `equivalent fractions for grade 4`. Pause on the `4.NF.A.1`, grade, and language signals.                      | “I’ll ask for equivalent fractions for Grade 4. The request stays anchored to one learning target, with a clear language and difficulty context instead of a vague chat response.”                                                                              |
| 0:35–0:58 | Click **Create lesson**. Show the progress state, then the four generated variants.                                                                                          | “GPT-5.6 runs on the server and returns a strict lesson contract: bounded variants, relationships, hints, deterministic feedback, language metadata, and accessibility metadata. It returns structured data—not executable HTML or JavaScript.”                 |
| 0:58–1:18 | Show the validator note and the evidence/standard card. If available, briefly show a warning and its explanation.                                                            | “Before the browser sees a lesson, the server checks structure, curriculum alignment, learning quality, and safety. Warnings stay visible for review; a hard block stops the path.”                                                                             |
| 1:18–1:38 | Open the teacher review surface. Compare the core, support, and stretch versions. Edit one small field, then approve/publish the chosen pack.                                | “The model proposes options; the teacher decides what belongs in the classroom. Nothing is published silently.”                                                                                                                                                 |
| 1:38–2:05 | Switch to the seeded student view. Show `1/2` and select `2/4`, `3/6`, and `4/8`; select the distractor `2/3` first if the corrected flow supports it; submit.               | “The student sees one focused matching activity. Grading is server-authoritative: the client does not submit a score, and the private answer key never enters the student payload.”                                                                             |
| 2:05–2:25 | Show the corrected result and connection reveal. Then show the recommended next activity and its reason.                                                                     | “The reveal makes the idea visible: different names can cover the same portion of a whole. A fixed attempt result leads to one explainable next step, not an opaque personalization claim.”                                                                     |
| 2:25–2:38 | Show the teacher’s mastery/adaptation reason. Add a two-second Arabic RTL or narrow-phone shot if it has passed QA.                                                          | “The teacher can inspect why the next activity was chosen, while the student gets only the focused activity they need.”                                                                                                                                         |
| 2:38–2:55 | Brief split-screen: `src/server/generation/provider.ts`, the A2UI contract/compiler, and a terminal with the passing test command. Keep each proof shot under three seconds. | “I built this with Codex: it helped turn the strategy into typed server seams, validation rules, the allowlisted A2UI catalog, and regression tests. GPT-5.6 powers structured lesson drafting; the server owns safety, answer keys, grading, and progression.” |

### Required on-screen captions

Use short captions, one at a time:

- `One teacher sentence`
- `GPT-5.6 → strict lesson contract`
- `Validate before preview`
- `Teacher approval boundary`
- `Server-authoritative result`
- `Explainable next activity`
- `Built with Codex + GPT-5.6`

## Current-checkout cut — recordable before the downstream loop ships

Use this honest cut for the repository as it stands in the strategy snapshot. Target runtime: **2:20**.

| Time      | What to show                                                                                                                                        | Narration                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Landing page and the teacher-first promise.                                                                                                         | “Edu-Canvas starts with a teacher’s own words and turns them into a reviewable visual lesson draft.”                                                                                                          |
| 0:15–0:38 | `/demo/teacher`; enter `equivalent fractions for grade 4`; pause on the inferred context.                                                           | “The teacher gives one plain-language request. The app keeps the target visible: Grade 4, Common Core 4.NF.A.1, and the selected language.”                                                                   |
| 0:38–1:03 | Click **Create lesson**; show the loading state, four variants, diagnostic note, and private-draft copy.                                            | “The shipped generation slice returns four structurally validated variants, then exposes bounded curriculum and learning-quality diagnostics. The draft remains private while the teacher reviews it.”        |
| 1:03–1:35 | Scroll through the evidence card and variant cards. Open the A2UI preview; switch between its four tabs and select a source/target pair.            | “The accepted public projection is compiled into an allowlisted A2UI `v0.9.1` catalog and rendered as semantic DOM. This is a teacher preview: it does not publish, grade, or reveal the private answer key.” |
| 1:35–1:55 | Show a brief Arabic prompt/RTL result only if it is already part of the tested recording path; otherwise show the keyboard-accessible preview tabs. | “The contract carries language direction and accessibility metadata, so the same lesson surface can support English and Arabic RTL.”                                                                          |
| 1:55–2:12 | Show `provider.ts` with the strict JSON schema and the factory/config branch; do not show secrets.                                                  | “In production-shaped mode, GPT-5.6 is called only from the server through the OpenAI Responses API. The clean seeded demo uses a deterministic provider so the recording is repeatable.”                     |
| 2:12–2:20 | Show a passing `pnpm check` result or a test file that rejects unsafe/unknown payloads.                                                             | “Codex helped build the contracts and tests around that boundary. Approval, grading, and adaptation are the next slices, so this recording does not claim they are complete.”                                 |

## Proof shots for Codex and GPT-5.6

Keep this evidence visual and concrete; do not spend the video on a generic “AI helped me code” statement.

1. In `src/server/generation/provider.ts`, show the server-only `POST /responses` call, `model: options.model`, and the strict `json_schema` response format.
2. Show `.env.example` with `OPENAI_MODEL=gpt-5.6`; keep `OPENAI_API_KEY` empty and never open a real `.env` file on camera.
3. Show `src/server/generation/service.ts` or the validation modules where provider output is checked before public projection.
4. Show `src/shared/a2ui-contract.ts` or `src/server/a2ui/compiler.ts` with the allowlisted catalog/protocol boundary.
5. Show the test command and one meaningful test result: invalid model output is rejected, unknown A2UI components/actions are blocked, or private fields are excluded from the public projection.

Suggested voiceover for the proof shot:

> “Codex was the implementation partner: I used it to trace the product strategy into domain seams, generate and review the TypeScript contracts, and harden the failure paths with tests. GPT-5.6 is the product model, not the security boundary—it proposes a structured draft, while Edu-Canvas validates and controls what can reach the browser.”

## Recording and submission checklist

### Before recording

- Run `pnpm check` from a clean environment and fix every failure.
- Start the exact artifact you will submit; run `pnpm smoke` against it.
- Use seeded synthetic data for the repeatable path. If demonstrating a live GPT-5.6 request, use server-only credentials and confirm the model value is `gpt-5.6` without exposing the key.
- Rehearse the exact clicks once with a stopwatch. Leave at least five seconds below the three-minute limit.
- Close unrelated tabs, notifications, terminals with secrets, and browser extensions.
- Set browser zoom and recording resolution so every label, diagnostic, and caption is legible.

### During recording

- Narrate the product outcome first; use code only as short implementation evidence.
- Pause after generation, validation, preview, score, and reveal so the judge can see each state.
- Never call a target roadmap step “live.” Say “the next slice” or remove it.
- Do not show an API key, private answer key, student identity, or raw internal graph payload.
- If a network call fails, stop and re-record; do not hide a broken core path with a jump cut.

### Before submitting

- Confirm the final video is **under three minutes**, has intelligible narration, and plays from start to finish.
- Upload it as **Public** or **Unlisted**, not Private.
- Copy the exact video URL into a private/incognito window while logged out and confirm it plays with audio. Verify the URL again from a second browser profile or device.
- Confirm the repository URL, README setup path, sample/seed credentials, and required Codex `/feedback` session ID are ready alongside the video.
- Re-check the final commit against this script. The video, repository, and description must describe the same shipped behavior.

## Claims to avoid

- “Learner-safe” for the landing preview before issue #27 is fixed and re-tested.
- “Teacher approved and published” when the submitted build only has a private preview.
- “GPT-5.6 generated this live” when the recording used the deterministic fixture.
- “Adaptive next activity” when the server-authoritative attempt and deterministic adaptation path are not shipped.
- “Real classroom results” or any claim based only on product intent; the current evidence is strategy and QA evidence, not user research.

> Prompt reuse note: this repository has no `DESIGN.md`. If this brief is later converted into Stitch-generated supporting screens, create a shared `DESIGN.md` first so the visual language remains consistent.
