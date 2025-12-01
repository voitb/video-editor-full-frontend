// Type declarations for m3u8-parser
declare module 'm3u8-parser' {
  interface Resolution {
    width: number;
    height: number;
  }

  interface PlaylistAttributes {
    BANDWIDTH?: number;
    RESOLUTION?: Resolution;
    CODECS?: string;
    'FRAME-RATE'?: number;
  }

  interface Playlist {
    uri: string;
    attributes: PlaylistAttributes;
  }

  interface ByteRange {
    offset?: number;
    length?: number;
  }

  interface Segment {
    uri: string;
    duration: number;
    byterange?: ByteRange;
    timeline?: number;
    map?: {
      uri: string;
      byterange?: ByteRange;
    };
  }

  interface Manifest {
    allowCache?: boolean;
    endList?: boolean;
    mediaSequence?: number;
    discontinuitySequence?: number;
    playlistType?: string;
    playlists?: Playlist[];
    segments?: Segment[];
    targetDuration?: number;
    totalDuration?: number;
  }

  class Parser {
    manifest: Manifest;
    push(chunk: string): void;
    end(): void;
  }
}
