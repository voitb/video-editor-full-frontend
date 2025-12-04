/**
 * Video Editor V2 - Main Application Component
 */

import { EditorApp } from './components/editor';

export function App() {
  return (
    <EditorApp
      previewWidth={1280}
      previewHeight={720}
    />
  );
}
