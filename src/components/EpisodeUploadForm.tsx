'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { getErrorMessage } from '@/lib/utils';
import { Button, Input } from '@/components/ui';

interface EpisodeUploadFormProps {
  podcastId: string;
  podcastSlug: string;
  onClose?: () => void;
}

export default function EpisodeUploadForm({ podcastId, podcastSlug, onClose }: EpisodeUploadFormProps) {
  const router = useRouter();
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight upload if the form unmounts (e.g. the modal is closed
  // mid-upload), so the request is dropped instead of navigating on completion.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      // Step 1: Upload file directly to Vercel Blob (bypasses function body size limit)
      const blob = await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/blob/upload',
        abortSignal: controller.signal,
      });

      // Step 2: Create episode record using the returned blob URL
      const res = await fetch(`/api/podcasts/${podcastId}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: blob.url,
          episodeNumber: Number(episodeNumber),
          title: title || undefined,
        }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Upload failed (${res.status})`);
      }
      // Cancelled while finishing — don't navigate away after the user closed the form.
      if (controller.signal.aborted) return;
      const episode = json.data;
      onClose?.();
      router.push(`/podcasts/${podcastSlug}/episodes/${episode.episodeNumber}`);
    } catch (err: unknown) {
      // Swallow the abort triggered by closing the form; it isn't a real failure.
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="number"
        value={episodeNumber}
        onChange={(e) => setEpisodeNumber(e.target.value)}
        placeholder="Episode number"
        required
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
      />
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
        className="block min-h-11 cursor-pointer text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
      />
      {loading && (
        <p className="text-sm text-muted">Uploading… this may take a moment.</p>
      )}
      {error && (
        <p className="text-xs text-error-on-subtle">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading || !file} loading={loading}>
          {loading ? 'Uploading…' : 'Upload'}
        </Button>
      </div>
    </form>
  );
}
