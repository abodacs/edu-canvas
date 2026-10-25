# One Useful Loop: implementation contracts

Use this document to build the feature described in the [design overview](design-doc.md). Each contract below is a required implementation result. A proposed path names a new file; it does not claim that the file exists.

**Status:** design specified on 2026-10-24. Application changes, service probes, and acceptance checks remain pending. The [UI implementation gate](../product/teacher-ui.md#implementation-gate) applies before build work.

## Existing code and required changes

This inventory comes from local source inspection. Repeat the inventory on the selected implementation checkout before changing files.

| Existing file | Observed behavior | Required change |
| --- | --- | --- |
| [provider.ts](../../src/server/generation/provider.ts) | Fixture and OpenAI providers; four matching variants | Add a Meta adapter and a versioned source-grounded request |
| [factory.ts](../../src/server/generation/factory.ts) | Chooses fixture or OpenAI | Select the proven provider explicitly; separate fixture mode from live mode |
| [types.ts](../../src/server/generation/types.ts) | Generation records; 30-second claim lease | Add source/version references and bounded operation timing |
| [service.ts](../../src/server/generation/service.ts) | Generation claims, validation, one correction | Preserve ownership checks across the expanded workflow |
| [generation-contract.ts](../../src/shared/generation-contract.ts) | Public draft has exactly four variants | Add a versioned package contract and distinct learner projection |
| [projection.ts](../../src/server/generation/projection.ts) | Removes matching relationships | Separate teacher review from learner responses and feedback |
| [a2ui-contract.ts](../../src/shared/a2ui-contract.ts) | `matching-v1`; no math or fraction diagram | Add a new catalog with typed components and actions |
| [compiler.ts](../../src/server/a2ui/compiler.ts) | Compiles the current preview | Compile validated package data into the new catalog |
| [server-function.ts](../../src/server/demo/server-function.ts) | Browser supplies a demo role | Require a protected server session for mutation endpoints |
| [persistence.ts](../../src/server/persistence.ts) | Seeded and Postgres generation stores | Add package, publication, attempt, and decision persistence |
| [schema.ts](../../drizzle/schema.ts) | Existing foundation and generation tables | Extend through additive migrations and adapter changes |
| [package.json](../../package.json) | `check` and separate database test command | Run both during implementation verification |

The present `ProviderLessonDraft` has no `concepts` field. Add concept identifiers to the new package contract. Inspect existing activity tables before selecting storage columns. Reuse compatible tables rather than creating a second activity system.

## Define records before wiring providers

Use universally unique identifiers, or UUIDs, for new record identifiers. Use UTC timestamps in ISO 8601 format. Scope every record lookup by tenant and the authenticated actor's permitted resources.

All new JSON schemas reject unknown properties. Keep private schemas in server modules. Public schemas contain only fields needed by their audience.

| Record | Required fields and constraints |
| --- | --- |
| `SourceSnapshot` | `id`, `tenantId`, `teacherId`, `mode`, `standardId`, `requiredSkills`, `prerequisites`, `sources`, `gaps`, `createdAt`, `contentHash` |
| Source entry | `sourceId`, `title`, `url` or upload locator, `providerVersion` or null, `retrievedAt`, `contentHash`, bounded text |
| `MatchDecision` | `id`, `snapshotId`, objective hash, candidate IDs, selected ID, native confidence or null, model/evaluation versions, decision reason |
| `LessonPackageVersion` | `id`, `packageId`, `parentVersionId` or null, revision number, `schemaVersion`, `snapshotId`, `matchDecisionId`, `conceptIds`, sections, variant references, provenance |
| `Publication` | Package version, teacher ID, approval time, content hash, validation-result hash, rule versions |
| `Assignment` | Tenant, learner ID, publication ID, assigning teacher, creation time |
| `LearnerRun` | Learner ID, publication ID, assigned variant, stage, first-response status, server-recorded hint events |
| `Attempt` | Run, item, publication, selected pairs, assistance state, ordinal, prior-attempt ID or null, score, correctness, rule version, timestamp |
| `TeacherDecision` | Run, evidence hash, proposal, chosen action, approved target or null, teacher ID, timestamp |

The source mode is `learning-commons` or `upload`. Gap codes distinguish missing prerequisites, extraction faults, and unverified external alignment. Empty required skills block generation in both modes.

A source snapshot never changes after generation starts. A source correction creates a new snapshot. A lesson version, publication, attempt, and teacher decision are immutable after creation.

Store private answer relationships separately from public section data. A public lesson version identifier can reference the private key only on the server.

## Resolve sources and objective matches

Use a server-side REST adapter for Learning Commons. The [official API overview](https://docs.learningcommons.org/api-reference/overview) documents standards, learning components, prerequisite queries, and API-key access.

Proposed adapter location: `src/server/grounding/learning-commons.ts`. The adapter returns a normalized `SourceSnapshot`, not a provider response object.

### Learning Commons request sequence

1. Resolve the exact Common Core `4.NF.A.1` record and its authoritative description.
2. Retrieve its required learning components.
3. Retrieve its immediate prerequisites.
4. Save identifiers, links, retrieval times, and available versions.
5. Calculate a hash of the normalized snapshot.
6. Classify missing fields before offering generation.

Use only the configured provider origin. Do not fetch arbitrary URLs from provider responses or uploads. Display safe source links as references.

| Source result | Application response |
| --- | --- |
| Standard and required skills available | Continue to objective matching |
| Only prerequisites missing | Continue with a visible prerequisite-gap warning |
| Standard or required skills missing | Offer one retry |
| Retry still lacks required data | Offer upload recovery |
| Response invalid or timed out | Apply the same retry/upload sequence |

The retry count belongs to one source-resolution request. Repeated clicks with the same operation key reuse the result. A changed objective starts a new request subject to usage limits.

### Jev decision contract

The supported candidate set contains `4.NF.A.1` and an `unsupported-or-unclear` choice. Pass the authoritative standard description and required skills with the teacher objective.

The [TypeSafe confidence documentation](https://docs.typesafe.ai/confidence) distinguishes native confidence from the selected option's probability. Store the native `confidence` field. Reject missing, non-finite, or out-of-range values.

| Condition | Result |
| --- | --- |
| Unsupported/unclear selected | Ask the teacher to clarify the objective |
| Supported, confidence greater than 0.90, evaluation passed | Continue without match confirmation |
| Supported, confidence at or below 0.90 | Ask the teacher to confirm the displayed standard |
| Evaluation pending or failed | Require confirmation for every supported match |
| Jev fails, grounding exists | Offer manual confirmation of the displayed standard |
| Grounding absent | Complete source recovery before matching |

Bind every match to the objective hash and source snapshot. A changed objective or source invalidates the match.

Manual confirmation cannot add a standard outside this release. Upload mode requires manual confirmation and never claims a Learning Commons match.

### Evaluate the threshold before enabling automation

Create 40 teacher-reviewed objective cases before tuning the matching prompt. Reserve 20 cases for development and 20 for a held-out check.

Each set contains ten supported objectives, five ambiguous objectives, and five unsupported objectives. Include fraction terminology without equivalent-fraction intent. Record the intended standard or clarification result for every case.

Enable automatic matching only when all these conditions hold:

- The held-out set contains zero incorrect automatic matches.
- Every ambiguous or unsupported case reaches clarification or confirmation.
- At least five supported held-out cases take the correct automatic path.
- Contract checks pass for confidence 0.89, 0.90, and 0.91.
- Contract checks pass for timeout, invalid confidence, and unknown candidate IDs.

This small evaluation is a release check, not proof of general accuracy. Pin candidate definitions, model version, prompt version, and evaluation version. A change to any pin disables automation until reevaluation.

## Accept uploads with explicit limits

Proposed module: `src/server/grounding/uploads.ts`. Permit one PDF, TXT, or Markdown file per request. Require a protected teacher session and a synthetic-material confirmation.

| Limit | Design default |
| --- | --- |
| File size | At most 5 MiB |
| PDF length | At most 20 pages |
| Extracted text | At most 30,000 Unicode characters |
| Extraction time | At most 10 seconds |
| Extraction memory | At most 128 MiB in a separate worker |
| Temporary file | Delete after extraction, failure, or cancellation |
| Unused source text | Delete after 24 hours |
| Used source text and demo records | Delete 7 days after the event closes |

These are application limits, not measured provider limits. Reject oversized inputs before parsing. Verify file signatures and text encoding. Reject encrypted PDFs, archives, embedded executables, and unsupported formats.

Do not silently truncate text. Record page-level extraction results. Scanned pages, missing text, broken math, or parser faults produce an incomplete-source state.

Incomplete extraction stops generation. Show the affected page or text span. Offer replacement text or another TXT/Markdown file. A teacher must review the corrected extraction before generation resumes.

The upload fallback does not depend on Learning Commons returning. Display `4.NF.A.1` as the teacher-selected target. Require the teacher to confirm the objective and explicit required-skill descriptions from the uploaded text. Label external alignment as unverified. An unrelated upload requires a replacement source.

Uploads supply reference context for original generation. They do not grant publisher access or enable verbatim publisher-lesson adaptation.

Store source text privately with tenant restrictions. Run expiry deletion on application startup and hourly. Delete dependent demo records together after the event retention period. Record provider-side retention separately before live use; application deletion does not delete provider copies.

## Generate a versioned lesson package

Proposed schema: `lesson-package-v2`. Keep the existing four matching variants: two standard, one scaffold, and one challenge.

Add a separate ordered sequence: `worked-example`, `guided-practice`, `independent-check`, and `follow-up`. Each section has a stable ID, content, concept IDs, dependency IDs, and applicable variant references.

The package has two or three concept IDs. The initial concepts are equal-sized wholes, equal parts, and equivalent names. Resolve concept IDs against the source snapshot or an explicitly reviewed local mapping. Keep external source IDs distinct from existing local graph-node IDs.

Select two standard variants for guided and independent matching. Use the scaffold and challenge variants as approved follow-up options. An independent variant must pass the fresh-item rule below.

Each section contains typed data rather than executable markup:

| Section | Required data |
| --- | --- |
| Worked example | Ordered explanation steps, fraction values, accessible diagram description |
| Guided practice | Fraction-diagram limits, question, ordered hints, matching item reference |
| Independent check | Fresh item reference, response instructions, feedback references |
| Follow-up | Approved scaffold and challenge references, teacher-readable reasons |

Feedback branches belong to the package version. The server reveals only the branch permitted by the learner's saved result. Teacher preview can simulate every branch without exposing private answer relationships.

Extend `LessonDraftProvider` with a server-resolved source snapshot and explicit schema version. Load the snapshot from storage; do not trust browser-supplied source contents. The model returns canonical lesson JSON. Server validation remains authoritative even if the provider supports structured output.

Validate fraction equality with integer arithmetic. For fractions `a/b` and `c/d`, equality requires `a*d = c*b` with nonzero denominators. Validate equal-sized wholes, item references, unique identifiers, source alignment, and the complete teaching sequence.

An independent item must differ from the worked and guided examples. Keep a retry of the same item separate from a fresh independent item. A repeated item cannot provide fresh independent evidence.

## Bound provider calls and preserve request ownership

Source resolution completes before the generation claim begins. The existing generation lease is 30 seconds.

| Operation | Deadline | Retry rule |
| --- | --- | --- |
| Learning Commons sequence | 10 seconds total | One teacher-requested retry |
| Jev match | 5 seconds | Manual confirmation after failure |
| Upload extraction | 10 seconds | Correct or replace the file |
| Model generation and correction | 25 seconds total | At most one correction for invalid output |
| One model call | 10 seconds | No hidden transport retry |

Reserve the remaining generation time for validation and persistence. Abort calls at their deadlines. Preserve the original lease ownership check before every write. Reject late responses after expiry or after another attempt acquires ownership.

A model timeout or rate limit offers an explicit retry. A correction applies only to invalid draft output. A moderation block requires a revised request. A teacher retry has a new operation key and links to the failed request.

Persist the normalized request hash with each operation key. The same key and same request return the original result. The same key with a different request returns `IDEMPOTENCY_CONFLICT`. This strengthens the current generation lookup, which returns an existing record before comparing the new payload.

For a live demonstration, record the proven Meta provider and model identifier in configuration and provenance. Until V1/V3 establish eligibility and access, no exact model is asserted to work.

## Render only application-owned components

Proposed catalog name: `fractions-v2`. Retain A2UI protocol `v0.9.1`. Introduce the new catalog explicitly; do not widen `matching-v1` silently.

Add `MathText` and `FractionDiagram` to the reviewed component set. Existing layout, text, matching, status, and button components remain bounded.

`MathText` accepts at most 500 characters of LaTeX. Disable HTML commands, external resources, and untrusted macros. Invalid math shows a diagnostic and blocks publication until corrected.

`FractionDiagram` accepts integer numerators from zero through the denominator. Denominators range from 1 through 12. Each compared whole has the same displayed size. Provide labeled keyboard controls and an accessible text equivalent.

Add typed `setFractionValue` and `advanceStage` actions. Validate run, section, item, permitted range, and publication on the server. Keep UI-only selection changes local; persist hints, submissions, and stage changes on the server.

Use teacher-only ordinary UI for source links and revision controls. Do not pass arbitrary source URLs or provider metadata through learner A2UI messages.

A learner request receives the current stage and permitted feedback only. It does not receive future check answers, private mappings, or all feedback branches before submission.

## Publish exact versions and preserve section edits

Use these package states: `draft`, `validating`, `reviewable`, `blocked`, and `published`.

| Event | Required transition |
| --- | --- |
| Complete generation | `draft` to `validating` |
| All blocking checks pass | `validating` to `reviewable` |
| A blocking check fails | `validating` to `blocked` |
| Teacher approves current hash and revision | `reviewable` to `published` |
| Teacher requests a revision | Create a new `draft`; preserve the old version |

A published version never returns to draft. Existing learner runs stay on their original publication. A new assignment uses the explicitly selected published version.

A section revision supplies `baseVersionId`, `sectionId`, and instructions. Copy all other section data without regeneration. Compare preserved-section hashes before saving. Reject changes outside the selected section.

Validate the entire new package after replacement. Changed concepts, fraction values, or item references can invalidate dependent sections. Show the affected sections and block publication until the teacher resolves each blocking diagnostic.

Approval supplies the expected revision and content hash. Revalidate required conditions inside the publication transaction. Concurrent revision or approval returns `STALE_VERSION`; it cannot approve unseen content.

## Grade responses and propose bounded follow-up

Use the formula in [AgDR-0002](../agdr/AgDR-0002-server-authoritative-grading.md):

`score = correctPairs / (requiredPairs + incorrectPairs) * 100`

Reject unknown item IDs, duplicate pairs, and multiple targets for one source. Unmatched sources remain incorrect through the denominator. Require at least one required pair in the validated key. `isCorrect` is true only for the exact complete set of required pairs.

Ignore a legacy client `score` field. Never let client data set correctness, assistance state, or result totals. Determine hint use from saved server events. Preserve hint status through reloads and retries. Reject hint requests during the first independent response. After submission, feedback and retries cannot change that response into unassisted success.

Store score inputs as integers and derive the percentage. Round only the displayed percentage to one decimal place.

| Evidence, in priority order | Proposed action | Reason shown to teacher |
| --- | --- | --- |
| Independent response incomplete | Pause | Independent evidence is missing |
| Independent first response incorrect or assisted | Approved scaffold | The learner needs another supported example |
| Independent first response correct without help; guided practice needed help | Approved standard activity | The learner needs more independent practice |
| Independent first response correct without help; guided practice independent | Approved challenge | The learner can try a harder approved item |

Retries never change the first-response classification. Missing approved follow-up content produces `pause`. Proposals record their evidence hash and rule version.

The teacher can accept, pause, or choose another approved activity in the same tenant and scope. A stale evidence hash requires the teacher to review the current proposal. The application makes no mastery claim.

## Expose commands with consistent errors

Use TanStack server functions for ordinary commands. Keep the existing SSE preview route for validated rendering messages. Function names below are proposed contracts, not existing APIs.

Every mutation requires a server session, an operation key, and tenant authorization. State-changing browser requests require same-origin checks and cross-site request forgery protection. The server supplies actor identity.

| Command | Input beyond the common fields | Successful output |
| --- | --- | --- |
| `resolveSources` | Objective, fixed target, retry reference or upload reference | Snapshot or recovery state |
| `confirmMatch` | Match decision ID, accepted target | Confirmed match ID |
| `generatePackage` | Snapshot ID, confirmed/automatic match ID | Generation request ID and state |
| `reviseSection` | Base version, section ID, instructions | New version ID and diagnostics |
| `approvePackage` | Version, expected revision, content hash | Publication ID |
| `assignPublication` | Publication ID and authorized learner ID | Assignment ID |
| `startLearnerRun` | Assignment ID | Run ID and initial stage |
| `requestHint` | Run and item | Permitted hint and saved assistance state |
| `submitAttempt` | Run, item, selected pairs, prior-attempt ID if retry | Saved attempt, score, feedback, proposal |
| `chooseFollowUp` | Run, evidence hash, chosen action, target if applicable | Saved teacher decision |

Read functions return authorized request status, teacher review, or the current learner stage. On SSE disconnect, reload request status. Reopening a preview never starts another generation.

Error responses contain a code, safe message, retry instruction, and request ID. They contain no raw provider body.

| Error | HTTP equivalent | Recovery |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | Correct the named field |
| `UNAUTHENTICATED` / `FORBIDDEN` | 401 / 403 | Restore authorized access |
| `NOT_FOUND` | 404 | Use an accessible resource |
| `STALE_VERSION` / `IDEMPOTENCY_CONFLICT` | 409 | Reload or use a new operation key |
| `SOURCE_INCOMPLETE` / `VALIDATION_BLOCKED` | 422 | Correct the source or lesson |
| `RATE_LIMITED` | 429 | Wait for the stated retry interval |
| `PROVIDER_UNAVAILABLE` | 503 | Use the specified retry or recovery path |

Protect attempt insertion with a unique run/item/ordinal constraint. Allocate the ordinal in a transaction. Duplicate submissions return the same attempt. Save the grade and attempt together; a database failure cannot produce a success response.

## Apply access limits and safe release changes

Use separate teacher and learner invitation credentials for the synthetic demo. Exchange each credential for a signed, HttpOnly, Secure, SameSite session cookie. Never embed invitation credentials in client bundles or repository files.

Store generation quota counters in Postgres. Permit at most 10 generation attempts per teacher per hour and 100 per tenant per day. Count corrections against the provider-call budget. Stop all generation at 200 provider calls per tenant per day.

Use process-local limits for request bursts: at most 30 authoring requests per session per minute. Permit at most one active generation per teacher. Return a retry interval for rejected requests. These defaults bound milestone use; measure costs before changing them. Production requires shared, database-backed limit state before horizontal scale — process-local counters cannot serve more than one instance ([AgDR-0007](../agdr/AgDR-0007-demo-access-and-deployment.md)).

Add forward-only migrations. Preserve existing version identifiers and the `matching-v1` reader. Give legacy records an explicit legacy schema version. Do not infer new approval or source provenance for old records.

Deploy the new readers before enabling new writes. Keep the feature disabled until acceptance checks pass. For rollback, disable new generation and assignments while preserving saved versions and attempts. Restore the previous application image only if it can read existing data. Never roll back by deleting attempt records.

## Implementation order and exit checks

Estimates are planning judgments from this checkout, not measured delivery promises. They include focused verification for each unit. They exclude credential waits and teacher recruitment delays.

| Unit | Depends on | Work and visible exit check | Human hours |
| --- | --- | --- | --- |
| U0 | Approval and supplied skills | Fresh-base inventory, skills mapped, source/model access measured, capacity decision recorded | 3–5 |
| U1 | U0 | Versioned schemas and additive storage; restart preserves records | 4–6 |
| U2 | U1 | Learning Commons, Jev, and upload recovery; source panel shows every gap | 6–10 |
| U3 | U2 | Meta draft reaches full validation and preview; deadlines and correction bounds hold | 4–6 |
| U4 | U3 | Fraction controls, rendered math, stage progression, and keyboard path work | 5–8 |
| U5 | U4 | Selected-section revision preserves other sections; stale approval fails | 4–6 |
| U6 | U5 | Server grading, immutable attempts, and teacher follow-up work after reload | 5–8 |
| U7 | U6 | Protected hosting, database checks, recovery rehearsals, and demo evidence pass | 5–8 |
| Total |  | Full agreed feature set | 36–57 |

The lower estimate exceeds the 30-hour budget by 6 hours. No feature is silently removed. Abdullah must reconcile capacity, delivery timing, or explicit scope before committing to the old sprint dates.

Start each work session from one unit and its exit check. Record the current unit, last passing check, and next failing case when stopping.

## Verify observable behavior before release

All checks below are pending. Attach the commit, environment, fixture version, command, and result to each evidence record. Read Abdullah's supplied verification skills before implementation; add their checks to this list.

| ID | Trigger | Expected result |
| --- | --- | --- |
| AC01 | Valid source lookup; missing prerequisites | Source panel shows standard and skills; prerequisite gap remains visible |
| AC02 | Required source missing twice | One retry is offered, then upload; no silent model-recall fallback |
| AC03 | Unsupported objective with high confidence | Clarification; generation stays unavailable |
| AC04 | Confidence 0.89, 0.90, 0.91 | First two require confirmation; last proceeds only after evaluation passes |
| AC05 | Partial/scanned PDF, bad math extraction, or oversized file | Named diagnostic; generation stops; replacement route works |
| AC06 | Jev outage with valid sources | Manual confirmation works; publication still requires teacher approval |
| AC07 | Invalid model output, then invalid correction | At most two calls; no previewable package; diagnostics persist |
| AC08 | Timeout or late response after lease expiry | Retry state persists; late response cannot replace the owned record |
| AC09 | Reuse operation key with changed input | Conflict; no provider call or duplicate mutation |
| AC10 | Revise one section | Other section hashes match; dependency faults block new publication |
| AC11 | Approve stale revision while another edit finishes | Conflict; unseen version remains unpublished |
| AC12 | Wrong independent answer with forged perfect score | Server result is incorrect; corrective feedback replaces false success |
| AC13 | Double submit, reload, and retry | One attempt per operation; first response and assistance remain unchanged |
| AC14 | Learner fetches another tenant or unpublished version | Access denied; no answer or lesson data returned |
| AC15 | Inspect learner JSON, SSE, bundles, and operational logs | No private answer mappings, credentials, or future check answers |
| AC16 | Keyboard and 320-pixel viewport interaction | Complete flow works; focus and labels remain usable; math is readable |
| AC17 | Adjust fraction values and render LaTeX | Equal-sized wholes, valid limits, correct visual math, accessible equivalents |
| AC18 | Accept, pause, override, or submit stale follow-up | Correct approved target or conflict; evidence and choice remain saved |
| AC19 | Database interruption or process restart | No false success; committed data survives; repeat requests remain safe |
| AC20 | Teacher credential missing, quota reached, or forged role | Request rejected before provider access or private data access |
| AC21 | Unknown catalog component, action, or executable markup | Renderer rejects the payload with a safe diagnostic |
| AC22 | Three rehearsals plus 20 live requests | Record full-loop times, p95, failure counts, and fixture/live labels |
| AC23 | Source expiry and post-event cleanup | Expired private text and dependent demo records disappear as specified |
| AC24 | Change model or matching prompt after evaluation | Automatic matching disables until the new evaluation passes |

Use the repository commands below from the implementation checkout. Supply a dedicated disposable test database through `DATABASE_URL`. The database suite is separate from `pnpm check`.

```bash
pnpm check
pnpm test:database
```

A green command does not replace the browser, math, content, or pedagogy checks. Add behavior checks for new contracts and run the supplied verification skills. Record real service results separately from fixture results in the [validation tracker](../hackathon/meta-global-2026/validation-tracker.md).
