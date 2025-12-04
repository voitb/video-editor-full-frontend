/**
 * FloatingMenu - Base component for positioned floating menus
 * Uses Floating UI for collision detection and auto-positioning
 */
import {
  useFloating,
  offset,
  flip,
  shift,
  limitShift,
  autoUpdate,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { useEffect, useRef, useState, useLayoutEffect, type ReactNode, type CSSProperties } from 'react';
import { TIMELINE_COLORS } from '../../constants';

export interface FloatingMenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Callback when menu should close */
  onClose: () => void;
  /** Menu content */
  children: ReactNode;
  /** Preferred placement */
  placement?: Placement;
  /** Offset from anchor in pixels */
  offsetPx?: number;
  /** Custom styles for the menu container */
  style?: CSSProperties;
  /** Min width in pixels */
  minWidth?: number;
  /** Whether to trap focus inside the menu */
  trapFocus?: boolean;
}

/** Base styles for floating menus matching Timeline dark theme */
export const MENU_STYLES = {
  container: {
    backgroundColor: '#252525',
    border: `1px solid ${TIMELINE_COLORS.border}`,
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
  } as CSSProperties,
  item: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 11,
    backgroundColor: 'transparent',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  } as CSSProperties,
  itemDanger: {
    color: '#ff6666',
  } as CSSProperties,
  separator: {
    borderTop: `1px solid ${TIMELINE_COLORS.border}`,
    margin: '4px 0',
  } as CSSProperties,
  sectionHeader: {
    padding: '6px 12px',
    fontSize: 10,
    fontWeight: 600,
    color: TIMELINE_COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  } as CSSProperties,
};

/** Helper for menu item hover effects */
export const menuItemHoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = '#333';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  },
};

/**
 * FloatingMenu with reference element (for Dropdown)
 * Use setReference on trigger element, renders floating content
 */
export function useFloatingMenu(options: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: Placement;
  offsetPx?: number;
}) {
  const { open, onOpenChange, placement = 'bottom-start', offsetPx = 4 } = options;

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    middleware: [
      offset(offsetPx),
      flip({
        fallbackPlacements: ['top-start', 'top-end', 'bottom-end', 'top', 'bottom', 'right-start', 'left-start'],
        padding: 16,
        crossAxis: true,
      }),
      shift({
        padding: 16,
        crossAxis: true,
        limiter: limitShift(),
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  return {
    refs,
    floatingStyles,
    context,
    getReferenceProps,
    getFloatingProps,
  };
}

/**
 * Context menu positioned at x,y coordinates
 * Handles viewport collision detection automatically
 */
export function ContextMenuFloating({
  open,
  onClose,
  x,
  y,
  children,
  minWidth = 180,
  style,
}: {
  open: boolean;
  onClose: () => void;
  x: number;
  y: number;
  children: ReactNode;
  minWidth?: number;
  style?: CSSProperties;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ left: x, top: y });

  // Handle click outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay to prevent immediate close from the same click that opened
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  // Calculate position with actual menu dimensions after render
  useLayoutEffect(() => {
    if (!open || !menuRef.current) {
      setAdjustedPosition({ left: x, top: y });
      return;
    }

    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Use actual menu dimensions
    const rect = menuRef.current.getBoundingClientRect();
    const menuWidth = rect.width || minWidth + 20;
    const menuHeight = rect.height || 300;

    let adjustedX = x;
    let adjustedY = y;

    // Flip horizontally if would overflow right edge
    if (x + menuWidth > viewportWidth - padding) {
      adjustedX = Math.max(padding, viewportWidth - menuWidth - padding);
    }

    // Flip vertically if would overflow bottom edge
    if (y + menuHeight > viewportHeight - padding) {
      adjustedY = Math.max(padding, viewportHeight - menuHeight - padding);
    }

    setAdjustedPosition({ left: adjustedX, top: adjustedY });
  }, [open, x, y, minWidth]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: adjustedPosition.left,
          top: adjustedPosition.top,
          zIndex: 9999,
          minWidth,
          ...MENU_STYLES.container,
          ...style,
        }}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}

/**
 * Menu item component with consistent styling
 */
export function MenuItem({
  onClick,
  children,
  danger,
  disabled,
  style,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...MENU_STYLES.item,
        ...(danger ? MENU_STYLES.itemDanger : {}),
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      {...menuItemHoverHandlers}
    >
      {children}
    </button>
  );
}

/**
 * Menu separator
 */
export function MenuSeparator() {
  return <div style={MENU_STYLES.separator} />;
}

/**
 * Menu section header
 */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div style={MENU_STYLES.sectionHeader}>{children}</div>;
}
