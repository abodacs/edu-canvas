import { memo } from 'react'
import { Sparkles } from 'lucide-react'

import type { LandingCopy } from './copy'
import type { Language, RoleView } from './types'

type RolesSectionProps = {
  activeCopy: LandingCopy
  language: Language
  roleView: RoleView
  onRoleChange: (role: RoleView) => void
}

export const RolesSection = memo(function RolesSectionView({
  activeCopy,
  language,
  roleView,
  onRoleChange,
}: RolesSectionProps) {
  return (
    <section
      className="roles-section page-width story-block"
      aria-labelledby="roles-title"
    >
      <div className="roles-heading">
        <div className="section-lead">
          <p className="eyebrow">{activeCopy.roleKicker}</p>
          <h2 id="roles-title">{activeCopy.roleTitle}</h2>
          <p>{activeCopy.roleDescription}</p>
        </div>
        <div
          className="role-switch"
          role="group"
          aria-label={
            language === 'en' ? 'Choose a perspective' : 'اختر منظوراً'
          }
        >
          <button
            type="button"
            onClick={() => onRoleChange('teacher')}
            aria-pressed={roleView === 'teacher'}
          >
            {activeCopy.teacherTab}
          </button>
          <button
            type="button"
            onClick={() => onRoleChange('student')}
            aria-pressed={roleView === 'student'}
          >
            {activeCopy.studentTab}
          </button>
        </div>
      </div>
      <div className="role-story" data-role={roleView}>
        <div className="role-story__index" aria-hidden="true">
          <span>0{roleView === 'teacher' ? '1' : '2'}</span>
          <span className="role-story__rule" />
          <span>{roleView === 'teacher' ? 'review' : 'reveal'}</span>
        </div>
        <blockquote>
          {roleView === 'teacher'
            ? activeCopy.teacherQuote
            : activeCopy.studentQuote}
        </blockquote>
        <p className="role-story__point">
          <Sparkles aria-hidden="true" />
          {roleView === 'teacher'
            ? activeCopy.teacherPoint
            : activeCopy.studentPoint}
        </p>
      </div>
    </section>
  )
})
