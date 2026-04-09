CREATE TYPE "public"."episode_status" AS ENUM('uploaded', 'transcribing', 'chunking', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."furigana_status" AS ENUM('ok', 'suspect');--> statement-breakpoint
CREATE TYPE "public"."review_outcome" AS ENUM('comfortable', 'needs_work');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('new', 'studying', 'learned');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"text_raw" text NOT NULL,
	"text_furigana" text NOT NULL,
	"furigana_status" "furigana_status" DEFAULT 'ok' NOT NULL,
	"furigana_warning" text,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"sentences" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "chunks_episode_id_chunk_index_unique" UNIQUE("episode_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "drilldowns" (
	"id" serial PRIMARY KEY NOT NULL,
	"chunk_id" integer NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "drilldowns_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"podcast_id" integer NOT NULL,
	"title" text NOT NULL,
	"episode_number" integer NOT NULL,
	"audio_url" text NOT NULL,
	"duration_ms" integer,
	"status" "episode_status" DEFAULT 'uploaded' NOT NULL,
	"study_status" "study_status" DEFAULT 'new' NOT NULL,
	"learned_at" timestamp with time zone,
	"next_review" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "episodes_podcast_id_episode_number_unique" UNIQUE("podcast_id","episode_number")
);
--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "podcasts_name_unique" UNIQUE("name"),
	CONSTRAINT "podcasts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "raw_transcripts" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now(),
	"outcome" "review_outcome" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilldowns" ADD CONSTRAINT "drilldowns_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_transcripts" ADD CONSTRAINT "raw_transcripts_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;