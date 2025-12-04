/**
 * Sortable Track Row
 * Wrapper component for dnd-kit track reordering.
 */

import type { CSSProperties, ReactNode, HTMLAttributes } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTrackRowProps {
  id: string;
  children: (dragHandleProps: HTMLAttributes<HTMLDivElement>, isDragging: boolean) => ReactNode;
}

export function SortableTrackRow({ id, children }: SortableTrackRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    position: 'relative' as const,
  };

  // Combine attributes and listeners for drag handle
  const dragHandleProps = {
    ...attributes,
    ...listeners,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandleProps, isDragging)}
    </div>
  );
}
