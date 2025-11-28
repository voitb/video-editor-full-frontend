# React Best Practices Guide

This document summarizes the React best practices applied to the frontend video editor codebase.

## 1. When to Use `useCallback` and `useMemo`

### The Key Rule

> "Caching a function with useCallback is only valuable in a few cases:
> 1. You pass it as a prop to a component wrapped in `memo`
> 2. The function is used as a dependency of some Hook"
>
> — [Official React docs](https://react.dev/reference/react/useCallback)

### When You DON'T Need Memoization

```typescript
// ❌ UNNECESSARY - Wrapper that just calls another function
const handleSeek = useCallback(
  (timeUs: number) => {
    seek(timeUs);  // Just wrapping seek()
  },
  [seek]
);

// ✅ BETTER - Pass the function directly
<Timeline onSeek={seek} />
```

```typescript
// ❌ UNNECESSARY - Trivial calculation
const visibleDurationUs = useMemo(
  () => viewport.endTimeUs - viewport.startTimeUs,
  [viewport.endTimeUs, viewport.startTimeUs]
);

// ✅ BETTER - Plain calculation
const visibleDurationUs = viewport.endTimeUs - viewport.startTimeUs;
```

```typescript
// ❌ UNNECESSARY - Event handler for native element
const handleFileChange = useCallback(
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  },
  [loadFile]
);

// ✅ BETTER - Plain function (native elements don't benefit from stable references)
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) loadFile(file);
};
```

### When You NEED Memoization

1. **Functions returned from custom hooks** (consumers may use in dependency arrays):

```typescript
// ✅ CORRECT - Hook consumers need stable references
export function useVideoWorker() {
  const seek = useCallback((timeUs: number) => {
    workerRef.current?.postMessage({ type: 'SEEK', payload: { timeUs } });
  }, []); // Empty deps - only accesses stable ref

  return { seek }; // Consumer might use in useEffect deps
}
```

2. **Functions used as useEffect dependencies**:

```typescript
// ✅ CORRECT - Used in dependency array
const requestSampleData = useCallback(() => {
  workerRef.current?.postMessage({ type: 'GET_SAMPLES_FOR_SPRITES' });
}, []);

useEffect(() => {
  if (state.isReady) requestSampleData();
}, [state.isReady, requestSampleData]); // requestSampleData in deps
```

3. **Expensive computations with complex data**:

```typescript
// ✅ CORRECT - Iterating over many items with calculations
const spriteElements = useMemo(() => {
  return sprites
    .map((sprite) => calculateVisibility(sprite, viewport))
    .filter((el) => el !== null);
}, [sprites, viewport.startTimeUs, viewport.endTimeUs]);
```

## 2. React 19 and the Future of Memoization

React 19 introduces the **React Compiler** which automatically handles memoization:

- Automatically memoizes components, hooks, and values
- More comprehensive than manual memoization
- ~95% of manual `useCallback`/`useMemo` can be deleted

**Current guidance**: Don't add `useCallback`/`useMemo` unless you have a specific reason. Profile first, optimize later.

## 3. Component Organization

### Extract Logic into Custom Hooks

**Before**: 424-line component with mixed concerns

```typescript
// ❌ GOD COMPONENT - Too many responsibilities
export function Timeline({ ... }) {
  // 50+ lines of state and refs
  // Mouse handling for playhead
  // Mouse handling for trim
  // Zoom handling
  // DOM manipulation
  // Rendering...
}
```

**After**: Clean component using focused hooks

```typescript
// ✅ BETTER - Separated concerns
export function Timeline({ ... }) {
  const { isDragging, handlePlayheadMouseDown, handleTrackClick } = useTimelineDrag({
    trackRef, playheadRef, ...options
  });

  const { isDraggingTrim, handleInMouseDown, handleOutMouseDown } = useTimelineTrim({
    trackRef, inHandleRef, outHandleRef, ...options
  });

  // ~100 lines of clean JSX
  return (...);
}
```

### Pure Functions Outside Components

```typescript
// ❌ INSIDE COMPONENT - Recreated every render
const calculateInterval = useCallback((duration: number): number => {
  if (duration < 120) return 1_000_000;
  if (duration < 600) return 2_000_000;
  return 5_000_000;
}, []); // Empty deps - it's pure!

// ✅ OUTSIDE COMPONENT - Defined once
function calculateInterval(duration: number): number {
  if (duration < 120) return 1_000_000;
  if (duration < 600) return 2_000_000;
  return 5_000_000;
}
```

## 4. Direct DOM Manipulation (When Justified)

For high-frequency updates (like dragging), direct DOM manipulation can be appropriate:

```typescript
// ✅ JUSTIFIED - Zero re-renders during drag
const updatePlayheadDOM = (percent: number) => {
  if (playheadRef.current) {
    playheadRef.current.style.left = `calc(${percent}% - 8px)`;
  }
};

// During drag: update DOM directly
// On mouseup: commit final position to React state
```

**Key principles**:
- Encapsulate in custom hooks
- Commit final state to React on completion
- Document why it's necessary

## 5. Error Handling Patterns

### Canvas and WebGL Operations

```typescript
// ❌ MISSING ERROR HANDLING
const initCanvas = (canvas: HTMLCanvasElement) => {
  const offscreen = canvas.transferControlToOffscreen(); // Can throw!
  // ...
};

// ✅ WITH ERROR HANDLING
const initCanvas = (canvas: HTMLCanvasElement) => {
  try {
    const offscreen = canvas.transferControlToOffscreen();
    // ...
  } catch (error) {
    console.error('Failed to initialize canvas:', error);
  }
};
```

### Null Checks for Canvas Context

```typescript
// ❌ NON-NULL ASSERTION
const ctx = canvas.getContext('2d')!;

// ✅ PROPER NULL CHECK
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Failed to get 2D context');
}
```

## 6. Type Safety

### Avoid Double Type Casting

```typescript
// ❌ UNSAFE - Double casting bypasses type safety
const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;

// ✅ BETTER - Proper interface extension
interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}
const nav = navigator as NavigatorWithDeviceMemory;
const memory = nav.deviceMemory ?? 4;
```

## Summary of Changes Made

| File | Before | After | Change |
|------|--------|-------|--------|
| `App.tsx` | 170 LOC | 145 LOC | Removed 4 wrapper callbacks |
| `Timeline.tsx` | 424 LOC | 262 LOC | -38%, extracted hooks |
| `useVideoWorker.ts` | 163 LOC | 161 LOC | Simplified, added error handling |
| `useTimelineViewport.ts` | 171 LOC | 168 LOC | Removed trivial useMemo |
| `useSpriteWorker.ts` | 174 LOC | 171 LOC | Extracted pure function |
| `spriteCache.ts` | 212 LOC | 227 LOC | Added error handling |

### New Files Created

- `src/hooks/useTimelineDrag.ts` - Playhead dragging logic (146 LOC)
- `src/hooks/useTimelineTrim.ts` - Trim handle dragging logic (199 LOC)

## References

- [React useCallback docs](https://react.dev/reference/react/useCallback)
- [React useMemo docs](https://react.dev/reference/react/useMemo)
- [React 19 Memoization: Is useMemo & useCallback No Longer Necessary?](https://dev.to/joodi/react-19-memoization-is-usememo-usecallback-no-longer-necessary-3ifn)
- [React Compiler & React 19](https://www.developerway.com/posts/react-compiler-soon)
- [useMemo and useCallback Are (Mostly) Obsolete](https://gaboesquivel.com/blog/2025-01-use-memo-use-callback-obsolete)
