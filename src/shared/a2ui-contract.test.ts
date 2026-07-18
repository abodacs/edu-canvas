import { describe, expect, it } from 'vitest'

import { A2UI_CATALOG_ID, validateA2UIMessage } from './a2ui-contract'

describe('Edu-Canvas A2UI catalog contract', () => {
  it('accepts the pinned catalog and rejects unknown components safely', () => {
    const accepted = validateA2UIMessage({
      version: 'v0.9.1',
      createSurface: {
        surfaceId: 'preview-1',
        catalogId: A2UI_CATALOG_ID,
      },
    })

    expect(accepted).toMatchObject({ ok: true })

    const rejected = validateA2UIMessage({
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

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNKNOWN_COMPONENT',
    })
  })

  it('rejects an action that is not in the matching catalog', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'preview-1',
        components: [
          {
            id: 'clear',
            component: 'Button',
            label: 'Clear selection',
            variant: 'quiet',
            action: {
              event: {
                name: 'runJavaScript',
                context: { surfaceId: 'preview-1' },
              },
            },
          },
        ],
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNKNOWN_ACTION',
    })
  })

  it('rejects an unsupported protocol version before rendering', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.8',
      createSurface: {
        surfaceId: 'preview-1',
        catalogId: A2UI_CATALOG_ID,
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_VERSION',
    })
  })

  it('rejects a catalog identifier that is not the pinned Edu-Canvas version', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.9.1',
      createSurface: {
        surfaceId: 'preview-1',
        catalogId: 'https://example.test/catalogs/untrusted',
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_CATALOG',
    })
  })

  it('rejects arbitrary styling and executable payload fields', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'preview-1',
        components: [
          {
            id: 'title',
            component: 'Text',
            text: 'Equivalent fractions',
            style: { color: 'red' },
          },
        ],
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_PROPERTY',
    })
  })

  it('rejects duplicate component identifiers before state application', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'preview-1',
        components: [
          { id: 'title', component: 'Text', text: 'One' },
          { id: 'title', component: 'Text', text: 'Two' },
        ],
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'DUPLICATE_COMPONENT',
    })
  })

  it('rejects private lesson fields before schema parsing', () => {
    const rejected = validateA2UIMessage({
      version: 'v0.9.1',
      updateDataModel: {
        surfaceId: 'preview-1',
        path: '/',
        value: {
          variantId: 'variant-1',
          purpose: 'Teach the model',
          accessibilityDescription: 'Match each fraction.',
          scaffold: 'Core matching scaffold',
          standardId: 'standard_ccss_4_nf_a_01',
          grade: 4,
          language: 'en',
          direction: 'ltr',
          validationState: 'ready-for-review',
          selectedItemIds: [],
          answerKey: 'private',
        },
      },
    })

    expect(rejected).toMatchObject({
      ok: false,
      code: 'UNSAFE_PAYLOAD',
    })
  })
})
