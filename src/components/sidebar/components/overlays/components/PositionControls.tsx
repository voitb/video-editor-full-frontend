/**
 * Position Controls
 * Slider controls for overlay X/Y position.
 */

export interface PositionControlsProps {
  position: { xPercent: number; yPercent: number };
  onPositionUpdate: (position: Partial<{ xPercent: number; yPercent: number }>) => void;
}

export function PositionControls({ position, onPositionUpdate }: PositionControlsProps) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        backgroundColor: '#1e1e1e',
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Position</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: '#666' }}>
            X: {position.xPercent.toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={position.xPercent}
            onChange={(e) => onPositionUpdate({ xPercent: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: '#666' }}>
            Y: {position.yPercent.toFixed(0)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={position.yPercent}
            onChange={(e) => onPositionUpdate({ yPercent: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
