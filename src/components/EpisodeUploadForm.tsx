'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EpisodeUploadForm({ podcastId }: { podcastId: string }) {
  const router = useRouter();
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    const body = new FormData();
    body.append('episodeNumber', episodeNumber);
    if (title) body.append('title', title);
    body.append('file', file);
    await fetch(`/api/podcasts/${podcastId}/episodes`, { method: 'POST', body });
    setEpisodeNumber('');
    setTitle('');
    setFile(null);
    (e.target as HTMLFormElement).reset();
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mb-4">
      <input
        type="number"
        value={episodeNumber}
        onChange={(e) => setEpisodeNumber(e.target.value)}
        placeholder="Episode number"
        required
        className="border rounded px-3 py-2 w-full"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="border rounded px-3 py-2 w-full"
      />
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        required
        className="block"
      />
      <button
        type="submit"
        disabled={loading || !file}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Uploading…' : 'Upload'}
      </button>
      {loading && (
        <p className="text-sm text-gray-500">Uploading… this may take a moment.</p>
      )}
    </form>
  );
}
