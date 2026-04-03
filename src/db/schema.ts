import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Enums must be declared before the tables that use them
export const episodeStatusEnum = pgEnum('episode_status', [
  'uploaded', 'transcribing', 'chunking', 'ready', 'error',
]);
export const studyStatusEnum = pgEnum('study_status', ['new', 'studying', 'learned']);
export const reviewOutcomeEnum = pgEnum('review_outcome', ['comfortable', 'needs_work']);

export const podcasts = pgTable('podcasts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  podcastId: integer('podcast_id')
    .notNull()
    .references(() => podcasts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  audioUrl: text('audio_url').notNull(),
  durationMs: integer('duration_ms'),
  status: episodeStatusEnum('status').notNull().default('uploaded'),
  studyStatus: studyStatusEnum('study_status').notNull().default('new'),
  learnedAt: timestamp('learned_at', { withTimezone: true }),
  nextReview: timestamp('next_review', { withTimezone: true }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [unique().on(table.podcastId, table.episodeNumber)]);

export const rawTranscripts = pgTable('raw_transcripts', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const chunks = pgTable('chunks', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  textRaw: text('text_raw').notNull(),
  textFurigana: text('text_furigana').notNull(),
  startMs: integer('start_ms').notNull(),
  endMs: integer('end_ms').notNull(),
  sentences: jsonb('sentences').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [unique().on(table.episodeId, table.chunkIndex)]);

export const drilldowns = pgTable('drilldowns', {
  id: serial('id').primaryKey(),
  chunkId: integer('chunk_id')
    .notNull()
    .references(() => chunks.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [unique().on(table.chunkId)]);

export const reviewLog = pgTable('review_log', {
  id: serial('id').primaryKey(),
  episodeId: integer('episode_id')
    .notNull()
    .references(() => episodes.id, { onDelete: 'cascade' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow(),
  outcome: reviewOutcomeEnum('outcome').notNull(),
});

// Inferred types for use in components and API routes
export type Podcast = typeof podcasts.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Drilldown = typeof drilldowns.$inferSelect;
