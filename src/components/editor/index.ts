/**
 * Editor Module
 * Barrel export for editor components.
 */

export { EditorApp } from './EditorApp';
export type { EditorAppProps } from './EditorApp';

// Re-export hooks for external use
export { useEditorCallbacks } from './hooks';
export type { UseEditorCallbacksParams, EditorCallbacks } from './hooks';
