---
description: Implement one GitHub issue end-to-end in an isolated worktree with TDD and production-quality gates
argument-hint: "<issue-number> [branch-slug]"
---

# Implement GitHub issue end-to-end

Use this command with `/implement-github-issue <issue-number> [branch-slug]`.

The user invoked this command with: `$ARGUMENTS`

Resolve the inputs before doing any work:

- `ISSUE_NUMBER`: the first argument. If it is missing, ask for it.
- `BRANCH_SLUG`: the second argument, or a short kebab-case slug derived from the issue title.
- `WORKTREE_PATH`: `.worktrees/<ISSUE_NUMBER>-<BRANCH_SLUG>`.
- `BRANCH_NAME`: `feature/<ISSUE_NUMBER>-<BRANCH_SLUG>`.

Use the target issue number consistently. Never silently substitute another issue number from an example, a related issue, or a copied prompt.

## Operating contract

Act as a senior staff engineer responsible for a ship-ready change. Keep the issue as the scope boundary. Do not broaden the work because a review skill suggests an interesting refactor, a design preference, or a resilience pattern that the issue does not need.

Do not ask for confirmation at every step. Ask only when a missing decision would materially change scope, correctness, the public seam, data safety, or the delivery target. If an issue is clear, proceed and record reasonable assumptions.

## 0. Route the optional specialist reviews

Classify the issue before implementation:

- `UI/UX`: changes a page, component, visual hierarchy, interaction, responsive behavior, accessibility behavior, copy, or design system.
- `Business/product`: changes a user outcome, product strategy, pricing/operational decision, workflow priority, or a behavior whose success depends on business assumptions.
- `Backend/platform`: everything else.

Use the specialist skills only when their route applies:

- For `UI/UX`, run `$enhance-prompt` on the issue's design brief before coding. Turn the result into explicit component, state, interaction, responsive, accessibility, and copy requirements. Check `DESIGN.md` if present; if absent, preserve the existing design language and record that no project design system file was available. Do not use prompt enhancement to add unrelated features.
- For `UI/UX`, run `$impeccable craft` when the project has enough design context to do so. Confirm the target audience, use cases, and brand personality from project instructions or `.impeccable.md`; if that context is unavailable, ask for it before making aesthetic decisions rather than inferring it from code alone.
- For `UI/UX`, run `$gpt-taste` as a visual and motion review after the implementation exists. Use its findings to assess hierarchy, typography, asset quality, spacing, responsiveness, interaction feedback, and motion. Do not add GSAP, marketing-page structures, randomization, or decorative effects merely to satisfy the review when the issue does not require them.
- For `Business/product`, load `$layers-intro` if needed, then run `$layers-orient`. Record the seven-layer decision landscape, the bottleneck layer, assumed layers, and the recommended next focus. Resolve any requirement ambiguity it exposes before coding; do not turn the orientation into speculative product strategy work.
- For `Backend/platform`, mark the UI/UX and business-specific routes as `N/A` unless the issue description shows that they are relevant.

## 1. Create an isolated worktree first

Use the repository's `.worktrees/` directory and a dedicated feature branch. The main worktree is read-only for this task except for Git worktree metadata. Perform all file edits, tests, builds, commits, and branch-local Git operations from `WORKTREE_PATH`.

