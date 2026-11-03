# Scholé demo video script

> **Status:** fresh script for the current build, 2026-11-04. It replaces the removed 2026-10-24 hackathon script and the older product-strategy script. The recording rule is unchanged: show only behavior present in the submitted revision, and label live model output, synthetic data, and shortened waits honestly.

**Promise:** one teacher sentence becomes a reviewable lesson pack, a server-graded learner attempt, and evidence for the next step.

**Target runtime:** 2:55. Hard stop: 2:59. The main cut is a single continuous teacher-to-learner loop, not a feature tour.

**Format:** 16:9, 1080p, narrated screen recording. Voiceover only under the product audio; no music competing with narration.

**One-line title:** Scholé — one sentence to a lesson the teacher controls.

## What changed since the removed script

This script reflects the current `main` behavior, not the July 2026 slice.

| Area | Current behavior | What the video should show |
| --- | --- | --- |
| Brand | The product is **Scholé**. The repository path still says `edu-canvas`. | Use “Scholé” in narration, captions, and the end card. Do not show an old “Edu-Canvas” heading. |
| Provider | Server-only **Meta Muse Spark** through the Responses transport. Default model: `muse-spark-1.2-contributor`. | Say “Meta Muse Spark” only when the preview provenance names that model. If it names another model, read the actual name. |
| Full loop | Generation → validation → teacher preview → per-screen approval → immutable publication → learner matching → server grading → reveal → deterministic next-activity proposal → teacher results view. | Show the whole loop. Do not stop at the preview and call it a demo. |
| Approval and publication | Every screen and the reverse reasoning path are approved per revision. Publishing writes one immutable publication and one assignment. | Show the approval count moving to 5 of 5, the publish gate opening, and the published link. |
| Learner grading | The server owns the answer key and the score. The client cannot submit a score. | Show a wrong answer, the server result, and the corrective reveal. Never show a client-side score. |
| Next activity | A checked-in deterministic rule proposes the next approved activity. The learner view and teacher results view show the stored reason. | Say “fixed rule” or “deterministic rule.” Do not call it adaptive AI or a diagnosis. |
| Teacher results | `/dashboard` is a read-only evidence view: attempts in order, the stored decision, rule version, evidence hash, and the assigned screen preview. | Show the evidence. State clearly that teacher override and pause are **not** shipped. |
| Moderation | A hard block stops preview and publication. The recovery panel keeps the teacher’s words and the earlier draft. | Optional insert only. Do not stage a blocked prompt in the main cut. |
| Request limits | Shared PostgreSQL limits guard provider calls; rejected requests return `RATE_LIMITED` with a retry interval. | Mention the boundary in the close if useful. Do not show a quota screen as the main story. |
| Catalog identity | The seed and live preview pin the same `A2UI_CATALOG_VERSION`. | Show the catalog in the preview provenance strip if it is legible. |
| Learner access | The learner page is keyboard-complete and works at phone width; the learner copy is RTL-ready. English remains the shipping scope. | Optional accessibility insert. Do not claim a bilingual product. |
| UX redesign | The token foundation and verification gates shipped. The page slices are on hold. | Do not present mock screens or redesign captures as shipped behavior. |

The removed demo-mode runtime is not coming back. There is no runtime fixture provider to fall back to. If the live provider fails, stop and record what actually works; do not splice in a seeded learner result.

## Before recording

### 1. Pin the build

```bash
git rev-parse HEAD
git status --short
pnpm check
pnpm build
pnpm start
pnpm smoke
```

Record the commit SHA, provider model, and database name in the edit notes. The video description may cite the SHA; the video itself should not display a terminal full of configuration.

### 2. Reset the synthetic stage

Use a disposable synthetic database. Do not record against a database that contains real student data.

```bash
docker compose down -v
docker compose up -d postgres
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
export META_API_KEY=<server-side-key>
export SYNTHETIC_DATA_ONLY=true
pnpm db:setup
pnpm dev
```

Check readiness before opening the browser:

```bash
curl --fail --silent http://localhost:3000/api/readiness
```

The provider key stays server-side. Never show `.env`, a terminal export, a network panel, or a request header containing the key.

### 3. Use the seeded accounts

