ALTER TABLE "standards" DROP CONSTRAINT "standards_pkey";--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_pkey" PRIMARY KEY("tenant_id","id");
