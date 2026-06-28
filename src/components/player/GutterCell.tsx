'use client';

interface GutterCellProps {
  readonly segmentId: number;
  readonly inRange: boolean;
  readonly isRangeStart: boolean;
  readonly isRangeEnd: boolean;
  readonly onStartPointerDown: (e: React.PointerEvent) => void;
  readonly onEndPointerDown: (e: React.PointerEvent) => void;
  readonly onStartKeyDown: (e: React.KeyboardEvent) => void;
  readonly onEndKeyDown: (e: React.KeyboardEvent) => void;
}

export default function GutterCell({
  segmentId,
  inRange,
  isRangeStart,
  isRangeEnd,
  onStartPointerDown,
  onEndPointerDown,
  onStartKeyDown,
  onEndKeyDown,
}: GutterCellProps) {
  return (
    <div
      data-gutter-id={segmentId}
      className="relative flex w-11 shrink-0 items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Faint full-height track so the gutter reads as a column. */}
      <span aria-hidden className="absolute inset-y-0 w-1.5 rounded-full bg-border/50" />
      {/* Filled bar for in-range cells; capped only at the endpoints. */}
      {inRange && (
        <span
          aria-hidden
          className={`absolute inset-y-0 w-1.5 bg-primary ${isRangeStart ? 'rounded-t-full' : ''} ${isRangeEnd ? 'rounded-b-full' : ''}`}
        />
      )}
      {/* Start handle on the first in-range cell. */}
      {inRange && isRangeStart && (
        <button
          type="button"
          onPointerDown={onStartPointerDown}
          onKeyDown={onStartKeyDown}
          aria-label="Drag to move loop start"
          style={{ touchAction: 'none' }}
          className="absolute -top-1 flex h-11 w-11 cursor-grab items-start justify-center active:cursor-grabbing"
        >
          <span aria-hidden className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
        </button>
      )}
      {/* End handle on the last in-range cell. */}
      {inRange && isRangeEnd && (
        <button
          type="button"
          onPointerDown={onEndPointerDown}
          onKeyDown={onEndKeyDown}
          aria-label="Drag to move loop end"
          style={{ touchAction: 'none' }}
          className="absolute -bottom-1 flex h-11 w-11 cursor-grab items-end justify-center active:cursor-grabbing"
        >
          <span aria-hidden className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow" />
        </button>
      )}
    </div>
  );
}
