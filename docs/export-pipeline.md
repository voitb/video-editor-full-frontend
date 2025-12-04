# Video Export Pipeline

This document describes how video export works in the frontend video editor, including how overlays, subtitles, and audio are burned into the final exported video.

## Overview

The export system uses a multi-threaded architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (UI)                         │
├─────────────────────────────────────────────────────────────┤
│  ExportModal → useExportController → preRenderOverlays()    │
│         ↓                                 ↓                 │
│   ImageBitmaps (DOM access)         Collect sources/tracks  │
│         └─────────────────────────────┘                     │
│                       ↓                                     │
│          START_EXPORT + Transferable[]                      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────┐
│                ExportWorker (Web Worker)                    │
├────────────────────────────────────────────────────────────┤
│  1. Parse sources (mp4box.js)                               │
│  2. Mix audio (OfflineAudioContext)                         │
│  3. For each frame:                                         │
│     - Decode video (VideoDecoder)                           │
│     - Render subtitles (Canvas 2D)                          │
│     - Composite all layers (WebGL2)                         │
│     - Encode frame (VideoEncoder)                           │
│  4. Mux to MP4 (mp4-muxer)                                  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                    Final MP4 ArrayBuffer
```

## Export Flow

### 1. User Initiates Export

The user opens `ExportModal` and selects export settings:
- Quality preset (720p, 1080p, Original)
- In/out points (portion of timeline to export)

**Key file:** `src/components/ExportModal/ExportModal.tsx`

### 2. Pre-render Phase (Main Thread)

Before sending data to the worker, overlays must be pre-rendered in the main thread because they may contain HTML content that requires DOM access.

**Key file:** `src/renderer/OverlayRenderer.ts`

```typescript
// Called by useExportController before starting export
const renderedOverlays = await preRenderOverlays(tracks, outputWidth, outputHeight);
```

The `OverlayRenderer` class handles two content types:

1. **Text overlays**: Rendered using Canvas 2D API
   - Font size scaled based on output height (reference: 1080p)
   - Text positioned using `xPercent`/`yPercent` coordinates
   - Background box with optional border radius

2. **HTML overlays**: Rendered using `html2canvas` library
   - Creates temporary DOM element with HTML content
   - Converts to canvas, then to ImageBitmap
   - Positioned centered on percentage coordinates

**Output:** Full-frame `ImageBitmap` objects with overlays already positioned correctly within the frame.

### 3. Worker Initialization

The export controller sends all data to the worker:

**Key file:** `src/components/ExportModal/hooks/useExportController.ts`

```typescript
worker.postMessage({
  type: 'START_EXPORT',
  composition: { width, height, frameRate },
  tracks: trackJSON,
  sources: sourceBuffers,      // MP4 file ArrayBuffers
  overlays: renderedOverlays,  // Pre-rendered ImageBitmaps
  preset: qualityPreset,
  inPointUs, outPointUs,
}, transferables);             // Bitmaps transferred for efficiency
```

### 4. Source Loading

The worker parses video sources using mp4box.js:

**Key file:** `src/workers/export/SourceLoader.ts`

- Extracts video and audio tracks
- Identifies keyframe positions for seeking
- Initializes `VideoDecoder` instances for each source
- Pre-decodes audio samples for later mixing

### 5. Audio Processing

All audio is processed upfront before video encoding:

**Key file:** `src/export/AudioMixer.ts`

```typescript
const audioMixer = new AudioMixer();
const mixedAudio = await audioMixer.mix(audioClips, durationUs);
```

- Uses `OfflineAudioContext` for sample-accurate mixing
- Schedules clips with gain nodes for volume control
- Respects trim points and timeline positions
- Encodes to AAC using `AudioEncoder`

### 6. Frame-by-Frame Video Processing

For each frame from in-point to out-point:

**Key file:** `src/workers/export/ExportWorker.ts`

#### a. Resolve Active Clips

**Key file:** `src/workers/export/ActiveClipResolver.ts`

```typescript
const activeClips = getActiveClipsAt(tracks, frameTimeUs);
const activeOverlays = getActiveOverlaysAt(overlayData, frameTimeUs);
const activeCues = getActiveCuesAt(subtitleCues, frameTimeUs);
```

#### b. Decode Video Frames

**Key file:** `src/workers/export/FrameDecoder.ts`

- Binary search to find the sample at target time
- Seeks to nearest keyframe before target
- Decodes frames sequentially from keyframe to target
- Returns the frame closest to requested timestamp

#### c. Render Subtitles

**Key file:** `src/renderer/SubtitleRenderer.ts`

- Creates `OffscreenCanvas` for subtitle layer
- Renders active cues with word wrapping
- Draws background boxes and text outlines
- Scales fonts based on output resolution

#### d. Composite All Layers

**Key file:** `src/export/ExportCompositor.ts`

The compositor uses WebGL2 with `OffscreenCanvas`:

```typescript
const frame = compositor.composite(videoLayers, timestampUs, subtitleLayer, overlays);
```

**Compositing order:**
1. Video layers (blended with opacity)
2. Subtitle layer (full opacity)
3. Overlay layers (ordered by track index)

**Key techniques:**
- Framebuffer ping-pong for multi-layer blending
- Pre-multiplied alpha blending
- Y-axis flip for WebGL coordinate system

#### e. Encode Frame

```typescript
videoEncoder.encode(frame, { keyFrame: isKeyFrame });
frame.close(); // Release memory
```

Keyframes inserted every 2 seconds for seeking in final video.

## Overlay Burn-in Detail

### How Overlays Are Burned Into Video

1. **Pre-render (Main Thread)**

   `OverlayRenderer.ts` creates full-frame `ImageBitmap` with overlay positioned:

   ```typescript
   // Calculate center position from percentages
   const centerX = (position.xPercent / 100) * this.width;
   const centerY = (position.yPercent / 100) * this.height;

   // Draw text centered on position
   const boxX = centerX - boxWidth / 2;
   const boxY = centerY - boxHeight / 2;
   ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
   ctx.fillText(text, textX, textY);

   return canvas.transferToImageBitmap();
   ```

2. **Transfer to Worker**

   Bitmaps are transferred (not copied) using `Transferable`:

   ```typescript
   worker.postMessage({ overlays }, [bitmap1, bitmap2, ...]);
   ```

3. **Composite (Worker)**

   `OverlayProcessor.ts` draws the pre-positioned bitmap:

   ```typescript
   // Bitmap already has correct positioning - draw at origin
   ctx.drawImage(bitmap, 0, 0);
   ```

4. **Blend (WebGL)**

   `ExportCompositor.ts` blends overlay canvas onto video:

   ```glsl
   // Blend shader
   vec4 blended = overlay.rgb * alpha + base.rgb * (1.0 - alpha);
   ```

### Position System

Overlay positions use percentages (0-100) for resolution independence:

```typescript
interface OverlayPosition {
  xPercent: number;      // 0-100, horizontal position
  yPercent: number;      // 0-100, vertical position
  widthPercent: number | null;  // null = auto
  heightPercent: number | null; // null = auto
}
```

This ensures overlays appear at the same relative position regardless of export resolution.

## Encoding & Muxing

### Video Encoder

```typescript
const videoEncoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: console.error,
});

