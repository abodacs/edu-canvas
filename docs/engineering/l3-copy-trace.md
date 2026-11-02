# L3 copy trace: carry, reveal, and next activity

Evidence for #176, #7, and the #134 edge review. The trace starts from the learner-visible sentences, not from a schema diff. The code that follows this document is checked by `pnpm check` and the focused tests named in the last column.

## Design synthesis

Three storage shapes were drawn before any code, per the architect discipline (caller's usage first, then types):

| Candidate | Shape | Rejected because |
| --- | --- | --- |
| Fat sections | Widen `sectionSchema` with feedback, hints, metadata; map path copy onto sections | Path copy has no section. Four copies of `rationale` drift. Widening the learner section schema ships feedback before submit. |
| Version-level block (base) | One `approved_copy` jsonb column: path copy once, variant copy keyed by `variantId` | Chosen. One owner per field, no client widening, the student projection stays field-by-field. |
| Normalized child record | A `lesson_copy` table keyed by version | More DDL and a second writer for copy that is only ever read with its version. |

Red-flag screen: the base has no split ownership (the bridge is still the only writer of the version), no importable internals (the learner section projection constructs field by field), and no hand-synced list (the carry table's "test" column names the file that fails). The arena fan-out could not run: all three subagent runners failed with provider `Insufficient Balance`, so the candidates were drawn and screened sequentially by one agent and the cross-judge was skipped.

## Placement decision

Approved learner copy is stored once per lesson version in `lesson_versions.approved_copy` (nullable `jsonb`, migration `drizzle/0014_flashy_goblin_queen.sql`). It is not duplicated into every section:

- `rationale` is path-level copy. Copying it onto four sections makes four copies that can drift.
- Feedback and column labels are variant-level. They are keyed by `variantId` inside the same version-level block, not repeated per section.
- A v1 row reads as `approvedCopy: null`; the learner still opens the lesson, but the reveal degrades to pairs and labels without feedback or connection. The next revision re-publishes with copy. The reader is tolerant, not a backfill.

`projectionVersion` is `lesson-package-public-v2`. A v1 row keeps its stored value in `ruleVersions`; the bridge writes v2 from now on.

## Carry table

| Learner-visible sentence | Stored source | Projection key | Consumer | Test |
| --- | --- | --- | --- | --- |
| Variant feedback, correct | `variant.feedback.correct` | `approvedCopy.variants[].feedback.correct` | `reveal.feedback` after submit | `learner/reveal.test.ts`, `learner/service.test.ts` |
| Variant feedback, incorrect | `variant.feedback.incorrect` | `approvedCopy.variants[].feedback.incorrect` | `reveal.feedback` after submit | `learner/reveal.test.ts`, `learner/service.test.ts` |
| Connection explanation | `learningPath.rationale` | `approvedCopy.path.rationale` | `reveal.connection` after submit | `learner/reveal.test.ts`, `learner/service.test.ts` |
| Source column heading | `variant.accessibilityMetadata.sourceGroupLabel` | `approvedCopy.variants[].columns.sourceLabel` | `lesson.columns.sourceLabel` | `publication/record-bridge.test.ts`, `shared/learner-contract.test.ts` |
| Target column heading | `variant.accessibilityMetadata.targetGroupLabel` | `approvedCopy.variants[].columns.targetLabel` | `lesson.columns.targetLabel` | `publication/record-bridge.test.ts`, `shared/learner-contract.test.ts` |
| Assigned variant to section | `variant.id` | `sections[].variantId` | `lesson.assignedSectionId` | `publication/record-bridge.test.ts`, `records/projections` test |
| Activity choice | stored variant references | `nextActivity.activityId` | next-activity card | `learner/decision.test.ts`, `learner/service.test.ts` |
| Reason | checked-in rule table | `nextActivity.reason` | next-activity card | `learner/decision.test.ts`, `learner/service.test.ts` |

Deferred, with a consumer still absent:

| Not carried | Why | Revisit |
| --- | --- | --- |
| `hints` | no hint route exists; hints stay server-side | the hint route |
| `languageMetadata.direction`/`locale` | the contract carries one `language` at version level | bilingual delivery |
| `learningPath.screenPurpose` / `nextScreenRationale` | no learner surface consumes path copy beyond the rationale | #8/#107 teacher evidence |
| `distractorItems` labels as answers | distractors already ship as items; they are never answers | never |

## Reveal samples

Every learner-visible sentence is marked with its stored field. Labels are item labels from `sections[].items`; the report never invents a target.

### Correct

```text
Your check
1/2 to 2/4        Correct            <- submitted pair + private relationship
2/3 to 4/6        Correct            <- submitted pair + private relationship
Yes. Both names describe the same part.   <- approvedCopy.variants[].feedback.correct
equal parts keep the same value ...       <- approvedCopy.path.rationale
What next
You need more independent practice.       <- nextActivity.reason
A second approved activity is ready.      <- nextActivity.activityId (not shown as an answer)
```

### Partial

```text
Your check
2/3 to 4/6        Correct            <- submitted pair
Still to match: 1/2                  <- unresolved source label, no target
Not yet. Multiply both parts by the same number.  <- approvedCopy...incorrect
```

### Distractor only

```text
Your check
1/2 to 3/4        Not yet            <- submitted pair judged against the private answer
Still to match: 1/2, 2/3             <- unresolved sources
Not yet. Multiply both parts by the same number.
```

### Assisted

```text
Your check
1/2 to 2/4        Correct            <- submitted pair
Yes. Both names describe the same part.
What next
You need another supported example.  <- assisted evidence, rule row independent-not-correct
```

The assisted case uses the first response's assistance state, not the retry's. A later unassisted retry does not rewrite the stored decision.

## Next-activity sample

```text
What next
The learner needs more independent practice.   <- nextActivity.reason
Your next approved activity is ready.          <- nextActivity.activityId is non-null
```

A pause renders no activity: `activityId` is `null` and the rule version and evidence hash still identify the decision.

## #134 edge review

#134 owns the eight Description practices (DS1-DS8) in `docs/product/teacher-practice-assessment.md`. Read against that table:

- DS1 audience, DS2 format, DS3 tone, DS4 planning, DS5 revision, DS6 exemplars, DS7 interaction, DS8 boundaries are all authoring/teacher-turn cases. None submits a learner matching attempt, so none reads the reveal.
- DS2's "never expose a learner answer key" is satisfied by the narrow learner projection and by keeping reveal behind a submission. It does not need #7's reveal surface.
- The nearest interaction is DS8's "do not draft yet", which tests a stop before generation, not feedback after a matching attempt.

**Conclusion: no DS1-DS8 case needs #7's reveal. #134 does not wait for #7.** The graph edge `#7 -> #134` is not inherited. #134 can start in parallel; the only shared dependency is the learner attempt record, which already exists from #6.

## What the tests prove

- `record-bridge.test.ts` pins every section key and asserts the exact `approvedCopy` shape, including that no hint crosses.
- `referents.test.ts` fails when a new identifier field is added without a scope descriptor.
- `learner/service.test.ts` proves a stored row returns the approved feedback, a stable decision across retries, and no answer key before submit.
- `learner/decision.test.ts` proves a mutated rule row changes the digest and that the assigned activity is never proposed again.
- `learner/reveal.test.ts` proves a distractor-only result renders incorrect and that the connection is a slice of the stored rationale.
- `components/learn/learn-surfaces.test.ts` renders the surfaces to markup: a distractor-only submission shows the incorrect report, the pause card names no activity, and the answer the learner never submitted never appears.

## Open decisions carried forward

1. **Learner section shape** - kept narrow. Feedback crosses only in the attempt response, never in the lesson read.
2. **Existing v1 rows** - tolerant reader. `approvedCopy` reads as `null` and a legacy `{ targetId }` next activity reads as no decision. Re-publish on the next revision.
3. **Path-copy home** - version-level `approved_copy` jsonb.
4. **Carry set** - traced minimum above; hints and path screen copy are declared deferred, and the bridge test still pins the section key list.
5. **Hints before a hint route** - server-side only.
6. **PR split** - #176 and #7 stay in one branch only because the decision needs the approved copy; split at merge if the reviewer prefers.
7. **#134** - does not wait for #7. Start it in parallel.

Known limitation: the `guided-assisted` and `ready-for-challenge` rule rows do not fire in production yet because a run stores one stage and no guided response. They are covered by the unit corpus so the table is executable, and they become live when #116 persists guided evidence. Until then a correct first response recommends another standard activity.
