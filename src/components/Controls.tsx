import { formatTime } from '../utils/time';

interface ControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
}

export function Controls({
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
}: ControlsProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={isPlaying ? onPause : onPlay}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium min-w-[80px]"
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <div className="text-sm text-gray-300 font-mono">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}
