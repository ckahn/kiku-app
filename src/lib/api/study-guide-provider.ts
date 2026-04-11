import studyGuideFixture from '../../../fixtures/study-guide.json';
import { z } from 'zod';
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
    object: studyGuideFixture,
  };
}

export async function generateStudyGuideFromProvider(
  chunkText: string
): Promise<StudyGuideContent> {
  const request = parseStudyGuideProviderRequest({ chunkText });

  if (process.env.USE_MOCKS === 'true') {
    return parseStudyGuideProviderResponse(generateFakeStudyGuideProviderResponse(request));
  }

  throw new Error('Real study guide provider not yet implemented — set USE_MOCKS=true');
}
