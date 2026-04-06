import { get, type GetBlobResult } from '@vercel/blob';

function getBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }
  return token;
}

export async function getPrivateBlob(url: string): Promise<GetBlobResult | null> {
  return get(url, {
    access: 'private',
    token: getBlobToken(),
    useCache: false,
  });
}

export async function getPrivateBlobBuffer(url: string): Promise<Buffer | null> {
  const blob = await getPrivateBlob(url);
  if (!blob) return null;

  const arrayBuffer = await new Response(blob.stream).arrayBuffer();
  return Buffer.from(arrayBuffer);
}
