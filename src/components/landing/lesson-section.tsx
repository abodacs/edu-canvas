import {
  Check,
  ChevronRight,
  CircleHelp,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { memo } from 'react'
import type { CSSProperties } from 'react'

import type { LandingCopy } from './copy'
import type { Language } from './types'

const targetCards = [
  { id: 'two-four', fraction: '2/4', en: 'two-fourths', ar: 'جزآن من أربعة' },
  {
    id: 'three-six',
    fraction: '3/6',
    en: 'three-sixths',
    ar: 'ثلاثة أجزاء من ستة',
  },
  {
    id: 'four-eight',
    fraction: '4/8',
    en: 'four-eighths',
    ar: 'أربعة أجزاء من ثمانية',
  },
  { id: 'two-three', fraction: '2/3', en: 'two-thirds', ar: 'جزآن من ثلاثة' },
] as const

type LessonSectionProps = {
  activeCopy: LandingCopy
  language: Language
  selectedTargets: string[]
  isRevealed: boolean
  hintVisible: boolean
  onToggleHint: () => void
  onToggleTarget: (id: string) => void
  onReveal: () => void
  onReset: () => void
}

export const LessonSection = memo(function LessonSectionView({
  activeCopy,
  language,
  selectedTargets,
  isRevealed,
  hintVisible,
  onToggleHint,
  onToggleTarget,
  onReveal,
  onReset,
}: LessonSectionProps) {
  const selectionStatus = isRevealed
    ? activeCopy.lessonRevealedStatus
    : selectedTargets.length > 0
      ? language === 'en'
        ? selectedTargets.length +
          (selectedTargets.length === 1
            ? ' name selected — keep looking for the same portion.'
            : ' names selected — keep looking for the same portion.')
        : 'تم اختيار ' +
          (selectedTargets.length === 1
            ? 'كسر واحد'
            : selectedTargets.length === 2
              ? 'كسرين'
              : selectedTargets.length + ' كسور') +
          ' — واصل البحث عن الجزء نفسه.'
      : activeCopy.lessonEmptyStatus

  return (
    <section
      className="lesson-section page-width story-block"
      id="lesson"
      aria-labelledby="lesson-title"
    >
      <div className="section-lead">
        <p className="eyebrow">{activeCopy.lessonKicker}</p>
        <h2 id="lesson-title">{activeCopy.lessonTitle}</h2>
        <p>{activeCopy.lessonDescription}</p>
      </div>

      <div className="lesson-layout">
        <aside
          className="lesson-brief"
          aria-label={
            language === 'en' ? 'Lesson instructions' : 'تعليمات الدرس'
          }
        >
          <div className="lesson-brief__topline">
            <span className="step-count">03</span>
            <span>
              {language === 'en'
                ? 'Student sees the idea'
                : 'يرى المتعلّم الفكرة'}
            </span>
          </div>
          <h3>{activeCopy.lessonInstruction}</h3>
          <div className="lesson-source-card">
            <span className="lesson-card-label">
              {activeCopy.lessonSourceLabel}
            </span>
            <span className="fraction fraction--hero">
              {activeCopy.lessonSourceFraction}
            </span>
            <span className="lesson-source-words">
              {activeCopy.lessonSourceWords}
            </span>
            <span className="source-slice" aria-hidden="true">
              <span />
            </span>
          </div>
          <div className="lesson-brief__footer">
            <button
              className="hint-button"
              type="button"
              onClick={onToggleHint}
              aria-expanded={hintVisible}
              aria-controls="lesson-hint"
            >
              <CircleHelp aria-hidden="true" />
              {activeCopy.lessonHintAction}
            </button>
            <p className="hint-copy" id="lesson-hint" hidden={!hintVisible}>
              {activeCopy.lessonHint}
            </p>
            <span className="preview-note">{activeCopy.lessonPreviewNote}</span>
          </div>
        </aside>

        <div className={'lesson-board' + (isRevealed ? ' is-revealed' : '')}>
          <div className="lesson-board__header">
            <div>
              <span className="board-label">
                {activeCopy.lessonTargetLabel}
              </span>
              <p className="board-status" aria-live="polite">
                {selectionStatus}
              </p>
            </div>
            <span
              className="board-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={selectedTargets.length}
              aria-label={
                language === 'en'
                  ? selectedTargets.length + ' of 4 fractions selected'
                  : 'تم اختيار ' + selectedTargets.length + ' من 4 كسور'
              }
            >
              <span
                style={
                  {
                    '--selection-progress': selectedTargets.length / 4,
                  } as CSSProperties
                }
              />
            </span>
          </div>
          <div className="target-grid">
            {targetCards.map((target) => {
              const isSelected = selectedTargets.includes(target.id)
              const isConnected = isRevealed && target.id !== 'two-three'
              const words = language === 'en' ? target.en : target.ar
              return (
                <button
                  className={
                    'target-card' +
                    (isSelected ? ' is-selected' : '') +
                    (isConnected ? ' is-connected' : '') +
                    (target.id === 'two-three' ? ' is-distractor' : '')
                  }
                  type="button"
                  key={target.id}
                  onClick={() => onToggleTarget(target.id)}
                  aria-pressed={isSelected}
                  aria-label={target.fraction + ', ' + words}
                >
                  <span className="target-card__topline">
                    <span className="target-card__number">
                      {target.id === 'two-three'
                        ? '04'
                        : target.id === 'two-four'
                          ? '01'
                          : target.id === 'three-six'
                            ? '02'
                            : '03'}
                    </span>
                    <span className="target-card__state" aria-hidden="true">
                      {isConnected || isSelected ? <Check /> : <ChevronRight />}
                    </span>
                  </span>
                  <span className="fraction fraction--target">
                    {target.fraction}
                  </span>
                  <span className="target-card__words">{words}</span>
                  <span className="target-card__measure" aria-hidden="true">
                    <span className="measure-fill" />
                  </span>
                </button>
              )
            })}
          </div>
          <div className="lesson-board__actions">
            <button
              className="button button--primary button--compact"
              type="button"
              onClick={onReveal}
              disabled={selectedTargets.length === 0 || isRevealed}
            >
              <Sparkles aria-hidden="true" />
              {activeCopy.lessonRevealAction}
            </button>
            <button
              className="button button--quiet button--compact"
              type="button"
              onClick={onReset}
            >
              <RotateCcw aria-hidden="true" />
              {activeCopy.lessonResetAction}
            </button>
          </div>
          {isRevealed && (
            <div className="connection-reveal" role="status">
              <div className="connection-reveal__diagram" aria-hidden="true">
                <span className="reveal-node reveal-node--source">1/2</span>
                <span className="reveal-line reveal-line--one" />
                <span className="reveal-line reveal-line--two" />
                <span className="reveal-line reveal-line--three" />
                <span className="reveal-node reveal-node--one">2/4</span>
                <span className="reveal-node reveal-node--two">3/6</span>
                <span className="reveal-node reveal-node--three">4/8</span>
              </div>
              <div className="connection-reveal__copy">
                <span className="eyebrow">
                  {language === 'en' ? 'The connection' : 'العلاقة'}
                </span>
                <h3>{activeCopy.lessonRevealTitle}</h3>
                <p>{activeCopy.lessonRevealDescription}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
})
