import { ArrowUpRight, CheckCircle2, Database, ShieldCheck } from 'lucide-react'
import { createFileRoute, Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: FoundationHome })

function FoundationHome() {
  return (
    <main className="app-shell" aria-labelledby="page-title">
      <div className="page-frame">
        <header className="site-header">
          <Link className="brand-lockup" to="/" aria-label="Edu-Canvas home">
            <span className="brand-mark" aria-hidden="true">
              EC
            </span>
            <span>
              <span className="brand-name">Edu-Canvas</span>
              <span className="brand-subtitle">learning, made legible</span>
            </span>
          </Link>
          <Badge variant="outline">Foundation · #2</Badge>
        </header>

        <section className="page-grid page-grid--hero">
          <div className="hero-copy">
            <p className="eyebrow">A quiet beginning</p>
            <h1 id="page-title">A dependable home for the lesson loop.</h1>
            <p className="hero-description">
              This deployable walking skeleton proves the runtime boundary,
              synthetic data contract, and tenant-safe demo access before lesson
              generation begins.
            </p>
            <div
              className="hero-actions"
              aria-label="Choose a seeded demo role"
            >
              <Link
                className={cn(buttonVariants({ size: 'lg' }), 'min-h-12')}
                to="/demo/$role"
                params={{ role: 'teacher' }}
              >
                Enter as teacher
                <ArrowUpRight aria-hidden="true" />
              </Link>
              <Link
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'min-h-12',
                )}
                to="/demo/$role"
                params={{ role: 'student' }}
              >
                Enter as student
              </Link>
            </div>
            <p className="supporting-note">
              Synthetic identities only. No real-student mode is enabled by
              default.
            </p>
          </div>

          <Card className="trust-card">
            <CardHeader>
              <CardTitle>Foundation checks</CardTitle>
              <CardDescription>
                Small signals that keep the next slice honest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="check-list">
                <li>
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>Server boundary</strong>
                    <small>TanStack Start server functions are ready.</small>
                  </span>
                </li>
                <li>
                  <Database aria-hidden="true" />
                  <span>
                    <strong>Seeded persistence</strong>
                    <small>
                      PostgreSQL migrations and demo fallback are explicit.
                    </small>
                  </span>
                </li>
                <li>
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>Safe by default</strong>
                    <small>
                      Secrets stay server-side; diagnostics are redacted.
                    </small>
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <section className="role-section" aria-labelledby="role-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Seeded access</p>
              <h2 id="role-heading">
                Pick the perspective you want to verify.
              </h2>
            </div>
            <a className="text-link" href="/api/readiness">
              View readiness JSON <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <div className="role-grid">
            <Card className="role-card">
              <CardHeader>
                <Badge className="role-badge" variant="secondary">
                  Teacher demo
                </Badge>
                <CardTitle>Maya Hassan</CardTitle>
                <CardDescription>
                  See the seeded classroom boundary and fixture counts.
                </CardDescription>
              </CardHeader>
              <CardContent className="role-card__content">
                <ul>
                  <li>Tenant-scoped synthetic classroom</li>
                  <li>Standards and prerequisite graph visible</li>
                  <li>Generation remains intentionally out of scope</li>
                </ul>
                <Link
                  className={cn(
                    buttonVariants({ variant: 'secondary' }),
                    'min-h-12',
                  )}
                  to="/demo/$role"
                  params={{ role: 'teacher' }}
                >
                  Open teacher view
                </Link>
              </CardContent>
            </Card>

            <Card className="role-card role-card--student">
              <CardHeader>
                <Badge className="role-badge" variant="outline">
                  Student demo
                </Badge>
                <CardTitle>Omar Nabil</CardTitle>
                <CardDescription>
                  Verify assigned-demo access without exposing private keys.
                </CardDescription>
              </CardHeader>
              <CardContent className="role-card__content">
                <ul>
                  <li>Opaque seeded identity</li>
                  <li>One assigned equivalent-fractions fixture</li>
                  <li>Answer key stays on the server</li>
                </ul>
                <Link
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'min-h-12',
                  )}
                  to="/demo/$role"
                  params={{ role: 'student' }}
                >
                  Open student view
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        <footer className="site-footer">
          <span>
            Operator path: configure → migrate → seed → readiness → smoke.
          </span>
          <a className="text-link" href="/api/health">
            Liveness <ArrowUpRight aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  )
}
