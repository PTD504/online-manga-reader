import { drawWrappedText, PolygonPoint } from "./overlayTextLayout";
import { preloadImages, toDataUri } from "./overlayImageUtils";

export type BoxArray = [number, number, number, number];

export type Bubble = {
  box: BoxArray | { x1: number; y1: number; x2?: number; y2?: number; width?: number; height?: number };
  polygon?: number[][];
  clean_image?: string | null;
  translatedText?: string;
};

const getScaledBox = (bubble: Bubble, scaleX: number, scaleY: number) => {
  if (Array.isArray(bubble.box)) {
    // Backend returns [x1, y1, x2, y2] (absolute coordinates)
    const [x1, y1, x2, y2] = bubble.box;
    const width = x2 - x1;
    const height = y2 - y1;
    return { left: x1 * scaleX, top: y1 * scaleY, width: width * scaleX, height: height * scaleY };
  }

  const { x1, y1 } = bubble.box;
  const width = (bubble.box.width ?? 0) || ((bubble.box.x2 ?? x1) - x1);
  const height = (bubble.box.height ?? 0) || ((bubble.box.y2 ?? y1) - y1);
  return { left: x1 * scaleX, top: y1 * scaleY, width: width * scaleX, height: height * scaleY };
};

export const drawOverlays = async (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  bubbles: Bubble[],
  imageCache: Map<string, HTMLImageElement>
) => {
  if (!image.naturalWidth || !image.naturalHeight) return;

  const canvas = ctx.canvas;
  const scaleX = canvas.width / image.naturalWidth;
  const scaleY = canvas.height / image.naturalHeight;

  // Phase 1 (async): preload clean images before the draw pass.
  await preloadImages(bubbles, imageCache);

  // Phase 2 (sync/atomic): clear then draw every bubble without awaits.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const bubble of bubbles) {
    const { left, top, width, height } = getScaledBox(bubble, scaleX, scaleY);
    if (width <= 0 || height <= 0) continue;

    ctx.save();
    ctx.beginPath();

    const polygon = bubble.polygon as PolygonPoint[] | undefined;
    const scaledPolygon =
      polygon && polygon.length >= 3
        ? polygon.map(([x, y]) => [x * scaleX, y * scaleY] as PolygonPoint)
        : undefined;

    if (polygon && polygon.length >= 3) {
      const [fx, fy] = polygon[0];
      ctx.moveTo(fx * scaleX, fy * scaleY);
      for (let i = 1; i < polygon.length; i += 1) {
        const [x, y] = polygon[i];
        ctx.lineTo(x * scaleX, y * scaleY);
      }
      ctx.closePath();
    } else {
      ctx.rect(left, top, width, height);
    }

    ctx.clip();

    const cleanImage = bubble.clean_image;
    if (cleanImage) {
      const clean = imageCache.get(toDataUri(cleanImage));
      if (clean) {
        ctx.drawImage(clean, left, top, width, height);
      } else {
        ctx.fillStyle = "white";
        ctx.fillRect(left, top, width, height);
      }
    } else {
      ctx.fillStyle = "white";
      ctx.fillRect(left, top, width, height);
    }

    drawWrappedText(ctx, bubble.translatedText?.trim() || "Translated text", { left, top, width, height }, scaledPolygon);
    ctx.restore();
  }
};
