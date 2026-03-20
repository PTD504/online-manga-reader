export type PolygonPoint = [number, number];

import { calculatePolygonCentroid, getBestSegmentAtY, getInteriorAnchor } from "./overlayPolygonUtils";

type LayoutLine = {
  text: string;
  centerX: number;
  yTop: number;
  maxWidth: number;
};

type DrawTextBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const getPrefixFitLength = (ctx: CanvasRenderingContext2D, word: string, maxWidth: number) => {
  let low = 0;
  let high = word.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const sample = word.slice(0, mid);
    if (ctx.measureText(sample).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
};

export const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  box: DrawTextBox,
  polygon?: PolygonPoint[]
) => {
  const trimmed = text.trim();
  if (!trimmed) return;

  const { left, top, width, height } = box;
  
  // Calculate dynamic font sizes based on bubble dimensions
  const maxFontSize = Math.max(36, Math.floor(Math.min(width, height) / 2));
  const minFontSize = 4;
  const lineHeightRatio = 1.25;
  const padding = Math.max(4, Math.round(Math.min(width, height) * 0.08));

  const geometry =
    polygon && polygon.length >= 3
      ? (() => {
          const centroid = calculatePolygonCentroid(polygon);
          const anchor = getInteriorAnchor(polygon, centroid);
          return {
            minY: Math.min(...polygon.map(([, y]) => y)),
            maxY: Math.max(...polygon.map(([, y]) => y)),
            anchor,
            getBoundsAtY: (y: number) => getBestSegmentAtY(polygon, y, anchor.x),
          };
        })()
      : {
          minY: top,
          maxY: top + height,
          anchor: { x: left + width / 2, y: top + height / 2 },
          getBoundsAtY: (_y: number) => ({ minX: left, maxX: left + width }),
        };

  const minInnerY = geometry.minY + padding;
  const maxInnerY = geometry.maxY - padding;
  if (maxInnerY <= minInnerY) return;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  const tryLayout = (fontSize: number): LayoutLine[] | null => {
    ctx.font = `${fontSize}px sans-serif`;
    const lineHeight = Math.round(fontSize * lineHeightRatio);
    const maxLines = Math.floor((maxInnerY - minInnerY) / lineHeight);
    if (maxLines < 1) return null;

    for (let lineCount = 1; lineCount <= maxLines; lineCount += 1) {
      const preferredStart = geometry.anchor.y - (lineCount * lineHeight) / 2;
      const startCandidates = Array.from(
        new Set([
          Math.round(preferredStart),
          Math.round(minInnerY),
          Math.round(maxInnerY - lineCount * lineHeight),
        ])
      );

      for (const startY of startCandidates) {
        const endY = startY + lineCount * lineHeight;
        if (startY < minInnerY || endY > maxInnerY) continue;

        const lineSlots: Array<{ centerX: number; yTop: number; maxWidth: number }> = [];
        let slotInvalid = false;

        for (let i = 0; i < lineCount; i += 1) {
          const yTop = startY + i * lineHeight;
          const yMid = yTop + lineHeight / 2;
          const bounds = geometry.getBoundsAtY(yMid);
          if (!bounds) {
            slotInvalid = true;
            break;
          }

          const lineMinX = bounds.minX + padding;
          const lineMaxX = bounds.maxX - padding;
          const maxWidth = lineMaxX - lineMinX;
          if (maxWidth <= 1) {
            slotInvalid = true;
            break;
          }

          // Force perfect center positioning within the available visual segment 
          // to prevent horizontal clipping.
          lineSlots.push({
            centerX: lineMinX + maxWidth / 2,
            yTop,
            maxWidth,
          });
        }

        if (slotInvalid) continue;

        const lines: string[] = [];
        let lineIndex = 0;
        let currentLine = "";
        let failed = false;

        for (let j = 0; j < words.length; j += 1) {
          const word = words[j];
          const slot = lineSlots[lineIndex];

          if (!slot) {
            failed = true;
            break;
          }

          const candidate = currentLine ? `${currentLine} ${word}` : word;

          if (ctx.measureText(candidate).width <= slot.maxWidth) {
            currentLine = candidate;
          } else {
            if (currentLine) {
              lines.push(currentLine);
              currentLine = word;
              lineIndex += 1;

              if (lineIndex >= lineCount) {
                failed = true;
                break;
              }

              const nextSlot = lineSlots[lineIndex];
              if (ctx.measureText(word).width > nextSlot.maxWidth) {
                failed = true;
                break;
              }
            } else {
              failed = true;
              break;
            }
          }
        }

        if (failed) continue;

        if (currentLine) {
          lines.push(currentLine);
        }

        if (lines.length === 0 || lines.length > lineCount) continue;

        const layout: LayoutLine[] = lines.map((lineText, idx) => {
          const slot = lineSlots[idx];
          return {
            text: lineText,
            centerX: slot.centerX,
            yTop: slot.yTop,
            maxWidth: slot.maxWidth,
          };
        });

        let tooWide = false;
        for (const line of layout) {
          if (ctx.measureText(line.text).width > line.maxWidth + 0.5) {
            tooWide = true;
            break;
          }
        }

        if (tooWide) continue;
        return layout;
      }
    }

    return null;
  };

  let finalLayout: LayoutLine[] | null = null;
  let finalFontSize = minFontSize;

  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const layout = tryLayout(fontSize);
    if (!layout) continue;
    finalLayout = layout;
    finalFontSize = fontSize;
    break;
  }

  // Fallback if even minFontSize fails
  if (!finalLayout) {
    ctx.font = `${minFontSize}px sans-serif`;
    const lineHeight = Math.round(minFontSize * lineHeightRatio);
    const fallbackWidth = Math.max(1, width - padding * 2);
    const lines: string[] = [];
    let rest = trimmed;

    // Remove maxLines limitation so we never drop remaining text
    while (rest.length > 0) {
      const fitLength = getPrefixFitLength(ctx, rest, fallbackWidth);
      if (fitLength <= 0) break;

      let chunk = rest.slice(0, fitLength);
      if (fitLength < rest.length) {
        const lastSpace = chunk.lastIndexOf(" ");
        if (lastSpace > 0) {
          chunk = chunk.slice(0, lastSpace);
        }
      }

      lines.push(chunk.trim());
      rest = rest.slice(chunk.length).trim();
    }

    const blockHeight = lines.length * lineHeight;
    const startY = geometry.anchor.y - blockHeight / 2;
    finalLayout = lines.map((line, idx) => ({
      text: line,
      // Fallback alignment based on geometry type
      centerX: polygon && polygon.length >= 3 ? geometry.anchor.x : left + width / 2,
      yTop: startY + idx * lineHeight,
      maxWidth: fallbackWidth,
    }));
  } else {
    ctx.font = `${finalFontSize}px sans-serif`;
  }

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (const line of finalLayout) {
    ctx.fillText(line.text, line.centerX, line.yTop);
  }
};