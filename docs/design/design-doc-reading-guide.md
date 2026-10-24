# Read and maintain the design documents

Use this guide when you return to the design after an interruption. The design assumes familiarity with TypeScript and HTTP. It explains the product terms used in the contracts.

## Start with one task

1. Read the scope in [One Useful Loop](design-doc.md).
2. Select one unit from the [implementation order](design-doc-implementation.md#implementation-order-and-exit-checks).
3. Read that unit's contracts and acceptance checks.
4. Record the current unit and the next observable result.

Keep one work unit active. Use stable IDs such as U3 or AC08 in notes. Short sections and explicit checkpoints support interrupted reading; they are not a medical intervention.

## Use one term for each concept

| Term | Meaning in this design |
| --- | --- |
| Grounding | Reference material supplied to generation from identified sources |
| Standard | The learning target, initially Common Core `4.NF.A.1` |
| Required skill | A skill the lesson must teach for the selected target |
| Prerequisite | Knowledge the learner needs before the lesson |
| Snapshot | A stored copy of source data at one time |
| Provenance | Identifiers and versions that show where content came from |
| Package | The complete teacher-reviewed lesson sequence |
| Variant | A standard, scaffold, or challenge activity option |
| Stage | One step in the learner sequence |
| Projection | The permitted fields sent to a specific audience |
| Publication | Teacher approval of one exact lesson version |
| Attempt | One saved learner response and its server result |
| Idempotency key | An operation identifier that prevents duplicate work |
| Lease | A time limit on ownership of a generation attempt |
| A2UI catalog | The named set of permitted display components and actions |
| SSE | Server-sent events that carry preview updates to the browser |
| Native confidence | Jev's distribution-based confidence value; not measured task accuracy |
| p95 | The duration at or below which 95 percent of the measured durations fall |
| Fixture | Fixed test data, visibly separate from live provider output |
| Gate | A required condition before a specific action |

## Apply Simplified Technical English rules

The writing target is ASD-STE100 Issue 9. Use the [official specification](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf) for formal language review.

Apply these rules to new prose:

- Give one instruction or fact per sentence.
- Keep instructions within 20 words and descriptions within 25 words.
- Name the actor. Use active voice for instructions.
- Use consistent technical terms and define them before dense explanations.
- State the condition before its action.
- Keep paragraphs short. Give each numbered step one main action.
- Keep exact code identifiers, UI labels, and protocol names unchanged.

Use approved words with their approved meaning and part of speech. Technical terms do not permit arbitrary synonyms. The [official FAQ](https://www.asd-ste100.org/faq.html) explains dictionary use and technical vocabulary.

**Review limit:** this revision applies STE sentence and structure rules with a software glossary. It has not received a complete dictionary and part-of-speech audit. Do not label it fully ASD-STE100 compliant until that audit is complete.

## Apply the requested writing skill

The [Refactoring English skill](../research/README.md#local-reference-materials) supplies the structure. Chapters 5 and 19 support small explanations, reader-first ordering, explicit scope, and separate decision history.

## Keep decisions separate from evidence

A design choice states required future behavior. A code observation states what the inspected source contains. A passing check states what a recorded execution demonstrated.

Keep those three states separate. Date external evidence. Name the remaining action when a dependency is untested. Update the decision record when a later owner decision changes the design.
