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
}

export interface StudyGuideProviderResponse {
  readonly object: StudyGuideContent;
}

export const studyGuideProviderRequestSchema = z.object({
  chunkText: z.string().min(1),
}) satisfies z.ZodType<StudyGuideProviderRequest>;

export const studyGuideProviderResponseSchema = z.object({
  object: studyGuideContentSchema,
}) satisfies z.ZodType<StudyGuideProviderResponse>;

export function parseStudyGuideProviderRequest(request: unknown): StudyGuideProviderRequest {
  const result = studyGuideProviderRequestSchema.safeParse(request);

  if (!result.success) {
    throw new Error(
      `Invalid study guide provider request: ${result.error.issues[0]?.message ?? 'Unknown error'}`
    );
  }

  return result.data;
}

export function parseStudyGuideProviderResponse(response: unknown): StudyGuideContent {
  const result = studyGuideProviderResponseSchema.safeParse(response);

  if (!result.success) {
    throw new Error(
      `Invalid study guide provider response: ${result.error.issues[0]?.message ?? 'Unknown error'}`
    );
  }

  return result.data.object;
}

function generateFakeStudyGuideProviderResponse(
  request: StudyGuideProviderRequest
): StudyGuideProviderResponse {
  parseStudyGuideProviderRequest(request);

  return {
    object: studyGuideFixture as StudyGuideContent,
  };
}

function buildStudyGuidePrompt(chunkText: string): string {
  return `You are a Japanese teacher creating a concise mobile study guide for one Japanese podcast chunk.

Return structured JSON only.

Chunk text:
${chunkText}

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
- Use hiragana in reading fields when a reading is useful
- If a reading is unnecessary, return null
- breakdown.order must start at 0 and increase by 1
- Every id must be a short stable string
- Keep the translation natural English, not word-for-word unless needed for clarity`;
}

async function generateStudyGuideWithClaude(
  request: StudyGuideProviderRequest
): Promise<StudyGuideProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = createAnthropic({ apiKey });
  const { object } = await generateObject({
    model: anthropic(CLAUDE_STUDY_GUIDE_MODEL),
    schema: studyGuideContentSchema,
    prompt: buildStudyGuidePrompt(request.chunkText),
    temperature: 0,
  });

  return {
    object,
  };
}

export async function generateStudyGuideFromProvider(
  chunkText: string
): Promise<StudyGuideContent> {
  const request = parseStudyGuideProviderRequest({ chunkText });

  if (process.env.USE_MOCKS === 'true') {
    return parseStudyGuideProviderResponse(generateFakeStudyGuideProviderResponse(request));
  }

  return parseStudyGuideProviderResponse(await generateStudyGuideWithClaude(request));
}
