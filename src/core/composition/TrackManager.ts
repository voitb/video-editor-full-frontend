/**
 * Track Manager
 * Handles track lifecycle operations: add, remove, reorder, filter.
 */

import { Track } from '../Track';
import type { TrackConfig } from '../types';

/**
 * Sort tracks by their order property
 */
export function sortTracks(tracks: Track[]): void {
  tracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Normalize track orders to be sequential (0, 1, 2, ...)
 */
export function normalizeTrackOrders(tracks: Track[]): void {
  tracks.forEach((track, index) => {
    track.setOrder(index);
  });
}

/**
 * Add a track to the tracks array
 */
export function addTrack(tracks: Track[], track: Track): void {
  if (track.order === undefined || track.order < 0) {
    // No order specified - append at end
    const maxOrder = tracks.reduce((max, t) => Math.max(max, t.order ?? 0), -1);
    track.setOrder(maxOrder + 1);
    tracks.push(track);
  } else {
    // Order specified - insert at that position
    insertTrackAt(tracks, track, track.order);
    return; // insertTrackAt already sorts
  }
  sortTracks(tracks);
}

/**
 * Create and add a new track
 */
export function createTrack(tracks: Track[], config: TrackConfig): Track {
  const track = new Track(config);
  addTrack(tracks, track);
  return track;
}

/**
 * Remove a track by ID
 */
export function removeTrack(tracks: Track[], trackId: string): boolean {
  const index = tracks.findIndex(t => t.id === trackId);
  if (index === -1) return false;
  tracks.splice(index, 1);
  normalizeTrackOrders(tracks);
  return true;
}

/**
 * Get a track by ID
 */
export function getTrack(tracks: Track[], trackId: string): Track | undefined {
  return tracks.find(t => t.id === trackId);
}

/**
 * Get track index for z-ordering
 */
export function getTrackIndex(tracks: Track[], trackId: string): number {
  return tracks.findIndex(t => t.id === trackId);
}

/**
 * Reorder a track to a new position
 */
export function reorderTrack(tracks: Track[], trackId: string, targetOrder: number): void {
  const track = getTrack(tracks, trackId);
  if (!track) return;

  const currentOrder = track.order;
  if (currentOrder === targetOrder) return;

  // Shift tracks to make room for the moved track
  tracks.forEach(t => {
    if (t.id === trackId) return;

    if (currentOrder < targetOrder) {
      // Moving down: shift tracks in between up
      if (t.order > currentOrder && t.order <= targetOrder) {
        t.setOrder(t.order - 1);
      }
    } else {
      // Moving up: shift tracks in between down
      if (t.order >= targetOrder && t.order < currentOrder) {
        t.setOrder(t.order + 1);
      }
    }
  });

  track.setOrder(targetOrder);
  sortTracks(tracks);
  normalizeTrackOrders(tracks);
}

/**
 * Insert a track at a specific position
 */
export function insertTrackAt(tracks: Track[], track: Track, position: number): void {
  // Shift all tracks at position and below
  tracks.forEach(t => {
    if (t.order >= position) {
      t.setOrder(t.order + 1);
    }
  });

  track.setOrder(position);
  tracks.push(track);
  sortTracks(tracks);
}

/**
 * Get video tracks only
 */
export function getVideoTracks(tracks: Track[]): Track[] {
  return tracks.filter(t => t.type === 'video');
}

/**
 * Get audio tracks only
 */
export function getAudioTracks(tracks: Track[]): Track[] {
  return tracks.filter(t => t.type === 'audio');
}

/**
 * Get subtitle tracks only
 */
export function getSubtitleTracks(tracks: Track[]): Track[] {
  return tracks.filter(t => t.type === 'subtitle');
}
