/**
 * Content Type Selector
 * Selector for overlay content type (text/html/widget).
 */

import { TIMELINE_COLORS } from '../../../../../constants';

export interface ContentTypeSelectorProps {
  selectedType: 'text' | 'html' | 'widget';
  onTypeChange: (type: 'text' | 'html' | 'widget') => void;
}

export function ContentTypeSelector({ selectedType, onTypeChange }: ContentTypeSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        padding: 8,
        backgroundColor: '#1e1e1e',
        borderRadius: 6,
      }}
    >
      {(['text', 'html', 'widget'] as const).map((type) => (
        <button
          key={type}
          onClick={() => onTypeChange(type)}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            backgroundColor: selectedType === type ? '#3b82f6' : 'transparent',
            color: selectedType === type ? '#fff' : '#888',
            border: `1px solid ${selectedType === type ? '#3b82f6' : TIMELINE_COLORS.border}`,
            borderRadius: 4,
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