| Role | Email | Password | Class to choose |
| --- | --- | --- | --- |
| Teacher | `amira.north@example.test` | `synthetic-pass-1` | `Grade 4S · Synthetic Fractions` (Teacher) |
| Learner | `omar.demo@example.test` | `synthetic-pass-1` | `Grade 4S · Synthetic Fractions` (Student) |

The demo tenant owns the curriculum. If the class name changed in the seed, choose the synthetic Grade 4 class that contains **Omar Nabil**. Do not choose `Grade 4A` for the main take; it does not own the seeded equivalent-fractions curriculum.

Pre-sign the learner profile before the take. The learner sign-in screen is not part of the cut; open the published link directly in the already-authenticated learner profile.

### 4. Prepare one reviewed synthetic source

The publish bridge only creates a learner assignment when the pack cites a reviewed source. A prompt-only pack publishes but produces no learner link. Upload the source in the teacher profile, review the extracted text, confirm “The source covers the required skills,” and leave it bound. Reload the workspace once and confirm the chip says `Drafts use <file>`.

Use the sample in [Appendix B](#appendix-b-synthetic-source-file). It is short, selectable text, contains no real student data, and covers the equivalent-fractions idea. Do not use a real worksheet, a real student name, or a scanned page.

### 5. Set up two browser profiles

| Window | Viewport | Purpose |
| --- | --- | --- |
| Teacher | 1440 × 900, browser zoom 110–125% | Landing, workspace, review, publish, results |
| Learner | 390 × 844, browser zoom 100% | Matching board, reveal, phone-width proof |

Use separate browser profiles or containers so the teacher and learner sessions never share cookies. Keep the learner window closed until the published link exists. Close bookmarks bars, extensions, password managers, and notification popups.

### 6. Rehearse the exact wrong path

Run the whole loop once without recording:

1. Teacher signs in and generates the draft from the reviewed source.
2. Teacher opens the preview, reviews every screen, approves the reverse path, publishes to Omar, and copies the **Open the learner activity** link address.
3. Learner opens the link and pairs the first assigned source with a target that is visibly not equivalent to it. Use a declared decoy if the pack has one; otherwise use another source's target. Record the exact labels.
4. Teacher refreshes `/dashboard` and opens the run detail.

Confirm the wrong answer produces an **incorrect** result and a corrective reveal. If any wrong answer produces a success reveal, stop and fix the build; do not record around it.

The learner link always opens the **first** approved variant, not the card chosen in the studio. Before recording, confirm that first variant is a core variant and that a separate support variant exists; otherwise the deterministic rule may pause instead of proposing the support activity, and the **Needs you** panel will not appear.

## Main cut — 2:55

Burn in a small `Synthetic data` label for the whole video. If the wait is shortened, burn in `Wait shortened — live generation` for the duration of the cut. The captions below are on-screen text, not subtitles for every word.

| Time | Picture | Narration | Caption |
| --- | --- | --- | --- |
| 0:00–0:12 | Landing page. Hold on the headline and the equivalent-fractions reveal illustration. Let the trust line “You stay in charge” appear. | “This is Scholé. A teacher describes one learning moment, and gets a lesson draft they can inspect before any student sees it.” | One sentence in. The teacher stays in charge. |
| 0:12–0:27 | Teacher workspace. Show the reviewed source chip, the prompt `equivalent fractions for grade 4`, and the inferred signals: Grade 4, `4.NF.A.1`, English. | “I’m signed in as a teacher in a synthetic Grade 4 class. I’ve already reviewed this one-page source, so the next draft is bound to it. I’ll ask for equivalent fractions, Grade 4.” | A reviewed source. A visible target. |
| 0:27–0:45 | Click **Create lesson**. Show “Shaping the draft…”. Cut the wait with the shortened-wait label, then reveal the four variant cards: two core options, one support option, and one stretch option. | “Meta Muse Spark runs on the server and returns a strict lesson contract: four variants, matching pieces, hints, feedback, language and accessibility metadata. It returns structured data, not executable HTML.” | Meta Muse Spark → strict lesson contract. |
| 0:45–1:00 | Select one of the two core variants. Click **Open the preview for this version**. In the A2UI preview, select a source and one target. Hold on the provenance strip long enough to read the model and catalog. | “The draft compiles into an allowlisted A2UI catalog. The preview is semantic DOM, and the private answer key never enters it.” | Allowlisted A2UI. No generated code. |
| 1:00–1:14 | Scroll to **Review and publish this pack** and open the review gallery. Show the validation verdict, the four screen cards, and the reverse reasoning path. | “Before publication, the server checks structure, curriculum alignment, learning quality, and safety. Warnings stay visible. A hard block stops the path.” | Validate before preview. |
| 1:14–1:34 | Open one screen. If a warning appears, check its acknowledgement; click **Approve this screen**. Return to the gallery. Quick cuts: the remaining screens approve; the reverse path approves; the count reaches 5 of 5; the publish gate opens. | “I approve every screen and the reverse path that comes before it. Each approval is tied to this revision. Saving an edit would revalidate the pack and start the approvals again.” | Every screen. Every revision. |
| 1:34–1:47 | Click **Continue to publish**. Hold on the confirmation: revision number, artifact hash, approved sequence. Select **Omar Nabil**. Click **Publish and assign**. Show the success state and the learner link. | “Publishing writes one immutable publication and one assignment. A later edit starts a new revision; it cannot change what this learner is working on.” | Immutable publication. One assigned learner. |
| 1:47–2:10 | Learner profile at phone width. Show the assigned matching board. Pair the rehearsal's source with its non-equivalent target (for example, `1/2` with `2/3` if those labels are in the draft). Click **Done**. Hold on the server result: score, correctness, per-pair reveal, corrective feedback, and **Still to match:**. | “Omar opens the assigned screen. He pairs [source] with [decoy] — a plausible wrong answer. The server grades the submission; the browser cannot submit a score. The reveal names what is not yet matched instead of showing a false success.” | Server-authoritative grading. |
| 2:10–2:22 | Show the “What next” card and its stored reason. Do not imply the learner has already started it. | “A fixed rule, not the model, proposes the next activity: another supported example. It is a recommendation from stored evidence, not a mastery diagnosis.” | A fixed rule, not a diagnosis. |
| 2:22–2:42 | Teacher profile. Open `/dashboard`. Click **Refresh**. Show **Needs you · 1**. Open the run. Show the attempt order, “Why this next activity,” rule version, evidence hash, and the assigned-screen preview. | “Back in the teacher’s results view, the same response appears as evidence: the first attempt, the proposed next activity, the rule version, and an evidence hash. The view is read-only and labelled observational. Teacher override is the next slice — this release does not pretend to ship it.” | Evidence, not a mastery claim. |
| 2:42–2:55 | Split screen, under three seconds each: the provider seam, the A2UI contract, the learner grading path, and a green `pnpm check`. End card: **Scholé — teaching, returned to its origin.** | “The boundary is the product: the model drafts, deterministic rules validate and grade, a fixed catalog renders, and answer keys stay on the server. Scholé gives the teacher a reviewable head start — and keeps the decision where it belongs.” | Model drafts. Server decides. Teacher approves. |

### Edit notes for the main cut

- Replace `[source]` and `[decoy]` with the exact labels from the recorded draft; for example, “one half with two thirds” only if those labels are present.
- Do not speed-ramp the grade or reveal. The result is the proof; let it land.
- Cut the generation wait only with a visible shortened-wait label. Preserve the loading state long enough to prove the request is real.
- Keep the approval count and the publish gate in frame. They are the clearest proof that nothing publishes silently.
- Show the learner at phone width for at least the result. The responsive path is part of the claim.
- If the preview provenance strip is too small, zoom before recording rather than adding a post-production overlay.
- Do not show a real email address, a real learner name, or a real class name. The seeded names are synthetic.

## Optional inserts

Use these only if the main cut has room, or publish them as separate short clips. Do not let an insert push the main loop past the hard stop.

### A. Moderation recovery — 15 seconds

**Picture:** Type a request that crosses the safety boundary. Show the blocked state, the category, and **Revise request**. Keep the earlier ready draft visible above the panel.

**Narration:** “If a request crosses the safety boundary, the gate blocks it before preview. The panel keeps my words, names the category, and offers a revise path. My earlier draft stays on screen.”

**Caption:** Hard block before preview. Earlier work preserved.

**Rule:** Show the category the server actually returns. Do not invent a category or script a fake block.

### B. Source recovery — 15 seconds

**Picture:** Upload a synthetic PDF with a missing or unreadable section. Show the gap state and affected pages. Enter corrected text or replace the file. Confirm review and show the bound chip.

**Narration:** “A source with unreadable or missing content stops generation. Scholé shows what is missing, and I can correct the text or replace the file before I review it.”

**Caption:** No silent extraction. Fix or replace.

**Rule:** Use a deliberately incomplete synthetic file, never a real student document.

### C. Keyboard and phone-width learner path — 10 seconds

**Picture:** At 390 × 844, use Tab and Space to select a source and a target, submit, and land on the reveal heading. Show the visible focus ring.

**Narration:** “The learner path is keyboard-complete and works at phone width. Focus moves to the result heading, and the live region announces the grade.”

**Caption:** Keyboard and phone width.

**Rule:** If the browser’s automation surface cannot deliver real Tab events, use a manual keyboard take. Do not describe a scripted click path as keyboard-only.

### D. RTL learner surface — 10 seconds

**Picture:** A persisted Arabic lesson board in RTL, with mixed Latin fraction tokens. Show the layout and the isolated tokens.

**Narration:** “The learner surface can render the pack’s approved language and direction. English is the shipping scope today.”

**Caption:** RTL-ready learner surface. English ships first.

**Rule:** Do not use this insert to imply that bilingual authoring or Arabic rollout is shipped.

## Claim boundaries

Say only what the recorded revision demonstrates.

| Say | Do not say |
| --- | --- |
| “Meta Muse Spark drafts the lesson on the server.” | “The model teaches” or “the model grades.” |
| “Four validated variants, each a content option.” | “Four teaching stages” or “four lessons.” |
| “The teacher approves every screen and the reverse path.” | “The teacher approves the learner’s next activity.” Teacher override is not shipped. |
| “Publishing writes an immutable version and one assignment.” | “Edits update the published lesson in place.” |
| “The server grades the submission.” | “The browser calculates the score” or “the client sends the score.” |
| “A fixed rule proposes the next approved activity.” | “AI adapts the next lesson” or “the system diagnoses the misconception.” |
| “The learner sees one assigned matching screen.” | “The learner completes a worked example, guided practice, and an independent check.” That full sequence is not the current learner runtime. |
| “The teacher results view is read-only evidence.” | “The teacher can pause or override the recommendation.” That is the next slice. |
| “Synthetic data only.” | “Used with real students” or “classroom-proven.” |
| “The learner page is keyboard-complete and phone-width ready.” | “The whole product is bilingual” or “Arabic has shipped.” |
| “The source is a reviewed synthetic document.” | “Learning Commons grounding” or “live curriculum retrieval.” |
| “The video shows a live model run.” | “The video shows a fixture” unless the provenance actually says fixture. |

This demo cannot establish learning gains, diagnose a misconception, or prove preparation-time savings. Those claims need the evidence gates in the [validation tracker](validation-tracker.md), not a screen recording.

## Post-record verification

- [ ] The model named in narration matches the model in the recorded provenance.
- [ ] The `Synthetic data` label is visible for the whole video.
- [ ] Any shortened generation wait is labelled on screen.
- [ ] The wrong answer uses labels the recorded draft actually renders, and it produces an incorrect result, not a success reveal.
- [ ] The approval count reaches 5 of 5 before the publish gate opens.
- [ ] The published link opens in a fresh learner profile and shows the assigned screen.
- [ ] The teacher results view shows the same attempt, reason, rule version, and evidence hash.
- [ ] No API key, `.env` value, session cookie, real email, or real learner name is visible.
- [ ] No mock screen, planned UI, or unshipped override control appears as live behavior.
- [ ] The video is under 3:00 and the audio is intelligible on phone speakers.
- [ ] The video description, title, and captions use **Scholé**, not Edu-Canvas.

## Fallback ladder

Pick the highest rung that is still honest. Never fake the missing stage.

1. **Live generation is slow.** Keep the real loading state, cut the wait, and label it. Do not replace the wait with a static image.
2. **Live generation fails.** Stop. Record the failure state and the recovery path if it works. Do not splice in a seeded learner result.
3. **Review or publication fails.** Record the teacher-review slice through the preview and validation. State that publication is incomplete. Do not show a learner screen.
4. **The learner link fails.** Record the teacher slice and the published-state proof. Do not mock the learner board.
5. **The results view fails.** Show the learner grade and reveal, then state that the teacher evidence view is unavailable. Do not narrate evidence that is not on screen.
6. **The take runs long.** Cut the code proof shot first, then the optional preview interaction, then the source-chip explanation. Never cut the approval gate, the wrong-answer grade, the reveal, or the teacher evidence.

## Short cutdowns

### 60-second cut

| Time      | Shot                                                |
| --------- | --------------------------------------------------- |
| 0:00–0:08 | Landing headline and reveal.                        |
| 0:08–0:20 | Prompt, source chip, Create lesson, four variants.  |
| 0:20–0:30 | A2UI preview and validation verdict.                |
| 0:30–0:40 | Approve every screen, publish gate, published link. |
| 0:40–0:50 | Learner wrong answer, server grade, reveal.         |
| 0:50–1:00 | Teacher results evidence and end card.              |

### 30-second cut

Landing → one sentence → four variants → approval gate → learner reveal → teacher evidence → end card. Use captions only; no narration except the final line.

## Submission description

> Scholé turns a teacher’s plain-language objective into four validated lesson variants. The teacher reviews every screen, approves the reverse reasoning path, and publishes an immutable version to one learner. The server grades the learner’s matching attempt, returns corrective feedback and a connection reveal, and a checked-in rule proposes the next approved activity. The teacher sees the attempt evidence, the reason, the rule version, and an evidence hash in a read-only results view.
>
> Built with TanStack Start, React, PostgreSQL, and an allowlisted A2UI v0.9.1 catalog, with Meta Muse Spark behind a server-only provider seam. Synthetic data only; no real student data was used.

## Appendix A: exact click path

1. Open `http://localhost:3000/login`.
2. Sign in as `amira.north@example.test` / `synthetic-pass-1`.
3. Choose `Grade 4S · Synthetic Fractions` (Teacher) and continue.
4. Confirm the source chip says `Drafts use <file>`.
5. Keep the prompt `equivalent fractions for grade 4`; confirm the signals show Grade 4, `4.NF.A.1`, English.
6. Click **Create lesson**.
7. Select one of the two core variants; click **Open the preview for this version**.
8. Select a source and one target in the preview.
9. Click **Review and publish this pack**.
10. On each screen: acknowledge any warnings, then click **Approve this screen**. Return to the gallery.
11. Approve the reverse reasoning path.
12. Confirm the publish gate reads every screen and the reverse path approved.
13. Click **Continue to publish**.
14. Select **Omar Nabil**; click **Publish and assign**.
15. Copy the **Open the learner activity** link address from the success state.
16. In the learner profile, open the link.
17. Pair the source with the non-equivalent target chosen in rehearsal; click **Done**.
18. Read the score, correctness, per-pair reveal, feedback, and **Still to match:**.
19. In the teacher profile, open `/dashboard`; click **Refresh**.
20. Open **Needs you · 1** → **See results**.
21. Show the attempts, “Why this next activity,” rule version, evidence hash, and assigned-screen preview.

## Appendix B: synthetic source file

Save this as `equivalent-fractions-source.md` and upload it as the reviewed source. It is deliberately short and contains no student data.

```markdown
# Equivalent Fractions — Grade 4

A fraction names equal parts of one whole.

- 1/2 means one of two equal parts.
- 2/4 means two of four equal parts.
- 3/6 means three of six equal parts.
- 4/8 means four of eight equal parts.

1/2, 2/4, 3/6, and 4/8 name the same amount. They are equivalent fractions.

2/3 is not equivalent to 1/2. Thirds are larger than halves, so the shaded parts do not cover the same amount.

To check whether two fractions are equivalent, multiply or divide the numerator and the denominator by the same number. The value does not change.
```

If the source panel rejects the Markdown file, save the same text as `equivalent-fractions-source.txt`. Do not shorten the extracted text after review; the draft must cite the reviewed snapshot.

## Appendix C: recording quick card

- **Runtime:** 2:55; hard stop 2:59.
- **Teacher:** 1440 × 900; **Learner:** 390 × 844.
- **Live label:** `Synthetic data` always; `Wait shortened` only where true.
- **Main proof:** 5 of 5 approvals → immutable publish → wrong answer → server grade → reveal → teacher evidence.
- **Never claim:** override, multi-stage learner sequence, learning gains, diagnosis, bilingual rollout, Learning Commons grounding.
- **If it breaks:** stop, label the working slice, and do not simulate the missing stage.
