#!/usr/bin/env python3
"""Build the Hanken Grotesk Variable web-font subsets used by the site.

Run by hand (needs: pip install fonttools brotli):

    python3 scripts/fonts-subset.py            # rebuild + write public/fonts/
    python3 scripts/fonts-subset.py --check    # verify outputs + scan for drift

Outputs are committed (public/fonts/*.woff2 + manifest.json). Nothing here runs
in the build. Rerun when --check reports drift: a font package bump, characters
used outside the kept ranges, font-weight values outside the axis range, or new
OpenType feature usage. See scripts/fonts/README.md.

Splits the variable font into two faces of one CSS family:
- core:     ASCII + the punctuation most pages use (curly quotes, dashes,
            ellipsis). Preloaded from src/routes/__root.tsx.
- extended: Latin-1 Supplement + Latin Extended-A. Loaded only when a page
            renders one of its characters (unicode-range).

Deliberately NOT covered (they fall back to the next font in the stack, the
same as today): Arabic, U+2248 (≈), combining marks, and every block outside
the two kept ranges.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import sys
from pathlib import Path

from brotli import __version__ as brotli_version
from fontTools import version as fonttools_version
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
VENDOR_TTF = ROOT / "scripts" / "fonts" / "vendor" / "HankenGrotesk-wght.ttf"
FONTSSOURCE_PKG = ROOT / "node_modules" / "@fontsource-variable" / "hanken-grotesk"
OUT_DIR = ROOT / "public" / "fonts"
CSS_FILE = ROOT / "src" / "styles.css"

FONT_FAMILY = "Hanken Grotesk Variable"
# Usage spans 400 (body default) to 800; WEIGHT_MIN/MAX describe the range of
# font-weight values the site may request, used by --check drift scanning.
# The wght axis itself is deliberately NOT instanced to this range: fontTools
# partial instancing re-derives gvar/HVAR deltas and shifts sub-pixel advances
# at intermediate weights (measured ±0.2px per ~340px run at 650/700/750),
# which reads as a visual regression. Keep the full 100-900 axis.
WEIGHT_MIN, WEIGHT_MAX = 400, 800
KEEP_FEATURES = ("ccmp", "kern", "liga", "locl", "mark", "mkmk")

# Core: ASCII printable + curly quotes, dashes, ellipsis + the middle dot
# separator used by the landing page, the studio header, and the preview
# footer (preloaded face).
CORE_RANGES: tuple[tuple[int, int], ...] = (
    (0x20, 0x7E),
    (0xB7, 0xB7),  # middle dot
    (0x2013, 0x2014),  # en dash, em dash
    (0x2018, 0x2019),  # left/right single quotes
    (0x201C, 0x201D),  # left/right double quotes
    (0x2026, 0x2026),  # ellipsis
)
# Extended: Latin-1 Supplement + Latin Extended-A (unicode-range face).
EXTENDED_RANGES: tuple[tuple[int, int], ...] = (
    (0xA0, 0xFF),
    (0x100, 0x17F),
)

# Characters allowed to fall back without flagging drift (they already render
# via the fallback stack today: Arabic UI copy, the ≈ sign).
FALLBACK_RANGES: tuple[tuple[int, int], ...] = ((0x600, 0x6FF), (0x2248, 0x2248))

CORE_FILE = "hanken-grotesk-variable-core.woff2"
EXTENDED_FILE = "hanken-grotesk-variable-extended.woff2"


def expand(ranges: tuple[tuple[int, int], ...]) -> set[int]:
    return {cp for lo, hi in ranges for cp in range(lo, hi + 1)}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unicode_range_str(cps: set[int]) -> str:
    spans: list[list[int]] = []
    for cp in sorted(cps):
        if spans and cp == spans[-1][1] + 1:
            spans[-1][1] = cp
        else:
            spans.append([cp, cp])
    parts = [f"U+{lo:04X}" if lo == hi else f"U+{lo:04X}-{hi:04X}" for lo, hi in spans]
    return ", ".join(parts)


def rename(font: TTFont, style: str) -> None:
    """Set internal names. 'Hanken Grotesk' carries no OFL Reserved Font Name
    (verified in the upstream OFL.txt copyright line), so derived names are
    permitted; keep family aligned with the CSS family for tooling clarity."""
    ps = f"HankenGroteskVariable-{style}"
    for name_id, value in ((1, FONT_FAMILY), (4, f"{FONT_FAMILY} {style}"), (6, ps)):
        font["name"].setName(value, name_id, 3, 1, 0x409)
        font["name"].setName(value, name_id, 1, 0, 0)


def subset_woff2(
    ranges: tuple[tuple[int, int], ...],
    style: str,
    exclude: set[int] | None = None,
) -> tuple[bytes, dict]:
    wanted = expand(ranges) - (exclude or set())
    # recalcTimestamp=False keeps head.modified stable so outputs are
    # byte-deterministic across runs (required by --check).
    font = TTFont(VENDOR_TTF, recalcTimestamp=False)
    cmap = font.getBestCmap()
    kept = {cp for cp in wanted if cp in cmap}
    missing = wanted - kept
    if missing:
        print(f"  note: {style}: {len(missing)} requested codepoints absent upstream, excluded: "
              + ", ".join(f"U+{cp:04X}" for cp in sorted(missing)))

    opts = Options()
    opts.layout_features = list(KEEP_FEATURES)
    opts.hinting = False  # drop prep/fpgm/cvt + TrueType instructions
    opts.name_IDs = "*"
    opts.name_languages = "*"
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=sorted(kept))
    subsetter.subset(font)
    # The wght axis is intentionally left at its full 100-900 range; see the
    # WEIGHT_MIN/MAX note above for why partial instancing is not used.
    rename(font, style)

    font.flavor = "woff2"
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()

    # Round-trip check: the generated file must contain exactly the kept set.
    out_font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    got = set(out_font.getBestCmap())
    if got != kept:
        raise SystemExit(
            f"{style}: generated cmap mismatch: extra={sorted(got - kept)[:8]} "
            f"missing={sorted(kept - got)[:8]}"
        )
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in out_font["fvar"].axes]
    glyphs = out_font["maxp"].numGlyphs
    feats = set()
    for tbl in ("GSUB", "GPOS"):
        if tbl in out_font:
            feats |= {r.FeatureTag for r in out_font[tbl].table.FeatureList.FeatureRecord}
    tables = set(out_font.keys())
    for probe in ("fpgm", "prep", "cvt "):
        if probe in tables:
            raise SystemExit(f"{style}: hinting table {probe!r} survived subsetting")
    return data, {
        "bytes": len(data),
        "sha256": sha256(data),
        "glyphs": glyphs,
        "axes": axes,
        "features": sorted(feats),
        "unicodeRange": unicode_range_str(kept),
        "codepoints": len(kept),
    }


def scan_source() -> tuple[dict, list[str]]:
    """Collect rendered-source facts for the drift check."""
    chars: set[int] = set()
    weights: set[int] = set()
    variant_lines = 0
    italic_uses = 0
    files = [
        p
        for pat in ("*.tsx", "*.ts", "*.css")
        for p in (ROOT / "src").rglob(pat)
        if ".test." not in p.name and "routeTree" not in p.name
    ]
    for path in files:
        text = path.read_text(errors="ignore")
        text = re.sub(r"\\u\{?([0-9A-Fa-f]{4,6})\}?", lambda m: chr(int(m.group(1), 16)), text)
        text = re.sub(r"\\x([0-9A-Fa-f]{2})", lambda m: chr(int(m.group(1), 16)), text)
        chars |= {ord(c) for c in text if ord(c) > 0x7E}
        if path.suffix == ".css":
            # font-weight inside @font-face is the axis range descriptor
            # (e.g. "100 900"), not a usage weight; drop those blocks first.
            text_no_ff = re.sub(r"@font-face\s*\{[^}]*\}", "", text)
            weights |= {int(v) for v in re.findall(r"font-weight:\s*(\d+)", text_no_ff)}
            variant_lines += len(re.findall(r"font-variant", text))
            italic_uses += len(re.findall(r"font-style:\s*italic", text))
    return {"chars": chars, "weights": weights, "variantLines": variant_lines, "italicUses": italic_uses}, [
        str(p.relative_to(ROOT)) for p in files
    ]


def build_all() -> tuple[dict[str, tuple[bytes, dict]], dict]:
    vendor_sha = sha256(VENDOR_TTF.read_bytes())
    fontsource_version = "absent"
    if FONTSSOURCE_PKG.exists():
        fontsource_version = json.loads((FONTSSOURCE_PKG / "package.json").read_text())["version"]
    core_data, core_info = subset_woff2(CORE_RANGES, "Core")
    # Extended excludes anything the core face already covers: unicode-ranges
    # of one family must stay disjoint, or the later-declared face wins and
    # defeats the split (measured: the browser fetched the extended file for
    # U+00B7 while core also declared it).
    ext_data, ext_info = subset_woff2(EXTENDED_RANGES, "Extended", exclude=expand(CORE_RANGES))
    manifest = {
        "family": FONT_FAMILY,
        "weightRange": [WEIGHT_MIN, WEIGHT_MAX],
        "featuresKept": list(KEEP_FEATURES),
        "vendor": {
            "file": "scripts/fonts/vendor/HankenGrotesk-wght.ttf",
            "sha256": vendor_sha,
            "fontsourceReferenceVersion": fontsource_version,
        },
        "tools": {
            "python": sys.version.split()[0],
            "fonttools": fonttools_version,
            "brotli": brotli_version,
        },
        "outputs": {CORE_FILE: core_info, EXTENDED_FILE: ext_info},
    }
    return {CORE_FILE: (core_data, core_info), EXTENDED_FILE: (ext_data, ext_info)}, manifest


def write_outputs() -> None:
    results, manifest = build_all()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (data, info) in results.items():
        (OUT_DIR / name).write_bytes(data)
        print(f"{name}: {info['bytes']} bytes, {info['glyphs']} glyphs, axes={info['axes']}")
        print(f"  features={info['features']}")
        print(f"  unicode-range: {info['unicodeRange']}")
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT_DIR / 'manifest.json'}")


def check() -> int:
    code = 0
    current, manifest = build_all()
    facts, files = scan_source()
    try:
        old = json.loads((OUT_DIR / "manifest.json").read_text())
    except FileNotFoundError:
        print("CHECK FAIL: public/fonts/manifest.json missing; run scripts/fonts-subset.py")
        return 2
    for name, (_, info) in current.items():
        old_info = old.get("outputs", {}).get(name)
        if old_info is None or old_info["sha256"] != info["sha256"]:
            print(f"CHECK FAIL: {name} differs from committed output; rerun scripts/fonts-subset.py")
            code = 2
    kept = expand(CORE_RANGES) | expand(EXTENDED_RANGES)
    allowed = kept | expand(FALLBACK_RANGES) | {c for c in range(0x80, 0xA0)}
    stray = {cp for cp in facts["chars"] if cp not in allowed}
    if stray:
        print(
            "CHECK FAIL: characters outside kept ranges found in src: "
            + ", ".join(f"U+{cp:04X} {chr(cp)!r}" for cp in sorted(stray))
        )
        print("  extend EXTENDED_RANGES/CORE_RANGES and rerun, or accept fallback explicitly.")
        code = 3
    bad_weights = {w for w in facts["weights"] if not WEIGHT_MIN <= w <= WEIGHT_MAX}
    if bad_weights:
        print(f"CHECK FAIL: font-weight values outside {WEIGHT_MIN}-{WEIGHT_MAX}: {sorted(bad_weights)}")
        code = 4
    if facts["italicUses"]:
        print(f"CHECK FAIL: font-style: italic found ({facts['italicUses']}); no italic face is shipped")
        code = 5
    if facts["variantLines"] != 1:
        print(f"CHECK NOTE: font-variant* rule count is {facts['variantLines']} (baseline 1); "
              "confirm KEEP_FEATURES still matches usage")
        code = max(code, 6)
    if code == 0:
        print(f"CHECK OK: {len(files)} source files, outputs match manifest, no drift")
    return code


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else write_outputs() or 0)