1. Inspect the current worktree and existing worktrees with `git status --short --branch` and `git worktree list`.
2. Fetch the base reference with `git fetch origin main` when the remote is available.
3. Ensure `.worktrees/` exists; create only that directory if necessary.
4. Create the fresh worktree from `origin/main` (or the repository's documented main base if `origin/main` is unavailable):

   ```bash
   git worktree add -b "feature/<ISSUE_NUMBER>-<BRANCH_SLUG>" ".worktrees/<ISSUE_NUMBER>-<BRANCH_SLUG>" origin/main
   ```

5. If the path or branch already exists, do not overwrite, reset, remove, or reuse it. Choose a new slug or ask the user.
6. Do not modify the main worktree, switch its branch, delete unrelated worktrees, or clean files you did not create.
7. Leave the feature worktree available after delivery unless the user explicitly asks for cleanup.

## 2. Understand the issue before coding

From the feature worktree, read:

- GitHub issue `#<ISSUE_NUMBER>` and its comments, using the repository's configured issue-tracker workflow.
- `README.md`, contributor/agent instructions, and relevant package scripts.
- `CONTEXT.md` if present, plus relevant domain glossaries such as `UBIQUITOUS_LANGUAGE.md`.
- Relevant ADRs in `docs/adr/` or equivalent decision-record directories.
- Relevant product, observed-behavior, architecture, security, and operational documentation.
- Existing tests around the affected behavior and the public delivery path.

Before writing a test or implementation, produce a plain-English implementation brief containing:

1. The problem the issue solves.
2. The user-facing North Star outcome.
3. Functional requirements.
4. Non-functional requirements, including security, accessibility, performance, reliability, and operational constraints that actually apply.
5. Observable acceptance criteria.
6. In-scope work.
7. Explicitly out-of-scope work.
8. Assumptions and risks.
9. The public seams that will be tested, including what a caller or user can observe at each seam.
10. For a business/product issue, the `$layers-orient` decision landscape and how the bottleneck affects the implementation.
11. For a UI/UX issue, the `$enhance-prompt` output distilled into a compact UI brief and the design context used by `$impeccable`.

Treat the issue and repository decisions as the source of truth. Call out contradictions instead of quietly choosing whichever document is convenient.

## 3. Implement with TDD

Use `$implement` to carry out the work and `$tdd` for every behavior change.

Before the first test, make the public seam checkpoint explicit. Tests must observe behavior through a public interface, route, command, adapter, or user-facing interaction—not private functions, internal state, implementation-specific mocks, or side channels. If a material seam decision is unresolved, pause and ask the user before writing tests.

Follow a strict red → green → refactor loop in vertical slices:

1. Write one failing test for one observable behavior.
2. Run the focused test and capture the failure.
3. Make the smallest implementation change that makes that test pass.
4. Run the focused test, relevant typecheck, and relevant lint/format check.
5. Repeat for the next behavior.
6. Keep refactoring local and behavior-preserving; do not build speculative abstractions or horizontal batches of tests.

Use domain language in test names. Keep expected values independent of the implementation. Prefer real collaborators at the seam and mock only external systems whose behavior is necessary to make the test deterministic.

Run focused tests and typechecking regularly. Discover and use the repository's canonical validation scripts rather than inventing replacements. Run the complete test suite, typecheck, lint, format check, and production build once implementation is complete.

## 4. Apply production engineering principles proportionately

Apply the relevant Release It! principles only where the issue needs them:

- clear, observable failure modes and actionable diagnostics;
- timeouts and bounded retries for external or potentially blocking work;
- idempotency for repeatable commands, writes, seeds, or delivery operations;
- resource, payload, concurrency, and input limits;
- safe startup and shutdown behavior;
- useful structured observability without leaking secrets or personal data;
- graceful degradation where a dependency is optional and the user experience can remain safe.

Do not add resilience, abstractions, configuration, or infrastructure unrelated to `#<ISSUE_NUMBER>`. Preserve existing safety boundaries and ADR decisions.

## 5. Verify behavior and quality

After implementation, run the checks below in order. Record commands, results, and every finding in a verification ledger.

### Acceptance QA

Run `$qa` as an acceptance-focused QA pass against the issue's observable requirements and user-facing behavior. Exercise happy paths, invalid input, empty/loading/error states, permissions, retries, and responsive/RTL behavior when relevant. Treat failures as implementation blockers: identify the root cause, fix it in scope, and rerun the affected checks.

Do not create a separate GitHub issue for a defect in this change unless it is genuinely independent or out of scope. If the QA skill's interactive flow asks whether to start another issue, continue the acceptance pass instead.

### Code and two-axis review

Run `$code-review` as required by `$implement`, then run `$review` against `main` using the merge-base diff and commit list. Require both axes from `$review`:

- Standards: repository coding standards, architecture decisions, type boundaries, and documented conventions.
- Spec: issue requirements, acceptance criteria, scope, and user-facing behavior.

Also review accessibility, performance, theming, responsive behavior, RTL support, loading/error states, and anti-patterns for any affected interface. Record every finding, even when non-blocking.

### UI/UX review, when routed

For `UI/UX` issues, run `$impeccable craft` and `$gpt-taste`'s visual/motion review after the implementation is functional. Check that the result is distinctive but coherent with the product, accessible, responsive, performant, and free of generic or decorative patterns that obscure the user task. Fix relevant findings; record intentionally rejected aesthetic suggestions as follow-ups with a reason.

### Strict maintainability gate

After the ordinary checks pass, run `$thermo-nuclear-code-quality-review` against `main`. Look aggressively for structural regressions, missed code-judo simplifications, spaghetti branching, wrong-layer logic, thin abstractions, cast-heavy boundaries, duplicate helpers, non-atomic updates, unnecessary sequential orchestration, and files pushed beyond healthy size limits.

Run `$craftsmanship` as the final production-quality gate. Require a ship-ready result with no blocking findings. If either review fails, fix the root cause, rerun the affected focused checks, and rerun the failed gate. Do not waive a clear blocker because tests happen to pass.

### Architecture review

Run `$improve-codebase-architecture` after implementation. Generate its self-contained HTML report in the OS temp directory and identify deepening opportunities in the changed area using the project's domain vocabulary and the `module`, `interface`, `depth`, `seam`, `adapter`, `leverage`, and `locality` vocabulary.

Do not expand this issue with speculative refactors. Implement an architectural improvement only when it is necessary for correctness, testability, maintainability, or production readiness. Record all other candidates as follow-up work. Do not delete unrelated worktrees or repository files while producing the report.

## 6. Failure loop

If any test, QA, audit, review, typecheck, lint, format, or build check fails:

1. Identify the root cause from evidence.
2. Make the smallest in-scope fix that addresses it.
3. Rerun the affected check.
4. Rerun dependent checks when the result is green.
5. Continue until the implementation is genuinely ready or a real external blocker requires user input.

Never hide failures, weaken assertions, skip a gate, suppress a warning without justification, or claim a check passed when it was not run.

## 7. Documentation and delivery

Update documentation only when the change introduces a durable behavior, operational requirement, architectural decision, domain term, security rule, or contributor workflow that future maintainers need. Otherwise state why no documentation change was needed.

Before delivery:

1. Confirm the diff contains only issue-scoped changes and intentional documentation.
2. Run the complete final validation suite from the feature worktree.
3. Commit with a concise message that references `#<ISSUE_NUMBER>`.
4. Show the final commit with `git show --stat --oneline HEAD` and record its SHA.
5. Push `BRANCH_NAME` to `origin`.
6. Open a pull request against `main` with:
   - a concise summary of the user-facing change;
   - the issue link and acceptance criteria covered;
   - test, QA, audit, review, architecture, and craftsmanship results;
   - any known risks, follow-ups, or intentionally rejected architecture candidates.

If authentication, network access, or repository permissions prevent pushing or opening the pull request, report the exact blocker and the command that failed. Never fabricate a commit, push, or PR URL.

## Final response

Return a concise but complete delivery report containing:

- implementation summary and North Star outcome;
- current issues found and how they were resolved;
- test, typecheck, lint, build, QA, `$code-review`, `$review`, `$thermo-nuclear-code-quality-review`, architecture, `$impeccable`/`$gpt-taste` when applicable, and `$craftsmanship` results;
- key learnings and remaining risks;
- documentation changes, or why none were needed;
- final branch and worktree path;
- final commit SHA and PR URL;
- follow-up architecture candidates that were deliberately left out of scope.
