'use client';

interface ProgressBarProps {
  readonly currentTime: number;
  readonly durationSec: number;
  readonly onSeek: (timeSec: number) => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export default function ProgressBar({ currentTime, durationSec, onSeek }: ProgressBarProps) {
  const pct = durationSec > 0 ? (currentTime / durationSec) * 100 : 0;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onSeek(Number(e.target.value));
  }

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="text-xs tabular-nums text-muted w-9 shrink-0 text-right">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={durationSec}
        step={0.1}
        value={currentTime}
        onChange={handleChange}
        aria-label="Playback position"
        className="flex-1 h-1 accent-primary cursor-pointer"
      />
      <span className="text-xs tabular-nums text-muted w-9 shrink-0">
        {formatTime(durationSec)}
      </span>
    </div>
  );
}
