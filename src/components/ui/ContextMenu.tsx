/**
 * ContextMenu - Right-click context menu with collision detection
 * Wraps FloatingMenu for context menu use case
 */
import { type ReactNode, type CSSProperties } from 'react';
import {
  ContextMenuFloating,
  MenuItem,
  MenuSeparator,
  MenuHeader,
  MENU_STYLES,
  menuItemHoverHandlers,
} from './FloatingMenu';

export interface ContextMenuProps {
  /** Whether the menu is visible */
  open: boolean;
  /** Callback when menu should close */
  onClose: () => void;
  /** X coordinate from mouse event clientX */
  x: number;
  /** Y coordinate from mouse event clientY */
  y: number;
  /** Menu content */
  children: ReactNode;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Additional styles */
  style?: CSSProperties;
}

/**
 * Context Menu component for right-click menus
 * Automatically handles viewport collision detection
 *
 * @example
 * const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
 *
 * <div onContextMenu={(e) => {
 *   e.preventDefault();
 *   setMenu({ x: e.clientX, y: e.clientY });
 * }}>
 *   Right click me
 * </div>
 *
 * <ContextMenu
 *   open={menu !== null}
 *   onClose={() => setMenu(null)}
 *   x={menu?.x ?? 0}
 *   y={menu?.y ?? 0}
 * >
 *   <MenuItem onClick={() => { handleAction(); setMenu(null); }}>
 *     Action
 *   </MenuItem>
 *   <MenuSeparator />
 *   <MenuItem onClick={() => setMenu(null)} danger>
 *     Delete
 *   </MenuItem>
 * </ContextMenu>
 */
export function ContextMenu({
  open,
  onClose,
  x,
  y,
  children,
  minWidth = 180,
  style,
}: ContextMenuProps) {
  return (
    <ContextMenuFloating
      open={open}
      onClose={onClose}
      x={x}
      y={y}
      minWidth={minWidth}
      style={style}
    >
      {children}
    </ContextMenuFloating>
  );
}

// Re-export menu components for convenience
export { MenuItem, MenuSeparator, MenuHeader, MENU_STYLES, menuItemHoverHandlers };
