'use client';
import { useEffect, useRef, useState } from 'react';

interface Props {
  readonly episodeId: number;
  readonly initialStatus: string;
  readonly transcriptText?: string;
  readonly errorMessage?: string | null;
  /** Override poll interval — use a small value in tests. Defaults to 2000ms. */
  readonly pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(['ready', 'error']);

export default function EpisodeStatusPoller({
  episodeId,
  initialStatus,
  transcriptText: initialTranscriptText,
  errorMessage: initialErrorMessage,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [transcriptText, setTranscriptText] = useState(initialTranscriptText ?? null);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;

    let cleanedUp = false;

    async function startProcessing() {
      if (status === 'uploaded') {
        await fetch(`/api/episodes/${episodeId}/process`, { method: 'POST' });
      }

      if (cleanedUp) return;

      intervalRef.current = setInterval(async () => {
        const res = await fetch(`/api/episodes/${episodeId}`);
        if (!res.ok) return;

        const json = (await res.json()) as {
          data: { status: string; transcriptText?: string; errorMessage?: string };
        };
        const episode = json.data;

        setStatus(episode.status);

        if (episode.status === 'ready') {
          setTranscriptText(episode.transcriptText ?? null);
        }
        if (episode.status === 'error') {
          setErrorMessage(episode.errorMessage ?? null);
        }

        if (TERMINAL_STATUSES.has(episode.status)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
        }
      }, pollIntervalMs);
    }

    startProcessing();

    return () => {
      cleanedUp = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-error-subtle bg-error-subtle px-4 py-3 text-sm text-error-on-subtle"
      >
        {errorMessage ?? 'Processing failed.'}
      </div>
    );
  }

  if (status === 'ready' && transcriptText) {
    return (
      <p className="text-sm text-ink font-jp leading-loose whitespace-pre-wrap">
        {transcriptText}
      </p>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
      <span
        className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
        aria-hidden="true"
      />
      {status === 'transcribing' ? 'Transcribing…' : 'Processing…'}
    </div>
  );
}
