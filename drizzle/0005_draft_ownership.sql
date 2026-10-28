ALTER TABLE "lesson_generation_attempts" DROP CONSTRAINT "lesson_generation_attempts_tenant_id_idempotency_key_key";--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" DROP CONSTRAINT "lesson_generation_attempts_tenant_id_request_id_fkey";--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" DROP CONSTRAINT "lesson_draft_requests_tenant_id_teacher_id_fkey";--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ADD COLUMN "teacher_id" text;--> statement-breakpoint
UPDATE "lesson_generation_attempts" AS attempt
SET "teacher_id" = request."teacher_id"
FROM "lesson_draft_requests" AS request
WHERE request."tenant_id" = attempt."tenant_id" AND request."id" = attempt."request_id";--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ALTER COLUMN "teacher_id" SET NOT NULL;--> statement-breakpoint
INSERT INTO "actors" ("id", "display_name")
SELECT DISTINCT identity."id", identity."display_name"
FROM "identities" AS identity
JOIN "lesson_draft_requests" AS request
  ON request."tenant_id" = identity."tenant_id"
 AND request."teacher_id" = identity."id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ADD CONSTRAINT "lesson_draft_requests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_draft_requests" ADD CONSTRAINT "lesson_draft_requests_tenant_id_id_teacher_id_key" UNIQUE("tenant_id","id","teacher_id");--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ADD CONSTRAINT "lesson_generation_attempts_tenant_id_request_id_teacher_id_fkey" FOREIGN KEY ("tenant_id","request_id","teacher_id") REFERENCES "public"."lesson_draft_requests"("tenant_id","id","teacher_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_generation_attempts" ADD CONSTRAINT "lesson_generation_attempts_idempotency_scope_key" UNIQUE("tenant_id","teacher_id","idempotency_key");
