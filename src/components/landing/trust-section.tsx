import type { LandingCopy } from './copy'

export function TrustSection({ activeCopy }: { activeCopy: LandingCopy }) {
  return (
    <section
      className="trust-section page-width story-block"
      id="trust"
      aria-labelledby="trust-title"
    >
      <div className="trust-intro">
        <p className="eyebrow">{activeCopy.trustKicker}</p>
        <h2 id="trust-title">{activeCopy.trustTitle}</h2>
      </div>
      <ul className="trust-list">
        {activeCopy.trustItems.map(([title, description], index) => (
          <li key={title}>
            <span className="trust-number">0{index + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
