import { createHash } from "node:crypto";

import {
  SOURCE_MAX_EXTRACTED_CHARS,
  SOURCE_MAX_FILE_BYTES,
  SOURCE_MAX_PDF_PAGES,
} from "@/shared/source-contract";

import type {
  SourceFailureReason,
  SourceFileFormat,
  SourceGap,
} from "@/shared/source-contract";

/**
Pure ingestion decisions (#114 build-order unit 2). No I/O, no parser: every
rejection class is decided here so tests can pin each named reason.
*/

export type IngestionDecision<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: SourceFailureReason };

const PDF_SIGNATURE = "%PDF-";
const PDF_ENCRYPT_MARKER = "/Encrypt";
const SHA_256 = "SHA-256";

/**
Encrypted PDFs carry `/Encrypt` in the trailer. Scanning the tail keeps the
pre-parse rejection cheap and avoids matching the literal inside content
streams.
*/
const PDF_TRAILER_SCAN_BYTES = 2048;

const LATIN1_DECODER = new TextDecoder("latin1");
const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });

type PageClass = "scanned" | "encoding" | "broken-math" | "clean";

/**
A page whose extracted text is mostly non-letters is suspected broken math:
fraction bars and glyphs survive extraction as isolated symbols. Conservative on purpose; the gap message says "suspected" and names the pages.
*/
const BROKEN_MATH_TEXT_DENSITY = 0.5;
const REPLACEMENT_CHARACTER = "\u{FFFD}";
const BROKEN_MATH_CLASS = "broken-math";

const textDensity = (page: string): number => {
  const characters = [...page];
  if (characters.length === 0) {
    return 1;
  }
  let readable = 0;
  for (const character of characters) {
    if (/[\p{L}\p{N}\s]/u.test(character)) {
      readable += 1;
    }
  }
  return readable / characters.length;
};

const classifyPage = (page: string): PageClass => {
  if (page.includes(REPLACEMENT_CHARACTER)) {
    return "encoding";
  }
  if (page.trim().length === 0) {
    return "scanned";
  }
  return textDensity(page) < BROKEN_MATH_TEXT_DENSITY
    ? BROKEN_MATH_CLASS
    : "clean";
};

const formatPageList = (pages: readonly number[]): string =>
  pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.join(", ")}`;

export const decideFileFormat = (
  fileName: string,
  bytes: Uint8Array
): IngestionDecision<SourceFileFormat> => {
  const header = LATIN1_DECODER.decode(bytes.slice(0, PDF_SIGNATURE.length));
  if (header === PDF_SIGNATURE) {
    return { ok: true, value: "pdf" };
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".md") || lowerName.endsWith(".markdown")) {
    return { ok: true, value: "markdown" };
  }
  return lowerName.endsWith(".txt")
    ? { ok: true, value: "txt" }
    : { ok: false, reason: "unsupported-format" };
};

export const decideFileSize = (
  bytes: Uint8Array
): IngestionDecision<number> => {
  return bytes.byteLength > SOURCE_MAX_FILE_BYTES
    ? { ok: false, reason: "oversized-file" }
    : { ok: true, value: bytes.byteLength };
};

export const hasPdfEncryptionMarker = (bytes: Uint8Array): boolean => {
  const scanStart = Math.max(0, bytes.byteLength - PDF_TRAILER_SCAN_BYTES);
  const trailer = LATIN1_DECODER.decode(bytes.slice(scanStart));
  return trailer.includes(PDF_ENCRYPT_MARKER);
};

export const decodeTextSource = (
  bytes: Uint8Array
): IngestionDecision<string> => {
  let text: string;
  try {
    text = UTF8_FATAL_DECODER.decode(bytes);
  } catch {
    return { ok: false, reason: "encoding" };
  }
  const withoutBom = text.replace(/^\u{FEFF}/u, "");
  return withoutBom.trim().length === 0
    ? { ok: false, reason: "empty-source" }
    : { ok: true, value: withoutBom };
};

export const countCodePoints = (text: string): number => [...text].length;

export const decideExtractedLength = (
  text: string
): IngestionDecision<string> => {
  return countCodePoints(text) > SOURCE_MAX_EXTRACTED_CHARS
    ? { ok: false, reason: "character-limit-exceeded" }
    : { ok: true, value: text };
};

export const decidePageCount = (
  pageCount: number
): IngestionDecision<number> => {
  return pageCount > SOURCE_MAX_PDF_PAGES
    ? { ok: false, reason: "too-many-pages" }
    : { ok: true, value: pageCount };
};

export const decidePageGaps = (pages: readonly string[]): SourceGap[] => {
  const scannedPages: number[] = [];
  const encodingPages: number[] = [];
  const mathPages: number[] = [];

  const pagesByClassification: Record<PageClass, number[]> = {
    scanned: scannedPages,
    encoding: encodingPages,
    "broken-math": mathPages,
    clean: [],
  };

  for (const [index, page] of pages.entries()) {
    const pageNumber = index + 1;
    pagesByClassification[classifyPage(page)].push(pageNumber);
  }

  const gaps: SourceGap[] = [];
  if (scannedPages.length > 0) {
    gaps.push({
      code: "scanned-page",
      pages: scannedPages,
      message: `No text layer on ${formatPageList(scannedPages)}; it looks scanned. Replace the file or enter corrected text.`,
    });
  }
  if (mathPages.length > 0) {
    gaps.push({
      code: BROKEN_MATH_CLASS,
      pages: mathPages,
      message: `Suspected broken mathematics on ${formatPageList(mathPages)}: symbols extracted without readable words. Review those pages.`,
    });
  }
  if (encodingPages.length > 0) {
    gaps.push({
      code: "encoding",
      pages: encodingPages,
      message: `Unreadable characters on ${formatPageList(encodingPages)}. Replace the file or enter corrected text.`,
    });
  }
  return gaps;
};

export const missingPrerequisitesGap = (): SourceGap => {
  return {
    code: "missing-prerequisites",
    message:
      "The required-skill pack for this standard is unavailable, so the source cannot be matched to prerequisites. Generation stays blocked.",
  };
};

export const unverifiedAlignmentGap = (): SourceGap => {
  return {
    code: "unverified-external-alignment",
    message:
      "Upload recovery never claims a Learning Commons match. Check alignment to the standard yourself.",
  };
};

export const hashExtractedText = (text: string): string =>
  createHash(SHA_256).update(text, "utf-8").digest("hex");
