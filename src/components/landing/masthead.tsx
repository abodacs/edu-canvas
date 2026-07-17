import { memo } from 'react'
import { Moon, Sun } from 'lucide-react'

import type { LandingCopy } from './copy'
import type { Language } from './types'

export const Masthead = memo(function MastheadView({
  activeCopy,
  language,
  isDark,
  onToggleLanguage,
  onToggleTheme,
}: {
  activeCopy: LandingCopy
  language: Language
  isDark: boolean
  onToggleLanguage: () => void
  onToggleTheme: () => void
}) {
  return (
    <header className="masthead page-width">
      <a className="brand-lockup" href="#top" aria-label="Edu-Canvas home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" role="presentation">
            <path d="M8 11.5 20 6l12 5.5v17L20 34 8 28.5v-17Z" />
            <path d="m8 11.5 12 6 12-6M20 17.5V34" />
            <circle cx="20" cy="17.5" r="2.1" />
          </svg>
        </span>
        <span className="brand-copy">
          <span className="brand-name">Edu-Canvas</span>
          <span className="brand-tagline">{activeCopy.brandTagline}</span>
        </span>
      </a>

      <nav
        className="site-nav"
        aria-label={
          language === 'en' ? 'Primary navigation' : 'التنقّل الرئيسي'
        }
      >
        <a href="#path">{activeCopy.nav.path}</a>
        <a href="#lesson">{activeCopy.nav.lesson}</a>
        <a href="#trust">{activeCopy.nav.trust}</a>
      </nav>

      <div className="masthead-actions">
        <button
          className="language-switch"
          type="button"
          onClick={onToggleLanguage}
          aria-label={activeCopy.languageLabel}
        >
          <span aria-hidden="true">{language === 'en' ? 'ع' : 'EN'}</span>
          <span className="sr-only">{activeCopy.languageLabel}</span>
        </button>
        <button
          className="theme-switch"
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? activeCopy.themeToLight : activeCopy.themeToDark}
          aria-pressed={isDark}
        >
          {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </div>
    </header>
  )
})
