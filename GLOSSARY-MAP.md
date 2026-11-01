# Glossary map

The repository has more than one context, so the language has more than one home. This file is the index. One term, one owner; a word with two meanings is a finding for [the homonym register](docs/domain/03-homonyms.md).

## Where each vocabulary lives

| Vocabulary | File | Why it lives there |
| --- | --- | --- |
| Product language | [GLOSSARY.md](GLOSSARY.md) | Words a teacher uses, plus the curriculum nouns. Owned by the product, not by a module. |
| Identity and tenancy | [src/server/identity/GLOSSARY.md](src/server/identity/GLOSSARY.md) | Actors, memberships, sessions, provisioning. |
| Lesson drafting | [src/server/generation/GLOSSARY.md](src/server/generation/GLOSSARY.md) | Drafts, attempts, variants, diagnostics. |
| Records and student learning | [src/server/records/GLOSSARY.md](src/server/records/GLOSSARY.md) | Versions, publications, runs, attempts, evidence. |
| Publication and review | [src/server/publication/GLOSSARY.md](src/server/publication/GLOSSARY.md) | Packs, approvals, the bridge. |
| Curriculum and sources | [src/server/grounding/GLOSSARY.md](src/server/grounding/GLOSSARY.md) | Uploads, extraction, gaps, grounding. |
| Validation and safety | [src/server/safety/GLOSSARY.md](src/server/safety/GLOSSARY.md) | Gate, verdicts, blocks, recovery. |

## Contexts without a glossary

| Context | Why no file |
| --- | --- |
| A2UI protocol | Its words — catalog, component, message — are defined by the versioned contract in `src/shared/a2ui-contract.ts`. A glossary here would restate a wire format. |
| Shared contracts | Published language only. Terms belong to the context that owns the meaning. |
| Platform | Persistence, configuration, and observability are generic; they contribute no domain word. |

## Rules

1. A term is defined in exactly one file, in the context that owns the work object.
2. A definition states meaning only. Where the term is stored or typed goes on its `**Implementing names:**` line, not in the sentence.
3. Every table and every stored-record schema is claimed by exactly one term. `pnpm verify:glossary-coverage` enforces both halves: a name claimed twice fails, a name claimed never fails, and a claimed name that does not exist fails.
4. A new context starts with a glossary only when it owns a word a teacher or an operator would say.
5. A word with two meanings gets one entry per meaning and a row in the register. Renaming the code is required only when one context holds both meanings.

## How it is checked

`pnpm verify:glossary-coverage` walks every `GLOSSARY.md` outside ignored directories, collects the `Implementing names:` lines, and compares them with `drizzle/schema.ts` and the stored-record schemas in `src/server/records/authoring.ts` and `delivery.ts`.

It cannot check that a definition is true. That remains a review question.
