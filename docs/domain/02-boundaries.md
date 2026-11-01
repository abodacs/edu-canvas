# Boundaries the stories show

Scope: the six [boundary indicators] applied to the ten contexts [AgDR-0008](../../docs/agdr/AgDR-0008-bounded-contexts-and-screaming-layout.md) claims. Input: [the as-is stories](01-as-is-stories.md), which are reconstructed, not observed.

## The six indicators

A candidate boundary holds when the activities inside it share a result and a hand-over, and when the groups differ on: information direction, trigger, artifacts used outside the group, language, and how a shared object is used.

## Verdict per claimed context

| Context | Class | Verdict | Why |
| --- | --- | --- | --- |
| Lesson Drafting | Subdomain | **Confirmed** | Own result (a draft lesson) and hand-over to review. Own trigger (the teacher asks). Own failure language. |
| Validation & Safety | Subdomain | **Confirmed** | Produces a separate artifact — a checked draft with findings — that review consumes. Language differs from drafting: _check, finding, block, recover_. |
| Teacher Review | Subdomain | **Confirmed, but split by technology** | One activity: read the draft, correct it, approve it. The code splits it into `a2ui/` (rendering the draft) and `publication/` (recording approval). Rendering is a delivery mechanism inside this context, not a sibling. |
| Student Learning | Subdomain | **Confirmed** | Different actors (learner), different trigger (assignment), different result (attempt and evidence), different vocabulary (_response, score, next activity_). |
| Curriculum & Standards | Subdomain | **Confirmed** | One-way flow: consuming contexts conform to its graph. Artifact (standard, prerequisite) is used outside the story that made it. |
| Identity & Tenancy | Subdomain | **Confirmed** | Different trigger (sign-in, provisioning). Artifact (session, membership) is used by every other context. Own language: _actor, membership, tenant, capability_. |
| A2UI Protocol | — | **Not a subdomain** | No actor performs an activity on it. It is a message format between two modules of Teacher Review. Keep it as a module and a published contract. |
| Shared contracts | — | **Not a subdomain** | It is the published language, not work. Naming it a context gives it an owner it does not need. |
| Platform | — | **Not a subdomain** | Generic capability. Already described as "generic" in the map. |

Result: **6 subdomains, 1 protocol module, 2 layers.** The map's own "Class" column already says `Supporting` and `Generic` for three of them; the verdict makes that difference load-bearing.

## The work object no context owns

Every story touches the **class**: the class period, the class materials, the class list, the misconception written on the class list. The schema has `class_assignments` — a teacher-to-class link — and no `classes` record. The class exists as an identifier with no name, no owner, and no membership list.

That is not a missing table alone. It means the teacher's unit of work, "my Grade 4 class", cannot be named in the domain language. Recorded in [the homonym register](03-homonyms.md) and as a gap in `GLOSSARY.md`.

## Boundaries the stories do not support

- **Learner isolation.** Story 2 has the teacher reading every answer. Nothing in the sources shows a learner working without the teacher present, yet `Student Learning` is modelled as its own context with its own session and its own routes. The code is ahead of the evidence here; that is allowed, but it should not be described as observed.
- **Automated next activity.** Story 2 step 11 is a teacher choice. The code models `nextActivity` as a stored field chosen by the system. The stories support _recording_ the teacher's choice, not proposing it. This is a product decision, not a modelling error.

## What changes

Nothing in the code moves because of this document. The verdicts above justify the existing module layout, and they justify _not_ treating `a2ui/` or `shared/` as contexts in the glossary map.
