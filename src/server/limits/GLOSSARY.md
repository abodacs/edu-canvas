# Glossary — request limits

Vocabulary for the shared request-limit state (#104). The product terms for lessons and classrooms stay in the root [glossary](../../../GLOSSARY.md).

### Request limit counter

One counted scope and kind inside one time window: a teacher's hourly generation attempts, a tenant's daily generation attempts, a tenant's daily provider calls, or a session's per-minute authoring requests. Checking the limit and incrementing the count are one atomic write, so a rejected request never leaves a partial increment or spends budget.

**Implementing names:** `request_limit_counters`

### Active generation lease

The single generation a teacher may have running at a time. The lease names the request and attempt holding it, expires on its own, and returns to the pool when the attempt finishes or fails. An expired lease is reclaimable; it is not a permanent lock.

**Implementing names:** `active_generation_leases`
