/**
 * useEditorKeyboard Hook
 * Handles keyboard shortcuts for the editor (In/Out points, Delete).
 */

import { useEffect } from 'react';

export interface UseEditorKeyboardParams {
  currentTimeUs: number;
  selectedClipId?: string;
  setInPoint: (timeUs: number) => void;
  setOutPoint: (timeUs: number) => void;
  clearInPoint: () => void;
  clearOutPoint: () => void;
  handleClipDelete: (clipId: string) => void;
}

export function useEditorKeyboard({
  currentTimeUs,
  selectedClipId,
  setInPoint,
  setOutPoint,
  clearInPoint,
  clearOutPoint,
  handleClipDelete,
}: UseEditorKeyboardParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'i':
          if (e.altKey || e.metaKey) {
            clearInPoint();
          } else {
            setInPoint(currentTimeUs);
          }
          e.preventDefault();
          break;
        case 'o':
          if (e.altKey || e.metaKey) {
            clearOutPoint();
          } else {
            setOutPoint(currentTimeUs);
          }
          e.preventDefault();
          break;
        case 'delete':
        case 'backspace':
          if (selectedClipId) {
            handleClipDelete(selectedClipId);
            e.preventDefault();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTimeUs, selectedClipId, setInPoint, setOutPoint, clearInPoint, clearOutPoint, handleClipDelete]);
}
