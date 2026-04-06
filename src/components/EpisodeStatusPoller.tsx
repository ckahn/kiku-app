'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  readonly episodeId: number;
  readonly initialStatus: string;
  /** Override poll interval — use a small value in tests. Defaults to 2000ms. */
  readonly pollIntervalMs?: number;
  /** Override stall timeout — use a small value in tests. Defaults to 90000ms. */
  readonly stallTimeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_STALL_TIMEOUT_MS = 90_000;
const TERMINAL_STATUSES = new Set(['ready', 'error']);

function stalledMessage(status: string): string {
  const stage =
    status === 'transcribing' ? 'transcription' :
    status === 'chunking' ? 'chunking' :
    null;
  return `Processing stalled${stage ? ` during ${stage}` : ''}. Refresh the page to retry.`;
}

export default function EpisodeStatusPoller({
  episodeId,
  initialStatus,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [stalled, setStalled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTriggeredRef = useRef(false);
  const currentStatusRef = useRef(initialStatus);
  const lastStatusChangeAtRef = useRef(Date.now());

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;

    let cleanedUp = false;

    async function startProcessing() {
      if (status === 'uploaded') {
        await fetch(`/api/episodes/${episodeId}/transcribe`, { method: 'POST' });
      }

      if (cleanedUp) return;

      intervalRef.current = setInterval(async () => {
        const res = await fetch(`/api/episodes/${episodeId}`);
        if (!res.ok) return;

        const json = (await res.json()) as {
          data: { status: string; errorMessage?: string };
        };
        const newStatus = json.data.status;

        if (newStatus !== currentStatusRef.current) {
          currentStatusRef.current = newStatus;
          lastStatusChangeAtRef.current = Date.now();
        }

        setStatus(newStatus);

        if (Date.now() - lastStatusChangeAtRef.current > stallTimeoutMs) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setStalled(true);
          return;
        }

        if (newStatus === 'chunking' && !chunkTriggeredRef.current) {
          chunkTriggeredRef.current = true;
          fetch(`/api/episodes/${episodeId}/chunk`, { method: 'POST' });
        }

        if (TERMINAL_STATUSES.has(newStatus)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          router.refresh();
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

  if (stalled) {
    return (
      <div role="alert" className="text-sm text-red-600">
        {stalledMessage(status)}
      </div>
    );
  }

  const label =
    status === 'transcribing' ? 'Transcribing…' :
    status === 'chunking' ? 'Chunking…' :
    'Processing…';

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
      <span
        className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}
