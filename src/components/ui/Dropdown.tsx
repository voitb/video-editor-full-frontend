/**
 * Dropdown - Button-triggered dropdown menu with collision detection
 * Uses Floating UI for auto-positioning
 */
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';
import { type ReactNode, type CSSProperties, type ButtonHTMLAttributes } from 'react';
import { MENU_STYLES, MenuItem, MenuSeparator, MenuHeader } from './FloatingMenu';

export interface DropdownProps {
  /** Whether the dropdown is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The trigger element (usually a button) */
  trigger: ReactNode;
  /** Dropdown content */
  children: ReactNode;
  /** Preferred placement */
  placement?: Placement;
  /** Offset from trigger in pixels */
  offsetPx?: number;
  /** Min width (defaults to trigger width) */
  minWidth?: number;
  /** Match trigger width */
  matchTriggerWidth?: boolean;
  /** Additional styles for dropdown content */
  style?: CSSProperties;
}

/**
 * Dropdown component with button trigger
 * Automatically positions and handles collision
 *
 * @example
 * const [open, setOpen] = useState(false);
 *
 * <Dropdown
 *   open={open}
 *   onOpenChange={setOpen}
 *   trigger={
 *     <button>
 *       Open Menu <span>&#9660;</span>
 *     </button>
 *   }
 * >
 *   <MenuItem onClick={() => { handleAction(); setOpen(false); }}>
 *     Action 1
 *   </MenuItem>
 *   <MenuItem onClick={() => { handleAction2(); setOpen(false); }}>
 *     Action 2
 *   </MenuItem>
 * </Dropdown>
 */
export function Dropdown({
  open,
  onOpenChange,
  trigger,
  children,
  placement = 'bottom-start',
  offsetPx = 4,
  minWidth,
  matchTriggerWidth = false,
  style,
}: DropdownProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    middleware: [
      offset(offsetPx),
      flip({
        fallbackPlacements: ['top-start', 'top-end', 'bottom-end', 'top', 'bottom'],
        padding: 8,
      }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const triggerWidth = refs.reference.current?.getBoundingClientRect().width;

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()}>
        {trigger}
      </div>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={{
              ...floatingStyles,
              zIndex: 9999,
              minWidth: matchTriggerWidth ? triggerWidth : minWidth,
              ...MENU_STYLES.container,
              ...style,
            }}
            onClick={(e) => e.stopPropagation()}
            {...getFloatingProps()}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

/**
 * Pre-styled dropdown trigger button matching Timeline theme
 */
export function DropdownTrigger({
  children,
  showArrow = true,
  style,
  ...props
}: {
  children: ReactNode;
  showArrow?: boolean;
  style?: CSSProperties;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'>) {
  return (
    <button
      type="button"
      style={{
        width: '100%',
        padding: '6px 10px',
        fontSize: 11,
        backgroundColor: '#333',
        color: '#fff',
        border: '1px solid #333',
        borderRadius: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        ...style,
      }}
      {...props}
    >
      {children}
      {showArrow && <span style={{ marginLeft: 'auto', fontSize: 10 }}>&#9660;</span>}
    </button>
  );
}

// Re-export menu components for convenience
export { MenuItem, MenuSeparator, MenuHeader, MENU_STYLES };
