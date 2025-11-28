import type { RefObject } from 'react';

interface TimelinePlayheadProps {
  playheadRef: RefObject<HTMLDivElement | null>;
  playheadPercent: number;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function TimelinePlayhead({
  playheadRef,
  playheadPercent,
  onMouseDown,
}: TimelinePlayheadProps) {
  return (
    <div
      ref={playheadRef}
      className="absolute top-0 h-full w-4 cursor-ew-resize z-20 flex justify-center"
      style={{ left: `calc(${playheadPercent}% - 8px)` }}
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-0.5 h-full bg-white" />
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
    </div>
  );
}
