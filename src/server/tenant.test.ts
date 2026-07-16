import { describe, expect, it } from 'vitest'

import { demoSeed } from './seed-data'
import { assertTenantAccess, canAccess, getDemoSession } from './tenant'

describe('demo tenant boundary', () => {
  it('gives each seeded role only its intended capabilities', () => {
    const teacher = getDemoSession('teacher')
    const student = getDemoSession('student')

    expect(canAccess(teacher, 'view_demo_activity_fixtures')).toBe(true)
    expect(canAccess(student, 'view_demo_activity_fixtures')).toBe(false)
    expect(canAccess(student, 'view_assigned_demo_activity')).toBe(true)
  })

  it('rejects a session crossing tenant boundaries', () => {
    const session = getDemoSession('student')

    expect(() => assertTenantAccess(session, demoSeed.tenant.id)).not.toThrow()
    expect(() => assertTenantAccess(session, 'tenant_other_school')).toThrow(
      'Tenant access denied.',
    )
  })
})
