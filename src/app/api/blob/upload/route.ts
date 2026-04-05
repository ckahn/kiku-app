// Server handler for Vercel Blob client uploads.
// The browser calls this route twice:
//   1. To get a signed upload token (generate-client-token)
//   2. To notify completion (upload-completed)
// The actual file bytes go directly from the browser to Vercel Blob — never through this function.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  const json = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => ({
      // Restrict uploads to audio files only
      allowedContentTypes: [
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/*',
      ],
      allowOverwrite: true,
    }),

  });

  return Response.json(json);
}
