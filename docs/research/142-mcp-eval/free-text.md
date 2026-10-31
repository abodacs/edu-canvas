# Free text to one standard: MCP keywords against REST semantic search

Measured 33 teacher sentences on 2026-10-31T00:48:12.249Z. 30 carry an expected standard; 3 are gap probes.

## Summary

| Measure | MCP `keywords` | REST `/academic-standards/search` |
| --- | --- | --- |
| hit@1 (exact code) | 0/30 | 13/30 |
| hit@5 (exact code) | 0/30 | 22/30 |
| hit@1 (code or child) | 0/30 | 17/30 |
| hit@5 (code or child) | 0/30 | 24/30 |
| hit@1 rate (exact) | 0% | 43% |
| Rows with zero results | 0 | 0 |
| Rows at the observed 25-row cap | 31 | n/a (limit 5) |
| Median latency | 419 ms | 482 ms |
| Rows with license and attribution | 0 | 33 |

## Per row

| Row | Text | Expected | MCP rank | REST rank | MCP rows | REST rows | REST score | MCP ms | REST ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| doc-equivalent-fractions | explain and identify equivalent fractions using equal-sized wholes | 4.NF.A.1 | miss | 2 | 25 | 5 | 0.790 | 419 | 1011 |
| doc-fraction-multiplication | fraction multiplication | 5.NF.B.4 | miss | miss | 25 | 5 | 0.738 | 422 | 457 |
| doc-placeholder-equivalent | equivalent fractions for grade 4 | 4.NF.A.1 | 20 | miss | 25 | 5 | 0.796 | 425 | 475 |
| var-compare-unlike | compare fractions with unlike denominators | 4.NF.A.2 | 24 | 1 | 25 | 5 | 0.798 | 397 | 457 |
| var-compare-unlike-neg | my kids can't compare fractions with unlike denominators | 4.NF.A.2 | 24 | 1 | 25 | 5 | 0.752 | 458 | 474 |
| var-multi-step | multi-step word problems using the four operations | 4.OA.A.3 | miss | 2 | 25 | 5 | 0.847 | 232 | 493 |
| var-number-line | understand a fraction as a number on the number line | 3.NF.A.2 | miss | 1 | 25 | 5 | 0.896 | 426 | 592 |
| var-generate-equivalent | recognize and generate equivalent fractions | 3.NF.A.3 | 16 | 5 | 25 | 5 | 0.846 | 436 | 490 |
| var-whole-times-fraction | multiply a whole number by a fraction | 4.NF.B.4 | miss | 1 | 25 | 5 | 0.803 | 423 | 500 |
| var-add-sub-unlike | add and subtract fractions with unlike denominators | 5.NF.A.1 | miss | 1 | 25 | 5 | 0.829 | 486 | 541 |
| var-fraction-division | interpret a fraction as division of the numerator by the denominator | 5.NF.B.3 | miss | 1 | 25 | 5 | 0.819 | 415 | 511 |
| var-place-value | understand place value patterns when multiplying by powers of ten | 5.NBT.A.1 | miss | 2 | 25 | 5 | 0.852 | 414 | 829 |
| var-standard-algorithm | multiply multi-digit whole numbers using the standard algorithm | 5.NBT.B.5 | miss | 1 | 25 | 5 | 0.884 | 419 | 448 |
| var-area | find the area of a rectangle by multiplying side lengths | 3.MD.C.7 | miss | miss (1 child) | 25 | 5 | 0.816 | 411 | 474 |
| var-volume | measure volume by counting unit cubes | 5.MD.C.3 | miss | miss (2 child) | 25 | 5 | 0.878 | 415 | 493 |
| var-ratio | understand ratio concepts and use ratio language | 6.RP.A.1 | miss | 2 | 25 | 5 | 0.845 | 417 | 461 |
| var-exponents | write and evaluate numerical expressions with whole-number exponents | 6.EE.A.1 | miss | 1 | 25 | 5 | 0.925 | 417 | 488 |
| var-proportional-graph | recognize proportional relationships in graphs | 7.RP.A.2 | miss | 1 | 25 | 5 | 0.852 | 416 | 452 |
| var-slope | explain slope using similar triangles | 8.EE.B.6 | miss | 1 | 25 | 5 | 0.766 | 416 | 464 |
| var-pythagoras | apply the Pythagorean theorem to find missing side lengths | 8.G.B.7 | miss | 1 | 25 | 5 | 0.824 | 392 | 601 |
| var-systems | solve systems of two linear equations | 8.EE.C.8 | miss | 3 | 25 | 5 | 0.802 | 413 | 473 |
| var-function | understand that a function assigns exactly one output to each input | 8.F.A.1 | miss | 1 | 25 | 5 | 0.872 | 417 | 442 |
| var-coordinate | draw points on the coordinate plane | 5.G.A.1 | miss | 3 | 25 | 5 | 0.795 | 414 | 492 |
| var-classify | classify two-dimensional figures by their properties | 5.G.B.3 | miss | miss | 25 | 5 | 0.871 | 604 | 608 |
| var-round-decimals | round decimals to any place | 5.NBT.A.4 | miss | 1 | 25 | 5 | 0.820 | 511 | 517 |
| var-fraction-word-problems | multiplying fractions by whole numbers word problems | 4.NF.B.4 | miss | 3 | 25 | 5 | 0.822 | 442 | 473 |
| var-same-size | help students see why two fractions can be the same size | 3.NF.A.3 | miss | 3 | 25 | 5 | 0.824 | 439 | 521 |
| adv-photosynthesis | photosynthesis and cellular respiration | none | gap | gap | 5 | 5 | 0.823 | 221 | 482 |
| adv-ela-main-idea | teach students to identify the main idea of a text | none | gap | gap | 25 | 5 | 0.805 | 422 | 461 |
| adv-single-word | fractions | none | gap | gap | 25 | 5 | 0.743 | 425 | 519 |
| adv-state-name | california equivalent fractions | 4.NF.A.1 | 19 | miss | 25 | 5 | 0.754 | 433 | 452 |
| adv-misspelling | equivlent fracions for fourth grade | 4.NF.A.1 | miss | miss | 10 | 5 | 0.793 | 221 | 464 |
| adv-long-sentence | I want a warm-up where my fourth graders explain why 1/2 and 2/4 are the same amount using a diagram | 4.NF.A.1 | miss | miss | 25 | 5 | 0.786 | 479 | 467 |

