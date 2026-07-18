import { describe, expect, it } from 'vitest'

import { A2UI_CATALOG_ID } from '@/shared/a2ui-contract'

import { applyA2UIMessage, createA2UIRenderState } from './renderer'

describe('semantic A2UI renderer state', () => {
  it('builds a surface from the v0.9.1 stream without exposing private data', () => {
    let state = createA2UIRenderState()

    const messages = [
      {
        version: 'v0.9.1' as const,
        createSurface: {
          surfaceId: 'preview-1',
          catalogId: A2UI_CATALOG_ID,
        },
      },
      {
        version: 'v0.9.1' as const,
        updateComponents: {
          surfaceId: 'preview-1',
          components: [
            {
              id: 'root',
              component: 'Column' as const,
              children: ['title'],
            },
            {
              id: 'title',
              component: 'Text' as const,
              text: 'Equivalent fractions',
              variant: 'heading' as const,
            },
          ],
        },
      },
      {
        version: 'v0.9.1' as const,
        updateDataModel: {
          surfaceId: 'preview-1',
          path: '/' as const,
          value: {
            variantId: 'variant-1',
            purpose: 'Teach the model',
            accessibilityDescription: 'Match each fraction.',
            scaffold: 'Core matching scaffold',
            standardId: 'standard_ccss_4_nf_a_01',
            grade: 4,
            language: 'en' as const,
            direction: 'ltr' as const,
            validationState: 'ready-for-review' as const,
            selectedItemIds: [],
          },
        },
      },
    ]

    for (const message of messages) {
      const applied = applyA2UIMessage(state, message)
      expect(applied.ok).toBe(true)
      if (applied.ok) state = applied.state
    }

    expect(state.surfaces['preview-1']).toMatchObject({
      catalogId: A2UI_CATALOG_ID,
      dataModel: { purpose: 'Teach the model' },
    })
    expect(state.surfaces['preview-1']?.components.title).toMatchObject({
      component: 'Text',
      text: 'Equivalent fractions',
    })
  })

  it('turns a malicious stream message into a recoverable visible error', () => {
    const state = createA2UIRenderState()
    const result = applyA2UIMessage(state, {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'preview-1',
        components: [
          {
            id: 'root',
            component: 'RawHtml',
            html: '<script>alert(1)</script>',
          },
        ],
      },
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'UNKNOWN_COMPONENT',
    })
    expect(result.state).toEqual(state)
  })
})
