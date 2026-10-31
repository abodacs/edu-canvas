# Glossary

The project's domain language. Terms here are canonical: when code, issues, or docs disagree with this file, one of them is wrong. This file records meaning only — no implementation detail.

## Identity and access

### Actor

A person the server has verified, represented as a teacher actor or a learner actor. An actor is independent of any school membership: the same actor can belong to several schools. A browser never supplies an actor; the server constructs one from a verified provider identity plus current membership.

### Provider

The external service that verifies an email and password and issues a session for it. The application owns the contract with the provider and treats the provider as replaceable.

### Provider binding

The link between a provider's own identifier for a person and an application actor. A binding is made by trusted provisioning, never as a side effect of signing in, and never from an email address, display name, or other untrusted claim.

### Provisioning

The trusted operation of creating actors, bindings, memberships, and class assignments, or revoking them. Provisioning is performed by an operator or service principal. It is not a public web action, and teachers and students cannot perform it.

### Membership

An actor's role — teacher or student — inside one tenant. An actor may hold several memberships; a session selects exactly one. A membership without an active status grants nothing.

### Tenant

A school. Access inside a tenant requires an active membership, and a class relationship where the resource belongs to a class.

### Class assignment

The relationship between a teacher's membership and a class in the same tenant. It is what lets a teacher reach that class's learners and evidence, and it ends when the assignment ends.

### Learner binding

The link from a student membership to that tenant's learner record. The caller never chooses the learner identity; the server derives it from the binding.

### Session

A revocable application credential the browser holds after a successful sign-in. A session selects one membership and carries its own expiry and revocation state. A session is not a provider session and does not become valid because the provider still recognises it.

### Pending authentication

The short-lived state after a verified sign-in that has not yet chosen a membership, because the actor belongs to more than one school. It cannot authorize any domain operation.

### Session generation

A non-secret label on a session, used to tell one sign-in apart from another for caching and to discard results that arrive after the session changed. It is not a secret and grants nothing.

### Capability

Something an actor is allowed to do — read the environment, generate, preview, publish, read an assignment, submit an attempt, record a teacher decision, cancel a generation, or log out. Capabilities follow from the active membership's role, never from the browser.

### Roster scope

The set of classes a teacher is currently assigned to inside the active tenant. A teacher reaches their own drafts and their assigned classes, and no other teacher's drafts.

### Revocation

Ending access before it would otherwise expire: signing out, revoking a membership, or disabling an actor. Revocation committed first blocks a later write that was authorized earlier.

## Verification vocabulary

### Full identity

One combination of component, version, surface, state, and runtime a browser test must exercise: routes, change handlers, validation branches, persisted effects, keyboard, phone, right-to-left, two tabs, page restoration, and actor switching.

### Baseline case

One named, always-run test in the authentication and domain-policy matrices. Baseline cases are a floor; every concrete route, loader, or reference adds executed cases.

### Referent

The record a protected operation names — a draft, roster, publication, activity version, learner, or attempt. A referent must both belong to the authorized scope and match the intended relationship.

## Records, versions, and evidence

### Lesson package

The teacher-owned identity a version chain belongs to. It carries the owner, the target standard, the title, and the head revision used for concurrency. It carries no lesson content.

### Lesson version

An immutable revision of a package: ordered sections, variant references, provenance, private answer relationships, content and package hashes, validation evidence, and rule versions. A section revision keeps the package; a fresh draft starts a new package.

### Publication

The immutable fact that a teacher approved one exact lesson version. It pins the content hash, package hash, private-answer digest, validation-result hash, and rule versions. It never mutates the version.

### Published lesson projection

The learner-facing view derived from a lesson version by a versioned projection function. It is not a stored copy, and its hash must match the publication.

### Learner attempt

An immutable response record in `learner_attempts`, keyed to the learner run, item, and publication. It is not the demo `attempts` table, which remains fixture data.

### Assistance event

An append-only record that a learner used a hint or other assistance on a specific run and item, before any feedback release that claims it was saved.

### Learner run

The mutable progress record for one assignment: stage, first-response status, revision, and next activity. Its publication, learner, and variant never change.

### Teacher decision

The immutable choice — accept, pause, or override — bound to the current evidence hash and the assigning teacher.

### Operation receipt

The record that makes a write replay-safe: tenant, actor, membership, authorization revision, action, operation key, input hash, and result ids.

### Curated reference

Human-supplied evidence for the focused path. It is explicitly not a source snapshot and carries no retrieval time or native match confidence.