## Failure classes

- **Exact code missed, child returned:** 2 of 30. The teacher still sees the right family if the picker groups children under the parent.
- **Expected family absent from the top 5:** 6 of 30. Rows: doc-fraction-multiplication, doc-placeholder-equivalent, var-classify, adv-state-name, adv-misspelling, adv-long-sentence.
- **Gap probe still returned rows:** 3 of 3. Top scores range 0.743 to 0.823. The response carries no threshold, so the product must decide where "no match" starts.
- **MCP ordering:** rows arrive in code order, not relevance order. The expected code is never in the top five, even when it is present in the full array.
- **Text tokens that are not topics:** a state name inside the sentence lowered the REST rank (`adv-state-name`). Grade words are not a filter on either transport. Both need structured inputs, not text inference.

## Selector

- Show the top 5 REST candidates and require teacher confirmation. Top-1 is right on 13 of 30 rows exact, and 17 of 30 with children. That rate is too low for an automatic pick.
- The MCP keyword mode is not a candidate for stage one at any k.

## Method

- The corpus is `free-text-corpus.json`. Both transports receive the row's `jurisdiction` and `subject` and nothing else about the standard.
- MCP receives `keywords`: the sentence lowercased, split on non-alphanumerics, stopwords removed, capped at 32 tokens. The tool matches ANY word by stem, so a longer array trades precision for recall.
- REST receives the full sentence as `query` with `limit=5`. Results are ranked by vector similarity and carry a `score`.
- `hit@1` and `hit@5` count rows where the expected code lands at that rank. A row with no expected code is a gap probe and is excluded from both.
- `exact code` requires the expected code itself. `code or child` also accepts a sub-standard, such as `3.MD.C.7.a` for `3.MD.C.7`, because a teacher can teach the child.
- The MCP server returned the same row count on every broad query, which suggests a server cap. The evidence marks a row as capped when it equals the observed maximum.

## Limits

- No field transcript exists in this repository. Three rows quote documented text; the rest are authored teacher-register variants.
- Semantic ranking is a vendor model with unknown version. A second run may reorder near ties.
- Jurisdiction is an explicit input. This run never infers a state from text.
- The corpus covers one subject and grades 3 to 8. It does not prove recall for every topic.
