# Option C evaluation: deterministic MCP dispatch for source grounding

Decision for [#142](https://github.com/abodacs/edu-canvas/issues/142). Captured 2026-10-31.

**Decision: defer Option C. Keep Option B (registry-driven REST) as the chosen path. Reopen on a measured B trace above three requests.**

Option C meets the visible three-call cap on all eight supported rows. It does not meet the issue's own fan-out default: provider-internal reads are not observable. It also loses facts that #113 requires: framework currency, mapping proof, license, attribution, and source links.

## The product boundary is free text, not a code list

The eight-row matrix starts from `{jurisdiction, code}`. The teacher types a sentence. Those are different stages.

The [free-text measurement](free-text.md) resolves 33 teacher sentences on both transports. 30 carry an expected standard; 3 are gap probes. REST semantic search finds the expected standard or a child in the top five on 24 of 30. The MCP keyword tool finds it in the top five on 0 of 30: it returns up to 25 rows in code order, with no relevance ranking.

That result does not change the deferral. It strengthens it. Option C cannot perform the first stage of the product path.

| Measure | MCP `keywords` | REST `/academic-standards/search` |
| --- | --- | --- |
| hit@1, exact code | 0/30 | 13/30 |
| hit@5, exact code | 0/30 | 22/30 |
| hit@1, code or child | 0/30 | 17/30 |
| hit@5, code or child | 0/30 | 24/30 |
| Rows at the 25-row server cap | 31/33 | n/a |
| License and attribution | 0 rows | 33 rows |
| Median latency | 399 ms | 484 ms |

Consequences for the path:

- **Transport for stage one:** REST only. The MCP keyword mode is a filtered list, not a search.
- **Selector:** no automatic pick. Top-1 is right 43% of the time and right-or-child 57%. Show five candidates and let the teacher confirm.
- **Gap detection:** the REST scores do not fall to zero. `photosynthesis and cellular respiration` still returned five Science rows with a top score of 0.823. The product needs a score threshold, because the transport never says "no match".
- **MCP reopen trigger:** the vendor adds relevance ranking or sentence-level search to `find_standard_statement`. Until then, the tool cannot pass stage one at any k.

## What was measured

Authenticated calls to `https://kg.mcp.learningcommons.org/mcp`, protocol `2025-03-26`, server `rmcp 3.2.0`. Eight registry rows, three modes each (cold, warm, repeat), two independent processes. Full numbers in [measurements.md](measurements.md); raw record in [evidence.json](evidence.json); schemas in [tool-schemas.json](tool-schemas.json).

| Measurement | Result |
| --- | --- |
| Visible calls per row | 3 of 3 stages, on 8/8 rows, in cold, warm and repeat |
| Visible calls per eight-row sweep | 24 |
| Full-chain latency | 651–6143 ms (median 770 ms) |
| Single-stage latency | 212–2122 ms (median 224 ms) |
| Learning components per row | 5, 7, 2, 18 — identical in both jurisdictions |
| Backward progression rows per row | 2, 1, 2, 3 — returned in the requested jurisdiction |
| Determinism | 24/24 chain hashes identical across two independent processes ([record](determinism.md)) |
| Tools advertised | 5, not the 3 recorded on 2026-10-28 |
| Provenance fields on any output schema | 0 |
| Gateway rate-limit accounting | 39 of 71 consecutive deltas are zero; no per-call count |

The California path is the headline result. `find_standards_progression_from_standard` returns California standards directly, with `matchType=exact` and `alignmentScore=1.0`. The nine-request crosswalk path in B's model collapses into one visible call. All eight rows cost three calls, cold and warm alike.

## Decision gate

The issue replaces B only when all four criteria hold.

| Criterion | Result | Evidence |
| --- | --- | --- |
| 1. Cap, including internal fan-out | **Fail** | Visible calls are exactly 3 per row. Internal fan-out cannot be observed or bounded. The issue's default then applies: unobservable fan-out fails this criterion. Gateway rate-limit headers stay flat across most calls (39 of 71 deltas are zero) and also rise inside one window. They do not count one unit per request, so they cannot count internal reads. |
| 2. Contract: schemas, fields, types, hashes | **Pass** | All five tools publish `inputSchema` and `outputSchema`. Hashes are recorded per tool and per response. |
| 3. Determinism, no model or agent | **Pass** | 24/24 identical semantic hashes over two processes. `session_id` is analytics-only and excluded from hashes. |
| 4. Migration cost, every R-01–R-13 gap named | **Fail** | Every rule is mapped in [r-mapping.md](r-mapping.md). Six rules need a specification rewrite. Two evidence-matrix rows become unprovable. Attribution and currency are absent from the contract. |

Criterion 1 fails on the issue's stated default. Criterion 4 fails on lost facts, not on effort. Even a resolved cap would not fix attribution, currency, or mapping proof.

## Cap comparison with B

B's model from the #113 evaluation comment, against one attempt:

| Path                 | B cold | B warm | C cold | C warm |
| -------------------- | ------ | ------ | ------ | ------ |
| Multi-State direct   | 4      | 3      | 3      | 3      |
| California crosswalk | 9      | 6      | 3      | 3      |
| Cap                  | 3      | 3      | 3      | 3      |

C is the only option that meets the visible cap on every row. That result is real and measured. It is not enough, because the cap's unit is our outbound requests, and the issue counts provider-internal reads too.

## Why defer rather than adopt

1. **Fan-out is unobservable.** The server is remote and behind a gateway. The rate-limit header both falls and rises inside one window, so it measures the gateway, not upstream reads. The tool descriptions admit a Common Core pivot and state re-mapping, so internal reads are certain, and their count is unknown.
2. **The snapshot contract loses required facts.** #113 needs framework currency, modification dates, mapping metrics, license, attribution, and safe source links. MCP returns none of these. A standards response has seven fields; a component has two. Adopting C needs a second REST path for provenance, which defeats the purpose.
3. **Absence and currency checks disappear.** R-02, R-03, R-04 and R-11 depend on framework scans, pagination and currency metadata. MCP exposes no framework concept and no pagination.
4. **The contract is moving.** In three days the server went from `rmcp 0.5.0` with three tools and no published response schema to `rmcp 3.2.0` with five tools and full output schemas. That is progress, but a runtime dependency now would sit on an unstable contract.

## Reopen triggers

Reopen this issue when any trigger holds.

1. **Primary:** a measured B trace exceeds three requests on any pilot-required row (#113 Q-01). This is the issue's own default.
2. The vendor publishes per-call request accounting, or a documented bound on internal reads. Criterion 1 then becomes testable.
3. The vendor adds framework currency, license, attribution, or source links to tool output. Migration cost then drops below B's cap overrun.
4. The vendor adds relevance ranking or sentence-level search to `find_standard_statement`. Without it, C fails stage one at every k.

## What this evidence is good for now

- **Cross-check oracle.** The #113 live runner can compare its REST result with an independent MCP resolution. Same facts from two transports is stronger evidence than either alone.
- **Fallback transport.** Product strategy already names MCP as a fallback, not the default. This evaluation keeps that position and gives it measured support.
- **Cached decision.** Criteria 2 and 3 are already proven. A reopen needs only criterion 1 and 4 work, not a fresh contract study.
- **Stage-one baseline.** The free-text numbers give #113 a recall baseline. A later selector must beat 24 of 30 at five candidates.

## Limits

- Two processes in one hour, one API key, one origin. No rate-limit or availability claim.
- Counts are client-visible requests. Internal provider reads are unknown, not zero.
- Progression rows are graph neighbours as the vendor returns them. This evaluation does not prove they are immediate prerequisites.
- No teacher or student data was sent. The runner sends curriculum codes only.
- Latency is one sample per row per mode, not a distribution. The slowest chain took 6143 ms, on a warm `3.NF.A.3` pass, with all three stages above 1900 ms.
- Q-01 has no measured REST traces yet. B numbers come from the #113 evaluation model, not provider traces.
- The free-text corpus has no field transcripts. Three rows quote documented text; the rest are authored variants. See [free-text.md](free-text.md).

## Reproduce

```bash
export LEARNING_COMMONS_API_KEY=...   # server-only, never commit
node --import tsx scripts/lc-mcp-eval.ts record --out /tmp/run-a
node --import tsx scripts/lc-mcp-eval.ts record --out /tmp/run-b
node --import tsx scripts/lc-mcp-eval.ts compare /tmp/run-a/evidence.json /tmp/run-b/evidence.json
node --import tsx scripts/lc-mcp-eval.ts check    # offline check of committed evidence
node --import tsx scripts/lc-mcp-eval.ts render   # regenerate measurements.md
node --import tsx scripts/lc-mcp-eval.ts compare docs/research/142-mcp-eval/evidence.json /tmp/run-a/evidence.json
node --import tsx scripts/lc-mcp-eval.ts free-text record   # both transports, 33 rows
node --import tsx scripts/lc-mcp-eval.ts free-text render
node --import tsx scripts/lc-mcp-eval.ts free-text check
```
