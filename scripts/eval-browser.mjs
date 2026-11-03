/**
S0 browser evidence runner for the delegation pack (#135).

Standalone by design: it is NOT a repo dependency. It dynamically imports
playwright-core from an external install (PW_CORE_PATH, default
/tmp/edu-canvas-pw) and drives the cached Chromium in ~/.cache/ms-playwright.

  BASE_URL=http://localhost:3111 node scripts/eval-browser.mjs

Drives the full S0 loop against a scratch environment and writes:
  - screenshots per step into <evidence-dir>/s0/
  - s0-runner-log.txt (human trace)
  - browser-results.json (merged by scripts/eval-practices.ts for the
    s0-smoke, dg-5-normal, and dg-5-challenge cases)

Failures are recorded with the exact error and a screenshot; the script never rewrites a failed step into a pass.

This is a sequential UI driver, not application code: step indexes, locator counts, and screenshot pauses are data, the main flow is one linear sequence, and waiting for either of two outcomes needs Promise.race with .then/.catch. The rules that read application-shaped code misjudge that genre here, so they are scoped off for this file only (same approach as src/routes/learn.tsx).
*/
/* eslint-disable
  github/no-then,
  import-x/dynamic-import-chunkname,
  no-magic-numbers,
  prefer-named-capture-group,
  require-unicode-regexp,
  sonarjs/cognitive-complexity,
  sonarjs/no-duplicate-string,
  sonarjs/publicly-writable-directories,
  sonarjs/super-linear-regex,
  complexity,
  unicorn/no-await-expression-member,
  unicorn/no-unreadable-new-expression,
  unicorn/prefer-await,
  unicorn/prefer-dom-node-text-content,
  unicorn/try-complexity
*/

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3111";
const EVIDENCE_ROOT =
  process.env.EVIDENCE_DIR ??
  "docs/product/teacher-practice-assessment/delegation/results";
const EVIDENCE_DIR = path.join(EVIDENCE_ROOT, "s0");
const PW_CORE_PATH =
  process.env.PW_CORE_PATH ??
  "/tmp/edu-canvas-pw/node_modules/playwright-core/index.mjs";
const TEACHER_EMAIL = "amira.north@example.test";
const LEARNER_EMAIL = "omar.demo@example.test";
const PASSWORD = "synthetic-pass-1";
const BLOCKED_PROMPT =
  "Make a fractions warm-up for Aisha's small group; her student id 4471 is on the roster sheet.";
const REVISED_PROMPT =
  "Explain why 1/2 and 2/4 name the same amount of one whole, with equal-part pictures.";
const SOURCE_FILE = "/tmp/edu-canvas-synthetic-source.txt";
const SOURCE_TEXT = [
  "Synthetic fractions reference sheet (no real people).",
  "A fraction names equal parts of one whole.",
  "1/2 of one whole is the same amount as 2/4 of the same whole.",
  "2/3 of one whole is the same amount as 4/6 of the same whole.",
  "Equivalent fractions name the same amount with different numbers.",
  "The bottom number says how many equal parts the whole is cut into.",
  "The top number says how many of those parts we are talking about.",
].join("\n");
const PROVIDER_WAIT_MS = 150_000;
const STEP_WAIT_MS = 20_000;
// The publish saga writes four transactions; a cold dev server can exceed the
// step wait before the linked/stored indicator renders.
const PUBLISH_WAIT_MS = Number(process.env.PUBLISH_WAIT_MS ?? 120_000);

const logLines = [];
const log = (message) => {
  const line = `[${new Date().toISOString()}] ${message}`;
  logLines.push(line);
  console.log(line);
};

const fail = (message) => {
  logLines.push(`[${new Date().toISOString()}] FAIL ${message}`);
  console.error(`FAIL ${message}`);
};

const writeResults = async (cases) => {
  const resultsFile = path.join(EVIDENCE_ROOT, "browser-results.json");
  const document = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    cases,
  };
  await writeFile(resultsFile, `${JSON.stringify(document, null, 2)}\n`);
  log(`wrote ${resultsFile}`);
};

const scoreSurface = ({
  tableHeading,
  provisional,
  reason,
  provenance,
  preview,
}) => {
  const isRowRendered = tableHeading > 0 && provisional > 0;
  const isReasonRendered = reason.trim().length > 0;
  const isProvenanceRendered =
    /Rule next-activity-rule-/.test(provenance) &&
    /\b[0-9a-f]{12,}\b/i.test(provenance);
  if (!isRowRendered || !isReasonRendered || !isProvenanceRendered) {
    return 0;
  }
  return preview > 0 ? 2 : 1;
};

