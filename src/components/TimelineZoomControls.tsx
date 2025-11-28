interface TimelineZoomControlsProps {
  zoomLevel: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
}

export function TimelineZoomControls({
  zoomLevel,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
}: TimelineZoomControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
        title="Zoom Out"
      >
        −
      </button>
      <span className="min-w-[50px] text-center">
        {Math.round(zoomLevel * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
        title="Zoom In"
      >
        +
      </button>
      <button
        onClick={onZoomToFit}
        disabled={zoomLevel === 1}
        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
        title="Zoom to Fit"
      >
        Fit
      </button>
    </div>
  );
}
