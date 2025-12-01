// Type declarations for mux.js
declare module 'mux.js' {
  export namespace mp4 {
    interface TransmuxerOptions {
      keepOriginalTimestamps?: boolean;
      remux?: boolean;
    }

    interface TransmuxedSegment {
      initSegment?: Uint8Array;
      data: Uint8Array;
      type?: string;
    }

    class Transmuxer {
      constructor(options?: TransmuxerOptions);
      on(event: 'data', callback: (segment: TransmuxedSegment) => void): void;
      push(data: Uint8Array): void;
      flush(): void;
    }
  }
}
