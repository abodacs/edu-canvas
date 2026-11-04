---
name: Scholé
description: Turn one learning objective into a lesson your students understand.
colors:
  primary: "#a64b2a"
  primary-deep: "#8f3f22"
  primary-soft: "#f6e6de"
  primary-foreground: "#ffffff"
  background: "oklch(96.5% 0.018 86deg)"
  foreground: "oklch(23.5% 0.028 65deg)"
  card: "oklch(98.5% 0.012 86deg)"
  secondary: "oklch(89% 0.045 87deg)"
  secondary-foreground: "oklch(28% 0.035 67deg)"
  muted: "oklch(92.5% 0.026 86deg)"
  muted-foreground: "oklch(48% 0.035 68deg)"
  accent: "oklch(91% 0.065 77deg)"
  accent-foreground: "oklch(30% 0.04 62deg)"
  destructive: "oklch(55% 0.18 28deg)"
  line: "#e6e1d8"
  line-strong: "#d6cfc3"
  line-control: "#938c80"
  focus-ring: "#1f1d1a"
typography:
  display:
    fontFamily: '"Source Serif 4", ui-serif, georgia, "Times New Roman", serif'
    fontSize: "clamp(2.9rem, 7vw, 6.3rem)"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Source Serif 4", ui-serif, georgia, "Times New Roman", serif'
    fontSize: "clamp(1.75rem, 3vw, 2.7rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Source Serif 4", ui-serif, georgia, "Times New Roman", serif'
    fontSize: "1.375rem"
    fontWeight: 500
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"Figtree", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: '"Figtree", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
  eyebrow:
    fontFamily: '"Figtree", "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    fontSize: "0.72rem"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "0.13em"
rounded:
  sm: "6px"
  md: "8px"
  field: "10px"
  card: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "72px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.field}"
    height: "32px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.field}"
    height: "32px"
    padding: "0 10px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.field}"
    height: "32px"
    padding: "0 10px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "2px 8px"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.pill}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: Scholé

<!--
Recorded 2026-11-03 from the shipped code on feat/ux-foundation (AgDR-0017 slices 1a and 1b), not from the mocks.
Source of truth: src/styles/tokens.css. Approved direction: .impeccable/mocks/screens/0-landing.html and base.css.
Where the mock and the build differ, this file records the build and says so.
Enforced by: pnpm verify:design-tokens (in pnpm check), pnpm verify:ui (per route), pnpm census:capture + pnpm verify:design-census.
-->

## Overview

**Creative North Star: "The Stoa at Dawn"**

Scholé is named for the Greek word for leisure given to learning, and the system is built around one thesis: a teacher's free hour, returned. The world is a warm limestone morning. Pages sit on a light, warm ground, the type that names things is a quiet serif, the type you act on or read is a plain grotesque, and a single clay tone marks every action. The interface is meant to feel calm and checked, never busy: hairline rules, few surfaces, one lifted shadow.

The world's signature is engraved: halftone and stipple artwork (apricot sky, olive hills, limestone stoa) drawn in SVG, with the product shown floating on the art rather than beside it. That scene exists today only in the approved landing mock. The shipped code holds its palette as tokens (`--scene-*`) so the landing slice can build it without inventing colours; no shipped page renders the scene yet.

The system is mid-migration and this record is honest about it. Slice 1b repointed the semantic layer (clay primary, the divider ladder, serif headings, the radius ladder), so every component that reads shadcn semantics already speaks the new direction. The structural scale from slice 1a (type roles, 4px spacing, `--radius-card` / `--radius-field` / `--radius-pill`, `--shadow-lift`, focus-ring tokens) is declared but not yet read by any surface stylesheet; surfaces move onto it one slice at a time. The census ceiling (43 distinct font sizes, 17 radii, 4 shadows, 8 AA failures) measures how far there is to go.

**Key Characteristics:**

- Warm, light ground (no dark mode; the unreachable `.dark` palette was deleted by AgDR-0017).
- Serif for naming (h1–h3), grotesque for doing and reading.
- Clay is the only action colour.
- Two radii (field 10px, card 14px) plus pills.
- Hairlines over boxes; one lifted shadow.
- Focus is a neutral near-black ring, never a brand moment.
- Engraved stipple artwork belongs to the scene only (mock-stage, landing slice).

## Colors

