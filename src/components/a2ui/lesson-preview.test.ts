import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { A2UI_CATALOG_ID } from '@/shared/a2ui-contract'

import { A2UIComponentRenderer } from './lesson-preview'
import type { A2UIRenderSurface } from './renderer'

describe('semantic A2UI lesson surface', () => {
  it('renders child components without React missing-key warnings', () => {
    const surface: A2UIRenderSurface = {
      catalogId: A2UI_CATALOG_ID,
      components: {
        root: {
          id: 'root',
          component: 'Column',
          children: ['heading', 'body'],
        },
        heading: {
          id: 'heading',
          component: 'Text',
          text: 'Equivalent fractions',
          variant: 'heading',
        },
        body: {
          id: 'body',
          component: 'Text',
          text: 'Match each fraction.',
          variant: 'body',
        },
      },
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const markup = renderToStaticMarkup(
        createElement(A2UIComponentRenderer, {
          surface,
          componentId: 'root',
          surfaceId: 'preview-1',
          onAction: () => {},
        }),
      )

      expect(markup).toContain('Equivalent fractions')
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })
})
