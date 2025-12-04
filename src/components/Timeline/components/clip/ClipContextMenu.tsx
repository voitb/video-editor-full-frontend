/**
 * Clip Context Menu
 * Displays context menu options for clips (unlink, delete).
 */

interface ClipContextMenuProps {
  x: number;
  y: number;
  hasLinkedClip: boolean;
  onUnlink: () => void;
  onDelete: () => void;
}

export function ClipContextMenu({
  x,
  y,
  hasLinkedClip,
  onUnlink,
  onDelete,
}: ClipContextMenuProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        backgroundColor: '#1a1a1a',
        border: '1px solid #444',
        borderRadius: 4,
        padding: 4,
        zIndex: 1000,
        minWidth: 120,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasLinkedClip && (
        <button
          onClick={onUnlink}
          style={{
            display: 'block',
            width: '100%',
            padding: '6px 12px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 12,
            textAlign: 'left',
            cursor: 'pointer',
            borderRadius: 2,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ marginRight: 6, verticalAlign: 'middle' }}
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          Unlink
        </button>
      )}
      <button
        onClick={onDelete}
        style={{
          display: 'block',
          width: '100%',
          padding: '6px 12px',
          backgroundColor: 'transparent',
          border: 'none',
          color: '#ff6b6b',
          fontSize: 12,
          textAlign: 'left',
          cursor: 'pointer',
          borderRadius: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ marginRight: 6, verticalAlign: 'middle' }}
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete
      </button>
    </div>
  );
}
