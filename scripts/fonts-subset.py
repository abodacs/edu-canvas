#!/usr/bin/env python3
"""Build the self-hosted web-font subsets used by the site.

Run by hand (needs: pip install fonttools brotli):

    python3 scripts/fonts-subset.py            # rebuild + write public/fonts/
    python3 scripts/fonts-subset.py --check    # verify outputs + scan for drift

Outputs are committed (public/fonts/*.woff2 + manifest.json). Nothing here runs
in the build. Rerun when --check reports drift: a font package bump, characters
used outside the kept ranges, font-weight values outside the axis range, or new
OpenType feature usage. See scripts/fonts/README.md.

Each family in FAMILIES (Source Serif 4 for display, Figtree for body) is split
into two faces of one CSS family:
- core:     ASCII + the punctuation most pages use (curly quotes, dashes,
            ellipsis). The Figtree core face is preloaded from
            src/routes/__root.tsx; the display core face is not.
- extended: Latin-1 Supplement + Latin Extended-A + the few maths symbols
            the lesson copy uses. Loaded only when a page renders one of
            its characters (unicode-range).

The @font-face rules live in src/styles/tokens.css and are maintained by hand;
this script never rewrites a stylesheet. --check compares the unicode-range
each face declares there against the generated subsets.

Deliberately NOT covered (they fall back to the next font in the stack): Arabic,
U+21D2 (⇒), combining marks, and every block outside the kept ranges.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from brotli import __version__ as brotli_version
from fontTools import version as fonttools_version
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
VENDOR_DIR = ROOT / "scripts" / "fonts" / "vendor"
OUT_DIR = ROOT / "public" / "fonts"
TOKENS_CSS = ROOT / "src" / "styles" / "tokens.css"


@dataclass(frozen=True)
class Family:
    """One self-hosted family. `css_family` is the name stylesheets use;
    `internal_family` is written into the subset's name table. They differ
    when the upstream licence reserves a font name: the OFL forbids a
    modified font (a subset is one) from carrying a Reserved Font Name."""

    key: str
    role: str
    css_family: str
    internal_family: str
    postscript_prefix: str
    vendor_file: str
    licence_file: str
    licence: str
    version: str
    origin: str
    output_prefix: str
    preload: bool
    # Licence copy served next to the woff2 files (public/fonts/).
    public_licence: str
    # nameID 0 written into the subset. None keeps the upstream notice.
    copyright: str | None = None
    # Codepoints inside the kept ranges that this family's upstream lacks and
    # that the site renders anyway; they fall back to the next font in the
    # stack. --check fails on any other kept codepoint the family cannot draw.
    fallback: tuple[int, ...] = ()


FAMILIES: tuple[Family, ...] = (
    Family(
        key="display",
        role="display: page titles, section and card headings (h1-h3)",
        css_family="Source Serif 4",
        # Adobe reserves the font name "Source"; the subset is renamed.
        internal_family="Schole Display Serif",
        postscript_prefix="ScholeDisplaySerif",
        vendor_file="SourceSerif4Variable-Roman.ttf",
        licence_file="SourceSerif4-OFL.md",
        licence="OFL-1.1 (Reserved Font Name: Source)",
        version="4.005",
        origin="https://github.com/adobe-fonts/source-serif/blob/2823e993c53fca27c5c8749f529b56a5a7c77b6b/VAR/SourceSerif4Variable-Roman.ttf",
        output_prefix="source-serif-4",
        preload=False,
        public_licence="OFL-SourceSerif4.md",
        # Upstream's notice names the reserved font name; the subset keeps the
        # copyright and licence but not the reserved name (see rename()).
        copyright="Copyright 2014 - 2023 Adobe (http://www.adobe.com/). "
        "Licensed under the SIL Open Font License, Version 1.1.",
    ),
    Family(
        key="sans",
        role="body: everything you read or act on",
        css_family="Figtree",
        internal_family="Figtree",
        postscript_prefix="Figtree",
        vendor_file="Figtree-wght.ttf",
        licence_file="Figtree-OFL.txt",
        licence="OFL-1.1 (no Reserved Font Name)",
        version="2.002",
        origin="https://github.com/google/fonts/blob/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/figtree/Figtree%5Bwght%5D.ttf",
        output_prefix="figtree",
        preload=True,
        public_licence="OFL-Figtree.txt",
        # Figtree 2.002 has no ≈; body copy renders it in the stack's next
        # font (Trebuchet MS / Segoe UI / system-ui).
        fallback=(0x2248,),
    ),
)

# Usage spans 400 (body default) to 800; WEIGHT_MIN/MAX describe the range of
# font-weight values the site may request, used by --check drift scanning.
# The wght axis itself is deliberately NOT instanced to this range: fontTools
# partial instancing re-derives gvar/HVAR deltas and shifts sub-pixel advances
# at intermediate weights (measured ±0.2px per ~340px run at 650/700/750 on the
# previous family), which reads as a visual regression. Keep the full axes.
WEIGHT_MIN, WEIGHT_MAX = 400, 800
# tnum backs the two font-variant-numeric: tabular-nums rules.
KEEP_FEATURES = ("ccmp", "kern", "liga", "locl", "mark", "mkmk", "tnum")
# font-variant values KEEP_FEATURES can satisfy. Today every rule is
# `tabular-nums` (tnum keeps the aligned digits); a new value means a feature
# review before the subset changes, not a raised count. The one italic rule
# (progress.css provisional note) renders a synthesised oblique.
ALLOWED_FONT_VARIANT_VALUES = frozenset({"tabular-nums"})
ITALIC_RULES_BASELINE = 1

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
# Extended: Latin-1 Supplement + Latin Extended-A + maths symbols the lesson
# and review copy render (unicode-range face).
EXTENDED_RANGES: tuple[tuple[int, int], ...] = (
    (0xA0, 0xFF),
    (0x100, 0x17F),
    (0x2192, 0x2192),  # rightwards arrow
    (0x2212, 0x2212),  # minus sign
    (0x2248, 0x2248),  # almost equal to
    (0x2260, 0x2260),  # not equal to
    (0x2264, 0x2265),  # less/greater-than or equal to
)

# Characters allowed to fall back without flagging drift: every right-to-left
# block the app can render (Arabic and its presentation forms, plus the Hebrew
# range boundary the bidi detector names), the ⇒ sign (absent upstream), the
# white square the answer-rules glyph set accepts, and two code-only characters
# that never render (byte-order mark, replacement character). The bidi
# detector's regex range endpoints are themselves scanned as characters, so the
# Arabic blocks have to be listed here even when no source string uses them.
FALLBACK_RANGES: tuple[tuple[int, int], ...] = (
    (0x590, 0x8FF),
    (0xFB1D, 0xFDFF),
    (0xFE70, 0xFEFF),
    (0x21D2, 0x21D2),
    (0x25A1, 0x25A1),
    (0xFEFF, 0xFEFF),
    (0xFFFD, 0xFFFD),
)


def output_name(family: Family, face: str) -> str:
    return f"{family.output_prefix}-{face}.woff2"


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


def rename(font: TTFont, family: Family, style: str) -> None:
    """Set internal names to the family's non-reserved internal name and keep
    the copyright notice and licence the OFL requires a Modified Version to
    carry."""
    ps = f"{family.postscript_prefix}-{style}"
    name_table = font["name"]
    copyright_notice = family.copyright or name_table.getDebugName(0) or ""
    licence_text = name_table.getDebugName(13) or (
        "This Font Software is licensed under the SIL Open Font License, Version 1.1."
    )
    # Drop every localized and variation-instance name so no reserved name
    # survives in another language record; then write the ones we need.
    keep = {0, 1, 2, 4, 6, 13, 14}
    name_table.names = [n for n in name_table.names if n.nameID in keep]
    for name_id, value in (
        (0, copyright_notice),
        (1, family.internal_family),
        (2, "Regular"),
        (4, f"{family.internal_family} {style}"),
        (6, ps),
        (13, licence_text),
        (14, "https://openfontlicense.org"),
    ):
        name_table.removeNames(nameID=name_id)
        name_table.setName(value, name_id, 3, 1, 0x409)
        name_table.setName(value, name_id, 1, 0, 0)
    # fvar/STAT instance names point at removed name IDs; drop named instances
    # (the CSS addresses the axes directly) and STAT, which only labels them.
    if "fvar" in font:
        font["fvar"].instances = []
    if "STAT" in font:
        del font["STAT"]


def subset_woff2(
    family: Family,
    ranges: tuple[tuple[int, int], ...],
    style: str,
    exclude: set[int] | None = None,
) -> tuple[bytes, dict]:
    wanted = expand(ranges) - (exclude or set())
    # recalcTimestamp=False keeps head.modified stable so outputs are
    # byte-deterministic across runs (required by --check).
    font = TTFont(VENDOR_DIR / family.vendor_file, recalcTimestamp=False)
    cmap = font.getBestCmap()
    kept = {cp for cp in wanted if cp in cmap}
    missing = wanted - kept
    if missing:
        print(f"  note: {family.css_family} {style}: {len(missing)} requested codepoints absent upstream, excluded: "
              + ", ".join(f"U+{cp:04X}" for cp in sorted(missing)))

    opts = Options()
    opts.layout_features = list(KEEP_FEATURES)
    opts.hinting = False  # drop prep/fpgm/cvt + TrueType instructions
    opts.name_IDs = "*"
    opts.name_languages = "*"
    # Subsetting invalidates any digital signature.
    opts.drop_tables = [*opts.drop_tables, "DSIG"]
    subsetter = Subsetter(options=opts)
    subsetter.populate(unicodes=sorted(kept))
    subsetter.subset(font)
    # Axes are intentionally left at their full upstream range; see the
    # WEIGHT_MIN/MAX note above for why partial instancing is not used.
    rename(font, family, style)

    font.flavor = "woff2"
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()

    # Round-trip check: the generated file must contain exactly the kept set.
    out_font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    got = set(out_font.getBestCmap())
    if got != kept:
        raise SystemExit(
            f"{family.css_family} {style}: generated cmap mismatch: extra={sorted(got - kept)[:8]} "
            f"missing={sorted(kept - got)[:8]}"
        )
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in out_font["fvar"].axes]
    glyphs = out_font["maxp"].numGlyphs
    feats = set()
    for tbl in ("GSUB", "GPOS"):
        if tbl in out_font:
            feats |= {r.FeatureTag for r in out_font[tbl].table.FeatureList.FeatureRecord}
    tables = set(out_font.keys())
    for probe in ("fpgm", "prep", "cvt ", "DSIG"):
        if probe in tables:
            raise SystemExit(f"{family.css_family} {style}: table {probe!r} survived subsetting")
    names = " ".join(str(n) for n in out_font["name"].names)
    if family.internal_family != family.css_family and "Source" in names:
        raise SystemExit(f"{family.css_family} {style}: reserved name survived in the name table")
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
    font_variants: set[str] = set()
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
            for value in re.findall(r"font-variant[\w-]*:\s*([^;]+);", text_no_ff):
                font_variants.add(" ".join(value.split()))
            italic_uses += len(re.findall(r"font-style:\s*italic", text))
    return {
        "chars": chars,
        "weights": weights,
        "fontVariants": font_variants,
        "italicUses": italic_uses,
    }, [
        str(p.relative_to(ROOT)) for p in files
    ]


def build_family(family: Family) -> tuple[dict[str, tuple[bytes, dict]], dict]:
    vendor_bytes = (VENDOR_DIR / family.vendor_file).read_bytes()
    core_data, core_info = subset_woff2(family, CORE_RANGES, "Core")
    # Extended excludes anything the core face already covers: unicode-ranges
    # of one family must stay disjoint, or the later-declared face wins and
    # defeats the split (measured: the browser fetched the extended file for
    # U+00B7 while core also declared it).
    ext_data, ext_info = subset_woff2(
        family, EXTENDED_RANGES, "Extended", exclude=expand(CORE_RANGES)
    )
    core_file, ext_file = output_name(family, "core"), output_name(family, "extended")
    source = TTFont(VENDOR_DIR / family.vendor_file, lazy=True)
    entry = {
        "family": family.css_family,
        "role": family.role,
        "internalName": family.internal_family,
        "version": family.version,
        "licence": family.licence,
        "licenceFile": f"scripts/fonts/vendor/{family.licence_file}",
        "origin": family.origin,
        "vendor": {
            "file": f"scripts/fonts/vendor/{family.vendor_file}",
            "sha256": sha256(vendor_bytes),
        },
        "axes": [[a.axisTag, a.minValue, a.maxValue] for a in source["fvar"].axes],
        "preload": family.preload,
        "publicLicence": f"public/fonts/{family.public_licence}",
        "fallbackCodepoints": [f"U+{cp:04X}" for cp in family.fallback],
        "outputs": {core_file: core_info, ext_file: ext_info},
    }
    return {core_file: (core_data, core_info), ext_file: (ext_data, ext_info)}, entry


def build_all() -> tuple[dict[str, tuple[bytes, dict]], dict]:
    results: dict[str, tuple[bytes, dict]] = {}
    families = []
    for family in FAMILIES:
        files, entry = build_family(family)
        results.update(files)
        families.append(entry)
    manifest = {
        "manifestVersion": 2,
        "weightRange": [WEIGHT_MIN, WEIGHT_MAX],
        "featuresKept": list(KEEP_FEATURES),
        "tools": {
            "python": sys.version.split()[0],
            "fonttools": fonttools_version,
            "brotli": brotli_version,
        },
        "families": families,
    }
    return results, manifest


def write_outputs() -> None:
    results, manifest = build_all()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, (data, info) in results.items():
        (OUT_DIR / name).write_bytes(data)
        print(f"{name}: {info['bytes']} bytes, {info['glyphs']} glyphs, axes={info['axes']}")
        print(f"  features={info['features']}")
        print(f"  unicode-range: {info['unicodeRange']}")
    for family in FAMILIES:
        licence = (VENDOR_DIR / family.licence_file).read_bytes()
        (OUT_DIR / family.public_licence).write_bytes(licence)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {OUT_DIR / 'manifest.json'} and the licence copies")


def declared_ranges() -> dict[str, str]:
    """Map each @font-face src file in tokens.css to its unicode-range."""
    css = TOKENS_CSS.read_text()
    found: dict[str, str] = {}
    for block in re.findall(r"@font-face\s*\{([^}]*)\}", css):
        src = re.search(r'url\("/fonts/([^"]+)"\)', block)
        rng = re.search(r"unicode-range:\s*([^;]+);", block)
        if src and rng:
            found[src.group(1)] = " ".join(rng.group(1).split())
    return found


def check() -> int:
    code = 0
    current, manifest = build_all()
    facts, files = scan_source()
    try:
        old = json.loads((OUT_DIR / "manifest.json").read_text())
    except FileNotFoundError:
        print("CHECK FAIL: public/fonts/manifest.json missing; run scripts/fonts-subset.py")
        return 2
    old_outputs = {
        name: info
        for entry in old.get("families", [])
        for name, info in entry.get("outputs", {}).items()
    }
    declared = declared_ranges()
    for name, (data, info) in current.items():
        old_info = old_outputs.get(name)
        if old_info is None or old_info["sha256"] != info["sha256"]:
            print(f"CHECK FAIL: {name} differs from committed manifest; rerun scripts/fonts-subset.py")
            code = 2
        on_disk = OUT_DIR / name
        if not on_disk.exists() or sha256(on_disk.read_bytes()) != info["sha256"]:
            print(f"CHECK FAIL: public/fonts/{name} differs from a fresh build; rerun scripts/fonts-subset.py")
            code = 2
        if declared.get(name) != info["unicodeRange"]:
            print(
                f"CHECK FAIL: tokens.css unicode-range for {name} is {declared.get(name)!r}; "
                f"expected {info['unicodeRange']!r}"
            )
            code = 2
    for stale in sorted(set(declared) - set(current)):
        print(f"CHECK FAIL: tokens.css declares {stale}, which no family builds")
        code = 2
    kept = expand(CORE_RANGES) | expand(EXTENDED_RANGES)
    allowed = kept | expand(FALLBACK_RANGES) | {c for c in range(0x80, 0xA0)}
    stray = {cp for cp in facts["chars"] if cp not in allowed}
    for family in FAMILIES:
        drawable = set(TTFont(VENDOR_DIR / family.vendor_file, lazy=True).getBestCmap())
        wanted = {cp for cp in facts["chars"] if cp in kept}
        undrawn = wanted - drawable - set(family.fallback)
        if undrawn:
            print(
                f"CHECK FAIL: {family.css_family} cannot draw characters used in src: "
                + ", ".join(f"U+{cp:04X} {chr(cp)!r}" for cp in sorted(undrawn))
            )
            print("  add them to the family's fallback tuple on purpose, or pick a family that has them.")
            code = 3
        stale = {cp for cp in family.fallback if cp in drawable}
        if stale:
            print(
                f"CHECK FAIL: {family.css_family} fallback lists characters the font draws: "
                + ", ".join(f"U+{cp:04X}" for cp in sorted(stale))
            )
            code = 3
        public = OUT_DIR / family.public_licence
        vendor = VENDOR_DIR / family.licence_file
        if not public.exists() or public.read_bytes() != vendor.read_bytes():
            print(f"CHECK FAIL: public/fonts/{family.public_licence} must equal {vendor.relative_to(ROOT)}")
            code = 2
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
    if facts["italicUses"] > ITALIC_RULES_BASELINE:
        print(
            f"CHECK FAIL: font-style: italic rule count is {facts['italicUses']} "
            f"(baseline {ITALIC_RULES_BASELINE}); no italic face is shipped"
        )
        code = 5
    unexpected_variants = facts["fontVariants"] - ALLOWED_FONT_VARIANT_VALUES
    if unexpected_variants:
        print(
            "CHECK FAIL: font-variant values outside KEEP_FEATURES: "
            + ", ".join(sorted(unexpected_variants))
        )
        print("  keep the value only after adding its OpenType feature to KEEP_FEATURES.")
        code = max(code, 6)
    if code == 0:
        families = ", ".join(f.css_family for f in FAMILIES)
        print(
            f"CHECK OK: {families}; {len(current)} faces match manifest and tokens.css; "
            f"{len(files)} source files, no drift"
        )
    return code


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else write_outputs() or 0)
