/**
 * useSubtitleImportExport Hook
 * Handlers for importing and exporting subtitle files (SRT, VTT).
 */

import { useCallback, useRef } from 'react';
import type { Track } from '../../../../../core/Track';
import type { SubtitleClip } from '../../../../../core/SubtitleClip';
import { parseSubtitles, exportToSRT, exportToWebVTT } from '../../../../../utils/subtitle';
import { SUBTITLE } from '../../../../../constants';

export interface SelectedSubtitleClip {
  clip: SubtitleClip;
}

export interface UseSubtitleImportExportOptions {
  selectedClip: SelectedSubtitleClip | null;
  firstSubtitleTrack: Track | undefined;
  currentTimeUs: number;
  onSubtitleClipUpdate?: (clipId: string, clip: SubtitleClip) => void;
  onAddSubtitleClip?: (trackId: string, clip: SubtitleClip) => void;
  onRefresh?: () => void;
}

export function useSubtitleImportExport(options: UseSubtitleImportExportOptions) {
  const {
    selectedClip,
    firstSubtitleTrack,
    currentTimeUs,
    onSubtitleClipUpdate,
    onAddSubtitleClip,
    onRefresh,
  } = options;

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
        onSubtitleClipUpdate?.(clip.id, clip);
        onRefresh?.();
      } else if (firstSubtitleTrack && onAddSubtitleClip) {
        const { SubtitleClip } = await import('../../../../../core/SubtitleClip');
        const newClip = new SubtitleClip({
          startUs: currentTimeUs,
          cues,
          style: { ...SUBTITLE.DEFAULT_STYLE },
          label: file.name.replace(/\.(srt|vtt)$/i, ''),
        });
        onAddSubtitleClip(firstSubtitleTrack.id, newClip);
        onRefresh?.();
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedClip, firstSubtitleTrack, currentTimeUs, onSubtitleClipUpdate, onAddSubtitleClip, onRefresh]
  );

  const handleExport = useCallback(
    (format: 'srt' | 'vtt') => {
      if (!selectedClip) return;
      const { clip } = selectedClip;
      const content = format === 'srt' ? exportToSRT([...clip.cues]) : exportToWebVTT([...clip.cues]);

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

  const triggerImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    fileInputRef,
    handleImport,
    handleExport,
    triggerImport,
  };
}