One warm accent on a field of warm neutrals; everything that is not an action stays in the limestone-and-ink family.

### Primary

- **Fired Clay** (`primary`): every primary action, inline text link, selected or correct state, and capability icon. Shipped one step deeper than the mock's `#b4532f` so clay text reaches AA (5.1:1) on every warm ground the census measured.
- **Kiln Clay** (`primary-deep`): pressed and emphasised clay; the target hover colour for primary buttons. The legacy `--teacher-forest` now aliases it.
- **Clay Wash** (`primary-soft`): tinted backgrounds behind clay content (selected rows, soft chips). The legacy `--teacher-mint` now aliases it.

### Neutral

- **Limestone Ground** (`background`): the page.
- **Pale Limestone** (`card`): cards and popovers, one step lighter than the ground.
- **Lamp Ink** (`foreground`): body text, headings, and the brand-mark tile.
- **Weathered Ink** (`muted-foreground`): secondary copy, metadata, the brand subtitle.
- **Sand** (`secondary`) and **Dust** (`muted`): secondary buttons, hover fills, quiet panels.
- **Apricot Haze** (`accent`): the warm wash used in banners and the ambient page tint; never text.
- **Hairline** (`line`, also `--border`): dividers and card edges. Decorative only; it does not meet 3:1.
- **Strong Hairline** (`line-strong`): dividers that must read at a glance (section breaks, table heads).
- **Control Edge** (`line-control`, also `--input`): the border of anything you can type into or toggle. This is the 3:1 tier.
- **Focus Ink** (`focus-ring`, also `--ring`): the focus outline on every interactive element.
- **Fired Red** (`destructive`): destructive actions and errors, almost always as a 10–20% tint behind red text rather than a solid fill.

### Scene palette (declared, landing slice only)

`--scene-sky-hi/-mid/-lo`, `--scene-sun`, `--scene-stone/-shade/-deep`, `--scene-hill-far/-mid/-near/-front`, `--scene-olive/-hi`, `--scene-bark` are defined in `tokens.css` and copied verbatim from the landing mock. No shipped stylesheet reads them yet. They are for halftone artwork only.

### Legacy palette (slated for removal)

`--teacher-paper`, `--teacher-ink`, `--teacher-butter`, `--teacher-sky`, `--teacher-clay` and the aliased `--teacher-forest` / `--teacher-mint` still carry about 150 references in the studio, workspace and review stylesheets. AgDR-0016 removes the whole palette; `verify:design-tokens` ratchets the reference count down and fails on any new one.

### Named Rules

**The One Clay Rule.** Clay is the only action colour. If a thing can be pressed, followed, or chosen, and it is not destructive, it is clay or it is neutral. No second accent, no green "success" button.

**The Scene Is Not Chrome Rule.** `--scene-*` colours paint the artwork and nothing else. A button, border, text run or panel that reads a scene token is a defect.

**The Control Edge Rule.** Hairlines decorate; controls get `line-control`. An input, checkbox or select bordered with `--border` alone fails 3:1 and fails the rule.

## Typography

**Display Font:** Source Serif 4 (self-hosted variable, `wght` 200–900 and `opsz` 8–60; with `ui-serif`, Georgia, Times New Roman fallback) **Body Font:** Figtree (self-hosted variable, `wght` 300–900; with Trebuchet MS, Segoe UI, system-ui fallback)

**Character:** A bookish serif at medium weight names the page and its sections; a neutral, slightly humanist grotesque carries every control and every paragraph. The serif speaks once per region; the sans does the work.

Both families are self-hosted through `scripts/fonts-subset.py` (AgDR-0016), each split into a core face and an extended face; `public/fonts/manifest.json` records origin, version, licence and hashes. Only the Figtree core face is preloaded; the display faces load with `font-display: swap`. **The Fallback Rule:** Arabic, and any character outside the kept ranges, renders in the system fonts already in each stack; no third hosted family is added for it. The census allows two families on screen; a third is a failure.

### Hierarchy

