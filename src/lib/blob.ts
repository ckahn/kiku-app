import { BlobNotFoundError, del, get, type GetBlobResult } from '@vercel/blob';

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }
  return token;
}

export async function getPrivateBlob(
  url: string,
  extraHeaders?: HeadersInit,
): Promise<GetBlobResult | null> {
  return get(url, {
    access: 'private',
    token: getBlobToken(),
    useCache: false,
    ...(extraHeaders ? { headers: extraHeaders } : {}),
  });
}

export function isBlobNotFoundError(error: unknown): boolean {
  return error instanceof BlobNotFoundError;
}

export async function deletePrivateBlob(url: string): Promise<'deleted' | 'not_found'> {
  try {
    await del(url, { token: getBlobToken() });
    return 'deleted';
  } catch (error: unknown) {
    if (isBlobNotFoundError(error)) {
      return 'not_found';
    }

    throw error;
  }
}
