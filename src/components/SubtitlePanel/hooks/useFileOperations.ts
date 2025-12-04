/**
 * File Operations Hook
 * Handles import/export of SRT and WebVTT subtitle files.
 */

import { useCallback, useRef } from 'react';
import type { Track } from '../../../core/Track';
import type { SubtitleClip } from '../../../core/SubtitleClip';
import { parseSubtitles, exportToSRT, exportToWebVTT } from '../../../utils/subtitle';
import { SUBTITLE } from '../../../constants';

interface SelectedClipInfo {
  clip: SubtitleClip;
  trackId: string;
}

interface UseFileOperationsOptions {
  selectedClip: SelectedClipInfo | null;
  firstSubtitleTrack: Track | undefined;
  currentTimeUs: number;
  onClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onAddClip?: (trackId: string, clip: SubtitleClip) => void;
  onRefresh?: () => void;
}

interface UseFileOperationsResult {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleExport: (format: 'srt' | 'vtt') => void;
  triggerFileInput: () => void;
}

export function useFileOperations({
  selectedClip,
  firstSubtitleTrack,
  currentTimeUs,
  onClipUpdate,
  onAddClip,
  onRefresh,
}: UseFileOperationsOptions): UseFileOperationsResult {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const content = await file.text();
      const cues = parseSubtitles(content);

      if (cues.length === 0) {
        alert('No subtitles found in file');
        return;
      }

      if (selectedClip) {
        const { clip } = selectedClip;
        for (const cue of cues) {
          clip.addCue(cue);
        }
        onClipUpdate?.(clip.id, clip);
        onRefresh?.();
      } else if (firstSubtitleTrack && onAddClip) {
        const { SubtitleClip } = await import('../../../core/SubtitleClip');
        const newClip = new SubtitleClip({
          startUs: currentTimeUs,
          cues,
          style: { ...SUBTITLE.DEFAULT_STYLE },
          label: file.name.replace(/\.(srt|vtt)$/i, ''),
        });
        onAddClip(firstSubtitleTrack.id, newClip);
        onRefresh?.();
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedClip, firstSubtitleTrack, currentTimeUs, onClipUpdate, onAddClip, onRefresh]
  );

  const handleExport = useCallback(
    (format: 'srt' | 'vtt') => {
      if (!selectedClip) return;

      const { clip } = selectedClip;
      const content =
        format === 'srt'
          ? exportToSRT([...clip.cues])
          : exportToWebVTT([...clip.cues]);

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clip.label || 'subtitles'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [selectedClip]
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    handleImport,
    handleExport,
    triggerFileInput,
  };
}
