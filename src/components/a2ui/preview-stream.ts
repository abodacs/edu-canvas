export type PreviewStreamOutcome =
  | { status: 'complete'; surfaceCount: number }
  | { status: 'error'; code: string; message: string }

type PreviewStreamEvent =
  | { type: 'message'; value: unknown }
  | { type: 'complete'; surfaceCount: number }
  | { type: 'error'; code: string; message: string }

export class PreviewStreamMessageError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PreviewStreamMessageError'
    this.code = code
  }
}

function streamError(code: string, message: string): PreviewStreamOutcome {
  return { status: 'error', code, message }
}

function parseFrame(frame: string): PreviewStreamEvent | undefined {
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  if (dataLines.length === 0) return undefined

  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n')) as unknown
  } catch {
    return {
      type: 'error',
      code: 'INVALID_STREAM_DATA',
      message: 'The preview sent an unreadable stream event.',
    }
  }

  if (eventName === 'a2ui') return { type: 'message', value: data }

  if (eventName === 'complete') {
    const surfaceCount =
      typeof data === 'object' &&
      data !== null &&
      'surfaceCount' in data &&
      typeof data.surfaceCount === 'number'
        ? data.surfaceCount
        : 0
    return { type: 'complete', surfaceCount }
  }

  if (eventName === 'error') {
    const code =
      typeof data === 'object' &&
      data !== null &&
      'code' in data &&
      typeof data.code === 'string'
        ? data.code
        : 'STREAM_ERROR'
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : 'The preview stream could not be completed.'
    return { type: 'error', code, message }
  }

  return {
    type: 'error',
    code: 'UNKNOWN_STREAM_EVENT',
    message: 'The preview sent an unsupported stream event.',
  }
}

export async function consumeA2UIPreviewStream(
  response: Response,
  onMessage: (message: unknown) => void,
): Promise<PreviewStreamOutcome> {
  if (!response.ok) {
    return streamError(
      'STREAM_HTTP_ERROR',
      'The preview could not be opened. Try the preview again.',
    )
  }

  if (!response.body) {
    return streamError(
      'STREAM_DISCONNECTED',
      'The preview connection ended before the lesson was ready.',
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamDone = false

  try {
    while (!streamDone) {
      const result = await reader.read()
      streamDone = result.done
      if (streamDone) continue
      buffer += decoder.decode(result.value, { stream: true })
      buffer = buffer.replaceAll('\r\n', '\n')

      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const event = parseFrame(frame)
        if (!event) continue

        if (event.type === 'message') {
          try {
            onMessage(event.value)
          } catch (error) {
            if (error instanceof PreviewStreamMessageError) {
              return streamError(error.code, error.message)
            }

            return streamError(
              'STREAM_MESSAGE_REJECTED',
              'The preview contained content the browser could not render safely.',
            )
          }
        } else if (event.type === 'complete') {
          return {
            status: 'complete',
            surfaceCount: event.surfaceCount,
          }
        } else {
          return streamError(event.code, event.message)
        }
      }
    }

    return streamError(
      'STREAM_DISCONNECTED',
      'The preview connection ended before the lesson was ready.',
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return streamError(
        'STREAM_ABORTED',
        'The preview connection was stopped before it finished.',
      )
    }

    return streamError(
      'STREAM_DISCONNECTED',
      'The preview connection was interrupted. Try the preview again.',
    )
  } finally {
    reader.releaseLock()
  }
}
