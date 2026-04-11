import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import studyGuideFixture from '../../../fixtures/study-guide.json';
import { z } from 'zod';
import { CLAUDE_STUDY_GUIDE_MODEL } from '@/lib/constants';
import { studyGuideContentSchema } from './study-guide';
import type { StudyGuideContent } from './types';

// TODO: Standardize the rest of our external capability integrations around this
// provider pattern too (for example transcript, chunking, and furigana) so route
// handlers depend on app-shaped providers instead of vendor-specific modules.
export interface StudyGuideProviderRequest {
  readonly chunkText: string;
  readonly transcriptText: string;
}

export const studyGuideProviderRequestSchema = z.object({
  chunkText: z.string().min(1),
  transcriptText: z.string().min(1),
}) satisfies z.ZodType<StudyGuideProviderRequest>;

export function parseStudyGuideProviderRequest(request: unknown): StudyGuideProviderRequest {
  const result = studyGuideProviderRequestSchema.safeParse(request);

  if (!result.success) {
    throw new Error(
      `Invalid study guide provider request: ${result.error.issues[0]?.message ?? 'Unknown error'}`
    );
  }

  return result.data;
}

function buildStudyGuidePrompt(request: StudyGuideProviderRequest): string {
  // We send the full episode transcript so the model has enough context to
  // produce accurate translations and grammar notes for the chunk (e.g. to
  // resolve pronouns or topic-dropped subjects that only make sense in context).
  //
  // TODO: This multiplies token cost by the number of chunks per episode.
  // Consider a more efficient approach — e.g. store a short episode summary
  // and pass that instead, and/or include only the N segments immediately
  // surrounding the chunk.
  return `You are a Japanese teacher creating a concise mobile study guide for one Japanese podcast chunk.

Return structured JSON only.

Full transcript for context:
${request.transcriptText}

Chunk text:
${request.chunkText}

Output requirements:
- version must be 2
- vocabulary: a curated list of the most useful words or short expressions only
- structures: a short list of key grammar patterns or sentence structures
- breakdown: guided interpretation steps in natural study order
- translation.fullEnglish: one complete fallback English translation

Content rules:
- Do not be exhaustive
- Prefer clarity over completeness
- Keep explanations concise and learner-friendly
- Reading fields: provide a hiragana reading ONLY when the text contains at least one kanji character; otherwise return null
- breakdown.cue must be an instructive explanation of the segment's meaning or grammar — never a question or quiz prompt
- breakdown.order must start at 0 and increase by 1
- Every id must be a short stable string
- Keep the translation natural English, not word-for-word unless needed for clarity`;
}

async function generateStudyGuideWithClaude(
  request: StudyGuideProviderRequest
): Promise<StudyGuideContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = createAnthropic({ apiKey });
  const { object } = await generateObject({
    model: anthropic(CLAUDE_STUDY_GUIDE_MODEL),
    schema: studyGuideContentSchema,
    prompt: buildStudyGuidePrompt(request),
    temperature: 0,
  });

  return object;
}

export async function generateStudyGuideFromProvider(
  chunkText: string,
  transcriptText: string
): Promise<StudyGuideContent> {
  const request = parseStudyGuideProviderRequest({ chunkText, transcriptText });

  if (process.env.USE_MOCKS === 'true') {
    return studyGuideFixture as StudyGuideContent;
  }

  return generateStudyGuideWithClaude(request);
}
