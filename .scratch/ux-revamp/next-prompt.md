Continue the Edu-Canvas UX revamp in worktree `ux-revamp` (branch `worktree-ux-revamp`). Read `.scratch/ux-revamp/deliverable-1.md` first. Abdullah accepted every default in its section 8 (D1-D8). Treat D1 as: design and non-UI scaffolding proceed; the first UI code change waits until he names the verification skills for content, pedagogy, rendering and interaction.

Do, in order, and do not block on questions (use the stated default, record it, move on):
1. Walk the running app (deterministic provider, dev only; real sources: selectable PDF, scanned PDF, TXT, MD). Fill every `walk` cell of the state matrix with a screenshot and the real error code. Update section 3.
2. Resolve gaps G6, G9, G13 from evidence; amend the mocks' copy for G1-G3 and G19 to match the backend.
3. Regenerate target captures from the mocks for each screen and state, so the visual-diff bar has a reference.
4. Draft the baseline task script (T1-T6, S1-S3) and a Playwright runner that records time and step counts; label results as friction proxies, not usability.
5. Run /modern-web-guidance, then step 1 of the rollout: move base.css tokens into Tailwind v4 @theme unchanged, keep --teacher-* as aliases. Stop for the gate if no verification skills are named. pnpm check must stay green.
Then report with the project map updated.
