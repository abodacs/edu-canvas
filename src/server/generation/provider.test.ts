import { describe, expect, it } from 'vitest'

import {
  createDeterministicLessonDraftProvider,
  createEquivalentFractionsDraft,
  createOpenAILessonDraftProvider,
  LessonProviderError,
} from './provider'
import type { NormalizedGenerationRequest } from './provider'
import { validateProviderDraft } from './validation'

const request: NormalizedGenerationRequest = {
  prompt: 'equivalent fractions for grade 4',
  grade: 4,
  standardId: 'standard_ccss_4_nf_a_01',
  language: 'en',
  difficulty: 'on-level',
}

describe('lesson draft providers', () => {
  it('records the validator version with language compatibility rules', async () => {
    const provider = createDeterministicLessonDraftProvider()
    await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
    })

    expect(provider.provenance.validatorVersion).toBe('lesson-validator-v2')
  })

  it('generates a deterministic Arabic fixture with RTL metadata', async () => {
    const provider = createDeterministicLessonDraftProvider()
    const response = await provider.generate(
      { ...request, language: 'ar' },
      { correctionAttempt: false, diagnostics: [] },
    )

    const result = validateProviderDraft(response.draft)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.variants[0]?.languageMetadata).toMatchObject({
        language: 'ar',
        direction: 'rtl',
      })
    }
    expect(provider.provenance).toMatchObject({
      provider: 'deterministic-fixture',
      model: 'equivalent-fractions-fixture-v1',
      promptTemplateVersion: 'lesson-prompt-v1',
    })
  })

  it('sends the canonical contract to the server-only OpenAI adapter', async () => {
    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const provider = createOpenAILessonDraftProvider({
      apiKey: 'server-only-test-key',
      model: 'gpt-5.6',
      fetchImplementation: async (input, init) => {
        requestUrl = String(input)
        requestInit = init
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify(
              createEquivalentFractionsDraft(request),
            ),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    })

    const response = await provider.generate(request, {
      correctionAttempt: false,
      diagnostics: [],
    })

    const body = JSON.parse(String(requestInit?.body)) as {
      model: string
      input: string
      text: { format: { name: string; type: string } }
    }
    const headers = new Headers(requestInit?.headers)

    expect(requestUrl).toBe('https://api.openai.com/v1/responses')
    expect(headers.get('authorization')).toBe('Bearer server-only-test-key')
    expect(body.model).toBe('gpt-5.6')
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      name: 'edu_canvas_lesson_draft',
    })
    expect(body.input).toContain('Return only the canonical JSON contract.')
    expect(validateProviderDraft(response.draft).ok).toBe(true)
  })

  it('maps provider rate limits to a safe retryable error', async () => {
    const provider = createOpenAILessonDraftProvider({
      apiKey: 'server-only-test-key',
      model: 'gpt-5.6',
      fetchImplementation: async () =>
        new Response('provider details must stay server-side', { status: 429 }),
    })

    await expect(
      provider.generate(request, { correctionAttempt: false, diagnostics: [] }),
    ).rejects.toMatchObject({
      kind: 'rate-limit',
      safeMessage: 'The lesson provider is busy. Try again in a moment.',
    })
    try {
      await provider.generate(request, {
        correctionAttempt: false,
        diagnostics: [],
      })
    } catch (error) {
      expect(error).toBeInstanceOf(LessonProviderError)
      expect(String(error)).not.toContain('provider details')
    }
  })
})
