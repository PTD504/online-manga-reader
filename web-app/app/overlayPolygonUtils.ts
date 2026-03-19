import type { PolygonPoint } from "./overlayTextLayout";

export const calculatePolygonCentroid = (polygon: PolygonPoint[]) => {
  if (polygon.length === 0) {
    return { x: 0, y: 0 };
  }

  if (polygon.length < 3) {
    const sum = polygon.reduce(
      (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / polygon.length, y: sum.y / polygon.length };
  }

  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    const cross = x0 * y1 - x1 * y0;
    signedArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-6) {
    const sum = polygon.reduce(
      (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / polygon.length, y: sum.y / polygon.length };
  }

  return {
    x: cx / (6 * signedArea),
    y: cy / (6 * signedArea),
  };
};

const getPolygonSegmentsAtY = (polygon: PolygonPoint[], y: number) => {
  const intersections: number[] = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];

    // Count intersections on a half-open interval to avoid double-counting vertices.
    if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
      const t = (y - y1) / (y2 - y1);
      intersections.push(x1 + t * (x2 - x1));
    }
  }

  if (intersections.length < 2) {
    return null;
  }

  intersections.sort((a, b) => a - b);
  const segments: Array<{ minX: number; maxX: number }> = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    segments.push({ minX: intersections[i], maxX: intersections[i + 1] });
  }

  if (segments.length === 0) {
    return null;
  }

  return segments;
};

export const getBestSegmentAtY = (polygon: PolygonPoint[], y: number, anchorX: number) => {
  const segments = getPolygonSegmentsAtY(polygon, y);
  if (!segments || segments.length === 0) {
    return null;
  }

  let best = segments[0];
  let bestScore = -Infinity;

  for (const segment of segments) {
    const width = segment.maxX - segment.minX;
    if (width <= 0) continue;

    const distanceToSegment =
      anchorX < segment.minX ? segment.minX - anchorX : anchorX > segment.maxX ? anchorX - segment.maxX : 0;
    const score = width - distanceToSegment * 2;
    if (score > bestScore) {
      best = segment;
      bestScore = score;
    }
  }

  return best;
};

export const getInteriorAnchor = (polygon: PolygonPoint[], centroid: { x: number; y: number }) => {
  const minY = Math.min(...polygon.map(([, y]) => y));
  const maxY = Math.max(...polygon.map(([, y]) => y));
  let best = { x: centroid.x, y: centroid.y };
  let bestScore = -Infinity;

  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const y = minY + (maxY - minY) * t;
    const segment = getBestSegmentAtY(polygon, y, centroid.x);
    if (!segment) continue;

    const x = Math.max(segment.minX, Math.min(segment.maxX, centroid.x));
    const width = segment.maxX - segment.minX;
    const score = width - Math.abs(y - centroid.y) * 0.35 - Math.abs(x - centroid.x) * 0.15;
    if (score > bestScore) {
      best = { x, y };
      bestScore = score;
    }
  }

  return best;
};
