'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';

interface PodcastCreateFormProps {
  onClose?: () => void;
}

export default function PodcastCreateForm({ onClose }: PodcastCreateFormProps) {
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
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.');
      setLoading(false);
      return;
    }
    onClose?.();
    router.push(`/podcasts/${data.data.slug}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
      <Button type="submit" loading={loading} className="w-full">
        {loading ? 'Creating…' : 'Add podcast'}
      </Button>
    </form>
  );
}
