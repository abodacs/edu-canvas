import { describe, expect, it } from 'vitest'

import { Route } from './__root'

describe('root document metadata', () => {
  it('publishes a favicon link instead of falling back to /favicon.ico', async () => {
    const head = Route.options.head
    if (!head) throw new Error('The root route must define document metadata.')

    const content = await head({} as never)

    expect(content.links ?? []).toContainEqual({
      rel: 'icon',
      href: '/favicon.svg',
      type: 'image/svg+xml',
    })
  })
})
