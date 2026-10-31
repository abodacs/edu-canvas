# #132 — measured moderation boundary (2026-10-31)

Issue: [#132 — Add an input moderation and personal-data boundary before real student data](https://github.com/abodacs/edu-canvas/issues/132)

This bundle is the measurement record. It states what the boundary catches, what it misses, and how much each arm costs. A green test suite is not the claim.

## What landed

1. `ContentSafetyResult` is now `{ allowed, category, code, ruleSetVersion }` (`src/server/moderation/content-safety.ts`). `category` is one of `personal-data`, `harmful-content`, `prompt-injection`, `unsafe-markup`, `unserializable`. `code` is the single local code `MODERATION_BLOCKED`, or `null`. `ruleSetVersion` is `moderation-rules-v1+<fnv1a>`. It is returned in memory but not persisted: the stored diagnostic uses the public schema, and the fingerprint must not reach the client.
2. One screen function serves `checkPrompt`, `checkGeneratedContent`, and `checkSourceText`. The generated-content path still fails closed on an unserializable value.
3. Personal data splits into two rule sets. Structured shapes (email, phone, labelled identifier) apply at every boundary. Reviewed first names apply only to teacher input and source text. Grade 4 word problems are full of reviewed first names ("Emma has 3/4 of a pizza"), so screening names on generated content would block legitimate lessons and waste a 20-47 s generation. `content-safety.test.ts` pins that case.
4. The category reaches the teacher payload as `moderationCategory` (`src/shared/generation-contract.ts`), and it reaches the stored diagnostic (`src/server/generation/types.ts`). The rule-set fingerprint stays server-side.
5. `src/server/moderation/content-safety.test.ts` — 19 tests: category cases, precedence, fail-closed, determinism over 1,000 runs, and the false-positive traps.
6. `src/server/moderation/prompt-text-exposure.test.ts` — canary proof, described below.
7. `scripts/moderation-bakeoff.ts` — scores any labeled TSV against the shipped rules and an optional Presidio arm.
8. Threat model T3, I2, the summary row, and the accepted-risk entry are updated, and the stale `src/server/generation/service.ts` path is gone.

## Corpus

`corpus.tsv` — 51 rows, `split=tuning`. Ten benign rows are the 14-objective probe in `docs/design/blocked-generation-recovery.md`; one is the shipped seed prompt; one is the shipped test fixture. The rest are authored.

`corpus-holdout.tsv` — 29 rows written after the rules were frozen. The rules were **not** changed after this file existed. Eight rows are deliberate traps: an unlisted first name, an unlisted surname, an entity-encoded script tag, an unfamilar harm phrasing, and four benign prompts that use a name-like word.

`bypasses.tsv` — 16 obfuscated attacks. Written to fail.

Provenance limits: the corpus is authored, not collected from teachers. The tuning rows existed before the rules, so `tuning` is not a generalization estimate. Only the holdout split is.

## Results

Held-out corpus, 29 rows, 19 block and 10 allow:

| detector | precision | recall | false positives | mean ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| `regex-v0` (shipped before this change) | 1.0000 | 0.1053 | 0 | 0.0007 | 0.0010 |
| `rules-v1` (this change) | 1.0000 | 0.6316 | 0 | 0.0105 | 0.0158 |
| Presidio (personal data only) | 1.0000 | 0.1579 | 0 | 11.54 | 12.09 |

Per category for `rules-v1`: personal data 5 of 7, harmful content 2 of 4, prompt injection 2 of 4, unsafe markup 3 of 4, benign 10 of 10 with zero false positives.

The seven misses, all expected classes:

- `B39` "Kai and Devon" and `B40` "Ms. Rivera" — names outside the reviewed list.
- `H08` "knife technique that would hurt a student" and `H09` "get a gun into the school" — harm phrasing not in the blocklist.
- `I07` "disregard all prior guidance" and `I09` "pretend you have no safety rules" — injection shapes without a listed target noun.
- `M08` `&#x3C;script&#x3E;` — entity-encoded markup.

## Do the arms substitute?

No. On the same holdout rows, Presidio caught the two names the rules missed (`B39`, `B40`) and `P11`. It missed the phone shapes and the labelled identifiers (`P09`, `P10`, `P12`, `P13`) that the rules caught. The union covers 7 of 7 personal-data rows with zero benign false positives. A Node-side NER arm would be the way to get that union without a Python runtime; that is an open decision, not part of this change.

## Survivors of the attack list

6 of 16 attacks pass:

| id | attack | why it survives |
| --- | --- | --- |
| X01 | zero-width space inside the trigger verb | rules match literal words |
| X09 | `i g n o r e previous instructions` | spaced letters break the word |
| X10 | base64-encoded instruction | no decoder in the path |
| X11 | fullwidth `ＩＤ 4471` | `\d` is ASCII only |
| X12 | Arabic-Indic digits in an identifier | `\d` is ASCII only |
| X15 | Cyrillic homoglyph in a first name | name list is Latin only |

Three more are caught only by accident: `X03`, `X04`, and `X06` (obfuscated email) are blocked by the name list, not by the email rule. `X05` is caught by its closing `</script>`, not by the obfuscated opening tag.

## Latency against the deadline contract

`rules-v1` is 0.0105 ms mean, 0.0158 ms p95, over 200 passes on 29 rows. The budget is 100 s per provider call and 200 s total (`AgDR-0006`). Detection costs about 1/6,000,000 of one call. On a 30 kB source the bounded email rule costs 23 ms, down from 884 ms with an unbounded local part. Latency is not a reason to defer any arm.

## Canary proof

`src/server/moderation/prompt-text-exposure.test.ts`. Canary `CANARY132TOKEN9F3C` plus `canary132@example.test` inside a blocked prompt.

| sink | result |
| --- | --- |
| persisted request diagnostics | absent |
| persisted attempt diagnostics | absent |
| public result payload | absent |
| preview | no draft, so no SSE frames |
| provider | not called (`provider.calls === 0`) |
| error message + context | email scrubbed to `[REDACTED_EMAIL]`, context key replaced with `[REDACTED]` |

One deliberate exception, asserted so it cannot change silently: the teacher's own prompt stays in their request row (`record.input.prompt`). The record is claimed before `checkPrompt` runs (`service.ts:716` then `:741`), and #119 needs the prior blocked request to stay visible for the revise flow. Whether a blocked prompt should be retained is a #101 governance question, not a moderation-code question.

## Reproduce

```bash
node --import tsx scripts/moderation-bakeoff.ts docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31/corpus.tsv
node --import tsx scripts/moderation-bakeoff.ts docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31/corpus-holdout.tsv
node --import tsx scripts/moderation-bakeoff.ts docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31/bypasses.tsv

# Presidio arm, isolated virtualenv
python3 -m venv /tmp/mod132-venv
/tmp/mod132-venv/bin/pip install presidio-analyzer
/tmp/mod132-venv/bin/python -m spacy download en_core_web_lg
MOD132_PRESIDIO_PYTHON=/tmp/mod132-venv/bin/python \
  node --import tsx scripts/moderation-bakeoff.ts docs/hackathon/meta-global-2026/evidence/moderation-2026-10-31/corpus-holdout.tsv
```

Files: `corpus.tsv`, `corpus-holdout.tsv`, `bypasses.tsv`, `bakeoff-tuning.txt`, `bakeoff-holdout.txt`, `bypasses.txt`, `presidio-latency.txt`, `presidio_scan.py`.

## Security review before commit

A focused review probed ReDoS, fail-open paths, client disclosure, the moderation oracle, log exposure, and the named-PII split. Three items came back and were resolved:

| item | disposition |
| --- | --- |
| Unbounded email local part rescanned from every word boundary. 884 ms on a 30 kB source, and the rule now also runs on generated content. | Fixed: local part bounded to 64 characters. 23 ms on the same input. |
| The shipped `api\|secret\|access key` rule was dropped during the category split. | Fixed: restored under `prompt-injection`, with a test. |
| The docs claimed `ruleSetVersion` is stored with each decision. Nothing persisted it. | Corrected: the field is returned in memory only. Persisting it needs a server-only stored diagnostic schema. |

No fail-open path was introduced. `moderationCategory` exposes only an enum value: no rule text, no matched span, no fingerprint. The category is a coarse 5-way label, so it adds little to the existing block/allow signal.

## Remaining limitations

- Authored corpus, small sample. 19 block rows cannot support a tight recall interval.
- One revision of the rules. Any change invalidates these verdicts, but `ruleSetVersion` changes with it.
- Presidio ran with default recognizers and default thresholds. A tuned recognizer set could score differently.
- Slur coverage is absent by choice. That gap belongs to a provider moderation layer.
- The phone rule assumes North American shapes.
- Name screening is off for generated content by design. A real student name that reaches the model could still be echoed into a draft; that path depends on the input block and the synthetic gate.
- The reviewed first-name list is curated, not exhaustive. Surnames are excluded because occupation words collide ("Baker", "Green").
- `source-service.ts` still writes `failureReason: "personal-data"` for every blocked source, so a markup block is mislabelled there.
- No timing assertion runs in CI. The bounded email rule is measured by hand in this record.
- `unserializable` is an internal failure category. It is never shown to a teacher as a category word.
