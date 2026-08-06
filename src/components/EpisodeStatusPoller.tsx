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
    status === 'segmenting' ? 'segmenting' :
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
  const [waitingForConnection, setWaitingForConnection] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirrors `stalled` for the mount-scoped effect: its closures only ever see
  // the initial state value, so the online handler must read this ref — else a
  // connectivity blip would silently restart a poller the UI declared dead.
  const stalledRef = useRef(false);
  const segmentTriggeredRef = useRef(false);
  const transcribeTriggeredRef = useRef(false);
  const currentStatusRef = useRef(initialStatus);
  const lastStatusChangeAtRef = useRef(Date.now());

  useEffect(() => {
    if (TERMINAL_STATUSES.has(status)) return;

    let cleanedUp = false;

    function stopInterval(): void {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    async function startProcessing(): Promise<void> {
      // Never spin against a dead network, never run two loops at once, and
      // never resurrect a stalled poller (the stall UI says it's dead).
      if (cleanedUp || stalledRef.current || intervalRef.current || !navigator.onLine) return;
      setWaitingForConnection(false);

      if (currentStatusRef.current === 'uploaded' && !transcribeTriggeredRef.current) {
        transcribeTriggeredRef.current = true;
        try {
          await fetch(`/api/episodes/${episodeId}/transcribe`, { method: 'POST' });
        } catch {
          // Kicked offline mid-request — the `online` listener resumes later.
          transcribeTriggeredRef.current = false;
          return;
        }
      }

      if (cleanedUp || intervalRef.current || !navigator.onLine) return;

      intervalRef.current = setInterval(async () => {
        let res: Response;
        try {
          res = await fetch(`/api/episodes/${episodeId}`);
        } catch {
          // Transient failure (e.g. dropped connection). The `offline` event
          // handler stops the loop for a genuine disconnect; skip this tick.
          return;
        }
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
          stopInterval();
          stalledRef.current = true;
          setStalled(true);
          return;
        }

        if (newStatus === 'segmenting' && !segmentTriggeredRef.current) {
          segmentTriggeredRef.current = true;
          fetch(`/api/episodes/${episodeId}/segment`, { method: 'POST' });
        }

        if (TERMINAL_STATUSES.has(newStatus)) {
          stopInterval();
          router.refresh();
        }
      }, pollIntervalMs);
    }

    function handleOnline(): void {
      if (!cleanedUp) void startProcessing();
    }

    function handleOffline(): void {
      stopInterval();
      if (!cleanedUp && !stalledRef.current && !TERMINAL_STATUSES.has(currentStatusRef.current)) {
        setWaitingForConnection(true);
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      void startProcessing();
    } else {
      setWaitingForConnection(true);
    }

    return () => {
      cleanedUp = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopInterval();
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

  if (waitingForConnection) {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted">
        Offline — processing will resume when you reconnect.
      </div>
    );
  }

  const label =
    status === 'transcribing' ? 'Transcribing…' :
    status === 'segmenting' ? 'Segmenting…' :
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
