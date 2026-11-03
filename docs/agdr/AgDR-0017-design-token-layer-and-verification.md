# AgDR-0017 — Design token layer and its verification

> In the context of porting the approved warm direction into the shipped UI, facing the risk that the direction is documented once and never reaches `src/` — which is exactly what happened to the sketches in `b5472de` — I decided to land the token layer in two slices behind ratchets that fail on growth, and to assign each verification category an owner that can actually observe the change, to achieve a token layer that cannot silently rot without naming a verification skill that does not exist, accepting that pedagogy and rendered math stay unverified until their owners exist.

Status: accepted, 2026-11-02. Slice 1a is approved; every screen slice still needs its own scoped approval under the [teacher UI implementation gate](../product/teacher-ui.md#implementation-gate). Reads with [AgDR-0016](AgDR-0016-studio-redesign-ui-stack-and-provider-transport.md), which owns the component stack and the font strategy.

## Context

- `b5472de` added `.impeccable/mocks/screens/base.css` — 43 tokens, Source Serif 4 + Figtree, clay `#b4532f` — and changed nothing under `src/`. `git rev-parse` puts `src/styles.css` at the identical blob before, at, and after that commit. The port is written down as rollout step 1 in `.scratch/ux-revamp/deliverable-1.md:129` and was never executed.
- The shipped stylesheet is the July system: green `--primary` (95 references), no serif, no type or spacing scale, `--border` at **1.39:1** with no control-border token, 19 literal radii, 10 focus-ring overrides, and 151 references to a parallel `--teacher-*` palette that `@theme` cannot see.
- A computed-style census of 15 captured states (2026-11-02) measured the result: **44 distinct font sizes, 64 line heights, 20 radii, 9 weights, 27 backgrounds, 22 border colours**, 398 text blocks under 13px, and 11 AA failures.
- The implementation gate requires verification skills covering content, pedagogy, rendering and interaction. `docs/product/delivery-priorities.md:21` records that these were expected from Abdullah as _"forthcoming verification skills"_; they were never supplied.

## Decision

### 1. Two slices, because one of them cannot be zero-diff

Slice 1 as originally planned — "43 tokens into `@theme`, `--teacher-*` as aliases, no visual change" — is impossible as a single unit: the sketch palette and the shipped palette differ by value, so adopting it is a visual change.

- **1a — the layer, no rewiring.** Add the sketch's structural scale (type roles, 4px spacing, two radii, three-tier dividers, one shadow, focus ring) as new semantic custom properties. Rewire nothing. Zero pixel diff. This is the slice that proves the pipeline.
- **1b — the direction.** Repoint `--primary` from green to clay, `--border` to the three-tier ladder, headings to the serif, and radii to the ladder. This is the design decision and it is _expected_ to differ; the review artifact is a before/after census, not a pixel diff.

### 2. Each verification category gets an owner that can observe the change

| Category | Owner | Why that one |
| --- | --- | --- |
| Content / structure | `verify-lesson-gate` (`pnpm verify:lesson-gate`) | Already exists; validates draft structure, not teaching quality |
| Interaction / a11y | `impeccable` critique, `better-ui`, `better-accessibility` | Covers focus, keyboard, reduced motion, surface values, and the 26/40 rubric |
| Rendering (math) | **#116** — _U4: render MathText and FractionDiagram in fractions-v2 with a complete keyboard path_ | It already owns the `fractions-v2` contract, the 320px keyboard path and the invalid-math block. A theme-level rendering check would duplicate it and could never pass, because generation emits `matching-v1` only |
| Pedagogy | **#106** (40 reviewed cases, regression gate) and **#118** (five teachers, two weeks) | The revamp changes presentation, not curriculum. Pedagogy gates automation and adoption, not styling |

### 3. Verification runs where the change can be observed

- `pnpm verify:design-tokens` joins `pnpm check`. It scans `src/styles.css` and `src/**/*.tsx` for colour, radius, size, family and shadow literals, undeclared `var()` references and inline style literals.
- `pnpm verify:design-census` stays out of `pnpm check` because it needs a browser, and becomes a step in `foundation.yml` — which already provides a `postgres:17` service, `pnpm db:setup` and a build.
- Both are **ratchets** over a committed baseline: an absolute gate would be red on arrival (196 literal font sizes, 73 literal radii, 151 aliases) and would be disabled within a week. Counts may only fall; `--update` rewrites the ceiling with `Math.min` so it cannot launder a regression.

### 4. Fonts: system serif in 1b, self-hosting before release

AgDR-0016 requires self-hosting Source Serif 4 through `scripts/fonts-subset.py` and no hosted stylesheet. That stands. Slice 1b uses `ui-serif, Georgia, "Times New Roman", serif` for display so the direction can ship without a font-sourcing PR; self-hosting replaces the stack before any public release. The total budget stays two families and roughly 180KB.

### 5. Delete the unreachable dark palette

`.dark` is 18 declarations nothing can activate: `html { color-scheme: light }` and no code sets the class. `--teacher-*` has no dark overrides, so the studio would be half-broken if it did. Slice 1b deletes the block. Dark returns as a scoped change when it is a real request.

## Not adopted

- **A rendering verification skill.** Nothing can render math today; a check that always passes is worse than a recorded gap.
- **Naming #106 as a pedagogy gate for the revamp.** It gates objective-to-standard matching, not lesson quality.
- **Absolute (non-ratchet) token checks.** They fail on arrival and get disabled.
- **A separate census pipeline.** `foundation.yml` already has the database, the seed and the build.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Two slices, token ratchet plus census budget, owners per category** | Ships the layer now; every check can fail; no invented skills | Two PRs; census depends on a seed fix |
| B. One slice, adopt the palette immediately | One review | No zero-diff proof; a visual regression cannot be separated from a token error |
| C. Wait for all four verification skills before any change | Matches the gate literally | Two of the four have no plausible owner; the direction has already waited through one commit |
| D. Absolute gates over the current stylesheet | Strict on paper | Red on arrival; 196+73+151 violations would be baselined by hand-waving or the check disabled |
| E. Documentation only, no checks | Zero process | This is the `b5472de` failure mode, repeated |

## Consequences

- - The direction can no longer separate from the app without a red build.
- - The census turns "it feels generic" into numbers a reviewer can refuse: 44 sizes may not become 45.
- - `foundation.yml` needs one step, not a new workflow.
- − The census cannot run until the seeded drafts are reachable: all 17 belong to `identity_demo_teacher`, and no seeded account can sign in as that identity (`PUBLICATION_FORBIDDEN`), so the Review screen has no CI capture path. Fixing the seed is a prerequisite.
- − Ratchet baselines must be re-tightened (`--update`) in the same PR that reduces a count, or the ceiling stays loose.
- − Slice 1b fixes the 1.39:1 divider and therefore _must_ produce a visible diff; it is not a refactor.

## Verification

- `pnpm check` includes `verify:design-tokens`; the ratchet holds at 196/73/3/5/151/2/0 today.
- `pnpm verify:design-census` holds at 44/64/9/1/20/5/27/22 distinct values and 11 AA failures, and was confirmed to fail when a font size and a radius were injected.
- Both were confirmed to fail on a lowered ceiling, so the ratchet is tested, not assumed.
- `pnpm verify:lesson-gate`, the `impeccable` critique and `better-accessibility` run per screen slice, not per token slice.
- Not verified: rendered math (#116), pedagogy (#106, #118), dark mode (out of scope).
