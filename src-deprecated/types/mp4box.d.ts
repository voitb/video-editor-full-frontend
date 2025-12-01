declare module 'mp4box' {
  export interface MP4Sample {
    number: number;
    track_id: number;
    timescale: number;
    description_index: number;
    /** Codec description (e.g., AVCC/HVCC data) */
    description: Uint8Array | null;
    data: ArrayBuffer;
    size: number;
    alreadyRead?: number;
    duration: number;
    cts: number;
    dts: number;
    is_sync: boolean;
    is_leading: number;
    depends_on: number;
    is_depended_on: number;
    has_redundancy: number;
    degradation_priority: number;
    offset: number;
  }

  export interface MP4VideoTrack {
    id: number;
    created: Date;
    modified: Date;
    movie_duration: number;
    layer: number;
    alternate_group: number;
    volume: number;
    track_width: number;
    track_height: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    language: string;
    nb_samples: number;
    video: {
      width: number;
      height: number;
    };
  }

  /** Base track info shared by all track types */
  export interface MP4TrackBase {
    id: number;
    created: Date;
    modified: Date;
    movie_duration: number;
    timescale: number;
    duration: number;
    bitrate: number;
    codec: string;
    language: string;
    nb_samples: number;
  }

  /** Audio track specific info */
  export interface MP4AudioTrack extends MP4TrackBase {
    audio: {
      sample_rate: number;
      channel_count: number;
      sample_size: number;
    };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    fragment_duration?: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    brands: string[];
    created: Date;
    modified: Date;
    /** All tracks (video + audio + other) */
    tracks: (MP4VideoTrack | MP4AudioTrack | MP4TrackBase)[];
    videoTracks: MP4VideoTrack[];
    audioTracks: MP4AudioTrack[];
  }

  export interface MP4BoxBuffer extends ArrayBuffer {
    fileStart: number;
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onSamples?: (id: number, user: unknown, samples: MP4Sample[]) => void;
    onError?: (e: Error) => void;

    appendBuffer(buffer: MP4BoxBuffer | ArrayBuffer): number;
    start(): void;
    stop(): void;
    flush(): void;

    setExtractionOptions(
      trackId: number,
      user: unknown,
      options: { nbSamples?: number; rapAlignment?: boolean }
    ): void;

    getTrackById(trackId: number): {
      mdia: {
        minf: {
          stbl: {
            stsd: {
              entries: Array<{
                avcC?: DataBox;
                hvcC?: DataBox;
                vpcC?: DataBox;
                esds?: DataBox;  // AAC codec description (MPEG-4 Elementary Stream Descriptor)
                mp4a?: DataBox;  // Alternative AAC box
              }>;
            };
          };
        };
      };
    };

    seek(time: number, useRap?: boolean): { offset: number; time: number };
  }

  interface DataBox {
    write(stream: DataStream): void;
  }

  export class DataStream {
    constructor(
      arrayBuffer?: ArrayBuffer,
      byteOffset?: number,
      endianness?: boolean
    );

    buffer: ArrayBuffer;

    static BIG_ENDIAN: boolean;
    static LITTLE_ENDIAN: boolean;
  }

  export function createFile(): MP4File;
}
