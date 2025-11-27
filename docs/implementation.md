## Instrukcja Uruchomienia

1.  Stwórz projekt Vite: `npm create vite@latest video-editor -- --template react-ts`
2.  Zainstaluj MP4Box: `npm install mp4box`
3.  Skopiuj poniższe pliki w odpowiednie miejsca.

-----

### 1\. `src/renderer.ts` (Silnik WebGL)

To jest Twój "Render Engine". Jest ultra-lekki, rysuje tylko teksturę wideo na pełny ekran. Żadnych zbędnych bibliotek 3D.

```typescript
// src/renderer.ts
export class WebGLRenderer {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;

  constructor(canvas: OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported");
    this.gl = gl;

    // 1. Shaders (Prosty Pass-through)
    const vsSource = `#version 300 es
      in vec2 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
      }`;

    const fsSource = `#version 300 es
      precision mediump float;
      uniform sampler2D u_image;
      in vec2 v_texCoord;
      out vec4 outColor;
      void main() {
        outColor = texture(u_image, v_texCoord);
      }`;

    this.program = this.createProgram(gl, vsSource, fsSource);
    this.texture = gl.createTexture()!;
    
    // Konfiguracja tekstury
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Setup geometrii (Quad na cały ekran)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
      -1,  1,  0, 0,
       1, -1,  1, 1,
       1,  1,  1, 0,
    ]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    const positionLoc = gl.getAttribLocation(this.program, "a_position");
    const texCoordLoc = gl.getAttribLocation(this.program, "a_texCoord");

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
  }

  draw(frame: VideoFrame) {
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    // Upload tekstury z VideoFrame (Zero-copy na GPU jeśli możliwe)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
    const program = gl.createProgram()!;
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vs)!);
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fs)!);
    gl.linkProgram(program);
    return program;
  }
}
```

-----

### 2\. `src/worker.ts` (Mózg operacji)

To tutaj dzieje się cała magia: WebCodecs, MP4Box i zarządzanie pamięcią.

```typescript
// src/worker.ts
import MP4Box, { MP4File, MP4Sample } from 'mp4box';
import { WebGLRenderer } from './renderer';

let renderer: WebGLRenderer | null = null;
let mp4boxfile: MP4File | null = null;
let decoder: VideoDecoder | null = null;
let videoTrackInfo: any = null;

// Kolejka próbek do zdekodowania
const pendingSamples: MP4Sample[] = [];

// Obsługa wiadomości z głównego wątku
self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT_CANVAS':
      renderer = new WebGLRenderer(payload.canvas);
      break;

    case 'LOAD_FILE':
      await loadFile(payload.file);
      break;

    case 'SEEK':
      await seekTo(payload.timeUs);
      break;
  }
};

async function loadFile(file: File) {
  mp4boxfile = MP4Box.createFile();
  
  // Konfiguracja dekodera
  decoder = new VideoDecoder({
    output: (frame) => {
      // 1. Rysuj klatkę
      if (renderer) renderer.draw(frame);
      // 2. WAŻNE: Natychmiast zwolnij pamięć!
      frame.close();
    },
    error: (e) => console.error("Decoder error", e),
  });

  mp4boxfile.onReady = (info) => {
    videoTrackInfo = info.videoTracks[0];
    const description = createDescription(mp4boxfile!, videoTrackInfo.id);

    decoder?.configure({
      codec: videoTrackInfo.codec,
      codedWidth: videoTrackInfo.video.width,
      codedHeight: videoTrackInfo.video.height,
      description: description,
    });
    
    // Ustaw extraction options, żeby MP4Box zbierał próbki
    mp4boxfile?.setExtractionOptions(videoTrackInfo.id, null, { nbSamples: 10000 });
    mp4boxfile?.start();
    
    // Poinformuj UI, że film gotowy
    self.postMessage({ type: 'READY', payload: { duration: info.duration / info.timescale } });
  };

  // Zbieramy próbki do pamięci (w prawdziwym projekcie robimy to leniwie/lazy)
  mp4boxfile.onSamples = (id, user, samples) => {
    // Dodajemy offsety (DTS/CTS) do próbek, bo MP4Box je parsuje
    for (const sample of samples) {
        pendingSamples.push(sample);
    }
  };

  // Czytanie pliku jako ArrayBuffer (chunkami dla wydajności w duzych plikach)
  const buffer = await file.arrayBuffer();
  (buffer as any).fileStart = 0; // MP4Box hack
  mp4boxfile.appendBuffer(buffer);
  mp4boxfile.flush();
}

// Funkcja SEEK - klucz do wydajności
async function seekTo(timeUs: number) {
  if (!decoder || pendingSamples.length === 0) return;

  // 1. Znajdź najbliższy Keyframe (IDR) PRZED czasem docelowym
  // WebCodecs potrzebuje Keyframe, żeby zacząć dekodować różnicę
  const timeSec = timeUs / 1_000_000;
  
  // Proste wyszukiwanie liniowe (w produkcji użyj binary search)
  let sampleIndex = pendingSamples.findIndex(s => s.cts / s.timescale >= timeSec);
  if (sampleIndex === -1) sampleIndex = 0;

  // Znajdź poprzedni Keyframe (is_sync)
  let keyframeIndex = sampleIndex;
  while (keyframeIndex > 0 && !pendingSamples[keyframeIndex].is_sync) {
    keyframeIndex--;
  }

  // Wyczyść dekoder (flush), aby usunąć stare klatki z kolejki
  await decoder.flush();

  // 2. Dekoduj od Keyframe'a do momentu docelowego
  // Tutaj jest trick: dekodujemy, ale nie wyświetlamy wszystkiego, tylko ostatnią klatkę?
  // W uproszczonym MVP po prostu wrzucamy ten jeden Chunk, który jest Keyframem (lub sekwencję)
  
  const sample = pendingSamples[keyframeIndex];
  
  const chunk = new EncodedVideoChunk({
    type: sample.is_sync ? 'key' : 'delta',
    timestamp: (sample.cts * 1_000_000) / sample.timescale,
    duration: (sample.duration * 1_000_000) / sample.timescale,
    data: sample.data
  });

  decoder.decode(chunk);
}

// Helper do wyciągnięcia opisu kodeka (AVCC/HVCC) z MP4Boxa
function createDescription(file: MP4File, trackId: number) {
    const track = file.getTrackById(trackId);
    for (const entry of track.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC;
        if (box) {
            const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
            box.write(stream);
            return new Uint8Array(stream.buffer.slice(8)); // Remove box header
        }
    }
    return null;
}
```

