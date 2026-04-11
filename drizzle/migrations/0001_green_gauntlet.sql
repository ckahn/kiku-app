ALTER TABLE "drilldowns" RENAME TO "study_guides";--> statement-breakpoint
ALTER TABLE "study_guides" DROP CONSTRAINT "drilldowns_chunk_id_unique";--> statement-breakpoint
ALTER TABLE "study_guides" DROP CONSTRAINT "drilldowns_chunk_id_chunks_id_fk";
--> statement-breakpoint
ALTER TABLE "study_guides" ADD CONSTRAINT "study_guides_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_guides" ADD CONSTRAINT "study_guides_chunk_id_unique" UNIQUE("chunk_id");