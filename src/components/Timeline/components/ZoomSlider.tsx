/**
 * Timeline Zoom Slider
 * Logarithmic zoom slider for natural zoom feel.
 */

import type { ZoomSliderProps } from '../types';
import { TIMELINE_COLORS } from '../../../constants';

export function ZoomSlider({ zoomLevel, minZoom, maxZoom, onChange }: ZoomSliderProps) {
  // Use logarithmic scale for more natural feel
  const logMin = Math.log(minZoom);
  const logMax = Math.log(maxZoom);
  const logValue = Math.log(zoomLevel);
  const sliderValue = ((logValue - logMin) / (logMax - logMin)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const logZoom = logMin + (value / 100) * (logMax - logMin);
    onChange(Math.exp(logZoom));
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        width: 70,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 8, color: TIMELINE_COLORS.textMuted, flexShrink: 0 }}>−</span>
      <input
        type="range"
        min={0}
        max={100}
        value={sliderValue}
        onChange={handleChange}
        style={{
          flex: 1,
          minWidth: 0,
          height: 4,
          WebkitAppearance: 'none',
          appearance: 'none',
          background: `linear-gradient(to right, ${TIMELINE_COLORS.clipVideo} 0%, ${TIMELINE_COLORS.clipVideo} ${sliderValue}%, ${TIMELINE_COLORS.border} ${sliderValue}%, ${TIMELINE_COLORS.border} 100%)`,
          borderRadius: 2,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 8, color: TIMELINE_COLORS.textMuted, flexShrink: 0 }}>+</span>
    </div>
  );
}
