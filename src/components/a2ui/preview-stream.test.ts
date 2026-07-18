import { describe, expect, it } from 'vitest'

import { consumeA2UIPreviewStream } from './preview-stream'

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe('A2UI preview SSE stream', () => {
  it('reports a disconnect when the stream ends before completion', async () => {
    const messages: unknown[] = []
    const response = new Response(
      streamFrom(
        'event: a2ui\ndata: {"version":"v0.9.1","createSurface":{"surfaceId":"preview-1","catalogId":"https://edu-canvas.app/a2ui/v0.9.1/catalogs/matching-v1"}}\n\n',
      ),
      { headers: { 'content-type': 'text/event-stream' } },
    )

    const outcome = await consumeA2UIPreviewStream(response, (message) => {
      messages.push(message)
    })

    expect(messages).toHaveLength(1)
    expect(outcome).toMatchObject({
      status: 'error',
      code: 'STREAM_DISCONNECTED',
    })
  })
})
