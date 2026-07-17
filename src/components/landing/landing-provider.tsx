import { createContext, use, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { copy } from './copy'
import type { LandingCopy } from './copy'
import type { Language, Phase, RoleView } from './types'

export interface LandingState {
  language: Language
  isDark: boolean
  selectedTargets: string[]
  isRevealed: boolean
  hintVisible: boolean
  activePhase: Phase
  roleView: RoleView
}

export interface LandingActions {
  toggleLanguage: () => void
  toggleTheme: () => void
  toggleHint: () => void
  toggleTarget: (id: string) => void
  reveal: () => void
  resetLesson: () => void
  changePhase: (phase: Phase) => void
  changeRole: (role: RoleView) => void
}

export interface LandingMeta {
  activeCopy: LandingCopy
}

export interface LandingContextValue {
  state: LandingState
  actions: LandingActions
  meta: LandingMeta
}

const LandingContext = createContext<LandingContextValue | null>(null)

export function LandingProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>('en')
  const [isDark, setIsDark] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [activePhase, setActivePhase] = useState<Phase>('shape')
  const [roleView, setRoleView] = useState<RoleView>('teacher')

  const actions = useMemo<LandingActions>(
    () => ({
      toggleLanguage: () =>
        setLanguage((current) => (current === 'en' ? 'ar' : 'en')),
      toggleTheme: () => setIsDark((current) => !current),
      toggleHint: () => setHintVisible((current) => !current),
      toggleTarget: (id) => {
        setIsRevealed(false)
        setSelectedTargets((current) =>
          current.includes(id)
            ? current.filter((targetId) => targetId !== id)
            : [...current, id],
        )
      },
      reveal: () => setIsRevealed(true),
      resetLesson: () => {
        setSelectedTargets([])
        setIsRevealed(false)
        setHintVisible(false)
      },
      changePhase: (phase) => setActivePhase(phase),
      changeRole: (role) => setRoleView(role),
    }),
    [],
  )

  const activeCopy = copy[language]
  const value = useMemo<LandingContextValue>(
    () => ({
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
    }),
    [
      language,
      isDark,
      selectedTargets,
      isRevealed,
      hintVisible,
      activePhase,
      roleView,
      actions,
      activeCopy,
    ],
  )

  return <LandingContext value={value}>{children}</LandingContext>
}

export function useLandingContext() {
  const context = use(LandingContext)
  if (!context) {
    throw new Error('useLandingContext must be used within LandingProvider')
  }
  return context
}