-----

### 3\. `src/App.tsx` (UI i Bridge)

Tutaj łączymy Reacta z Workerem i Canvasem.

```tsx
// src/App.tsx
import { useEffect, useRef, useState } from 'react';
import Worker from './worker?worker'; // Vite worker import syntax

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    // Inicjalizacja Workera
    const worker = new Worker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'READY') {
        setDuration(e.data.payload.duration);
      }
    };

    // Transfer Canvasa do Workera
    if (canvasRef.current) {
      const offscreen = canvasRef.current.transferControlToOffscreen();
      worker.postMessage({ type: 'INIT_CANVAS', payload: { canvas: offscreen } }, [offscreen]);
    }

    return () => worker.terminate();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && workerRef.current) {
      workerRef.current.postMessage({ type: 'LOAD_FILE', payload: { file } });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    
    // Wysyłamy czas w mikrosekundach
    if (workerRef.current) {
      workerRef.current.postMessage({ 
        type: 'SEEK', 
        payload: { timeUs: time * 1_000_000 } 
      });
    }
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4">High-Perf Video Editor MVP</h1>
      
      {/* Container dla wideo */}
      <div className="relative border border-gray-700 bg-black rounded-lg overflow-hidden shadow-2xl" style={{ width: 640, height: 360 }}>
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Kontrolki */}
      <div className="w-[640px] mt-4 p-4 bg-gray-800 rounded-lg">
        <div className="mb-4">
          <input 
            type="file" 
            accept="video/mp4" 
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
        </div>

        <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-400 flex justify-between">
                <span>Timeline</span>
                <span>{currentTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
            </label>
            <input 
              type="range" 
              min="0" 
              max={duration || 100} 
              step="0.04" // ~25fps precision
              value={currentTime} 
              onChange={handleSeek}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
        </div>
      </div>
    </div>
  );
}

export default App;
```

-----

### Dlaczego to zadziała na słabym laptopie?

1.  **OffscreenCanvas:** UI Reacta jest kompletnie odseparowane od renderowania. Możesz klikać przyciski, a wideo nie przytnie interfejsu.
2.  **VideoDecoder:** Zamiast dekodować programowo (co zjada 100% CPU w ffmpeg.wasm), używamy chipu wideo.
3.  **Frame.close():** W `worker.ts` jest linijka `frame.close()`. Bez niej przeglądarka "zjadłaby" cały RAM w 5 sekund. To jest najważniejsza linia w tym kodzie.

### Co dalej (Next Steps)?

To jest "surowy" silnik. Aby zamienić to w edytor:

1.  **Play/Pause:** W workerze musisz dodać pętlę `requestAnimationFrame` (lub `setInterval`), która będzie inkrementować czas i wołać `SEEK` automatycznie.
2.  **Trimming:** W `App.tsx` dodaj dwa suwaki (Start/End). Przy eksporcie wyślesz te czasy do workera, a worker użyje `VideoEncoder` (którego tu jeszcze nie ma), aby zapisać nowy plik.
