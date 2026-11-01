# Glossary — validation and safety

Vocabulary for `src/server/safety/` and `src/server/moderation/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Artifact gate

The single check that decides whether a stored draft may be rendered at all. The gate reads the whole stored artifact, re-derives its verdict on every preview, and mints the only value a compiler accepts.

### Verdict

The gate's answer for one artifact: pass, or hard block. A verdict is not a warning list; warnings live in findings and do not stop rendering.

### Hard block

A verdict that stops a draft from being previewed or published. It is not a warning, and it cannot be overridden by a teacher in this release.

### Finding

One reason a verdict was reached, with a code, a field, and a severity. Findings are what the teacher reads when content is refused.

### Renderable artifact

A value that can only be produced by a passing gate result. Compilers accept nothing else, so a draft cannot reach a screen without a fresh verdict.

### Recovery action

What a teacher can do about a block or failure: edit the prompt, replace the draft, or retry. One table owns every code-to-recovery decision and the order they are offered in.

### Moderation block

A refusal produced by the deterministic screens, with a category and a code. It is not a provider moderation refusal, which carries its own code.

### Moderation category

The kind of content a screen refused: personal data, harmful content, prompt injection, unsafe markup, or unserializable content. The category is stable; the rule set version is recorded beside it.

### Deterministic screen

A local rule that needs no provider call, so it costs no latency, no money, and no data leaving the server. A deterministic screen is preferred over a provider moderation call for every check it can make.
