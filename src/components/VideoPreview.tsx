/**
 * Video Editor V2 - VideoPreview Component
 * Canvas-based video preview with playback controls.
 */

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

export interface VideoPreviewProps {
  /** Width of the preview canvas */
  width?: number;
  /** Height of the preview canvas */
  height?: number;
  /** CSS class name */
  className?: string;
  /** CSS styles */
  style?: React.CSSProperties;
  /** Callback when canvas is ready */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export interface VideoPreviewHandle {
  /** Get the canvas element */
  getCanvas: () => HTMLCanvasElement | null;
}

/**
 * Video preview component that renders video frames to a canvas.
 * Connect this to the useEngine hook for playback.
 *
 * @example
 * ```tsx
 * const previewRef = useRef<VideoPreviewHandle>(null);
 * const { composition } = useComposition();
 * const { initialize, play, pause } = useEngine({ composition });
 *
 * useEffect(() => {
 *   const canvas = previewRef.current?.getCanvas();
 *   if (canvas) {
 *     initialize(canvas);
 *   }
 * }, [initialize]);
 *
 * return (
 *   <VideoPreview
 *     ref={previewRef}
 *     width={1280}
 *     height={720}
 *   />
 * );
 * ```
 */
export const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(
  function VideoPreview(props, ref) {
    const {
      width = 1280,
      height = 720,
      className,
      style,
      onCanvasReady,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Expose canvas via ref
    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
    }), []);

    // Notify when canvas is ready
    useEffect(() => {
      if (canvasRef.current && onCanvasReady) {
        onCanvasReady(canvasRef.current);
      }
    }, [onCanvasReady]);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{
          backgroundColor: '#000',
          ...style,
        }}
      />
    );
  }
);
