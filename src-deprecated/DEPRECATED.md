# DEPRECATED

This directory (`src/`) is **deprecated** and will be removed in a future version.

## Migration

The new video editor implementation is in `src-v2/`. All new development should happen there.

### Key differences:
- **Worker-based architecture**: 3 dedicated workers for rendering, HLS loading, and transmuxing
- **WebCodecs API**: Hardware-accelerated video decoding/encoding
- **Declarative composition model**: Composition → Track → Clip → Source hierarchy
- **Progressive HLS**: Playback starts before all segments load
- **Microsecond precision**: All timing in µs for frame-accurate editing

### To use the new version:
The app entry point has been moved to `src-v2/main.tsx`.

## Why deprecated?

The original implementation had several issues:
- Playback not working reliably
- HLS loading failures
- Multi-track support broken
- Performance issues on main thread

The new `src-v2/` implementation addresses all these issues with a modern architecture.
