/**
 * Content Editor
 * Textarea for editing overlay content.
 */

import { TIMELINE_COLORS } from '../../../../../constants';

export interface ContentEditorProps {
  content: string;
  contentType: 'text' | 'html' | 'widget';
  onContentUpdate: (content: string) => void;
}

export function ContentEditor({ content, contentType, onContentUpdate }: ContentEditorProps) {
  const placeholder =
    contentType === 'text'
      ? 'Enter text...'
      : contentType === 'html'
        ? 'Enter HTML...'
        : 'Widget identifier...';

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
        Content
      </label>
      <textarea
        value={content}
        onChange={(e) => onContentUpdate(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: 10,
          fontSize: 13,
          backgroundColor: '#0a0a0a',
          border: `1px solid ${TIMELINE_COLORS.border}`,
          borderRadius: 4,
          color: '#fff',
          resize: 'vertical',
          minHeight: 80,
          boxSizing: 'border-box',
          fontFamily: contentType === 'html' ? 'monospace' : 'inherit',
        }}
      />
    </div>
  );
}