videoEncoder.configure({
  codec: 'avc1.640028',  // H.264 High Profile
  width: outputWidth,
  height: outputHeight,
  bitrate: preset.videoBitrate,
  framerate: frameRate,
});
```

### Audio Encoder

```typescript
const audioEncoder = new AudioEncoder({
  output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
  error: console.error,
});

audioEncoder.configure({
  codec: 'mp4a.40.2',    // AAC-LC
  numberOfChannels: 2,
  sampleRate: 48000,
  bitrate: preset.audioBitrate,
});
```

### Muxing

**Key file:** Uses `mp4-muxer` library

```typescript
const muxer = new Muxer({
  target: new ArrayBufferTarget(),
  video: { codec: 'avc', width, height },
  audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 },
  fastStart: 'in-memory',  // moov atom at start for streaming
});

// After all chunks added
muxer.finalize();
const mp4Data = muxer.target.buffer;
```

## Quality Presets

| Preset | Resolution Scale | Video Bitrate | Audio Bitrate |
|--------|------------------|---------------|---------------|
| low    | 0.5× (720p)      | 2 Mbps        | 96 kbps       |
| medium | 0.75× (1080p)    | 5 Mbps        | 128 kbps      |
| high   | 1.0× (1080p)     | 8 Mbps        | 192 kbps      |
| original | 1.0×           | 15 Mbps       | 256 kbps      |

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/components/ExportModal/ExportModal.tsx` | Export UI |
| `src/components/ExportModal/hooks/useExportController.ts` | Export coordination |
| `src/workers/export/ExportWorker.ts` | Main worker orchestration |
| `src/export/ExportCompositor.ts` | WebGL2 frame compositing |
| `src/renderer/OverlayRenderer.ts` | Overlay pre-rendering |
| `src/renderer/compositor/OverlayProcessor.ts` | Overlay canvas preparation |
| `src/renderer/SubtitleRenderer.ts` | Subtitle rendering |
| `src/workers/export/SourceLoader.ts` | MP4 parsing and decoder init |
| `src/workers/export/FrameDecoder.ts` | Video frame decoding |
| `src/workers/export/ActiveClipResolver.ts` | Timeline resolution |
| `src/export/AudioMixer.ts` | Audio mixing |

## Memory Management

- **VideoFrames**: Created by compositor, immediately encoded, then `.close()` called
- **ImageBitmaps**: Transferred to worker (zero-copy), held in worker state
- **Textures**: Reused across frames via WebGL texture binding
- **AudioData**: Decoded, converted to PCM, then released

## Timing Precision

All timing uses microseconds (μs) for sample-accurate synchronization:

```typescript
const US_PER_SECOND = 1_000_000;
const frameIntervalUs = US_PER_SECOND / frameRate;

for (let timeUs = inPointUs; timeUs < outPointUs; timeUs += frameIntervalUs) {
  // Process frame at timeUs
}
```
