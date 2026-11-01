# AgDR-0016 — Studio redesign UI stack and provider transport

> In the context of rebuilding the teacher and learner screens from the approved redesign sketches, facing the risk that a component upgrade or an AI SDK quietly widens the trust boundary (generated UI, client-side model calls, unvalidated streaming), I decided to build the redesign on the existing shadcn Base UI style at its current release and to adopt TanStack AI only as the server-side transport inside the existing provider seam, to achieve accessible primitives and provider-agnostic structured output without changing what the lesson gate decides, accepting a second migration step for the provider and no chat-style or streaming-draft features.

Status: proposed, 2026-11-02. Not yet built: the [teacher UI implementation gate](../product/teacher-ui.md#implementation-gate) still requires Abdullah's approval and named verification skills.

## Context

- The redesign is sketched as static HTML in `.impeccable/mocks/screens/` (index at `index.html`), with tokens in `base.css`. Product truth is in [`PRODUCT.md`](../../PRODUCT.md).
- The repository already uses the shadcn CLI 4.22.1 with the Base UI style (`base-nova`, `rtl: true`) and `@base-ui/react` 1.6.0. On 2026-11-02 npm published shadcn 4.23.0 and `@base-ui/react` 1.9.0. Only `button`, `badge` and `card` exist in `src/components/ui`.
- `src/server/generation/provider.ts` calls the provider over HTTP directly, with a 100 s deadline and four failure kinds (`timeout`, `rate-limit`, `transient`, `terminal`). [AgDR-0006](AgDR-0006-provider-selection-and-deadlines.md) owns which model is allowed; this record does not change it.
- TanStack AI 1.0.1 (`@tanstack/ai`, `@tanstack/ai-openai`, `@tanstack/ai-anthropic`) returns a typed object when `chat()` is given a Standard Schema `outputSchema` (Zod 4 is already a dependency), takes an `AbortController`, and throws provider and schema errors through the same path. It does not stream partial structured objects.

## Decision

### UI stack

- Stay on the shadcn Base UI style. Bump `shadcn` and `@base-ui/react` to their current releases in one dependency PR, then run `pnpm check`.
- Add only the primitives the sketches use: tabs, radio group, checkbox, select, input, textarea, label, table, alert, skeleton, separator, dropdown menu and tooltip. Their keyboard and ARIA behaviour (roving tabindex, radio semantics, linked tab panels) replaces the hand-rolled sketch markup.
- Components are owned code. Restyle them to the sketch tokens after adding; check upstream changes with `shadcn add <name> --diff` before any later update.
- Move the sketch palette onto shadcn's variables in `src/styles.css` and remove the old `--teacher-*` palette, so one set of variables drives every component.
- Self-host Source Serif 4 and Figtree through `scripts/fonts-subset.py`, as Hanken Grotesk is today. No hosted font stylesheet.
- `src/components/ui` holds teacher-app primitives only. Learner content keeps rendering through the allowlisted A2UI catalog in `src/components/a2ui` ([AgDR-0001](AgDR-0001-a2ui-catalog-governance.md)); no shadcn component becomes something a model can emit.

### Provider transport

- Replace only the HTTP call inside the provider seam with `chat({ adapter, messages, outputSchema, abortController })`. Bridge the existing `AbortSignal` and deadline into an `AbortController`.
- Schema validation is not the lesson gate. Structural, curriculum, learning-quality, semantic and safety validation run after the transport exactly as now ([AgDR-0003](AgDR-0003-canonical-lesson-contract-and-bounded-generation.md), [AgDR-0004](AgDR-0004-bounded-semantic-validation.md)). A schema failure feeds the existing correction attempt and diagnostics.
- Map every thrown error to the existing `ProviderFailureKind`, with one test per kind in `src/server/generation/provider.test.ts`.
- Import `@tanstack/ai*` only from server modules; keys stay in `src/server/config.ts`. Add a dependency-cruiser rule that forbids those imports from `src/components` and `src/shared`.
- Record the adapter and model in `ProviderProvenance`.
- Roll out behind a configuration switch (`direct` or `tanstack`), compare acceptance and block rates on the artifact corpus, then remove the direct path.

### Not adopted

- `useChat` or any chat interface: the product is not a chat wrapper.
- Model-called tools for grounding: Learning Commons retrieval stays a deterministic server step that produces an immutable snapshot before generation.
- Streaming partial drafts: previews stream only compiled, validated A2UI.

## Options considered

| Option | Pros | Cons |
| --- | --- | --- |
| **A. Current shadcn Base UI + TanStack AI as transport only** | Accessible primitives with no style migration; provider-agnostic typed output; gate and boundaries unchanged | Two PRs; TanStack AI is at 1.0, so error mapping needs tests |
| B. Keep hand-written components and the direct HTTP call | No new dependency | Re-implements tabs, radios and selects; provider stays hard-wired |
| C. Adopt TanStack AI fully (chat hooks, tools, streaming) | Fast to demo | Breaks the trust boundary: client-visible model traffic, non-deterministic grounding, unvalidated output on screen; rejected |
| D. Move to a Radix-based shadcn style | Larger component catalogue | A style migration with no product gain; Base UI already covers the needed primitives |

## Consequences

- - The critique's accessibility findings (tab semantics, radio grade picker, focusable disabled actions) come from the primitives rather than custom code.
- - Switching providers becomes an adapter and configuration change, still bounded by AgDR-0006.
- - `pnpm verify:client-boundary`, `verify:boundaries` and `verify:lesson-gate` keep guarding the same seams.
- − Upstream component updates need a manual diff review because the components are restyled.
- − No partial-draft streaming until TanStack AI supports it and a validated-stream design exists.

## Verification

- Build steps: `pnpm check` per PR; `verify-lesson-gate` for the provider change; Impeccable critique and audit on the rebuilt screens; `specs-plugin:ac-checker` against AC01–AC24. These are the proposed defaults pending Abdullah's confirmation under the implementation gate.

## Handoff

- Order: (1) dependency bump, tokens and fonts; (2) Studio and Review; (3) Publish, Lessons and the learner board; (4) TanStack AI transport behind the switch; (5) `DESIGN.md` written from the built screens.
- Open: confirmation of the verification skills; which allowed model the adapter targets under AgDR-0006.
