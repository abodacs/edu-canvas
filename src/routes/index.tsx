import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { HeroSection } from '@/components/landing/hero-section'
import { LessonSection } from '@/components/landing/lesson-section'
import {
  LandingProvider,
  useLandingContext,
} from '@/components/landing/landing-provider'
import { LoopSection } from '@/components/landing/loop-section'
import { Masthead } from '@/components/landing/masthead'
import { RolesSection } from '@/components/landing/roles-section'
import { SiteFooter } from '@/components/landing/site-footer'
import { TrustSection } from '@/components/landing/trust-section'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  return (
    <LandingProvider>
      <LandingExperience />
    </LandingProvider>
  )
}

function LandingExperience() {
  const {
    state: {
      language,
      isDark,
      selectedTargets,
      isRevealed,
      hintVisible,
      activePhase,
      roleView,
    },
    actions,
    meta: { activeCopy },
  } = useLandingContext()

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        isDark ? 'oklch(0.19 0.028 55)' : 'oklch(0.965 0.022 78)',
      )
  }, [isDark])

  return (
    <main className="experience" data-language={language} id="top">
      <a className="skip-link" href="#lesson">
        {language === 'en'
          ? 'Skip to the lesson moment'
          : 'انتقل إلى لحظة الدرس'}
      </a>
      <div className="page-progress" aria-hidden="true">
        <span />
      </div>

      <Masthead
        activeCopy={activeCopy}
        language={language}
        isDark={isDark}
        onToggleLanguage={actions.toggleLanguage}
        onToggleTheme={actions.toggleTheme}
      />
      <HeroSection
        activeCopy={activeCopy}
        language={language}
        isDark={isDark}
      />
      <LoopSection
        activeCopy={activeCopy}
        language={language}
        activePhase={activePhase}
        onPhaseChange={actions.changePhase}
      />
      <LessonSection
        activeCopy={activeCopy}
        language={language}
        selectedTargets={selectedTargets}
        isRevealed={isRevealed}
        hintVisible={hintVisible}
        onToggleHint={actions.toggleHint}
        onToggleTarget={actions.toggleTarget}
        onReveal={actions.reveal}
        onReset={actions.resetLesson}
      />
      <RolesSection
        activeCopy={activeCopy}
        language={language}
        roleView={roleView}
        onRoleChange={actions.changeRole}
      />
      <TrustSection activeCopy={activeCopy} />
      <SiteFooter activeCopy={activeCopy} />
    </main>
  )
}
