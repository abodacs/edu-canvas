import { describe, expect, it } from "vitest";

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

import {
  SOURCE_MAX_EXTRACTED_CHARS,
  SOURCE_MAX_FILE_BYTES,
} from "@/shared/source-contract";

const TEXT_PDF_BYTES = new TextEncoder().encode("%PDF-1.4 test content");

describe(decideFileFormat, () => {
  it("detects a PDF by signature, not by extension", () => {
    const decision = decideFileFormat("mislabeled.txt", TEXT_PDF_BYTES);
    expect(decision).toEqual({ ok: true, value: "pdf" });
  });

  it("accepts markdown and txt extensions for non-PDF bytes", () => {
    const bytes = new TextEncoder().encode("plain notes");
    expect(decideFileFormat("notes.md", bytes)).toEqual({
      ok: true,
      value: "markdown",
    });
    expect(decideFileFormat("notes.markdown", bytes)).toEqual({
      ok: true,
      value: "markdown",
    });
    expect(decideFileFormat("notes.txt", bytes)).toEqual({
      ok: true,
      value: "txt",
    });
  });

  it("rejects a PDF extension whose signature disagrees", () => {
    const bytes = new TextEncoder().encode("just text, not a pdf");
    const decision = decideFileFormat("fake.pdf", bytes);
    expect(decision).toEqual({ ok: false, reason: "unsupported-format" });
  });
});

describe(decideFileSize, () => {
  it("accepts a file at the limit", () => {
    const bytes = new Uint8Array(SOURCE_MAX_FILE_BYTES);
    expect(decideFileSize(bytes)).toEqual({
      ok: true,
      value: bytes.byteLength,
    });
  });

  it("rejects one byte over the limit with the named reason", () => {
    const bytes = new Uint8Array(SOURCE_MAX_FILE_BYTES + 1);
    expect(decideFileSize(bytes)).toEqual({
      ok: false,
      reason: "oversized-file",
    });
  });
});

describe(hasPdfEncryptionMarker, () => {
  it("finds /Encrypt in the trailer region", () => {
    const body = new TextEncoder().encode("%PDF-1.4 ");
    const filler = new Uint8Array(2100).fill(32);
    const trailer = new TextEncoder().encode("trailer << /Encrypt 99 0 R >>");
    const bytes = new Uint8Array(
      body.byteLength + filler.byteLength + trailer.byteLength
    );
    bytes.set(body, 0);
    bytes.set(filler, body.byteLength);
    bytes.set(trailer, body.byteLength + filler.byteLength);
    expect(hasPdfEncryptionMarker(bytes)).toBe(true);
  });

  it("does not match /Encrypt beyond the trailer region", () => {
    const header = "%PDF-1.4 A document that mentions /Encrypt early.";
    const filler = "x".repeat(4096);
    const bytes = new TextEncoder().encode(`${header}${filler}%%EOF`);
    expect(hasPdfEncryptionMarker(bytes)).toBe(false);
  });
});

describe(decodeTextSource, () => {
  it("decodes UTF-8 text and strips a BOM", () => {
    const bytes = new TextEncoder().encode("\uFEFFequivalent fractions");
    expect(decodeTextSource(bytes)).toEqual({
      ok: true,
      value: "equivalent fractions",
    });
  });

  it("rejects invalid UTF-8 with the encoding reason", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    expect(decodeTextSource(bytes)).toEqual({ ok: false, reason: "encoding" });
  });

  it("rejects an empty document", () => {
    const bytes = new TextEncoder().encode("   \n  ");
    expect(decodeTextSource(bytes)).toEqual({
      ok: false,
      reason: "empty-source",
    });
  });
});

describe(decidePageCount, () => {
  it("rejects more than twenty pages", () => {
    expect(decidePageCount(21)).toEqual({
      ok: false,
      reason: "too-many-pages",
    });
    expect(decidePageCount(20)).toEqual({ ok: true, value: 20 });
  });
});

describe(decideExtractedLength, () => {
  it("rejects text over the Unicode character cap without truncating", () => {
    const text = "a".repeat(SOURCE_MAX_EXTRACTED_CHARS + 1);
    expect(decideExtractedLength(text)).toEqual({
      ok: false,
      reason: "character-limit-exceeded",
    });
  });

  it("counts code points, not UTF-16 units", () => {
    expect(countCodePoints("\u{1F600}")).toBe(1);
    const atCap = "\u{1F600}".repeat(SOURCE_MAX_EXTRACTED_CHARS);
    expect(decideExtractedLength(atCap)).toEqual({ ok: true, value: atCap });
    const overCap = "\u{1F600}".repeat(SOURCE_MAX_EXTRACTED_CHARS + 1);
    expect(decideExtractedLength(overCap)).toEqual({
      ok: false,
      reason: "character-limit-exceeded",
    });
  });
});

describe(decidePageGaps, () => {
  it("flags scanned pages by page number", () => {
    const gaps = decidePageGaps(["readable text", "   ", "more text"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.code).toBe("scanned-page");
    expect(gaps[0]?.pages).toEqual([2]);
  });

  it("flags suspected broken math and encoding faults separately", () => {
    const symbolPage =
      "\u00D7 \u2215 \u2212 \u2261 \u221E \u2211 \u221A \u2202";
    const encodingPage = "readable start \u{FFFD}\u{FFFD}\u{FFFD}";
    const gaps = decidePageGaps(["fine prose page", symbolPage, encodingPage]);
    const codes = gaps.map((gap) => gap.code);
    expect(codes).toContain("broken-math");
    expect(codes).toContain("encoding");
  });

  it("returns no gaps for clean pages", () => {
    expect(decidePageGaps(["equivalent fractions", "two fourths"])).toEqual([]);
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
