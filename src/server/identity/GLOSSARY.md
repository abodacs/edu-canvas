# Glossary — identity and tenancy

Vocabulary for `src/server/identity/`. Meaning only. Product words live in the root [GLOSSARY.md](../../GLOSSARY.md); the map is [GLOSSARY-MAP.md](../../GLOSSARY-MAP.md).

### Actor

A person the server has verified, represented as a teacher actor or a learner actor. An actor is independent of any class membership: the same actor can belong to several classes. A browser never supplies an actor; the server constructs one from a verified provider identity plus current membership.

**Implementing names:** `actors`

### Identity

The provider's account for one person, verified once, before any membership is chosen. One person can hold more than one identity in one tenant over time.

**Implementing names:** `identities`

### Provider

The external service that verifies an email and password and issues a session for it. The application owns the contract with the provider and treats the provider as replaceable.

### Provider binding

The link between a provider's own identifier for a person and an application actor. A binding is made by trusted provisioning, never as a side effect of signing in, never from an email address, display name, or other untrusted claim.

**Implementing names:** `provider_bindings`

### Provisioning

The trusted operation of creating actors, bindings, memberships, and class assignments, or revoking them. Provisioning is performed by an operator or a service principal. It is not a public web action, and teachers and students cannot perform it.

**Implementing names:** `provisioning_audit`

### Tenant

The storage row behind one class, until #99 lands a real class object. One tenant holds one class for now, and its `name` is the class name a teacher picks. Access inside a tenant requires an active membership, and a class relationship where the resource belongs to a class.

**Implementing names:** `tenants`

### Membership

An actor's role — teacher or student — inside one tenant. An actor may hold several memberships; a session selects exactly one. A membership without an active status grants nothing.

**Implementing names:** `memberships`

### Class assignment

The relationship between a teacher's membership and a class in the same tenant. It is what lets a teacher reach that class's learners and evidence, and it ends when the assignment ends.

This is not a **learner assignment** — that one gives a published lesson to a student. One word, two work objects; see [the homonym register](../../docs/domain/03-homonyms.md).

**Implementing names:** `class_assignments`

### Learner binding

The link from a student membership to that tenant's learner record. The caller never chooses the learner identity; the server derives it from the binding.

### Session

A revocable application credential the browser holds after a successful sign-in. A session selects one membership and carries its own expiry and revocation state. A session is not a provider session and does not become valid because the provider still recognises it.

**Implementing names:** `identity_sessions`

### Pending authentication

The short-lived state after a verified sign-in that has not yet chosen a membership, because the actor belongs to more than one class. It cannot authorize any domain operation.

**Implementing names:** `pending_authentications`

### Session generation

A non-secret label on a session, used to tell one sign-in apart from another for caching and to discard results that arrive after the session changed. It is not a secret and grants nothing.

### Capability

Something an actor is allowed to do — read the environment, generate, preview, publish, read an assignment, submit an attempt, record a teacher decision, cancel a generation, or log out. Capabilities follow from the active membership's role, never from the browser.

### Roster scope

The set of classes a teacher is currently assigned to inside the active tenant. A teacher reaches their own drafts and their assigned classes, and no other teacher's drafts.

### Revocation

Ending access before it would otherwise expire: signing out, revoking a membership, or disabling an actor. Revocation committed first blocks a later write that was authorized earlier.
