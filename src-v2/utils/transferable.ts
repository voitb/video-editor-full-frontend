/**
 * Video Editor V2 - Transferable Utilities
 * Helpers for efficient ArrayBuffer transfer between workers.
 */

/**
 * Extract transferable objects from a message for postMessage
 */
export function getTransferables(obj: unknown): Transferable[] {
  const transferables: Transferable[] = [];

  const extract = (value: unknown) => {
    if (value instanceof ArrayBuffer) {
      transferables.push(value);
    } else if (value instanceof MessagePort) {
      transferables.push(value);
    } else if (value instanceof OffscreenCanvas) {
      transferables.push(value);
    } else if (ArrayBuffer.isView(value)) {
      transferables.push(value.buffer);
    } else if (Array.isArray(value)) {
      value.forEach(extract);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(extract);
    }
  };

  extract(obj);
  return transferables;
}

/**
 * Merge multiple ArrayBuffers into one
 */
export function mergeArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return result.buffer;
}

/**
 * Clone an ArrayBuffer (when you need to keep the original)
 */
export function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  const clone = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(clone).set(new Uint8Array(buffer));
  return clone;
}
