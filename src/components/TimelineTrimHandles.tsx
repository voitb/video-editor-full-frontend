import type { RefObject } from 'react';

interface TimelineTrimHandlesProps {
  inHandleRef: RefObject<HTMLDivElement | null>;
  outHandleRef: RefObject<HTMLDivElement | null>;
  activeRegionRef: RefObject<HTMLDivElement | null>;
  inactiveLeftRef: RefObject<HTMLDivElement | null>;
  inactiveRightRef: RefObject<HTMLDivElement | null>;
  inPercent: number;
  outPercent: number;
  onInMouseDown: (e: React.MouseEvent) => void;
  onOutMouseDown: (e: React.MouseEvent) => void;
}

export function TimelineTrimHandles({
  inHandleRef,
  outHandleRef,
  activeRegionRef,
  inactiveLeftRef,
  inactiveRightRef,
  inPercent,
  outPercent,
  onInMouseDown,
  onOutMouseDown,
}: TimelineTrimHandlesProps) {
  return (
    <>
      {/* Active region (between in and out points) */}
      <div
        ref={activeRegionRef}
        className="absolute top-0 h-full bg-gray-600/30"
        style={{
          left: `${inPercent}%`,
          width: `${outPercent - inPercent}%`,
        }}
      />

      {/* Inactive regions (dimmed) */}
      <div
        ref={inactiveLeftRef}
        className="absolute top-0 h-full bg-gray-900/70"
        style={{ left: 0, width: `${inPercent}%` }}
      />
      <div
        ref={inactiveRightRef}
        className="absolute top-0 h-full bg-gray-900/70"
        style={{ left: `${outPercent}%`, right: 0 }}
      />

      {/* In point handle */}
      <div
        ref={inHandleRef}
        className="absolute top-0 h-full w-[12px] bg-green-500 cursor-ew-resize hover:bg-green-400 z-10"
        style={{ left: `calc(${inPercent}% - 6px)` }}
        onMouseDown={onInMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-green-400 whitespace-nowrap">
          IN
        </div>
      </div>

      {/* Out point handle */}
      <div
        ref={outHandleRef}
        className="absolute top-0 h-full w-[12px] bg-red-500 cursor-ew-resize hover:bg-red-400 z-10"
        style={{ left: `calc(${outPercent}% - 6px)` }}
        onMouseDown={onOutMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-red-400 whitespace-nowrap">
          OUT
        </div>
      </div>
    </>
  );
}
