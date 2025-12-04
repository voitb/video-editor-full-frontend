/**
 * Source Loader
 * Handles loading HLS and file-based media sources.
 */

import type { Composition } from '../../core/Composition';
import { HlsSource } from '../../core/HlsSource';
import { FileSource } from '../../core/FileSource';
import type { EngineEventEmitter } from '../EngineEvents';
import type { AudioController } from '../AudioController';
import type { WorkerBridge } from '../worker/WorkerBridge';
import type { RenderWorkerCommand } from '../../workers/messages/renderMessages';

export interface SourceLoaderDeps {
  composition: Composition;
  events: EngineEventEmitter;
  audio: AudioController;
  workerBridge: WorkerBridge;
  setLoading: () => void;
}

/**
 * Handles loading media sources into the engine.
 */
export class SourceLoader {
  private deps: SourceLoaderDeps;

  constructor(deps: SourceLoaderDeps) {
    this.deps = deps;
  }

  /**
   * Load an HLS source from a URL.
   */
  async loadHlsSource(url: string): Promise<HlsSource> {
    const { composition, events, workerBridge, setLoading } = this.deps;

    const source = new HlsSource(url);
    composition.registerSource(source);

    if (workerBridge.isInitialized) {
      const cmd: RenderWorkerCommand = {
        type: 'START_SOURCE_STREAM',
        sourceId: source.id,
        durationHint: undefined,
      };
      workerBridge.postCommand(cmd);
    }

    source.on((event) => {
      switch (event.type) {
        case 'progress':
          events.emit({
            type: 'sourceLoading',
            sourceId: source.id,
            progress: event.total > 0 ? event.loaded / event.total : 0,
          });
          break;

        case 'stateChange':
          if (event.state === 'playable') {
            events.emit({ type: 'sourcePlayable', sourceId: source.id });
          } else if (event.state === 'ready') {
            events.emit({ type: 'sourceReady', sourceId: source.id });
          } else if (event.state === 'error') {
            events.emit({
              type: 'sourceError',
              sourceId: source.id,
              message: source.errorMessage ?? 'Unknown error',
            });
          }
          break;

        case 'chunk':
          this.appendSourceChunk(source.id, event.chunk, event.isLast);
          break;
      }
    });

    setLoading();
    await source.load();

    return source;
  }

  /**
   * Load a file-based source.
   */
  async loadFileSource(file: File): Promise<FileSource> {
    const { composition, events, audio, setLoading } = this.deps;

    const source = new FileSource(file);
    composition.registerSource(source);

    source.on((event) => {
      switch (event.type) {
        case 'progress':
          events.emit({
            type: 'sourceLoading',
            sourceId: source.id,
            progress: event.total > 0 ? event.loaded / event.total : 0,
          });
          break;

        case 'stateChange':
          if (event.state === 'ready') {
            const buffer = source.getBuffer();
            if (buffer) {
              if (source.isAudioOnly) {
                this.loadAudioOnlySource(source.id, buffer);
              } else {
                this.loadSourceBuffer(source.id, buffer, source.durationUs);
              }
            }
            events.emit({ type: 'sourceReady', sourceId: source.id });
          } else if (event.state === 'error') {
            events.emit({
              type: 'sourceError',
              sourceId: source.id,
              message: source.errorMessage ?? 'Unknown error',
            });
          }
          break;
      }
    });

    setLoading();
    await source.load();

    return source;
  }

  /**
   * Load an audio-only source into the audio controller.
   */
  private async loadAudioOnlySource(sourceId: string, buffer: ArrayBuffer): Promise<void> {
    const { audio, events } = this.deps;

    try {
      await audio.loadAudioOnlySource(sourceId, buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decode audio';
      events.emit({ type: 'sourceError', sourceId, message });
    }
  }

  /**
   * Append a chunk to a streaming source.
   */
  private appendSourceChunk(sourceId: string, chunk: ArrayBuffer, isLast: boolean): void {
    const { workerBridge } = this.deps;
    if (!workerBridge.isInitialized) return;

    const clonedChunk = chunk.slice(0);
    const cmd: RenderWorkerCommand = {
      type: 'APPEND_SOURCE_CHUNK',
      sourceId,
      chunk: clonedChunk,
      isLast,
    };
    workerBridge.postCommand(cmd, [clonedChunk]);
  }

  /**
   * Load a source buffer into the worker.
   */
  loadSourceBuffer(sourceId: string, buffer: ArrayBuffer, durationHint?: number): void {
    const { workerBridge } = this.deps;
    if (!workerBridge.isInitialized) return;

    const clonedBuffer = buffer.slice(0);
    const cmd: RenderWorkerCommand = {
      type: 'LOAD_SOURCE',
      sourceId,
      buffer: clonedBuffer,
      durationHint,
    };
    workerBridge.postCommand(cmd, [clonedBuffer]);
  }

  /**
   * Remove a source from the engine.
   */
  removeSource(sourceId: string): void {
    const { composition, audio, workerBridge } = this.deps;

    const source = composition.getSource(sourceId);
    if (source) {
      source.dispose();
      composition.unregisterSource(sourceId);
    }

    audio.removeSource(sourceId);

    if (workerBridge.isInitialized) {
      const cmd: RenderWorkerCommand = {
        type: 'REMOVE_SOURCE',
        sourceId,
      };
      workerBridge.postCommand(cmd);
    }
  }
}
