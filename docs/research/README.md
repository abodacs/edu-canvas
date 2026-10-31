# Research index

Raw research notes, brainstorms, and archived ideas were imported on 2026-10-24 with the hackathon-2026 document migration ([import plan](../archive/hackathon-2026-pr-stack.md), [change record](../archive/hackathon-2026-import-changes.md)); they are inputs and background, not current requirements, and their claims were not re-verified during import.

The raw research notes (`education/`, `ui/`, `engineering/`, and `design/` `.txt` files) were removed from the repository the same day. They are retained, byte-identical, in the local notes workspace (`.worktrees/hackthon-docs/`). The hackathon idea-brainstorm archive was removed from the repository on 2026-10-25 and stays only in the local notes workspace.

## Local reference materials

The following materials are retained on the owner's machine only. They are not tracked in this repository, and no link inside the repository points at them directly; import requires a separate decision on repository scope and redistribution basis (see the [import plan](../archive/hackathon-2026-pr-stack.md)).

| Material | Where it lives | Notes |
| --- | --- | --- |
| _Refactoring English_, v1.0.4 (PDF) | Local notes workspace (`.worktrees/hackthon-docs/`) | Book by Michael Lynch; supplies writing guidance for [contributions](../../CONTRIBUTING.md), [delivery priorities](../product/delivery-priorities.md), and the design [reading guide](../design/design-doc-reading-guide.md) |
| _7 Coding Patterns I Stole From Senior Engineers_ (PDF) | Local notes workspace (`.worktrees/hackthon-docs/`) | Article by CodeByUmar, Skill Stuff on Medium, June 8, 2026; its seven patterns are summarized and adapted in [coding patterns](../engineering/coding-patterns.md) |
| `refactoring-english/` generated skill | Local notes workspace (`.worktrees/hackthon-docs/refactoring-english/`), installed via a personal skills symlink | Book-to-skill output; not installed into this repository |
| _The Learning Game_ (PNG screenshot) | Owner's Downloads folder | Web-essay screenshot on learning and schooling; saved 2026-10-24, indexed here as a local reference only |

## Transport evaluations

- [Option C: deterministic MCP dispatch, #142](142-mcp-eval/README.md): deferred. Eight registry rows cost three visible calls each, deterministically. Provider-internal reads stay unobservable, and the contract carries no currency, licence, attribution or source links. The same directory adds a free-text stage: 33 teacher sentences, MCP keywords against REST semantic search. MCP finds the expected standard in the top five on 0 of 30; REST finds it or a child on 24 of 30. Recorded schemas, response hashes and the rerunnable runner are in the same directory.

## Synthetic study rehearsals

- [Twelve fictional teacher personas for issue #118](teacher-simulation-118/README.md): v2 US Common Core profiles, neutral prompts, capability limits and a twelve-persona gap audit. No v2 outcomes are generated. The complete original AI-authored rehearsal is retained under `legacy/v1`; its profiles, procedure and raw values stay separate. Neither version supplies real teacher evidence or satisfies #118 or V12.
