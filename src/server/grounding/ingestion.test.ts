import { describe, expect, it } from "vitest";

import {
  SOURCE_MAX_EXTRACTED_CHARS,
  SOURCE_MAX_FILE_BYTES,
} from "@/shared/source-contract";
import {
  countCodePoints,
  decideExtractedLength,
  decideFileFormat,
  decideFileSize,
  decidePageCount,
  decidePageGaps,
  decodeTextSource,
  hasPdfEncryptionMarker,
  hashExtractedText,
} from "./ingestion";

const encoder = new TextEncoder();

const encodeSource = (value: string): Uint8Array => encoder.encode(value);

const TEXT_PDF_BYTES = encodeSource("%PDF-1.4 test content");

describe(decideFileFormat, () => {
  it("detects a PDF by signature, not by extension", () => {
    const decision = decideFileFormat("mislabeled.txt", TEXT_PDF_BYTES);

    expect(decision).toStrictEqual({ ok: true, value: "pdf" });
  });

  it("accepts markdown and txt extensions for non-PDF bytes", () => {
    const bytes = encodeSource("plain notes");

    expect(decideFileFormat("notes.md", bytes)).toStrictEqual({
      ok: true,
      value: "markdown",
    });
    expect(decideFileFormat("notes.markdown", bytes)).toStrictEqual({
      ok: true,
      value: "markdown",
    });
    expect(decideFileFormat("notes.txt", bytes)).toStrictEqual({
      ok: true,
      value: "txt",
    });
  });

  it("rejects a PDF extension whose signature disagrees", () => {
    const bytes = encodeSource("just text, not a pdf");
    const decision = decideFileFormat("fake.pdf", bytes);

    expect(decision).toStrictEqual({ ok: false, reason: "unsupported-format" });
  });
});

describe(decideFileSize, () => {
  it("accepts a file at the limit", () => {
    const bytes = new Uint8Array(SOURCE_MAX_FILE_BYTES);

    expect(decideFileSize(bytes)).toStrictEqual({
      ok: true,
      value: bytes.byteLength,
    });
  });

  it("rejects one byte over the limit with the named reason", () => {
    const bytes = new Uint8Array(SOURCE_MAX_FILE_BYTES + 1);

    expect(decideFileSize(bytes)).toStrictEqual({
      ok: false,
      reason: "oversized-file",
    });
  });
});

describe(hasPdfEncryptionMarker, () => {
  it("finds /Encrypt in the trailer region", () => {
    const body = encodeSource("%PDF-1.4 ");
    const filler = new Uint8Array(2100);
    filler.fill(32);
    const trailer = encodeSource("trailer << /Encrypt 99 0 R >>");
    const bytes = new Uint8Array(
      body.byteLength + filler.byteLength + trailer.byteLength
    );
    bytes.set(body, 0);
    bytes.set(filler, body.byteLength);
    bytes.set(trailer, body.byteLength + filler.byteLength);

    expect(hasPdfEncryptionMarker(bytes)).toBeTruthy();
  });

  it("does not match /Encrypt beyond the trailer region", () => {
    const header = "%PDF-1.4 A document that mentions /Encrypt early.";
    const filler = "x".repeat(4096);
    const bytes = encodeSource(`${header}${filler}%%EOF`);

    expect(hasPdfEncryptionMarker(bytes)).toBeFalsy();
  });
});

describe(decodeTextSource, () => {
  it("decodes UTF-8 text and strips a BOM", () => {
    const bytes = encodeSource("\u{FEFF}equivalent fractions");

    expect(decodeTextSource(bytes)).toStrictEqual({
      ok: true,
      value: "equivalent fractions",
    });
  });

  it("rejects invalid UTF-8 with the encoding reason", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);

    expect(decodeTextSource(bytes)).toStrictEqual({
      ok: false,
      reason: "encoding",
    });
  });

  it("rejects an empty document", () => {
    const bytes = encodeSource("   \n  ");

    expect(decodeTextSource(bytes)).toStrictEqual({
      ok: false,
      reason: "empty-source",
    });
  });
});

describe(decidePageCount, () => {
  it("rejects more than twenty pages", () => {
    expect(decidePageCount(21)).toStrictEqual({
      ok: false,
      reason: "too-many-pages",
    });
    expect(decidePageCount(20)).toStrictEqual({ ok: true, value: 20 });
  });
});

describe(decideExtractedLength, () => {
  it("rejects text over the Unicode character cap without truncating", () => {
    const text = "a".repeat(SOURCE_MAX_EXTRACTED_CHARS + 1);

    expect(decideExtractedLength(text)).toStrictEqual({
      ok: false,
      reason: "character-limit-exceeded",
    });
  });

  it("counts code points, not UTF-16 units", () => {
    expect(countCodePoints("\u{1F600}")).toBe(1);

    const atCap = "\u{1F600}".repeat(SOURCE_MAX_EXTRACTED_CHARS);

    expect(decideExtractedLength(atCap)).toStrictEqual({
      ok: true,
      value: atCap,
    });

    const overCap = "\u{1F600}".repeat(SOURCE_MAX_EXTRACTED_CHARS + 1);

    expect(decideExtractedLength(overCap)).toStrictEqual({
      ok: false,
      reason: "character-limit-exceeded",
    });
  });
});

describe(decidePageGaps, () => {
  it("flags scanned pages by page number", () => {
    const gaps = decidePageGaps(["readable text", " ".repeat(3), "more text"]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.code).toBe("scanned-page");
    expect(gaps[0]?.pages).toStrictEqual([2]);
  });

  it("flags suspected broken math and encoding faults separately", () => {
    const symbolPage =
      "\u{D7} \u{2215} \u{2212} \u{2261} \u{221E} \u{2211} \u{221A} \u{2202}";
    const encodingPage = "readable start \u{FFFD}\u{FFFD}\u{FFFD}";
    const gaps = decidePageGaps(["fine prose page", symbolPage, encodingPage]);
    const codes = gaps.map((gap) => gap.code);

    expect(codes).toContain("broken-math");
    expect(codes).toContain("encoding");
  });

  it("returns no gaps for clean pages", () => {
    expect(
      decidePageGaps(["equivalent fractions", "two fourths"])
    ).toStrictEqual([]);
  });
});

describe(hashExtractedText, () => {
  it("is a stable SHA-256 digest", () => {
    const digest = hashExtractedText("equivalent fractions");

    expect(digest).toBe(hashExtractedText("equivalent fractions"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(digest).not.toBe(hashExtractedText("different text"));
  });
});
