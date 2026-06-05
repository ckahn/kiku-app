ALTER TYPE "public"."episode_status" RENAME VALUE 'chunking' TO 'segmenting';--> statement-breakpoint
ALTER TABLE "chunks" RENAME TO "segments";--> statement-breakpoint
ALTER TABLE "segments" RENAME COLUMN "chunk_index" TO "segment_index";--> statement-breakpoint
ALTER TABLE "study_guides" RENAME COLUMN "chunk_id" TO "segment_id";--> statement-breakpoint
ALTER TABLE "segments" RENAME CONSTRAINT "chunks_episode_id_episodes_id_fk" TO "segments_episode_id_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "segments" RENAME CONSTRAINT "chunks_episode_id_chunk_index_unique" TO "segments_episode_id_segment_index_unique";--> statement-breakpoint
ALTER TABLE "study_guides" RENAME CONSTRAINT "study_guides_chunk_id_chunks_id_fk" TO "study_guides_segment_id_segments_id_fk";--> statement-breakpoint
ALTER TABLE "study_guides" RENAME CONSTRAINT "study_guides_chunk_id_unique" TO "study_guides_segment_id_unique";
