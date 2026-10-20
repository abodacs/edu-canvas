export type PreviewStreamOutcome =
  | { status: "complete"; surfaceCount: number }
  | { status: "error"; code: string; message: string };

type PreviewStreamEvent =
  | { type: "message"; value: unknown }
  | { type: "complete"; surfaceCount: number }
  | { type: "error"; code: string; message: string };

export class PreviewStreamMessageError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PreviewStreamMessageError";
    this.code = code;
  }
}

const readField = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return Object.hasOwn(record, key) ? record[key] : undefined;
};

const streamError = (code: string, message: string): PreviewStreamOutcome => {
  return {
    status: "error",
    code,
    message,
  };
};

const parseFrame = (frame: string): PreviewStreamEvent | undefined => {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return {
      type: "error",
      code: "INVALID_STREAM_DATA",
      message: "The preview sent an unreadable stream event.",
    };
  }

  if (eventName === "a2ui") {
    return { type: "message", value: data };
  }

  if (eventName === "complete") {
    const surfaceCountValue = readField(data, "surfaceCount");
    const surfaceCount =
      typeof surfaceCountValue === "number" ? surfaceCountValue : 0;
    return { type: "complete", surfaceCount };
  }

  if (eventName === "error") {
    const codeValue = readField(data, "code");
    const messageValue = readField(data, "message");
    const code = typeof codeValue === "string" ? codeValue : "STREAM_ERROR";
    const message =
      typeof messageValue === "string"
        ? messageValue
        : "The preview stream could not be completed.";
    return { type: "error", code, message };
  }

  return {
    type: "error",
    code: "UNKNOWN_STREAM_EVENT",
    message: "The preview sent an unsupported stream event.",
  };
};

const handlePreviewEvent = (
  event: PreviewStreamEvent,
  onMessage: (message: unknown) => void
): PreviewStreamOutcome | undefined => {
  if (event.type === "message") {
    try {
      onMessage(event.value);
      return undefined;
    } catch (error) {
      return error instanceof PreviewStreamMessageError
        ? streamError(error.code, error.message)
        : streamError(
            "STREAM_MESSAGE_REJECTED",
            "The preview contained content the browser could not render safely."
          );
    }
  }

  if (event.type === "complete") {
    return {
      status: "complete",
      surfaceCount: event.surfaceCount,
    };
  }

  return streamError(event.code, event.message);
};

const readPreviewFrames = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onMessage: (message: unknown) => void
): Promise<PreviewStreamOutcome> => {
  const decoder = new TextDecoder();
  let buffer = "";
  let isStreamDone = false;

  while (!isStreamDone) {
    // A stream is read frame by frame; the next read needs the previous
    // chunk to have been decoded and parsed.
    // eslint-disable-next-line no-await-in-loop
    const result = await reader.read();
    isStreamDone = result.done;
    if (isStreamDone) {
      continue;
    }
    buffer += decoder.decode(result.value, { stream: true });
    buffer = buffer.replaceAll("\r\n", "\n");

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = parseFrame(frame);
      if (!event) {
        continue;
      }

      const outcome = handlePreviewEvent(event, onMessage);
      if (outcome) {
        return outcome;
      }
    }
  }

  return streamError(
    "STREAM_DISCONNECTED",
    "The preview connection ended before the lesson was ready."
  );
};

export const consumeA2UIPreviewStream = async (
  response: Response,
  onMessage: (message: unknown) => void
): Promise<PreviewStreamOutcome> => {
  if (!response.ok) {
    return streamError(
      "STREAM_HTTP_ERROR",
      "The preview could not be opened. Try the preview again."
    );
  }

  if (!response.body) {
    return streamError(
      "STREAM_DISCONNECTED",
      "The preview connection ended before the lesson was ready."
    );
  }

  const reader = response.body.getReader();

  try {
    return await readPreviewFrames(reader, onMessage);
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? streamError(
          "STREAM_ABORTED",
          "The preview connection was stopped before it finished."
        )
      : streamError(
          "STREAM_DISCONNECTED",
          "The preview connection was interrupted. Try the preview again."
        );
  } finally {
    reader.releaseLock();
  }
};
