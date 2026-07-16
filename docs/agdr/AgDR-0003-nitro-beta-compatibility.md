# AgDR-0003 — Keep Nitro 3 beta while Vite 8 is pinned

> In the context of deciding whether to replace the pinned Nitro beta without destabilizing the walking skeleton, facing a stable 3.x release whose peer contract targets Vite 7 and whose package is deprecated in favor of an unavailable 3.0.1, I decided to keep Nitro 3.0.260610-beta with the existing Vite 8.1.4 pin, to achieve a reproducible release-shaped build with minimal dependency churn, accepting prerelease risk and the need to reevaluate when stable Nitro supports Vite 8.

## Context

Issue #14 asks whether the pinned Nitro beta can be replaced by a compatible stable Nitro 3.x release. The current toolchain pins Nitro `3.0.260610-beta`, Vite `8.1.4`, and pnpm `10.17.1`.

The npm registry was checked on 2026-07-17:

- The `latest` Nitro dist-tag is still `3.0.260610-beta`.
- The only published stable `3.x` version is `3.0.0`. The registry has no `3.0.1`; it has only `3.0.1-alpha.*` prereleases after `3.0.0`.
- Nitro `3.0.0` declares an optional `vite: ^7` peer and is marked deprecated with a message to use the unavailable `3.0.1`.
- Nitro `3.0.260610-beta` declares `vite: ^7 || ^8`, which matches the repository's Vite 8 pin.

The stable candidate's install and full `pnpm check` completed, but the install reported the unmet Vite 8 peer and the deprecated package. Regenerating the candidate lockfile also changed 793 lockfile lines, including transitive Rollup, esbuild, srvx, and Nitro runtime resolutions. That is unnecessary dependency churn for this issue.

## Options considered

| Option                                                    | Pros                                                                                                     | Cons                                                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Replace Nitro with stable `3.0.0`**                  | Removes the beta label; the candidate build completes                                                    | Declared Vite peer is `^7`, package is deprecated, `3.0.1` is unavailable, and the lockfile changes substantially; not a compatible stable replacement for this Vite 8 toolchain |
| **B. Keep the pinned `3.0.260610-beta`**                  | Matches Vite 8, preserves the known-good lockfile, and keeps the change limited to a documented decision | Retains prerelease compatibility and maintenance risk; requires a later reevaluation                                                                                             |
| **C. Downgrade Vite or upgrade other toolchain packages** | Could make a different Nitro combination resolvable                                                      | Unrelated major dependency churn and explicitly outside issue #14's scope                                                                                                        |

## Decision

**Option B. Keep Nitro `3.0.260610-beta` and leave `package.json` and `pnpm-lock.yaml` unchanged.** The stable `3.0.0` package is not compatible with the repository's declared Vite 8 toolchain, even though its candidate build happened to complete. A successful build does not make an unmet and deprecated peer contract a safe dependency decision.

The beta's compatibility is bounded by the frozen lockfile and the release-shaped checks:

| Verification                                                | Result                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                            | Pass                                                                                                         |
| `pnpm install --frozen-lockfile --strict-peer-dependencies` | Pass                                                                                                         |
| `pnpm check`                                                | Pass: formatting, lint, typecheck, 11 tests, production build, client-boundary check, and architecture check |
| `pnpm audit --prod`                                         | No known vulnerabilities found                                                                               |

## Security and operational consequences

- The exact beta version and existing integrity-locked dependency graph remain unchanged; frozen installs cannot silently resolve a different Nitro build.
- The production dependency audit found no known vulnerabilities at the time of this decision. This is evidence about the current graph, not a claim that prerelease software is risk-free.
- Keeping the beta avoids silently accepting the stable candidate's incompatible peer contract and broad transitive graph rewrite.
- The remaining risk is Nitro prerelease maturity and the possibility of future incompatibility with Vite 8. That risk is visible, pinned, and owned rather than hidden behind a warning.
- No application code, server boundary, client boundary, or data contract changes are needed for this decision.

## Re-evaluation trigger

Revisit this decision as soon as a non-deprecated stable Nitro 3.x release declares support for Vite 8. Before changing the pin, repeat the registry/version check, production audit, frozen install, full `pnpm check`, and lockfile-diff review. If no compatible stable release appears first, review the decision by 2026-08-17 or before a production release, whichever comes first.

## Artifacts

Issue #14 · `package.json` · `pnpm-lock.yaml` · `pnpm check` · `pnpm audit --prod`
