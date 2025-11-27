import { useEffect, useRef } from 'react';

interface VideoPreviewProps {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  width?: number;
  height?: number;
}

export function VideoPreview({ onCanvasReady, width = 640, height = 360 }: VideoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (canvasRef.current && !initializedRef.current) {
      initializedRef.current = true;
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  return (
    <div
      className="relative border border-gray-700 bg-black rounded-lg overflow-hidden"
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full block"
      />
    </div>
  );
}
