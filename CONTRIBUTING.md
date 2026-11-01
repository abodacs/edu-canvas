# Contributing to Edu-Canvas

Use this guide to report a problem, propose a bounded change, or prepare a contribution for review. Follow [CODING_STANDARDS.md](CODING_STANDARDS.md) for code rules and [coding patterns](docs/engineering/coding-patterns.md) for design guidance.

## Run with synthetic fixtures

Use Node.js 26 or newer and the pnpm version pinned in [package.json](package.json), currently 10.17.1.

```bash
docker compose up -d postgres
pnpm install --frozen-lockfile
export DATABASE_URL=postgresql://edu_canvas:edu_canvas_dev@127.0.0.1:5432/edu_canvas
export OPENAI_API_KEY=<server-side-key>
pnpm db:setup
pnpm dev
```

Open `http://localhost:3000`. Every environment requires PostgreSQL and a server-side provider key; there is no in-memory runtime fallback. The curriculum is synthetic, but generation calls the configured model provider.

See the [foundation runbook](docs/foundation-runbook.md) for environment overrides, Git worktrees, and PostgreSQL setup.

Keep private answer keys, mastery, permissions, and credentials on the server. Use synthetic examples in contributions. Preserve the [architecture boundaries](docs/architecture-harness.md) and [safety boundaries](README.md#safety-boundaries-non-negotiable-even-under-deadline-pressure).

## Write an issue someone can act on

Search existing issues before opening another. Choose the form that matches the work:

| Form | Describe |
| --- | --- |
| [Bug report](https://github.com/abodacs/edu-canvas/issues/new?template=bug_report.yml) | The symptom, reproducible steps, expected and actual behavior, and environment |
| [Feature request](https://github.com/abodacs/edu-canvas/issues/new?template=feature_request.yml) | The user's problem, supporting observations, desired outcome, and optional approach |
| [Task](https://github.com/abodacs/edu-canvas/issues/new?template=task.yml) | One deliverable, its motivation, scope, acceptance criteria, and verification |

Give the title a specific outcome or symptom, such as "Teacher preview stays empty after reconnecting." Put the problem and its consequence first. Include the context needed to understand linked issues or documents.

- Describe observations separately from assumptions. Mark unknown causes or requirements as open questions.
- For bugs, include the smallest synthetic input that reproduces the failure and quote exact error text when available.
- For planned work, state the scope and exclusions. Write acceptance criteria that a reviewer can observe or check.
- Name dependencies and constraints that affect the work. Suggest an approach when useful; a feature request can leave implementation open.
- Describe how to verify completion. Include relevant commands or manual steps and the expected result.

Remove credentials, student identifying data, and private answer keys from screenshots and logs. Keep long background material in a linked document with a short summary in the issue.

The forms live in [.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE). When changing their fields, follow [GitHub's form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema).

## Write commits that explain the effect and motivation

Keep each commit focused on one coherent change. Follow the repository's existing `<type>: <effect>` title style. Common types include `feat`, `fix`, `docs`, `refactor`, `test`, and `chore`.

State what changes for a user or contributor in the title. A title such as `fix: keep blocked drafts out of lesson previews` explains the result. Keep implementation details in the body when they explain the approach or a tradeoff.

For a substantive change, explain why it was needed and what shaped the solution. Include useful verification results and limitations. Quote a distinctive error message when it will help someone find the change later. Summarize relevant issue context before adding the issue reference.

Example documentation commit:

```text
docs: explain how to report and verify a lesson bug

Contributors need a reproducible report before they can investigate a
preview failure. Explain how to supply a synthetic input, separate the
expected result from the observed result, and record the environment.

Keep the bug form aligned with the contribution guide.
```

Link related work with `Refs #<issue-number>`. Use `Closes #<issue-number>` in the PR when merging it completes the issue. A reference supplements the explanation.

Call out breaking changes and required migration steps when applicable. Put critical invariants in code, checks, or maintained documentation so readers can find them without searching commit history.

## Verify the changed behavior

Choose checks that exercise the change and relevant failure paths. [package.json](package.json) owns the commands; the [Foundation workflow](.github/workflows/foundation.yml) defines the CI pipeline.

| Change | Verification |
| --- | --- |
| Documentation or issue forms | Run Prettier on every changed Markdown or YAML file; check local links and form fields |
| Application code | Run `pnpm check` and relevant behavior tests; run `pnpm test:coverage` for coverage evidence |
| Persistence or migrations | Follow the [database runbook](docs/foundation-runbook.md#postgresql-migration-and-seed); run `pnpm test:database` against a configured local PostgreSQL database |
| Runtime or API behavior | After building, start the server with `pnpm start`; run `pnpm smoke` in another terminal |
| UI or interaction | Exercise the affected flow, keyboard controls, and responsive layout. |

For example, check the root contribution guides and issue forms with:

```bash
pnpm exec prettier --check CODING_STANDARDS.md CONTRIBUTING.md .github/ISSUE_TEMPLATE
```

Include any other changed documentation files in that command. The `format:check` script currently covers selected documentation files. Use the existing formatter configuration. Avoid unrelated formatting changes.

Record the commands, results, and untested cases in the PR. Documentation-only edits can use documentation checks; explain why a runtime check was skipped when it would otherwise apply.

## Prepare a focused pull request

Describe the intended outcome, why it matters, and where review should start. Follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md) and link the issue. Include before-and-after evidence appropriate to the change, plus risks and rollback implications.

Keep required code, contract, configuration, and migration changes together. Separate unrelated cleanup when it can stand alone. Update affected documentation and [architecture decisions](docs/agdr) when their contracts change.

## Writing references

The commit guidance adapts chapters 3 and 21 of Michael Lynch's _Refactoring English_. The issue guidance applies its reader-first structure and chapter 19's scope and decision principles to this repository's forms. See the [research index](docs/research/README.md#local-reference-materials) for the retained reference.
