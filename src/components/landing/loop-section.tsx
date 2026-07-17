import { memo } from 'react'
import { Check, ChevronRight } from 'lucide-react'

import type { LandingCopy } from './copy'
import type { Language, Phase } from './types'

const phases: Phase[] = ['shape', 'review', 'match', 'adapt']

type LoopSectionProps = {
  activeCopy: LandingCopy
  language: Language
  activePhase: Phase
  onPhaseChange: (phase: Phase) => void
}

export const LoopSection = memo(function LoopSectionView({
  activeCopy,
  language,
  activePhase,
  onPhaseChange,
}: LoopSectionProps) {
  const activePhaseCopy = activeCopy.phases[phases.indexOf(activePhase)]

  return (
    <section
      className="loop-section page-width story-block"
      id="path"
      aria-labelledby="path-title"
    >
      <div className="section-lead section-lead--wide">
        <p className="eyebrow">{activeCopy.journeyKicker}</p>
        <h2 id="path-title">{activeCopy.journeyTitle}</h2>
        <p>{activeCopy.journeyDescription}</p>
      </div>
      <div className="phase-layout">
        <div
          className="phase-rail"
          role="group"
          aria-label={
            language === 'en' ? 'Lesson path steps' : 'خطوات مسار الدرس'
          }
        >
          {phases.map((phase, index) => {
            const phaseCopy = activeCopy.phases[index]
            const isActive = activePhase === phase
            return (
              <button
                key={phase}
                className={'phase-tab' + (isActive ? ' is-active' : '')}
                type="button"
                onClick={() => onPhaseChange(phase)}
                aria-pressed={isActive}
              >
                <span className="phase-tab__number">{phaseCopy.number}</span>
                <span>{phaseCopy.label}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            )
          })}
        </div>
        <div className="phase-panel" aria-live="polite">
          <div className="phase-panel__content" key={activePhase}>
            <div className="phase-panel__stamp">
              <span>{activePhaseCopy.number}</span>
              <span>{activePhaseCopy.label}</span>
            </div>
            <h3>{activePhaseCopy.title}</h3>
            <p>{activePhaseCopy.body}</p>
            <div className="phase-panel__note">
              <span className="note-check">
                <Check aria-hidden="true" />
              </span>
              {activePhaseCopy.note}
            </div>
            <div className="phase-panel__line" aria-hidden="true">
              <span className="phase-panel__line-dot" />
              <span className="phase-panel__line-stroke" />
              <span className="phase-panel__line-dot" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
})
