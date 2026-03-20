import { useEffect, useRef } from "react";
import { Bubble, drawOverlays } from "../overlayRenderer";

type ImageCanvasViewerProps = {
  imageUrl: string | null;
  imageName: string | null;
  bubbles: Bubble[];
  isLoading: boolean;
};

function Spinner() {
  return (
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/80 border-t-indigo-500" aria-hidden="true" />
  );
}

export default function ImageCanvasViewer({
  imageUrl,
  imageName,
  bubbles,
  isLoading,
}: ImageCanvasViewerProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const render = () => {
      if (!image || !imageUrl) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const width = image.clientWidth;
      const height = image.clientHeight;
      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
      }

      void drawOverlays(ctx, image, bubbles, imageCacheRef.current);
    };

    render();

    if (!image) {
      return;
    }

    image.addEventListener("load", render);
    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(image);

    return () => {
      image.removeEventListener("load", render);
      resizeObserver.disconnect();
    };
  }, [bubbles, imageUrl]);

  return (
    <section className="rounded-xl border border-indigo-100 bg-white p-4 shadow-lg sm:p-5">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900">Image Viewer</h2>

      <div className="min-h-[320px] rounded-xl border border-neutral-200 bg-neutral-100 p-4 text-center">
        {imageUrl ? (
          <div className="relative inline-block max-w-full rounded-xl border border-neutral-200 bg-neutral-900/90 shadow-sm">
            {/* Object URLs are rendered with a native image element for local preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={imageName ? "Selected manga page: " + imageName : "Selected manga page"}
              className="block max-h-[70vh] w-auto max-w-full"
            />

            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
              id="canvas-layer-root"
            />

            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Spinner />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center">
            <p className="text-sm text-neutral-500">
              <span className="font-bold text-red-500">Paste (Ctrl + V)</span> your image here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
