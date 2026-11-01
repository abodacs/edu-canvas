# Domain study

| Document | Owns |
| --- | --- |
| [As-is stories](01-as-is-stories.md) | Three pure as-is stories of one teacher's week. Reconstructed, not observed. |
| [Boundaries](02-boundaries.md) | The six indicators applied to the ten contexts AgDR-0008 claims. |
| [Homonym register](03-homonyms.md) | Every word with two implementations, its resolution, and where it lives now. |

## The language

| File | Vocabulary |
| --- | --- |
| [GLOSSARY.md](../../GLOSSARY.md) | Product language: the words a teacher uses. |
| [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md) | Which context owns which vocabulary. |
| `src/server/*/GLOSSARY.md` | Context language, beside the code that implements it. |

## Status

The stories are **reconstructed** from the desk study in [#94](https://github.com/abodacs/edu-canvas/issues/94) and from the seed lesson. No teacher was interviewed and no classroom was observed. Nothing here is evidence about teachers.

The test that would change that status: a teacher reads Story 1 aloud and corrects it. Until then, every sentence in these documents is a hypothesis with a source, which is better than a hypothesis without one.

## What is enforced

`pnpm verify:glossary-coverage` fails when a table or a stored-record schema has no owning term, when two terms claim one name, or when a term claims a name that does not exist.

It cannot enforce meaning. The homonym register cannot be checked by a machine either: a new word with two meanings is a review finding, not a test failure.