- **Display** (serif 500, `clamp(2.9rem, 7vw, 6.3rem)`, line-height 0.94, max 11ch): the page's single h1. The landing hero overrides it to `clamp(2rem, 4.5vw, 3.25rem)` at 24ch with balanced wrapping.
- **Headline** (serif 500, `clamp(1.75rem, 3vw, 2.7rem)`, line-height 1, max 23ch): section h2.
- **Title** (serif 500, 1.375rem): h3 and card-level names, on the declared `--type-title` role.
- **Body** (sans 400, 1rem, line-height 1.65, max 65ch): paragraphs and lede copy; the hero lede scales to `clamp(1rem, 1.5vw, 1.18rem)`.
- **Label** (sans 500, 0.875rem): buttons, form labels, card titles (card titles at 1rem).
- **Eyebrow** (sans 800, 0.72rem, 0.13em tracking, uppercase): the kicker above a heading.

The declared role ladder in `tokens.css` (`--type-display` through `--type-micro`, twelve steps from 3.25rem to 0.75rem) is the target every surface converges on. No surface reads it yet; new work should.

### Named Rules

**The Serif Names, Sans Does Rule.** h1–h3 are serif at weight 500 with -0.02em tracking. Everything you click, type, or read in a paragraph is sans. Never set a button or a form label in the serif.

**The Twelve Steps Rule.** A new font size comes from a `--type-*` role. `verify:design-tokens` fails on an unlisted size above its ceiling, and `verify:design-census` fails if a 44th distinct size reaches the screen.

## Layout

The shell pads with fluid gutters (`clamp(1rem, 4vw, 3.5rem)` block, `clamp(1rem, 5vw, 5rem)` inline) and centres content in a `min(100%, 76rem)` frame. Sections separate generously (`clamp(4rem, 10vw, 8rem)`); headers sit `clamp(2.5rem, 7vw, 5.5rem)` above content. Grids are auto-fit with `minmax(min(100%, 17rem), 1fr)` tracks so they collapse without breakpoints; the hero grid is `1.2fr / 0.8fr` with a 18rem floor. Breakpoints that exist are content-driven rather than a fixed ladder; the most reused is `width <= 38rem`.

Spacing is declared on a 4px base (`spacing.1`–`spacing.8`: 4, 8, 12, 16, 24, 32, 48, 72). Surfaces still use rem literals that mostly land on this rhythm; new work uses the tokens.

All layout uses logical properties (`inline-size`, `margin-block-*`, `padding-inline`); the shadcn style is configured `rtl: true`. No page may scroll sideways at 390px (`verify:ui` and `verify:student-probe` fail on it).

The direction's staging, from the mock and not yet shipped: on the landing page the scene is the page, the Studio window floats on the art, the tagline is centred in the sky. That composition belongs to the landing surface, not to every page.

## Elevation & Depth

Mostly flat with tonal layering: ground, then a lighter card, separated by a hairline or a 1px ring of `foreground` at 10%. Depth is earned, not ambient. The system declares exactly one raised shadow, `--shadow-lift`, for things that float above the page (popovers, the floated Studio window). Shipped surfaces still carry a handful of older large drop shadows in the studio, workspace and auth stylesheets; the census caps distinct shadows at 4 and they are expected to collapse onto `--shadow-lift`.

### Shadow Vocabulary

- **Lift** (`box-shadow: 0 1px 2px rgb(31 29 26 / 4%), 0 8px 24px -12px rgb(31 29 26 / 10%)`): the one raised surface.
- **Hairline drop** (`box-shadow: 0 1px 0 color-mix(in oklch, var(--foreground) 6%, transparent)`): a resting card that needs a ground line, as on the landing reveal sample.

### Named Rules

**The One Lift Rule.** A new shadow is `--shadow-lift` or nothing. If a surface needs more separation, give it a stronger edge, not a bigger blur.

## Shapes

