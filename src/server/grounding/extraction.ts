import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  SOURCE_EXTRACTION_TIMEOUT_MS,
  SOURCE_EXTRACTION_WORKER_MEMORY_MB,
} from "@/shared/source-contract";
import { isJsonObject } from "@/lib/http";

import type {
  SourceFailureReason,
  SourceFileFormat,
} from "@/shared/source-contract";

export type ExtractionOutcome =
  | { readonly ok: true; readonly pages: readonly string[] }
  | {
      readonly ok: false;
      readonly reason: SourceFailureReason;
      readonly detail: string;
    };

const WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: SOURCE_EXTRACTION_WORKER_MEMORY_MB,
  maxYoungGenerationSizeMb: 32,
} as const;

const EXTRACTION_WORKER_SCRIPT = `
const { parentPort, workerData } = require("node:worker_threads");
const { bytes, format, moduleUrl } = workerData;
const run = async () => {
  if (format === "pdf") {
    const { extractText, getDocumentProxy } = await import(moduleUrl);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    return { ok: true, pages: result.text };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    return { ok: true, pages: [text] };
  } catch {
    return { ok: false, name: "EncodingError", message: "not valid UTF-8" };
  }
};
run().then(
  (result) => parentPort.postMessage(result),
  (error) => parentPort.postMessage({
    ok: false,
    name: error && error.name ? error.name : "Error",
    message: String(error && error.message ? error.message : error),
  })
);
`;

const extractionModule = { url: null as string | null };

const resolveExtractionModuleUrl = (): string => {
  if (extractionModule.url === null) {
    const require = createRequire(import.meta.url);
    extractionModule.url = pathToFileURL(require.resolve("unpdf")).href;
  }
  return extractionModule.url;
};

const reasonForWorkerFailure = (name: unknown): SourceFailureReason => {
  if (name === "PasswordException") {
    return "encrypted";
  }
  return name === "EncodingError" ? "encoding" : "parser-fault";
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export interface BoundedExtraction {
  readonly promise: Promise<ExtractionOutcome>;
  readonly cancel: () => void;
}

const outcomeFromMessage = (message: unknown): ExtractionOutcome => {
  const parsed = isJsonObject(message) ? message : undefined;
  if (parsed?.ok === true && isStringArray(parsed.pages)) {
    return { ok: true, pages: parsed.pages };
  }
  const name = parsed?.name;
  const detail = parsed?.message;
  return {
    ok: false,
    reason: reasonForWorkerFailure(name),
    detail: `${String(name)}: ${String(detail)}`,
  };
};

export const startBoundedExtraction = (
  bytes: Uint8Array,
  format: SourceFileFormat
): BoundedExtraction => {
  const earlyDeadline = new AbortController();
  let moduleUrl: string;
  try {
    moduleUrl = resolveExtractionModuleUrl();
  } catch {
    const outcome: ExtractionOutcome = {
      ok: false,
      reason: "parser-fault",
      detail: "The extraction module could not be resolved.",
    };
    return {
      promise: Promise.resolve(outcome),
      cancel: () => {
        earlyDeadline.abort();
      },
    };
  }

  const worker = new Worker(EXTRACTION_WORKER_SCRIPT, {
    eval: true,
    workerData: { bytes, format, moduleUrl },
    resourceLimits: WORKER_RESOURCE_LIMITS,
  });

  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
    void worker.terminate();
  }, SOURCE_EXTRACTION_TIMEOUT_MS);

  const promise = (async (): Promise<ExtractionOutcome> => {
    try {
      const messages: unknown[] = await once(worker, "message", {
        signal: deadline.signal,
      });
      const [message] = messages;
      return outcomeFromMessage(message);
    } catch (error) {
      if (deadline.signal.aborted) {
        return {
          ok: false,
          reason: "extraction-timeout",
          detail: `Extraction exceeded ${SOURCE_EXTRACTION_TIMEOUT_MS} ms.`,
        };
      }
      const failure = error instanceof Error ? error : undefined;
      return {
        ok: false,
        reason: reasonForWorkerFailure(failure?.name),
        detail: failure?.message ?? "",
      };
    } finally {
      clearTimeout(timer);
      worker.unref();
      void worker.terminate();
    }
  })();

  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      deadline.abort();
      void worker.terminate();
    },
  };
};
