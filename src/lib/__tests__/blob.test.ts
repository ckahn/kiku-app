import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetBlobResult } from '@vercel/blob';

const mockGet = vi.fn();
const mockDel = vi.fn();
class MockBlobNotFoundError extends Error {}

vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: MockBlobNotFoundError,
  del: mockDel,
  get: mockGet,
}));

describe('blob helpers', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-token';
  });

  it('uses the Vercel Blob SDK to fetch private blobs', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('audio'));
        controller.close();
      },
    });

    const blobResult: GetBlobResult = {
      statusCode: 200,
      stream,
      headers: new Headers({ 'content-type': 'audio/mpeg', 'content-length': '5' }),
      blob: {
        url: 'https://blob.example.com/audio.mp3',
        downloadUrl: 'https://blob.example.com/audio.mp3?download=1',
        pathname: 'audio.mp3',
        contentDisposition: 'inline',
        cacheControl: 'private',
        uploadedAt: new Date('2026-04-05T12:00:00.000Z'),
        etag: 'etag-1',
        contentType: 'audio/mpeg',
        size: 5,
      },
    };
    mockGet.mockResolvedValueOnce(blobResult);

    const { getPrivateBlob } = await import('../blob');
    const result = await getPrivateBlob('https://blob.example.com/audio.mp3');

    expect(result).toBe(blobResult);
    expect(mockGet).toHaveBeenCalledWith('https://blob.example.com/audio.mp3', {
      access: 'private',
      token: 'blob-token',
      useCache: false,
    });
  });

  it('forwards extra headers (e.g. Range) to the underlying get call', async () => {
    mockGet.mockResolvedValueOnce(null);

    const { getPrivateBlob } = await import('../blob');
    await getPrivateBlob('https://blob.example.com/audio.mp3', { Range: 'bytes=0-1023' });

    expect(mockGet).toHaveBeenCalledWith('https://blob.example.com/audio.mp3', {
      access: 'private',
      token: 'blob-token',
      useCache: false,
      headers: { Range: 'bytes=0-1023' },
    });
  });

  it('returns null when the blob does not exist', async () => {
    mockGet.mockResolvedValueOnce(null);

    const { getPrivateBlob } = await import('../blob');
    const result = await getPrivateBlob('https://blob.example.com/missing.mp3');

    expect(result).toBeNull();
  });

  it('throws when the blob token is missing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const { getPrivateBlob } = await import('../blob');

    await expect(getPrivateBlob('https://blob.example.com/audio.mp3')).rejects.toThrow(
      'BLOB_READ_WRITE_TOKEN is not configured'
    );
  });

  it('deletes a private blob with the configured token', async () => {
    mockDel.mockResolvedValueOnce(undefined);

    const { deletePrivateBlob } = await import('../blob');
    const result = await deletePrivateBlob('https://blob.example.com/audio.mp3');

    expect(result).toBe('deleted');
    expect(mockDel).toHaveBeenCalledWith('https://blob.example.com/audio.mp3', {
      token: 'blob-token',
    });
  });

  it('treats missing blobs as a non-fatal delete result', async () => {
    mockDel.mockRejectedValueOnce(new MockBlobNotFoundError('missing'));

    const { deletePrivateBlob } = await import('../blob');
    const result = await deletePrivateBlob('https://blob.example.com/missing.mp3');

    expect(result).toBe('not_found');
  });
});
