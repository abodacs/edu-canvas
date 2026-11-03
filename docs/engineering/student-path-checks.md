# Student path checks

Issue [#9](https://github.com/abodacs/edu-canvas/issues/9) hardens the learner page (`/learn`) for English and Arabic, narrow and wide screens, keyboard and screen-reader use. This page records what the automated probe checks, how to run it, and the manual device pass that the probe cannot replace.

## Language locus

The page speaks the pack's approved language (`approvedCopy.language`, carried to the learner projection as `lesson.language`). There is no student toggle; that is the issue's default. Arabic sets `lang="ar"` and `dir="rtl"` on the learner card. Fixed learner templates live in `src/components/learn/learner-copy.ts`; approved pack copy is never translated. A version stored before approved copy existed has a null language and keeps the English default.

Inside a right-to-left run, each Latin or numeric token (`4.NF.A.1`, `1/2`, `3`) is isolated with `<bdi dir="ltr">` by `BidiText`, so its characters keep their order and the Arabic base direction is unchanged.

## Automated probe

`pnpm verify:student-probe` runs last in `pnpm check`. It:

1. creates a scratch database beside `DATABASE_URL` (never the shared one), migrates and seeds it;
2. publishes one English and one Arabic pack to the synthetic learner through the real source, generation (deterministic provider), approval, and publication services;
3. starts the built server (`.output/server/index.mjs`) in the development composition on a free port;
4. signs the learner in through `/login` in headless Chromium (playwright-core) and runs the matrix below;
5. drops the scratch database and prints one PASS/FAIL line per check, with a JSON evidence file (results plus keyboard traces).

Without Chromium or PostgreSQL it prints one `SKIP verify:student-probe: <reason>` line and exits 0. Set `STUDENT_PROBE_REQUIRED=true` to make a skip fail. `STUDENT_PROBE_CHROMIUM` points at a browser binary; `STUDENT_PROBE_EVIDENCE` sets the evidence directory.

| State (EN and AR) | Checks |
| --- | --- |
| Loading (delayed run response) | axe-core 0 serious/critical; busy status present; no horizontal overflow at 390px |
| Empty (assigned section has no items) | axe; 320px overflow; `lang`/`dir`; Done disabled; focus not trapped |
| Board at 320 portrait, 390 portrait, 844 landscape, 640 (1280px at 200% zoom), 1280 wide | overflow; 44px touch targets; `lang`/`dir`; axe at 390 and 1280 |
| Keyboard loop | Tab/Enter only: pair one, Clear, pair all, Done, Try again; focus after every pairing, Clear, submit (reveal heading), and retry; live region announces the grade; graded axe, direction, and 320/390 overflow; focus not trapped; trace recorded |
| Submit error (409) | alert receives focus; axe; overflow |
| Dark palette + reduced motion | axe contrast with the `.dark` palette applied; no running animation |
| Canvas disabled (`getContext` returns null) | no canvas on the page; a submit still grades |
| Arabic bidi (`4.NF.A.1` in an Arabic sentence) | computed `rtl` base; token characters left to right; token follows the preceding Arabic word in reading order |
| Missing learner link | axe; 320px overflow |

`src/components/learn/learn-surfaces.test.ts` also fails when a `.learn-*` rule uses a physical property (`margin-left`, `width`, `text-align: left`, a three- or four-value margin, and the like), so the Arabic page can always mirror.

## Manual device and browser pass

The probe runs Chromium only. Before a release, run the learner loop once on each row and record the date, build, and result on the pull request.

| Device and browser | Language | Input | Pass when |
| --- | --- | --- | --- |
| iPhone Safari, portrait and landscape | EN, AR | Touch, VoiceOver | Each pair, Done, the reveal, and Try again are reachable and announced; no sideways scroll |
| Android Chrome, portrait | AR | Touch, TalkBack | Same as above; Arabic reads right to left with numerals intact |
| Desktop Firefox at 200% zoom | EN | Keyboard only | Full loop with visible focus; nothing clipped |
| Desktop Safari or Chrome | AR | Keyboard, NVDA or VoiceOver | Grade is announced once; focus lands on the reveal heading |
| Any browser with reduced motion and dark system theme | EN | Mouse | No animation; text stays readable |
