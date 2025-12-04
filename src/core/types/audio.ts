/**
 * Video Editor - Audio Type Definitions
 * Types for audio data handling.
 */

/** Audio data for a source */
export interface SourceAudioData {
  sourceId: string;
  audioBuffer: AudioBuffer;
  sampleRate: number;
  channels: number;
  durationUs: number;
}
