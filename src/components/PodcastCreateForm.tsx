'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';

export default function PodcastCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/podcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      setLoading(false);
      return;
    }
    setName('');
    setDescription('');
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Podcast name"
        required
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      {error && <p className="text-xs text-error-on-subtle">{error}</p>}
      <Button type="submit" loading={loading}>
        {loading ? 'Creating…' : 'Add Podcast'}
      </Button>
    </form>
  );
}
