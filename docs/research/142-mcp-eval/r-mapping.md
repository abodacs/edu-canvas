# R-01–R-13 and evidence-matrix mapping

Every requirement from the [#113 specification](https://github.com/abodacs/edu-canvas/issues/113) mapped to MCP behavior. Field names come from [tool-schemas.json](tool-schemas.json); behavior comes from [evidence.json](evidence.json).

Verdicts: **satisfiable** (client-side rule, MCP adds no obstacle), **mapping change** (rule can hold with new names or codes), **spec change** (rule text must change), **not satisfiable** (requirement cannot hold under MCP as measured).

## Resolution rules

| Rule | Requirement | MCP behavior | Verdict | Required change |
| --- | --- | --- | --- | --- |
| R-01 | Registry membership before outbound work; unsupported yields `upload-required` with zero provider calls | Our registry stays client-side, so an unsupported envelope still makes zero calls. Inside a supported jurisdiction, an unknown code is only detectable by one `find_standard_statement` call that returns `standards: []`. An unknown jurisdiction returns `isError: true` with `Unknown jurisdiction`. | Satisfiable | Keep the registry as the gate. Document that provider-level absence costs one call. |
| R-02 | Unique current framework per jurisdiction and subject; registry pin; ambiguity, absent and noncurrent outcomes | No framework concept in any input or output. A standards row has `academicSubject`, `alternateStatementCode`, `caseIdentifierUUID`, `description`, `gradeLevels`, `jurisdiction`, `statementCode`. No `frameworkIdentifier`, no `isCurrent`, no dates, no pins. | Spec change | Replace framework selection and currency checks with the request's `jurisdiction` and `academicSubject`, plus a recorded assumption that the vendor serves the current framework. |
| R-03 | Scan all framework pages; exact code match; absence only after a complete scan; ambiguity on multiple exact matches | No pagination and no scan. Matching is server-side. A code search returns the parent plus its children: `3.NF.A.3` returned five rows. Absence is a `standards: []` response, indistinguishable from an incomplete index. | Not satisfiable | Rewrite absence as "not returned by the vendor index" and keep `standard-absent` as `standard-not-found`. Client must still select the exact `statementCode` among siblings. |
| R-04 | All required components; nonempty standard text and skills; identifier plus description; framework currency recorded separately | `description` is present. Components return only `identifier` and `description`. No currency, modification date, framework metadata, license or attribution. | Spec change | Keep the content checks. Drop currency recording or source it from REST. |
| R-05 | Direct immediate prerequisites first; California crosswalk with `jaccard=1`, equal component counts and consistent overlap; no fuzzy matching | `find_standards_progression_from_standard` returns the requested jurisdiction directly with `matchType` (`exact` or `partial`) and `alignmentScore` (1.0 on all eight measured rows). No `jaccard`, no component counts, no overlap counts, no immediate-edge flag. Partial matches carry `learningComponents` instead. | Spec change | Replace the crosswalk proof with `matchType=exact` plus `alignmentScore=1`, and state that the vendor owns the mapping proof. Keep the fallback crosswalk only if independent proof is required. |
| R-06 | Unavailable or inexact mapping yields `prerequisites-unavailable` and `crosswalk-inexact`; partial facts stay as labeled evidence | `matchType=partial` plus per-row `learningComponents` is returned. A non-math input returns `isError: true` and no rows: "Progressions are only available for Common Core State Standard - Mathematics". | Mapping change | Map `partial` to `crosswalk-inexact`, and the error result to `prerequisites-unavailable`. Keep the ready-with-warning outcome. |
| R-07 | One 10,000 ms total deadline per attempt; no automatic retries or sleeps; abort outstanding work | The client can enforce one total deadline. Measured full chains took 637–1408 ms, and single stages 210–936 ms. The contract does not document cancellation semantics. | Satisfiable | Keep the client deadline. Record that the slowest measured chain leaves about seven times the deadline. |
| R-08 | One blocking failure gives `retry-available`; one explicit retry; second failure gives upload recovery | Client-side sequence. MCP adds no retry behavior. | Satisfiable | None. |
| R-09 | Idempotent replay by owner-scoped key; fingerprints cover registry and normalizer versions | Client-side. `session_id` is analytics-only and must stay out of fingerprints. | Satisfiable | Add the MCP protocol and server version to the fingerprint. |
| R-10 | One durable attempt claim and one terminal commit | Client-side. | Satisfiable | None. |
| R-11 | Cache only complete, validated framework scans, keyed by framework and versions; 15 minutes | No framework scans exist to cache. The cache key loses framework identity. Internal vendor caching is unobservable. | Not satisfiable | Replace the cache object with a response cache keyed by jurisdiction, subject, code, protocol version and server version. State that vendor-side caching is unknown. |
| R-12 | Configured HTTPS origin, fixed endpoints, no redirects, safe links, source text treated as data | One configured origin and no redirects: the client sets `redirect: "error"`. No response carries a link, so the link-safety rule has no input. No license or attribution either, which #113 needs for AC-04. | Spec change | Keep the transport rules. Remove the link rule or source links from REST. Attribution and license need a separate source. |
| R-13 | Atomic snapshot and terminal reference; owner, objective and hash binding; consumers read only a matching snapshot | Client-side. | Satisfiable | None. |

Result: six rules are satisfiable as written (R-01, R-07, R-08, R-09, R-10, R-13), one needs a diagnostic mapping (R-06), four need rewritten text (R-02, R-04, R-05, R-12), and two cannot hold (R-03, R-11).

## Evidence-matrix rows

| #113 row | Under MCP | Verdict |
| --- | --- | --- |
| `4.NF.A.1`, `4.NF.A.2`, `3.NF.A.3`, `4.OA.A.3` in both jurisdictions: text, component count, path | Text and component counts measured (5, 7, 2, 18 in both). Path is `matchType=exact` with `alignmentScore=1`, not a crosswalk metric. | Partial: content yes, crosswalk proof no |
| Unsupported jurisdiction, subject or code: zero provider calls, `unsupported-envelope` | Registry blocks known-unsupported envelopes client-side. An unknown jurisdiction returned `isError: true`; an unknown code returned zero rows after one visible call. | Satisfiable with the registry gate |
| Absent code in a fully scanned framework: `standard-absent`, full page-chain evidence | No scan exists. A zero-row answer carries no page-chain evidence. | Not satisfiable |
| Superseded or noncurrent framework: currency rejection with retained provenance | No currency field, no framework identifier, no dates. | Not satisfiable |

## Data-contract gaps for #113

The snapshot contract needs fields MCP does not supply. Each gap needs either a REST source or a contract change.

| Snapshot field | MCP source | Gap |
| --- | --- | --- |
| Framework identifier and currency | None | Missing |
| Standard modification date | None | Missing |
| Mapping metrics (`jaccard`, component counts, overlap) | `matchType`, `alignmentScore` only | Different proof shape |
| License and attribution | None | Missing |
| Safe source reference link | None | Missing |
| Provider version and retrieval time | Server version from `initialize`; retrieval time client-side | Partial |

## Scope-change outline, if this issue reopens

Not filed, because the decision is defer. A reopen needs one scope-change issue covering:

1. Drop the REST requirement in the #113 body, or scope MCP to a cross-check role.
2. Rewrite R-02, R-03, R-04, R-05, R-11 and R-12.
3. Rewrite the evidence matrix rows for absence and currency.
4. Record the provenance gap: license, attribution and links have no MCP source.
5. Re-run [the runner](../../../scripts/lc-mcp-eval.ts) and refresh the hashes.
