/**
 * Read the duration of a media file in seconds using a detached video element.
 */
export async function getMediaDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Unable to determine media duration'));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load media metadata'));
    };
  });
}
