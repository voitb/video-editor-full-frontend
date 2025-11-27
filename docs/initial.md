# Project Specification: High-Performance Browser Video Editor (MVP)

## 1\. Role & Objective

You are an Expert Graphics & Video Engineer specializing in WebAssembly, WebCodecs, and WebGL.
**Goal:** Build a Proof-of-Concept (MVP) client-side video editor optimized for low-end devices.
**Core Philosophy:** Zero software decoding. Maximize hardware acceleration. Minimize Main Thread blocking.

## 2\. Tech Stack & Constraints

  * **Framework:** React 18+ (TypeScript) + Vite.
  * **Styling:** Tailwind CSS (for UI components).
  * **Video Engine:** **WebCodecs API** (Hardware Decoding) + **MP4Box.js** (Demuxing/Muxing).
  * **Rendering:** **WebGL 2** (via a custom Canvas context, no heavy 3D libraries like Three.js).
  * **State Management:** Zustand (for Timeline state).
  * **FORBIDDEN:** Do NOT use `ffmpeg.wasm` for playback/preview (too slow). Do NOT use the `<video>` tag for the main preview (lack of frame control).

## 3\. Architecture Overview

The application must use a **Off-Main-Thread Architecture**:

1.  **Main Thread (UI Layer):**

      * Handles React Components (Timeline, Buttons, File Input).
      * Sends commands (`LOAD_FILE`, `SEEK`, `PLAY`, `TRIM`) to the Web Worker.
      * Receives `frame` bitmaps or render signals from the Worker.

2.  **Web Worker (Video Engine):**

      * **Demuxing:** Uses `MP4Box.js` to parse the MP4 container and extract encoded video chunks.
      * **Decoding:** Uses `VideoDecoder` to convert chunks into `VideoFrame` objects.
      * **Rendering:** Uses an `OffscreenCanvas` with WebGL to render the current `VideoFrame`.
      * **Memory Management:** Strictly manages `VideoFrame.close()` to prevent memory leaks (critical for low-end laptops).

## 4\. Key Features Implementation Details

### A. The "Smart" Timeline Data Structure

The timeline should not hold video blobs. It should hold lightweight references:

```typescript
interface VideoClip {
  id: string;
  sourceId: string; // Reference to the loaded file in memory
  trackId: number;
  inPoint: number;  // Start time in the source file (microseconds)
  outPoint: number; // End time in the source file (microseconds)
  timelineStart: number; // Where it appears on the timeline
}
```

### B. Frame-Accurate Seeking & Scrubbing

  * **Challenge:** Decoding is asynchronous.
  * **Strategy:** When the user drags the scrubber, find the nearest **Keyframe (IDR)** previous to the target time in MP4Box samples. Feed the decoder from that Keyframe up to the target time to resolve dependencies.

### C. The Rendering Pipeline (WebGL)

  * Create a simple WebGL Program that takes a `VideoFrame` as an external texture.
  * Render it to a full-screen quad on the `OffscreenCanvas`.
  * **Why:** This prepares the app for future filters (shaders) with zero performance cost.

## 5\. Step-by-Step Implementation Plan (Execute in Order)

### Phase 1: Project Scaffolding & Worker Setup

1.  Initialize Vite + React + TS.
2.  Set up the `VideoWorker.ts` and the message passing system (Comlink or native `postMessage`).
3.  Implement file loading: Read `File` -\> ArrayBuffer -\> MP4Box (in Worker).

### Phase 2: The Decoding Engine

1.  Implement `VideoDecoder` initialization in the Worker.
2.  Create a `seekTo(time)` function that:
      * Identifies the correct sample index from MP4Box.
      * Sends the `EncodedVideoChunk` to the decoder.
      * Outputs the `VideoFrame`.

### Phase 3: The WebGL Renderer

1.  Pass an `OffscreenCanvas` from the React Main thread to the Worker.
2.  Write a minimal WebGL wrapper to draw the `VideoFrame` onto the canvas.
3.  Implement the `renderLoop`: Decode Frame -\> Upload to GPU -\> Draw -\> `frame.close()`.

### Phase 4: UI & Timeline Interaction

1.  Build a minimalist Timeline UI (CSS-based tracks).
2.  Implement "Trimming" logic: changing the `inPoint` and `outPoint` in the state.
3.  Sync the visual playhead with the engine `seekTo` commands.

## 6\. Critical Performance Guardrails (Instructions to AI)

  * **ALWAYS** call `frame.close()` immediately after rendering.
  * **NEVER** decode frames faster than the refresh rate during playback (use `requestAnimationFrame` logic inside the worker).
  * **Debounce** seeking operations on the timeline to avoid flooding the decoder.

