ALTER TABLE "segments" ADD COLUMN "study_status" "study_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "learned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "next_review" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "study_status";--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "learned_at";--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "next_review";--> statement-breakpoint
ALTER TABLE "review_log" DROP CONSTRAINT "review_log_episode_id_episodes_id_fk";--> statement-breakpoint
ALTER TABLE "review_log" DROP COLUMN "episode_id";--> statement-breakpoint
ALTER TABLE "review_log" ADD COLUMN "segment_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;