/**
The persistence backends the readiness check can report. `in-memory` is the
test double; runtime composition selects `postgres` or fails closed.
*/
export const persistenceKinds = ["postgres", "in-memory"] as const;
export type PersistenceKind = (typeof persistenceKinds)[number];
export const postgresPersistenceKind = "postgres" satisfies PersistenceKind;
export const inMemoryPersistenceKind = "in-memory" satisfies PersistenceKind;
