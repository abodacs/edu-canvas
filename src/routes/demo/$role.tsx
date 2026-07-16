import {
  ArrowLeft,
  Database,
  LockKeyhole,
  Network,
  ShieldCheck,
} from 'lucide-react'
import { createFileRoute, Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { isDemoRole } from '@/shared/demo-contract'
import { getDemoSnapshot } from '@/server/demo/server-function'

export const Route = createFileRoute('/demo/$role')({
  loader: ({ params }) => {
    if (!isDemoRole(params.role)) {
      throw new Error('Unknown seeded demo role.')
    }

    return getDemoSnapshot({ data: { role: params.role } })
  },
  component: DemoPerspective,
})

function DemoPerspective() {
  const snapshot = Route.useLoaderData()
  const { session, environment, curriculum, seededCounts } = snapshot

  return (
    <main className="app-shell" aria-labelledby="demo-title">
      <div className="page-frame">
        <header className="site-header">
          <Link className="text-link" to="/">
            <ArrowLeft aria-hidden="true" /> Back to foundation
          </Link>
          <Badge variant="secondary">Synthetic demo</Badge>
        </header>

        <section className="demo-intro">
          <div>
            <p className="eyebrow">{session.role} perspective</p>
            <h1 id="demo-title">Welcome, {session.displayName}.</h1>
            <p className="hero-description">
              You are viewing the isolated <strong>{session.tenantName}</strong>{' '}
              tenant. This foundation exposes only the capabilities intended for
              this seeded role.
            </p>
          </div>
          <div className="session-stamp" aria-label="Current demo session">
            <span>Environment</span>
            <strong>{environment.appEnv}</strong>
            <span>Persistence</span>
            <strong>{environment.persistence}</strong>
          </div>
        </section>

        <section className="page-grid page-grid--details">
          <Card>
            <CardHeader>
              <CardTitle>What this identity can see</CardTitle>
              <CardDescription>
                Capabilities are resolved on the server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="capability-list">
                {session.capabilities.map((capability) => (
                  <li key={capability}>
                    <ShieldCheck aria-hidden="true" />
                    {capability.replaceAll('_', ' ')}
                  </li>
                ))}
              </ul>
              <p className="security-note">
                <LockKeyhole aria-hidden="true" /> The private answer key is not
                part of this response or the client bundle.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Seeded classroom</CardTitle>
              <CardDescription>{curriculum.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="data-list">
                <div>
                  <dt>Standard</dt>
                  <dd>{curriculum.id}</dd>
                </div>
                <div>
                  <dt>Graph version</dt>
                  <dd>{curriculum.graphVersion}</dd>
                </div>
                <div>
                  <dt>Tenant</dt>
                  <dd>{session.tenantId}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>

        <section className="fixture-section" aria-labelledby="fixture-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Persistence proof</p>
              <h2 id="fixture-heading">
                The next slices have somewhere stable to land.
              </h2>
            </div>
            <Database aria-hidden="true" />
          </div>
          <div className="fixture-grid">
            {Object.entries(seededCounts).map(([label, count]) => (
              <div className="fixture-stat" key={label}>
                <strong>{String(count)}</strong>
                <span>
                  {label.replace(
                    /[A-Z]/g,
                    (letter) => ` ${letter.toLowerCase()}`,
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="supporting-note">
            <Network aria-hidden="true" /> Lesson generation and interaction are
            deliberately not implemented in issue #2.
          </p>
        </section>
      </div>
    </main>
  )
}