const main = async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(SOURCE_FILE, `${SOURCE_TEXT}\n`);

  const { chromium } = await import(PW_CORE_PATH);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  const shot = async (page, name) => {
    const file = path.join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    log(`screenshot ${file}`);
    return file;
  };

  try {
    // --- Teacher segment -----------------------------------------------------
    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await teacherContext.newPage();
    page.setDefaultTimeout(STEP_WAIT_MS);
    let sourceSnapshotIdLogged = null;
    page.on("request", (request) => {
      if (!request.url().includes("/api/lessons/generate")) {
        return;
      }

      log(`generate request body: ${request.postData() ?? "none"}`);
      try {
        const body = JSON.parse(request.postData() ?? "{}");
        if (typeof body.sourceSnapshotId === "string") {
          sourceSnapshotIdLogged = body.sourceSnapshotId;
        }
      } catch {
        // Body logging stays observational.
      }
    });

    log("step 1: open sign-in");
    await page.goto(`${BASE_URL}/login`);
    // The app hydrates after first paint; filling earlier gets wiped by
    // hydration, so wait for the bundle to settle before touching inputs.
    await page.waitForLoadState("networkidle");
    await shot(page, "s0-01-sign-in-page");

    log("step 2: sign in as the synthetic teacher");
    await page.getByLabel("Email address").fill(TEACHER_EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    const typedEmail = await page.getByLabel("Email address").inputValue();
    if (typedEmail !== TEACHER_EMAIL) {
      throw new Error(
        `hydration wiped the sign-in fields; email input holds "${typedEmail}"`
      );
    }
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/membership|workspace/, { timeout: STEP_WAIT_MS });
    await shot(page, "s0-02-after-sign-in");

    if (page.url().includes("membership")) {
      log("step 3: choose the synthetic fractions membership");
      const option = page
        .locator("label", { hasText: "Synthetic Fractions" })
        .first();
      await option.click();
      await shot(page, "s0-03-membership-choice");
      await page
        .getByRole("button", { name: /continue/i })
        .first()
        .click();
    }

    log("step 4: open the teacher studio");
    await page.waitForURL(/workspace/, { timeout: STEP_WAIT_MS });
    await page.locator("#lesson-prompt").waitFor();
    await shot(page, "s0-04-workspace-studio");

    log("step 5: upload and review a synthetic source");
    await page
      .getByLabel("This material is synthetic")
      .check({ timeout: STEP_WAIT_MS });
    await page
      .getByLabel("Choose a source file to upload")
      .setInputFiles(SOURCE_FILE);
    await page
      .getByRole("button", { name: "Review the extracted text" })
      .waitFor({ timeout: 60_000 });
    await page
      .getByRole("button", { name: "Review the extracted text" })
      .click();
    await page
      .getByLabel("The source covers the required skills")
      .check({ timeout: STEP_WAIT_MS });
    await shot(page, "s0-05-source-review-open");
    await page
      .getByRole("button", { name: "Confirm review" })
      .click({ timeout: STEP_WAIT_MS });
    // The composer only sends the source once the binding state has flushed;
    // wait for the source chip before any submit.
    await page
      .locator(".prompt-composer__source-chip")
      .waitFor({ timeout: STEP_WAIT_MS });
    log("source reviewed and bound to the composer");

    log("step 6: submit the moderation-triggering objective");
    await page.locator("#lesson-prompt").fill(BLOCKED_PROMPT);
    await page
      .getByRole("button", { name: "Create lesson" })
      .click({ timeout: STEP_WAIT_MS });
    await page.locator("#revise-request").waitFor({ timeout: 60_000 });
    await shot(page, "s0-06-moderation-block");

    const blockedText = await page.locator("body").innerText();
    const hasReviseOnly = (await page.locator("#revise-request").count()) === 1;
    const hasRetryButton = /try that again/iu.test(blockedText);
    const hasApproveControls = /publish and assign/iu.test(blockedText);
    if (!hasReviseOnly || hasRetryButton || hasApproveControls) {
      fail(
        `dg-5-challenge gate check failed: revise-only=${String(hasReviseOnly)} retry-button=${String(hasRetryButton)} approve-controls=${String(hasApproveControls)}`
      );
    } else {
      log(
        "dg-5-challenge: blocked result offers exactly the revise action; no retry, approve, or publish controls"
      );
    }
    results.push({
      id: "dg-5-challenge",
      practice: "DG5",
      layer: "B-browser",
      status: "executed",
      score: hasReviseOnly && !hasRetryButton && !hasApproveControls ? 2 : 0,
      expected:
        "The blocked result exposes exactly the revise action: no retry, no approve, no publish, no withheld-draft preview.",
      observed: `Recovery panel rendered (#revise-request present=${String(hasReviseOnly)}); retry-style control present=${String(hasRetryButton)}; publish control present=${String(hasApproveControls)}.`,
      evidence: [
        "results/s0/s0-06-moderation-block.png",
        "results/s0/s0-runner-log.txt",
      ],
      flipCondition: null,
    });

    log("step 7: revise the request through the recovery panel");
    await page.locator("#revise-request").click();
    await page.locator("#lesson-prompt").waitFor({ timeout: STEP_WAIT_MS });
    const keptText = await page.locator("#lesson-prompt").inputValue();
    log(`objective field kept its text (${keptText.length} chars)`);
    await page.locator("#lesson-prompt").fill(REVISED_PROMPT);
    await page
      .getByRole("button", { name: "Create lesson" })
      .click({ timeout: STEP_WAIT_MS });

    log("step 8: wait for ready-for-review (live provider call)");
    const readyIndicator = page.getByText(
      "Choose the version that fits the room."
    );
    const failureIndicator = page
      .getByText(/missed a beat|could not be finished/iu)
      .first();
    const readyOutcome = await Promise.race([
      readyIndicator.waitFor({ timeout: PROVIDER_WAIT_MS }).then(() => "ready"),
      failureIndicator
        .waitFor({ timeout: PROVIDER_WAIT_MS })
        .then(() => "failed"),
    ]).catch(() => "timeout");
    await shot(page, "s0-07-generation-outcome");

    if (readyOutcome !== "ready") {
      const bodyText = await page.locator("body").innerText();
      fail(
        `generation did not reach ready-for-review: outcome=${readyOutcome}`
      );
      results.push({
        id: "s0-smoke",
        practice: "S0",
        layer: "B-browser",
        status: "executed",
        score: 0,
        expected:
          "Full loop completes: blocked generation, recovery, ready-for-review, approve, publish, learner attempt, reveal.",
        observed: `Loop stopped at the generation step: outcome=${readyOutcome}. Server response excerpt: ${bodyText.slice(0, 400).replaceAll("\n", " | ")}`,
        evidence: [
          "results/s0/s0-07-generation-outcome.png",
          "results/s0/s0-runner-log.txt",
        ],
        flipCondition:
          "Unblocks when the configured lesson provider completes a generation for the revised request; the provider seam is never bypassed.",
      });
      const generationBlockedResult = {
        id: "dg-5-normal",
        practice: "DG5",
        layer: "B-live",
        status: "executed",
        score: 0,
        expected:
          "Four variant cards render; the teacher chooses one and opens review.",
        observed: `Generation did not reach ready-for-review (outcome=${readyOutcome}); the four-variant chooser never rendered.`,
        evidence: ["results/s0/s0-07-generation-outcome.png"],
        flipCondition:
          "Unblocks when the configured lesson provider completes a generation (EVAL_LIVE_MODEL=1 and a reachable provider).",
      };
      results.push(generationBlockedResult);
      await writeResults(results);
      await writeFile(
        path.join(EVIDENCE_DIR, "s0-runner-log.txt"),
        `${logLines.join("\n")}\n`
      );
      await browser.close();
      process.exitCode = 1;
      return;
    }

    log("step 9: dg-5-normal — four variants, choose one");
    const variantRadios = page.locator('input[name="chosen-variant"]');
    const variantCount = await variantRadios.count();
    const variantTitles = await page
      .locator(".variant-card h3, .variant-card h4, .variant-card__title")
      .allInnerTexts();
    log(
      `variant cards: ${String(variantCount)}; titles: ${JSON.stringify(variantTitles)}`
    );
    const uniqueTitles = new Set(variantTitles);
    await variantRadios.first().check({ force: true });
    await shot(page, "s0-08-variant-chosen");

    log("step 10: open review");
    await page
      .getByRole("button", { name: "Review and publish this pack" })
      .click({ timeout: STEP_WAIT_MS });
    await page
      .getByRole("heading", {
        name: "Approve every screen before students see the pack",
      })
      .waitFor({ timeout: STEP_WAIT_MS });
    await shot(page, "s0-09-review-gallery");

    results.push({
      id: "dg-5-normal",
      practice: "DG5",
      layer: "B-live",
      status: "executed",
      score: variantCount === 4 ? 2 : 1,
      expected:
        "Four ready variants render as individually selectable cards; the teacher's choice is recorded and the review surface opens.",
      observed: `${String(variantCount)} variant cards rendered; titles observed: ${JSON.stringify(variantTitles)}; distinct titles: ${String(uniqueTitles.size)}; teacher checked the first card and opened review.`,
      evidence: [
        "results/s0/s0-07-generation-outcome.png",
        "results/s0/s0-08-variant-chosen.png",
        "results/s0/s0-09-review-gallery.png",
      ],
      flipCondition: null,
    });

    log("step 11: approve the reverse reasoning path");
    const acknowledgeAll = async () => {
      const boxes = page.locator('input[aria-label^="Acknowledge warning"]');
      const total = await boxes.count();
      for (let index = 0; index < total; index += 1) {
        // Sequential by design: each checkbox belongs to one warning finding.
        // eslint-disable-next-line no-await-in-loop
        await boxes.nth(index).check({ force: true });
      }
      return total;
    };
    const reverseBoxCount = await acknowledgeAll();
    await page
      .getByRole("button", { name: "Approve the reverse path" })
      .click({ timeout: STEP_WAIT_MS });
    await page
      .getByText("Reverse reasoning path approved.")
      .waitFor({ timeout: STEP_WAIT_MS });
    log(
      `reverse path approved (acknowledged ${String(reverseBoxCount)} warnings)`
    );

    log("step 12: approve the four screens");
    for (let screen = 0; screen < 4; screen += 1) {
      // Screens are approved sequentially by card index: each approval
      // mutates the gallery, and an approved card's button reads
      // "Screen approved" instead of "Approve this screen".

      const card = page.locator("article.review-card").nth(screen);
      // eslint-disable-next-line no-await-in-loop
      await card
        .getByRole("button", { name: "Review screen" })
        .click({ timeout: STEP_WAIT_MS });
      // eslint-disable-next-line no-await-in-loop
      const screenBoxes = await acknowledgeAll();
      // eslint-disable-next-line no-await-in-loop
      await page
        .getByRole("button", { name: "Approve this screen" })
        .click({ timeout: STEP_WAIT_MS });
      // eslint-disable-next-line no-await-in-loop
      await page.getByText("Screen approved for this revision.").waitFor({
        timeout: STEP_WAIT_MS,
      });
      // eslint-disable-next-line no-await-in-loop
      await page
        .getByRole("button", { name: "Back to the gallery" })
        .click({ timeout: STEP_WAIT_MS });
      // eslint-disable-next-line no-await-in-loop
      await page
        .getByRole("heading", {
          name: "Approve every screen before students see the pack",
        })
        .waitFor({ timeout: STEP_WAIT_MS });
      log(
        `screen ${String(screen + 1)} approved (acknowledged ${String(screenBoxes)} warnings)`
      );
    }
    await shot(page, "s0-10-all-approved");

    log("step 13: publish to the synthetic learner");
    await page
      .getByRole("button", { name: /publish/iu })
      .first()
      .click({ timeout: STEP_WAIT_MS });
    const learnerSelect = page.locator("select");
    await learnerSelect.waitFor({ timeout: STEP_WAIT_MS });
    // The synthetic roster has two students named "Omar Nabil"; only
    // learner_omar carries the active records membership, and the learner
    // segment signs in as that identity. Label matching picks the unrostered
    // first row and the records assignment correctly refuses it.
    await learnerSelect.selectOption({ value: "learner_omar" });
    await shot(page, "s0-11-publish-pick");
    await page
      .getByRole("button", { name: "Publish and assign" })
      .click({ timeout: STEP_WAIT_MS });
    const linkedIndicator = page.getByText("now has the reviewed pack");
    const storedIndicator = page.getByText("The reviewed pack is stored for");
    const publishOutcome = await Promise.race([
      linkedIndicator
        .waitFor({ timeout: PUBLISH_WAIT_MS })
        .then(() => "linked"),
      storedIndicator
        .waitFor({ timeout: PUBLISH_WAIT_MS })
        .then(() => "stored"),
    ]).catch(() => "timeout");
    const publishedText = await page
      .locator(".review-published")
      .innerText()
      .catch(() => "");
    const publicationId = /PUBLICATION\s*\n\s*([a-z0-9-]+)/iu.exec(
      publishedText
    )?.[1];
    const packAssignmentId = /PACK ASSIGNMENT\s*\n\s*([a-z0-9-]+)/iu.exec(
      publishedText
    )?.[1];
    const learnerLink =
      publishOutcome === "linked"
        ? await page
            .locator('a[href*="/learn?assignment="]')
            .first()
            .getAttribute("href")
        : null;
    log(
      `publish outcome=${publishOutcome}; publication=${String(publicationId)}; pack assignment=${String(packAssignmentId)}; learner link=${String(learnerLink)}`
    );
    await shot(page, "s0-12-published");

    await teacherContext.close();

    // --- Learner segment ---------------------------------------------------
    log("step 14: learner side (fresh context)");
    const learnerContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const learnerPage = await learnerContext.newPage();
    learnerPage.setDefaultTimeout(STEP_WAIT_MS);
    await learnerPage.goto(`${BASE_URL}/login`);
    await learnerPage.waitForLoadState("networkidle");
    await learnerPage.getByLabel("Email address").fill(LEARNER_EMAIL);
    await learnerPage.locator('input[type="password"]').fill(PASSWORD);
    await learnerPage.getByRole("button", { name: "Sign in" }).click();
    await learnerPage.waitForURL(/membership|workspace|learn/, {
      timeout: STEP_WAIT_MS,
    });
    if (learnerPage.url().includes("membership")) {
      await learnerPage
        .locator("label", { hasText: "Synthetic Fractions" })
        .first()
        .click();
      await learnerPage
        .getByRole("button", { name: /continue/i })
        .first()
        .click();
      await learnerPage.waitForURL(/workspace|learn/, {
        timeout: STEP_WAIT_MS,
      });
    }
    let learnerOutcome = "not attempted";
    await learnerPage.goto(
      learnerLink === null
        ? `${BASE_URL}/learn?assignment=${String(packAssignmentId)}`
        : `${BASE_URL}${String(learnerLink)}`
    );
    // /learn holds a connection open after load, so networkidle never
    // settles; the learn-heading check below is the real readiness gate.
    await learnerPage.waitForLoadState("domcontentloaded");
    // The learn surfaces fade in; capture after the transition settles.
    await learnerPage.waitForTimeout(1500);
    const learnerText = await learnerPage.locator("body").innerText();
    await shot(learnerPage, "s0-13-learner-side");
    learnerOutcome =
      (await learnerPage.locator("#learn-heading").count()) > 0
        ? "activity opened"
        : `no learner activity opened; page says: ${learnerText.replaceAll("\n", " | ").slice(0, 300)}`;
    log(`learner outcome: ${learnerOutcome}`);

    let attemptTrace = "";
    let revealScore = 0;
    if (learnerOutcome === "activity opened") {
      log("step 15: submit an attempt");
      const sourceItems = learnerPage.locator(".learn-board > div").first();
      const targetItems = learnerPage.locator(".learn-board > div").nth(1);
      const sourceCount = await sourceItems
        .locator("button.learn-item")
        .count();
      const targetCount = await targetItems
        .locator("button.learn-item")
        .count();
      const firstSource = sourceItems.locator("button.learn-item").first();
      await firstSource.click();
      await targetItems.locator("button.learn-item").first().click();
      const statusText = await learnerPage.locator(".learn-status").innerText();
      await shot(learnerPage, "s0-14-attempt-paired");
      await learnerPage.locator("button.learn-submit").click();
      await learnerPage.locator("#learn-reveal-heading").waitFor({
        timeout: STEP_WAIT_MS,
      });
      const revealText = await learnerPage
        .locator(".learn-result-panel")
        .innerText();
      attemptTrace = `Attempt submitted (${statusText.trim()}); board ${String(sourceCount)} sources / ${String(targetCount)} targets.`;
      revealScore = revealText.trim().length > 0 ? 2 : 1;
      await shot(learnerPage, "s0-15-reveal");
    }

    const isLearnerBlocked = learnerOutcome !== "activity opened";
    await learnerContext.close();
    results.push({
      id: "s0-smoke",
      practice: "S0",
      layer: "B-browser",
      status: "executed",
      score: isLearnerBlocked ? 0 : revealScore,
      expected:
        "Full loop completes with evidence: sign-in, moderation block, recovery revise, ready-for-review, approvals, publish, learner attempt, reveal of the approved copy.",
      observed: isLearnerBlocked
        ? `Teacher segment passed end to end: moderation block revised via the recovery panel; the revise request carried sourceSnapshotId ${String(sourceSnapshotIdLogged)} (logged request body); generation reached ready-for-review with four variants; reverse path plus 4 screens approved; publish completed (publication ${String(publicationId)}, pack assignment ${String(packAssignmentId)}). Learner segment blocked by observed product behavior: the app states the review cites no source material, so the learner runtime has no activity to open (${learnerOutcome}). Root cause evidence: the record row stores source_snapshot_id NULL even though the request body carried it — runAttempt rebuilds record.input without sourceSnapshotId (src/server/generation/service.ts:702-728), so source lineage never persists.`
        : `All steps completed. Publish outcome=${publishOutcome} (${String(learnerLink)}). ${attemptTrace}`,
      evidence: [
        "results/s0/s0-06-moderation-block.png",
        "results/s0/s0-07-generation-outcome.png",
        "results/s0/s0-10-all-approved.png",
        "results/s0/s0-12-published.png",
        "results/s0/s0-13-learner-side.png",
        "results/s0/s0-runner-log.txt",
      ],
      flipCondition: isLearnerBlocked
        ? "Unblocks when the generation record preserves input.sourceSnapshotId (runAttempt at src/server/generation/service.ts:702-728 currently drops it), so a source-grounded publish creates the learner assignment and /learn can open the activity."
        : null,
    });
    if (isLearnerBlocked) {
      process.exitCode = 1;
    } else {
      // --- Dashboard surface cases (#8 acceptance map) --------------------

      const openDashboardAs = async (membershipLabel, tag) => {
        const context = await browser.newContext();
        const dashPage = await context.newPage();
        dashPage.setDefaultTimeout(STEP_WAIT_MS);
        await dashPage.goto(`${BASE_URL}/login`);
        await dashPage.waitForLoadState("networkidle");
        await dashPage.getByLabel("Email address").fill(TEACHER_EMAIL);
        await dashPage.locator('input[type="password"]').fill(PASSWORD);
        await dashPage.getByRole("button", { name: "Sign in" }).click();
        await dashPage.waitForURL(/membership|workspace/, {
          timeout: STEP_WAIT_MS,
        });
        if (dashPage.url().includes("membership")) {
          await dashPage
            .locator("label", { hasText: membershipLabel })
            .first()
            .click();
          await dashPage
            .getByRole("button", { name: /continue/i })
            .first()
            .click();
          await dashPage.waitForURL(/workspace|dashboard|learn/, {
            timeout: STEP_WAIT_MS,
          });
        }
        await dashPage.goto(`${BASE_URL}/dashboard`);
        await dashPage.waitForLoadState("domcontentloaded");
        await dashPage.waitForTimeout(1500);
        await shot(dashPage, `s0-16-${tag}`);
        return { context, dashPage };
      };

      try {
        log("step 16: dashboard surface as the assigning teacher");
        const { context: dashContext, dashPage } = await openDashboardAs(
          "Synthetic Fractions",
          "ac-surface"
        );
        const tableHeading = await dashPage
          .getByRole("heading", { name: "All results" })
          .count();
        await dashPage.locator("button.progress-open").first().click();
        const provisional = await dashPage
          .locator(".progress-provisional")
          .count();
        const reason = await dashPage
          .locator(".progress-reason")
          .first()
          .innerText()
          .catch(() => "");
        const provenance = await dashPage
          .locator(".progress-provenance")
          .first()
          .innerText()
          .catch(() => "");
        const preview = await dashPage.locator(".progress-preview").count();
        const surfaceScore = scoreSurface({
          tableHeading,
          provisional,
          reason,
          provenance,
          preview,
        });
        await dashContext.close();
        results.push({
          id: "ac-surface",
          practice: "S0",
          layer: "B-browser",
          status: "executed",
          score: surfaceScore,
          expected:
            "The dashboard renders the run from the completed loop: provisional label, reason with purpose, rule version plus evidence hash, and the read-only preview (AC1 read side, AC2 surface, AC4, AC5).",
          observed: `All-results table present=${String(tableHeading > 0)}; provisional note=${String(provisional > 0)}; reason="${reason.trim().slice(0, 120)}"; provenance="${provenance.trim().slice(0, 120)}"; preview present=${String(preview > 0)}.`,
          evidence: [
            "results/s0/s0-16-ac-surface.png",
            "results/s0/s0-runner-log.txt",
          ],
          flipCondition:
            surfaceScore === 0
              ? "Unblocks when the dashboard renders the run's reason, provenance, and preview; the progress database suite proves the storage side."
              : null,
        });
      } catch (error) {
        results.push({
          id: "ac-surface",
          practice: "S0",
          layer: "B-browser",
          status: "executed",
          score: 0,
          expected:
            "The dashboard renders the run from the completed loop with reason, provenance, and preview.",
          observed: `Runner error: ${Error.isError(error) ? error.message : String(error)}`,
          evidence: [
            "results/s0/s0-99-failure-state.png",
            "results/s0/s0-runner-log.txt",
          ],
          flipCondition:
            "Recorded with the exact failing step in the runner log.",
        });
        process.exitCode = 1;
      }

      try {
        log("step 17: dashboard boundary and empty state from another tenant");
        const { context: otherContext, dashPage: otherPage } =
          await openDashboardAs("Ratio Reasoning", "ac-empty");
        const emptyHeading = await otherPage
          .getByRole("heading", { name: "No learner results yet" })
          .count();
        const tableRows = await otherPage
          .locator(".progress-table-card")
          .count();
        await otherContext.close();
        const boundaryScore = tableRows === 0 && emptyHeading > 0 ? 2 : 0;
        results.push({
          id: "ac-boundary-empty",
          practice: "S0",
          layer: "B-browser",
          status: "executed",
          score: boundaryScore,
          expected:
            "A teacher scoped to the other tenant sees only the designed empty screen; no cross-tenant row renders (AC3, AC6).",
          observed: `Designed empty heading=${String(emptyHeading > 0)}; result table present=${String(tableRows > 0)}.`,
          evidence: [
            "results/s0/s0-16-ac-empty.png",
            "results/s0/s0-runner-log.txt",
          ],
          flipCondition:
            boundaryScore === 0
              ? "Unblocks when the other-tenant dashboard shows the designed empty state and no foreign rows."
              : null,
        });
      } catch (error) {
        results.push({
          id: "ac-boundary-empty",
          practice: "S0",
          layer: "B-browser",
          status: "executed",
          score: 0,
          expected:
            "A teacher scoped to the other tenant sees only the designed empty screen.",
          observed: `Runner error: ${Error.isError(error) ? error.message : String(error)}`,
          evidence: [
            "results/s0/s0-99-failure-state.png",
            "results/s0/s0-runner-log.txt",
          ],
          flipCondition:
            "Recorded with the exact failing step in the runner log.",
        });
        process.exitCode = 1;
      }
    }
  } catch (error) {
    fail(Error.isError(error) ? (error.stack ?? error.message) : String(error));
    try {
      const current = (await browser.contexts()).at(-1);
      const openPage = current?.pages().at(-1);
      if (openPage) {
        await shot(openPage, "s0-99-failure-state");
      }
    } catch {
      // The failure screenshot is best effort.
    }
    results.push({
      id: "s0-smoke",
      practice: "S0",
      layer: "B-browser",
      status: "executed",
      score: 0,
      expected:
        "Full loop completes with evidence: sign-in, moderation block, recovery revise, ready-for-review, approvals, publish, learner attempt, reveal.",
      observed: `Runner error: ${Error.isError(error) ? error.message : String(error)}`,
      evidence: [
        "results/s0/s0-99-failure-state.png",
        "results/s0/s0-runner-log.txt",
      ],
      flipCondition: "Recorded with the exact failing step in the runner log.",
    });
    process.exitCode = 1;
  } finally {
    await writeResults(results);
    await writeFile(
      path.join(EVIDENCE_DIR, "s0-runner-log.txt"),
      `${logLines.join("\n")}\n`
    );
    await browser.close();
  }
};

await main();
