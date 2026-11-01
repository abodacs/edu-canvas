import { z } from "zod";

export const hashVersion = "sha256-canonical-json-v1" as const;

export const recordSchemaVersionValues = [
  "curated-reference-v1",
  "lesson-package-curated-v1",
  "publication-v1",
  "assignment-v1",
  "learner-run-v1",
  "attempt-v2",
  "assistance-event-v1",
  "teacher-decision-v1",
  "operation-receipt-v1",
] as const;
export type RecordSchemaVersion = (typeof recordSchemaVersionValues)[number];

export const legacySchemaVersionValues = [
  "legacy-activity-v1",
  "legacy-generation-v1",
  "legacy-attempt-v1",
] as const;
export type LegacySchemaVersion = (typeof legacySchemaVersionValues)[number];

export const schemaVersionSchema = z.enum(recordSchemaVersionValues);
export const legacySchemaVersionSchema = z.enum(legacySchemaVersionValues);

export const revisionKindValues = [
  "initial",
  "section-revision",
  "reframe",
  "fresh-draft",
] as const;
export type RevisionKind = (typeof revisionKindValues)[number];

export const sectionKindValues = [
  "worked-example",
  "guided-practice",
  "independent-check",
  "follow-up",
] as const;
export type SectionKind = (typeof sectionKindValues)[number];

export const runStageValues = [
  "assigned",
  "active",
  "awaiting-decision",
  "paused",
  "advanced",
  "completed",
] as const;
export type RunStage = (typeof runStageValues)[number];

export const firstResponseStatusValues = ["pending", "submitted"] as const;
export type FirstResponseStatus = (typeof firstResponseStatusValues)[number];

export const assistanceKindValues = ["hint", "other"] as const;
export type AssistanceKind = (typeof assistanceKindValues)[number];

export const assistanceStateValues = ["none", "hinted"] as const;
export type AssistanceState = (typeof assistanceStateValues)[number];

export const correctnessValues = ["correct", "partial", "incorrect"] as const;
export type Correctness = (typeof correctnessValues)[number];

export const teacherDecisionActionValues = [
  "accept",
  "pause",
  "override",
] as const;
export type TeacherDecisionAction =
  (typeof teacherDecisionActionValues)[number];

export const recordActionValues = [
  "store-grounding",
  "append-version",
  "publish",
  "assign",
  "start-run",
  "record-hint",
  "record-attempt",
  "choose",
] as const;
export type RecordAction = (typeof recordActionValues)[number];

export const receiptResultKindValues = [
  "curated-reference",
  "lesson-version",
  "publication",
  "assignment",
  "learner-run",
  "assistance-event",
  "learner-attempt",
  "teacher-decision",
] as const;
export type ReceiptResultKind = (typeof receiptResultKindValues)[number];

export const validationSeverityValues = ["warning", "error"] as const;

export const recordLimits = {
  idLength: 80,
  shortText: 120,
  titleText: 200,
  attributionText: 300,
  bodyText: 4000,
  locatorText: 500,
  summaryText: 2000,
  revisionMax: 1_000_000,
  sectionCount: 4,
  listMax: 50,
  variantMax: 8,
  itemMax: 50,
  findingMax: 100,
  answerTargetMax: 10,
  answerRelationshipMax: 100,
  scoreMin: 0,
  scoreMax: 100,
  ordinalMin: 1,
  receiptResultIdMax: 10,
  editMax: 50,
} as const;
