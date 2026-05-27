/**
 * Eval: Study guide completeness
 *
 * Checks that vocabulary and structures cover all meaningful content words
 * and grammatical patterns in the chunk. Breakdown coverage does not count.
 *
 * Grading: LLM-as-judge using claude-opus-4-7 (intentionally different from
 * the generator model, per Anthropic eval guidance).
 *
 * Usage:
 *   npx tsx evals/eval-study-guide-completeness.ts
 *
 * Requires: KIKU_APP_DATABASE_URL and ANTHROPIC_API_KEY in .env.local
 * USE_MOCKS must not be 'true'.
 */

import { resolve } from 'path';
import { config } from 'dotenv';
import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { generateStudyGuideFromProvider } from '@/lib/api/study-guide-provider';
import { STUDY_GUIDE_CONTEXT_CHUNKS } from '@/lib/constants';
import type { StudyGuideContent } from '@/lib/api/types';

// Must run before DB modules are imported — db/index.ts reads env at init time.
config({ path: resolve(process.cwd(), '.env.local') });

const JUDGE_MODEL = 'claude-opus-4-7';

interface Fixture {
  readonly episodeId: number;
  readonly chunkId: number;
  readonly expected: 'pass' | 'fail';
  readonly note: string;
}

const FIXTURES: readonly Fixture[] = [
  {
    episodeId: 13,
    chunkId: 403,
    expected: 'fail',
    note: 'や (non-exhaustive listing particle) missing from structures',
  },
  {
    episodeId: 7,
    chunkId: 293,
    expected: 'pass',
    note: '',
  },
];

const judgeOutputSchema = z.object({
  reasoning: z.string(),
  verdict: z.enum(['pass', 'fail']),
  missing: z.array(z.string()),
});

function buildJudgePrompt(chunkText: string, guide: StudyGuideContent): string {
  return `You are evaluating the completeness of a Japanese language study guide.

Chunk text (the Japanese passage being studied):
<chunk>
${chunkText}
</chunk>

Vocabulary items in the study guide:
${guide.vocabulary.map((v) => v.japanese).join(', ')}

Structure patterns in the study guide:
${guide.structures.map((s) => s.pattern).join(', ')}

Evaluation criteria:
- vocabulary must contain every meaningful content word in the chunk (nouns, verbs, adjectives, adverbs, and particles that carry semantic weight).
- structures must contain every meaningful grammatical pattern, conjugation, or particle usage. This includes verb conjugation patterns (e.g. たり〜たり), sentence-ending patterns (e.g. んです), connective forms, and grammatical particles used in a teachable way (e.g. や for non-exhaustive listing, から for reason, のに for contrast).
- "Meaningful" means genuinely useful for a Japanese learner studying this passage.

Think step by step: enumerate every content word and grammatical pattern you find in the chunk text, then verify each is covered in vocabulary or structures. Output your step-by-step analysis in reasoning, then give a final verdict.`;
}

async function judgeStudyGuide(
  chunkText: string,
  guide: StudyGuideContent
): Promise<z.infer<typeof judgeOutputSchema>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = createAnthropic({ apiKey });
  const result = await generateText({
    model: anthropic(JUDGE_MODEL),
    output: Output.object({ schema: judgeOutputSchema }),
    prompt: buildJudgePrompt(chunkText, guide),
  });

  return result.output;
}

async function main(): Promise<void> {
  if (process.env.USE_MOCKS === 'true') {
    console.error('Error: USE_MOCKS=true — eval must run against the real API, not fixtures.');
    process.exit(1);
  }

  // DB modules imported here so dotenv.config() above runs first.
  const { getChunkById, getChunksByEpisodeId } = await import('@/db/chunks');
  const { getStudyGuideByChunkId } = await import('@/db/study-guides');
  const { db } = await import('@/db');
  const { episodes, podcasts } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');

  async function buildStudyUrl(episodeId: number, chunkIndex: number): Promise<string> {
    const [row] = await db
      .select({ slug: podcasts.slug, episodeNumber: episodes.episodeNumber })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(episodes.id, episodeId));
    if (!row) throw new Error(`Episode ${episodeId} not found`);
    return `/podcasts/${row.slug}/episodes/${row.episodeNumber}/segments/${chunkIndex}/study`;
  }

  console.log('Study Guide Completeness Eval');
  console.log(`Judge model: ${JUDGE_MODEL}`);
  console.log(`Fixtures: ${FIXTURES.length}`);

  let allMatched = true;

  for (const fixture of FIXTURES) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(
      `Chunk ${fixture.chunkId} (episode ${fixture.episodeId}) — expected: ${fixture.expected.toUpperCase()}`
    );
    if (fixture.note) console.log(`Note: ${fixture.note}`);

    const chunk = await getChunkById(fixture.chunkId);
    if (!chunk) {
      console.error(`ERROR: Chunk ${fixture.chunkId} not found in DB`);
      allMatched = false;
      continue;
    }

    const studyUrl = await buildStudyUrl(fixture.episodeId, chunk.chunkIndex);
    console.log(`URL: ${studyUrl}`);

    const allChunks = await getChunksByEpisodeId(fixture.episodeId);
    const contextText = allChunks
      .slice(-STUDY_GUIDE_CONTEXT_CHUNKS)
      .map((c) => c.textRaw)
      .join('\n');

    console.log(`\nChunk text:\n${chunk.textRaw}`);

    console.log('\nGenerating study guide (live)...');
    const liveGuide = await generateStudyGuideFromProvider(chunk.textRaw, contextText);

    console.log('\n--- Live guide: vocabulary ---');
    for (const v of liveGuide.vocabulary) {
      console.log(`  ${v.japanese} (${v.dictionaryForm}): ${v.meaning}`);
    }

    console.log('\n--- Live guide: structures ---');
    for (const s of liveGuide.structures) {
      console.log(`  ${s.pattern}: ${s.meaning}`);
    }

    const storedRow = await getStudyGuideByChunkId(fixture.chunkId);
    const storedGuide = storedRow?.content as StudyGuideContent | undefined;

    if (storedGuide) {
      console.log('\n--- Stored guide: vocabulary (reference) ---');
      for (const v of storedGuide.vocabulary) {
        console.log(`  ${v.japanese}: ${v.meaning}`);
      }
      console.log('\n--- Stored guide: structures (reference) ---');
      for (const s of storedGuide.structures) {
        console.log(`  ${s.pattern}: ${s.meaning}`);
      }
    } else {
      console.log('\n(No stored guide found for this chunk)');
    }

    console.log('\nRunning judge...');
    const judgment = await judgeStudyGuide(chunk.textRaw, liveGuide);

    console.log(`\nJudge reasoning:\n${judgment.reasoning}`);
    if (judgment.missing.length > 0) {
      console.log(`Missing items: ${judgment.missing.join(', ')}`);
    }

    const matched = judgment.verdict === fixture.expected;
    const symbol = matched ? '✓' : '✗';
    console.log(
      `\n${symbol} Verdict: ${judgment.verdict.toUpperCase()} (expected: ${fixture.expected.toUpperCase()}) — ${matched ? 'MATCH' : 'MISMATCH'}`
    );

    if (!matched) allMatched = false;
  }

  console.log(`\n${'═'.repeat(60)}`);
  if (allMatched) {
    console.log('All fixture verdicts matched. ✓');
    process.exit(0);
  } else {
    console.log('One or more fixture verdicts did not match. ✗');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
