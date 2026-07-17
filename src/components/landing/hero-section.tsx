import { memo } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import type { LandingCopy } from './copy'
import { InkField } from './ink-field'
import type { Language } from './types'

export const HeroSection = memo(function HeroSectionView({
  activeCopy,
  language,
  isDark,
}: {
  activeCopy: LandingCopy
  language: Language
  isDark: boolean
}) {
  return (
    <section
      className="hero page-width story-block"
      id="idea"
      aria-labelledby="hero-title"
    >
      <div className="hero-copy">
        <p className="eyebrow">{activeCopy.heroEyebrow}</p>
        <h1 id="hero-title">
          {activeCopy.heroTitleStart}{' '}
          <span className="hero-title-accent">
            {activeCopy.heroTitleAccent}
          </span>{' '}
          {activeCopy.heroTitleEnd}
        </h1>
        <p className="hero-description">{activeCopy.heroDescription}</p>
        <div className="hero-actions">
          <a className="button button--primary" href="#lesson">
            {activeCopy.heroPrimary}
            <ArrowDownRight aria-hidden="true" />
          </a>
          <a className="button button--quiet" href="#loop">
            {activeCopy.heroSecondary}
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <ul
          className="hero-meta"
          aria-label={language === 'en' ? 'Lesson details' : 'تفاصيل الدرس'}
        >
          {activeCopy.heroMeta.map((item) => (
            <li key={item}>
              <span className="meta-dot" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="hero-stage"
        role="img"
        aria-label={activeCopy.stageLabel + '. ' + activeCopy.stageDescription}
      >
        <InkField isDark={isDark} />
        <div className="stage-noise" aria-hidden="true" />
        <div className="stage-caption">
          <span>{activeCopy.stageLabel}</span>
          <span>01 / 04</span>
        </div>
        <div className="stage-diagram">
          <div className="stage-orbit stage-orbit--outer" aria-hidden="true" />
          <div className="stage-orbit stage-orbit--inner" aria-hidden="true" />
          <div className="stage-source">
            <span className="fraction fraction--large">1/2</span>
            <span>{activeCopy.stageSource}</span>
          </div>
          <svg
            className="stage-connections"
            viewBox="0 0 480 440"
            aria-hidden="true"
          >
            <path d="M226 219C287 170 315 125 354 96" />
            <path d="M226 219c84 5 125 22 168 42" />
            <path d="M226 219c54 61 88 98 140 125" />
          </svg>
          <div className="stage-target stage-target--one">
            <span className="fraction">2/4</span>
            <span>{activeCopy.stageTarget}</span>
          </div>
          <div className="stage-target stage-target--two">
            <span className="fraction">3/6</span>
            <span>{activeCopy.stageTarget}</span>
          </div>
          <div className="stage-target stage-target--three">
            <span className="fraction">4/8</span>
            <span>{activeCopy.stageTarget}</span>
          </div>
          <div className="stage-distractor">
            <span className="fraction">2/3</span>
            <span>{activeCopy.stageDistractor}</span>
          </div>
        </div>
        <p className="stage-description">{activeCopy.stageDescription}</p>
        <div className="stage-index" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  )
})
