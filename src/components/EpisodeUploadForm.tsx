'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '@/lib/utils';
import { Button, Input } from '@/components/ui';

interface EpisodeUploadFormProps {
  podcastId: string;
}

export default function EpisodeUploadForm({ podcastId }: EpisodeUploadFormProps) {
  const router = useRouter();
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('episodeNumber', episodeNumber);
      if (title) body.append('title', title);
      body.append('file', file);
      const res = await fetch(`/api/podcasts/${podcastId}/episodes`, { method: 'POST', body });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Upload failed (${res.status})`);
      }
      setEpisodeNumber('');
      setTitle('');
      setFile(null);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mb-4">
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
        className="block text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink file:cursor-pointer"
      />
      {loading && (
        <p className="text-sm text-muted">Uploading… this may take a moment.</p>
      )}
      {error && (
        <p className="text-xs text-error-on-subtle">{error}</p>
      )}
      <Button type="submit" disabled={loading || !file} loading={loading}>
        {loading ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}
