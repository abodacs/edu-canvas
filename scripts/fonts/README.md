# Web fonts

The site self-hosts two variable families (AgDR-0016), each split into two subset files of one CSS family with `font-display: swap`:

| family | role | upstream | licence |
| --- | --- | --- | --- |
| `"Source Serif 4"` | display: h1–h3, `--font-display` | [adobe-fonts/source-serif](https://github.com/adobe-fonts/source-serif) 4.005, `VAR/SourceSerif4Variable-Roman.ttf` (`wght` 200–900, `opsz` 8–60) | OFL-1.1, Reserved Font Name "Source" |
| `"Figtree"` | body: everything you read or act on, `--font-sans` | [google/fonts](https://github.com/google/fonts) `ofl/figtree/Figtree[wght].ttf` 2.002 (`wght` 300–900) | OFL-1.1, no Reserved Font Name |

| file | covers | loads |
| --- | --- | --- |
| `public/fonts/figtree-core.woff2` | ASCII + curly quotes, dashes, ellipsis, middle dot | every page (preloaded from `src/routes/__root.tsx`) |
| `public/fonts/figtree-extended.woff2` | Latin-1 Supplement + Latin Extended-A + `→ − ≠ ≤ ≥` | only pages rendering one of those characters (`unicode-range`) |
| `public/fonts/source-serif-4-core.woff2` | same as Figtree core | pages with a serif heading; not preloaded |
| `public/fonts/source-serif-4-extended.woff2` | same as Figtree extended, plus `≈` | only on demand |

The four faces are declared at the top of `src/styles/tokens.css`. The script never rewrites a stylesheet; `--check` fails when a declared `unicode-range` there differs from the generated subset. Arabic, `⇒` (U+21D2), combining marks, and everything outside the kept ranges fall back to the system fonts in each stack (**the fallback rule**: no third hosted family).

Axes are kept at their full upstream range. Partial instancing re-derives `gvar`/`HVAR` deltas and shifts sub-pixel advances at intermediate weights (measured ±0.2px per ~340px run on the previous family), which reads as a visual regression.

**Reserved Font Name.** Adobe reserves "Source" under the OFL, and a subset is a Modified Version, so the Source Serif 4 subsets carry the internal name `Schole Display Serif` (name table, PostScript name; named instances and `STAT` are dropped because they point at removed names). The stylesheet still addresses the family as `"Source Serif 4"`. Figtree has no reserved name and keeps its own.

## Regenerating

```sh
pip install fonttools brotli   # once
python3 scripts/fonts-subset.py
git add public/fonts scripts/fonts
```

The script reads the vendored upstream TTFs in `scripts/fonts/vendor/` (licences alongside) from the `FAMILIES` table and rewrites the four woff2 files plus `manifest.json` (v2: one entry per family with origin, version, licence, sha256, axes, ranges). Outputs are byte-deterministic for a given fontTools/brotli version; the manifest records the versions and hashes used. Update `src/styles/tokens.css` by hand when a range changes.

## When to rerun

```sh
python3 scripts/fonts-subset.py --check
```

exits non-zero (and says what moved) when any of these drift:

- `public/fonts/*.woff2` no longer match a fresh build or the committed manifest (fontTools or vendor font changed) → rerun and commit.
- A `unicode-range` in `tokens.css` no longer matches its subset, or `tokens.css` declares a file no family builds.
- New non-ASCII characters appear in `src/` outside the kept ranges and the fallback allowlist (Arabic, U+21D2, U+FEFF, U+FFFD) → either extend `CORE_RANGES` / `EXTENDED_RANGES` and rerun, or accept fallback rendering on purpose.
- A `font-weight` outside 400–800 appears, the `font-style: italic` rule count grows past its baseline of 1 (no italic face is shipped; the one rule renders a synthesised oblique), or `font-variant*` usage changes from its baseline of 2 (both `tabular-nums`, served by the kept `tnum` feature) → revisit `WEIGHT_MIN/MAX` / `KEEP_FEATURES`.
