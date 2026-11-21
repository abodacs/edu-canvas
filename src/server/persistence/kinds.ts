export const persistenceKinds = ["postgres", "in-memory"] as const;
export type PersistenceKind = (typeof persistenceKinds)[number];
export const postgresPersistenceKind = "postgres" satisfies PersistenceKind;
export const inMemoryPersistenceKind = "in-memory" satisfies PersistenceKind;
