import { ArrowUpRight } from 'lucide-react'

import type { LandingCopy } from './copy'

export function SiteFooter({ activeCopy }: { activeCopy: LandingCopy }) {
  return (
    <footer className="site-footer page-width">
      <a className="brand-lockup" href="#top" aria-label="Edu-Canvas home">
        <span className="brand-mark brand-mark--small" aria-hidden="true">
          <svg viewBox="0 0 40 40" role="presentation">
            <path d="M8 11.5 20 6l12 5.5v17L20 34 8 28.5v-17Z" />
            <path d="m8 11.5 12 6 12-6M20 17.5V34" />
            <circle cx="20" cy="17.5" r="2.1" />
          </svg>
        </span>
        <span className="brand-copy">
          <span className="brand-name">Edu-Canvas</span>
          <span className="brand-tagline">{activeCopy.footerLine}</span>
        </span>
      </a>
      <a className="footer-action" href="#lesson">
        {activeCopy.footerAction}
        <ArrowUpRight aria-hidden="true" />
      </a>
    </footer>
  )
}
