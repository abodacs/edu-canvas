# Web fonts

The site ships two subset files of Hanken Grotesk Variable (single CSS family `"Hanken Grotesk Variable"`, `font-display: swap`). The wght axis is kept at its full 100–900 range — usage spans 400–800, but partial instancing shifts sub-pixel advances at intermediate weights (measured ±0.2px per ~340px run at 650/700/750), which reads as a visual regression:

| file | covers | loads |
| --- | --- | --- |
| `public/fonts/hanken-grotesk-variable-core.woff2` | ASCII + curly quotes, dashes, ellipsis | every page (preloaded from `src/routes/__root.tsx`) |
| `public/fonts/hanken-grotesk-variable-extended.woff2` | Latin-1 Supplement + Latin Extended-A (U+00A0-017E) | only pages rendering one of those characters (`unicode-range`) |

Both faces are declared at the top of `src/styles.css`. Arabic, `≈` (U+2248), combining marks, and everything outside the two ranges fall back to `Trebuchet MS`/`Segoe UI`/`system-ui` — the same behavior as before the split.

## Regenerating

```sh
pip install fonttools brotli   # once
python3 scripts/fonts-subset.py
git add public/fonts scripts/fonts
```

The script reads the vendored upstream variable TTF (`scripts/fonts/vendor/HankenGrotesk-wght.ttf`, OFL-1.1, license included alongside) and rewrites the two woff2 files plus `manifest.json`. Outputs are byte-deterministic for a given fontTools/brotli version; the manifest records the versions and hashes used.

## When to rerun

```sh
python3 scripts/fonts-subset.py --check
```

exits non-zero (and says what moved) when any of these drift:

- `public/fonts/*.woff2` no longer match the committed manifest (fontTools or vendor font changed) → rerun and commit.
- New non-ASCII characters appear in `src/` outside the kept ranges and the fallback allowlist (Arabic, U+2248) → either extend `CORE_RANGES` / `EXTENDED_RANGES` and rerun, or accept fallback rendering on purpose.
- A `font-weight` outside 400–800 appears, `font-style: italic` appears (no italic face is shipped), or OpenType feature usage changes (`font-variant*`, `font-feature-settings`) → revisit `WEIGHT_MIN/MAX` / `KEEP_FEATURES`.

Historical note: the ranges in this directory were derived from the rendered content on 2026-10-31 (used weights 400–800; used non-ASCII: `· – — ’ …` plus Arabic fallback copy). The `@fontsource-variable/hanken-grotesk` dependency was removed in the same change; the manifest records the reference version it replaced (5.3.0).

Rendering-identity notes (2026-10-31 pixel-diff investigation):

- Real pages render bit-identical to the previous single-file setup (home/login/sign-up: 0 changed pixels at 1280px, DPR 1).
- Synthetic accented text (Latin-1/Extended-A composites) can differ from the old file at anti-aliasing edge level: same outlines, advances, and positions, sub-pixel edge shifts only — invisible at 100% zoom, and no current page renders those characters. Verified independent of the woff2 container (identical as plain TTF and as untransformed woff2); present in Chrome's decode of both the old fontsource file and re-encoded files, so it cannot be closed without Google's reference woff2 encoder.
- Hinting (`prep`/instructions) is dropped; verified rendering-neutral here (Chrome/Linux ignores TrueType instructions under its default rasterizer settings).
