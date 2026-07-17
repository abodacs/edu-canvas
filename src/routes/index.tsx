import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { HeroSection } from '@/components/landing/hero-section'
import { LessonSection } from '@/components/landing/lesson-section'
import { LoopSection } from '@/components/landing/loop-section'
import { Masthead } from '@/components/landing/masthead'
import { RolesSection } from '@/components/landing/roles-section'
import { SiteFooter } from '@/components/landing/site-footer'
import { TrustSection } from '@/components/landing/trust-section'
import { copy } from '@/components/landing/copy'
import type { Language, Phase, RoleView } from '@/components/landing/types'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  const [language, setLanguage] = useState<Language>('en')
  const [isDark, setIsDark] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [activePhase, setActivePhase] = useState<Phase>('shape')
  const [roleView, setRoleView] = useState<RoleView>('teacher')
  const activeCopy = copy[language]

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

  function toggleLanguage() {
    setLanguage((current) => (current === 'en' ? 'ar' : 'en'))
  }

  function toggleTheme() {
    setIsDark((current) => !current)
  }

  function toggleTarget(id: string) {
    setIsRevealed(false)
    setSelectedTargets((current) =>
      current.includes(id)
        ? current.filter((targetId) => targetId !== id)
        : [...current, id],
    )
  }

  function resetLesson() {
    setSelectedTargets([])
    setIsRevealed(false)
    setHintVisible(false)
  }

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
        onToggleLanguage={toggleLanguage}
        onToggleTheme={toggleTheme}
      />
      <HeroSection
        activeCopy={activeCopy}
        language={language}
        isDark={isDark}
      />
      <LessonSection
        activeCopy={activeCopy}
        language={language}
        selectedTargets={selectedTargets}
        isRevealed={isRevealed}
        hintVisible={hintVisible}
        onToggleHint={() => setHintVisible((current) => !current)}
        onToggleTarget={toggleTarget}
        onReveal={() => setIsRevealed(true)}
        onReset={resetLesson}
      />
      <LoopSection
        activeCopy={activeCopy}
        language={language}
        activePhase={activePhase}
        onPhaseChange={setActivePhase}
      />
      <RolesSection
        activeCopy={activeCopy}
        language={language}
        roleView={roleView}
        onRoleChange={setRoleView}
      />
      <TrustSection activeCopy={activeCopy} />
      <SiteFooter activeCopy={activeCopy} />
    </main>
  )
}
