import { PackUniqueViolationError } from "./pack-port";

import type {
  PackApprovalRecord,
  PackAssignmentRecord,
  PackLearner,
  PackPersistence,
  PackPublicationRecord,
  PackReceiptRecord,
  PackVersionRecord,
} from "./pack-port";

export interface SeededPackLearner extends PackLearner {
  tenantId: string;
}

export interface SeededPackStore {
  readonly versions: Map<string, PackVersionRecord>;
  readonly approvals: Map<string, PackApprovalRecord>;
  readonly publications: Map<string, PackPublicationRecord>;
  readonly assignments: Map<string, PackAssignmentRecord>;
  readonly receipts: Map<string, PackReceiptRecord>;
  readonly learners: readonly SeededPackLearner[];
}

export interface SeededPackPersistenceOptions {
  store?: SeededPackStore;
  learners?: readonly SeededPackLearner[];
}

const versionKey = (tenantId: string, versionId: string): string =>
  `${tenantId}\0${versionId}`;

const requestRevisionKey = (
  tenantId: string,
  requestId: string,
  revision: number
): string => `${tenantId}\0${requestId}\0${revision}`;

const approvalKey = (
  tenantId: string,
  versionId: string,
  targetKind: string,
  targetId: string
): string => `${tenantId}\0${versionId}\0${targetKind}\0${targetId}`;

const publicationKey = (tenantId: string, versionId: string): string =>
  `${tenantId}\0${versionId}`;

const assignmentKey = (
  tenantId: string,
  publicationId: string,
  learnerId: string
): string => `${tenantId}\0${publicationId}\0${learnerId}`;

const receiptKey = (
  tenantId: string,
  actorId: string,
  action: string,
  operationKey: string
): string => `${tenantId}\0${actorId}\0${action}\0${operationKey}`;

export const createSeededPackStore = (
  learners: readonly SeededPackLearner[] = []
): SeededPackStore => {
  return {
    versions: new Map(),
    approvals: new Map(),
    publications: new Map(),
    assignments: new Map(),
    receipts: new Map(),
    learners,
  };
};

const clone = <T>(value: T): T => structuredClone(value);

export const createSeededPackPersistence = (
  options: SeededPackPersistenceOptions = {}
): PackPersistence => {
  const store = options.store ?? createSeededPackStore(options.learners ?? []);

  const rememberVersion = (record: PackVersionRecord): void => {
    const revisionKey = requestRevisionKey(
      record.tenantId,
      record.requestId,
      record.revision
    );
    if (store.versions.has(versionKey(record.tenantId, record.id))) {
      throw new PackUniqueViolationError("pack_versions_tenant_id_id_key");
    }
    const isDuplicateRevision = store.versions.values().some((version) => {
      return (
        requestRevisionKey(
          version.tenantId,
          version.requestId,
          version.revision
        ) === revisionKey
      );
    });
    if (isDuplicateRevision) {
      throw new PackUniqueViolationError(
        "pack_versions_tenant_id_request_id_revision_key"
      );
    }
    store.versions.set(versionKey(record.tenantId, record.id), clone(record));
  };

  const versionsForRequest = (
    tenantId: string,
    requestId: string
  ): PackVersionRecord[] => {
    return store.versions
      .values()
      .filter(
        (version) =>
          version.tenantId === tenantId && version.requestId === requestId
      )
      .toArray()
      .toSorted((left, right) => right.revision - left.revision);
  };

  return {
    kind: "seeded-demo",
    check: () => Promise.resolve(true),

    listVersions: (tenantId, requestId) =>
      Promise.resolve(versionsForRequest(tenantId, requestId).map(clone)),

    readLatestVersion: (tenantId, requestId) => {
      const [latest] = versionsForRequest(tenantId, requestId);
      return Promise.resolve(latest ? clone(latest) : undefined);
    },

    readVersion: (tenantId, versionId) => {
      const record = store.versions.get(versionKey(tenantId, versionId));
      return Promise.resolve(record ? clone(record) : undefined);
    },

    insertVersion: (record) => {
      rememberVersion(record);
      return Promise.resolve();
    },

    listApprovals: (tenantId, versionId) => {
      return Promise.resolve(
        store.approvals
          .values()
          .filter((approval) => {
            return (
              approval.tenantId === tenantId && approval.versionId === versionId
            );
          })
          .map(clone)
          .toArray()
      );
    },

    readApproval: (tenantId, versionId, targetKind, targetId) => {
      const record = store.approvals.get(
        approvalKey(tenantId, versionId, targetKind, targetId)
      );
      return Promise.resolve(record ? clone(record) : undefined);
    },

    insertApproval: (record) => {
      const key = approvalKey(
        record.tenantId,
        record.versionId,
        record.targetKind,
        record.targetId
      );
      if (store.approvals.has(key)) {
        throw new PackUniqueViolationError(
          "pack_approvals_tenant_version_target_key"
        );
      }
      store.approvals.set(key, clone(record));
      return Promise.resolve();
    },

    readPublicationForVersion: (tenantId, versionId) => {
      const record = store.publications.get(
        publicationKey(tenantId, versionId)
      );
      return Promise.resolve(record ? clone(record) : undefined);
    },

    insertPublication: (record) => {
      const key = publicationKey(record.tenantId, record.versionId);
      if (store.publications.has(key)) {
        throw new PackUniqueViolationError(
          "pack_publications_tenant_version_key"
        );
      }
      store.publications.set(key, clone(record));
      return Promise.resolve();
    },

    readAssignmentForPublication: (tenantId, publicationId) => {
      const record = store.assignments.values().find((assignment) => {
        return (
          assignment.tenantId === tenantId &&
          assignment.publicationId === publicationId
        );
      });
      return Promise.resolve(record ? clone(record) : undefined);
    },

    insertAssignment: (record) => {
      const key = assignmentKey(
        record.tenantId,
        record.publicationId,
        record.learnerId
      );
      const publicationAlreadyAssigned = store.assignments
        .values()
        .some((assignment) => {
          return (
            assignment.tenantId === record.tenantId &&
            assignment.publicationId === record.publicationId
          );
        });
      if (publicationAlreadyAssigned) {
        throw new PackUniqueViolationError(
          store.assignments.has(key)
            ? "pack_assignments_tenant_publication_learner_key"
            : "pack_assignments_tenant_publication_key"
        );
      }
      store.assignments.set(key, clone(record));
      return Promise.resolve();
    },

    readReceipt: (tenantId, actorId, action, operationKey) => {
      const record = store.receipts.get(
        receiptKey(tenantId, actorId, action, operationKey)
      );
      return Promise.resolve(record ? clone(record) : undefined);
    },

    insertReceipt: (record) => {
      const key = receiptKey(
        record.tenantId,
        record.actorId,
        record.action,
        record.operationKey
      );
      if (store.receipts.has(key)) {
        throw new PackUniqueViolationError(
          "pack_receipts_tenant_actor_action_key_key"
        );
      }
      store.receipts.set(key, clone(record));
      return Promise.resolve();
    },

    listLearners: (tenantId) => {
      return Promise.resolve(
        store.learners
          .filter((learner) => learner.tenantId === tenantId)
          .map((learner) => {
            return {
              id: learner.id,
              displayName: learner.displayName,
            };
          })
      );
    },

    readLearner: (tenantId, learnerId) => {
      const learner = store.learners.find(
        (candidate) =>
          candidate.tenantId === tenantId && candidate.id === learnerId
      );
      return Promise.resolve(
        learner
          ? { id: learner.id, displayName: learner.displayName }
          : undefined
      );
    },
  };
};
