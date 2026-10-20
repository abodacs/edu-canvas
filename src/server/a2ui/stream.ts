import { validateA2UIMessage } from "@/shared/a2ui-contract";
import type { A2UIMessage } from "@/shared/a2ui-contract";

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const enqueueMessageFrames = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  messages: readonly A2UIMessage[]
): void => {
  for (const message of messages) {
    const validation = validateA2UIMessage(message);
    if (!validation.ok) {
      controller.enqueue(
        encoder.encode(
          frame("error", {
            code: validation.code,
            message: validation.message,
          })
        )
      );
      controller.close();
      return;
    }

    controller.enqueue(encoder.encode(frame("a2ui", message)));
  }

  controller.enqueue(
    encoder.encode(
      frame("complete", {
        surfaceCount: messages.filter((message) => "createSurface" in message)
          .length,
      })
    )
  );
  controller.close();
};

export const createPreviewSSEStream = (
  messages: readonly A2UIMessage[],
  signal?: AbortSignal
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }
      const closeOnAbort = () => {
        controller.close();
      };
      signal?.addEventListener("abort", closeOnAbort, { once: true });

      try {
        enqueueMessageFrames(controller, encoder, messages);
      } finally {
        signal?.removeEventListener("abort", closeOnAbort);
      }
    },
  });
};
