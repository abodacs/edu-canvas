# Scholé

**Turn one learning objective into a lesson your students understand.**

[![Foundation checks](https://github.com/abodacs/edu-canvas/actions/workflows/foundation.yml/badge.svg)](https://github.com/abodacs/edu-canvas/actions/workflows/foundation.yml) [![Security scan](https://github.com/abodacs/edu-canvas/actions/workflows/security.yml/badge.svg)](https://github.com/abodacs/edu-canvas/actions/workflows/security.yml)

Scholé is a lesson-preparation workspace for Grades 3–6 teachers. A teacher describes an objective, reviews four structured lesson variants, and publishes the version students receive. The model drafts the lesson. The server checks its structure, curriculum quality, learning quality, and safety. The teacher makes the final decision.

The current release covers Grade 4 equivalent fractions (Common Core `4.NF.A.1`). English is the product language, and teachers can also generate lessons in Arabic that render right to left. Everything runs on synthetic data.

![Scholé landing page showing the hero, a sample equivalent-fractions activity, and the target preparation-time metric](docs/assets/readme-hero.png)

## Run Scholé locally

You need Node.js 26 or newer, pnpm 10.17.1, Docker, and a Meta API key.

```bash
git clone https://github.com/abodacs/edu-canvas.git
cd edu-canvas
pnpm install --frozen-lockfile
docker compose up -d postgres
cp .env.example .env
# In .env, uncomment META_API_KEY and set it to a server-side key.
set -a; source .env; set +a
pnpm db:setup
pnpm dev
```

Open `http://localhost:3000`. In development, sign in as the synthetic teacher `amira.north@example.test` with the password `synthetic-pass-1`.

The app needs PostgreSQL and a server-side provider key. It has no in-memory fallback. The [foundation runbook](docs/foundation-runbook.md) covers configuration, readiness checks, and safe redeploys.

## Safety boundaries

Three rules apply in every environment:

- Answer keys, mastery, and permissions stay on the server. They never appear in a client bundle or an A2UI message.
- The server sends no student images or identifying data to the model.
- The foundation blocks real student data until a data-processing agreement, EU data residency, a security review, and consent are all in place. Until then, deployments use synthetic data only.

## Contribute a change

Before you open an issue or a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md). It lists the checks for each kind of change. Run `pnpm check` before you push.

[ARCHITECTURE.md](ARCHITECTURE.md) maps the code. [docs/README.md](docs/README.md) indexes the rest of the documentation.

## Report a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/abodacs/edu-canvas/security/advisories/new). Do not open a public issue for a suspected vulnerability.

## License

The repository has no reuse license. It is public for review. To discuss reuse, open an issue.