Gently rounded, never soft. Two radii carry the system: fields and buttons at 10px (`rounded.field`, which is shadcn's `--radius`), cards at 14px (`rounded.card`). The `@theme` ladder derives sm 6px and md 8px for compact controls (xs and sm buttons). Pills (999px) are for badges, chips and match targets only. The brand mark is a 44px ink tile with a 0.9rem corner holding a stoa glyph (pediment, three columns, stylobate) at 55% width.

`verify:design-tokens` fails on any radius off this ladder above its ceiling; the census caps distinct radii on screen at 17 and falling.

## Components

Restrained and tactile: components are owned shadcn Base UI primitives (`button`, `badge`, `card`) restyled through the semantic variables, so they inherit the direction without per-component colour.

### Buttons

- **Shape:** gently rounded (10px), 1px transparent border reserved for outline variants.
- **Primary:** clay fill, white label, sans 500 at 0.875rem, 32px tall with 10px inline padding (sizes xs 24, sm 28, lg 36; the landing CTA raises to 48px and 1rem).
- **Hover / Focus:** hover lightens clay to 80% (the declared target is `primary-deep`); press nudges down 1px; transitions run 150ms on colour, border, shadow, opacity and transform. Focus shows the shared neutral ring.
- **Outline:** ground fill, hairline edge, dust fill on hover. **Secondary:** sand fill. **Ghost:** no fill until hover. **Destructive:** red text on a 10% red tint. **Link:** clay text, underline on hover.

### Text links

Clay, bold, underlined at 45% clay with a 0.25em offset; the underline goes solid on hover. The hit area extends past the text to at least 24px without moving the text.

### Chips (badges)

- **Style:** pill, 20px tall, sans 500 at 0.75rem; clay, sand, outline (hairline edge), ghost, or destructive tint.
- **State:** linked badges darken on hover; plain badges are static labels.

### Cards / Containers

- **Corner Style:** 14px (shadcn `rounded-xl` resolves to `--radius-card`).
- **Background:** pale limestone (`card`).
- **Shadow Strategy:** none at rest; a 1px ring of ink at 10% defines the edge (see Elevation & Depth).
- **Internal Padding:** 16px (12px for the small size); footers sit on a 50% dust band with a hairline above.

### Inputs / Fields

- **Style:** 10px radius, `line-control` edge (`--input`), ground or card fill.
- **Focus:** the shared focus ring. **Error:** destructive border with a 20% destructive ring.

### Navigation

The site header is a flex row: brand lockup at the start, identity in 0.8rem muted sans 600 at the end. The brand lockup (`BrandMark`) is a single home link whose accessible name is its visible text ("Scholé", plus the tagline on public pages); the glyph is decorative.

### Focus

Every focusable element gets a solid near-black outline (`focus-ring`), offset 3px. Shipped width is 3px in `base.css`; `--focus-ring-width` declares 2px for the surfaces that adopt the tokens. Record: the build ships 3px today.

### Halftone Scene (mock-stage signature)

The landing mock draws its world in inline SVG: dot `<pattern>` fills (circles 1.1–1.6px on 5–7px cells) masked by vertical fades over a stepped sky, layered hills, olive trees and a limestone stoa. Not yet shipped; the landing slice builds it from `--scene-*` tokens, inline and local only (the CSP allows no remote image host).

## Do's and Don'ts

### Do:

- **Do** read colour, radius, type and shadow from the token layer; components reach shadcn semantics (`--primary`, `--border`, `--ring`), never `--scene-*` or new `--teacher-*` names.
- **Do** use clay (`primary`) for every non-destructive action and keep everything else neutral.
- **Do** border every control with `line-control`; keep `line` for decoration.
- **Do** set h1–h3 in the serif at 500 with -0.02em tracking, and everything interactive in Figtree.
- **Do** take new sizes from the `--type-*` roles and new gaps from `--space-*`.
- **Do** use logical properties and keep every page free of sideways scroll at 390px.
- **Do** run `pnpm verify:design-tokens`, `pnpm verify:ui <route>`, and `pnpm census:capture` + `pnpm verify:design-census` on every UI slice, together with the /modern-web-guidance, /emil-design-eng (motion) and /impeccable audits.
- **Do** keep motion short and eased (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, 120–240ms for state changes) and honour `prefers-reduced-motion`.

### Don't:

- **Don't** add a second accent colour or bring back the forest green; `--teacher-forest` is an alias awaiting deletion.
- **Don't** use gradients as UI decoration: no gradient fills on buttons, cards, text or borders. Gradients belong only to the scene, where the sky's light and the stipple masks use them natively.
- **Don't** paint chrome with scene colours, or put halftone texture behind controls or body text.
- **Don't** add a shadow other than `--shadow-lift`, or a radius off the 6/8/10/14/pill ladder.
- **Don't** make focus a brand moment; the ring is near-black, never clay.
- **Don't** load a hosted font stylesheet or a third family; self-host through `scripts/fonts-subset.py`.
- **Don't** add dark-mode tokens until dark mode is a real request.
