import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import {
  SOURCE_EXTRACTION_TIMEOUT_MS,
  SOURCE_EXTRACTION_WORKER_MEMORY_MB,
} from "@/shared/source-contract";

import type {
  SourceFailureReason,
  SourceFileFormat,
} from "@/shared/source-contract";

/**
Bounded extraction runner (#114 build-order unit 2). The parse always runs in
a `worker_threads` worker capped at 128 MiB with a 10 s abort deadline — the
measured unpdf prototype (parser-eval in .scratch) stays inside both.

The worker is created from an eval script that imports unpdf by the module URL resolved here, so the server bundle keeps one statically imported copy of unpdf while the parse itself stays off the main thread. No temporary files exist at any point: bytes are passed in memory and dropped with the worker.
*/

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

const reasonForWorkerFailure = (name: string): SourceFailureReason => {
  if (name === "PasswordException") {
    return "encrypted";
  }
  return name === "EncodingError" ? "encoding" : "parser-fault";
};

export interface BoundedExtraction {
  readonly promise: Promise<ExtractionOutcome>;
  /**
  Cancels the extraction by terminating the worker; safe to call twice.
  */
  readonly cancel: () => void;
}

const outcomeFromMessage = (message: unknown): ExtractionOutcome => {
  const parsed = message as
    | { ok: true; pages: string[] }
    | { ok: false; name: string; message: string };
  if (parsed.ok) {
    return { ok: true, pages: parsed.pages };
  }
  return {
    ok: false,
    reason: reasonForWorkerFailure(parsed.name),
    detail: `${parsed.name}: ${parsed.message}`,
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
    worker.terminate();
  }, SOURCE_EXTRACTION_TIMEOUT_MS);

  const promise = (async (): Promise<ExtractionOutcome> => {
    try {
      const [message] = (await once(worker, "message", {
        signal: deadline.signal,
      })) as [unknown];
      return outcomeFromMessage(message);
    } catch (error) {
      if (deadline.signal.aborted) {
        return {
          ok: false,
          reason: "extraction-timeout",
          detail: `Extraction exceeded ${SOURCE_EXTRACTION_TIMEOUT_MS} ms.`,
        };
      }
      const failure = error as Error;
      return {
        ok: false,
        reason: reasonForWorkerFailure(failure.name),
        detail: failure.message,
      };
    } finally {
      clearTimeout(timer);
      worker.unref();
      worker.terminate();
    }
  })();

  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      deadline.abort();
      worker.terminate();
    },
  };
};
