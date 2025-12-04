/**
 * useClipContextMenu Hook
 * Manages context menu state and handlers for clips.
 */

import { useState, useCallback, useEffect } from 'react';

export interface ContextMenuState {
  x: number;
  y: number;
}

export interface UseClipContextMenuOptions {
  clipId: string;
  linkedClipId?: string;
  onUnlink?: (clipId: string) => void;
  onDelete?: (clipId: string) => void;
}

export function useClipContextMenu(options: UseClipContextMenuOptions) {
  const { clipId, onUnlink, onDelete } = options;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Handle right-click for context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // Handle unlink from context menu
  const handleUnlink = useCallback(() => {
    onUnlink?.(clipId);
    setContextMenu(null);
  }, [clipId, onUnlink]);

  // Handle delete from context menu
  const handleDelete = useCallback(() => {
    onDelete?.(clipId);
    setContextMenu(null);
  }, [clipId, onDelete]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    handleContextMenu,
    handleUnlink,
    handleDelete,
    closeContextMenu,
  };
}
