import { Point, CanvasElement, FreedrawElement } from '../types';

/**
 * Math and geometric hit-testing functions for canvas elements.
 */

/** Check if a point is inside a rectangle */
export function isPointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/** Check if a point is near a line segment (within strokeWidth/2 + margin) */
export function isPointNearLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number, distance: number): boolean {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1) <= distance;
  
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const pProjX = x1 + t * (x2 - x1);
  const pProjY = y1 + t * (y2 - y1);
  return Math.hypot(px - pProjX, py - pProjY) <= distance;
}

/** Check if a point is inside/near an ellipse */
export function isPointInEllipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): boolean {
  if (rx === 0 || ry === 0) return false;
  const dx = px - cx;
  const dy = py - cy;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

/** Get bounding box of a list of points */
export function getPointsBounds(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Perform precise hit testing on a canvas element */
export function hitTestElement(px: number, py: number, element: CanvasElement, margin: number = 5): boolean {
  const { type, x, y, width, height, strokeWidth } = element;
  const hitDistance = strokeWidth / 2 + margin;
  
  // Normalize negative width/height (shapes drawn right-to-left or bottom-to-top)
  const nx = width >= 0 ? x : x + width;
  const ny = height >= 0 ? y : y + height;
  const nw = Math.abs(width);
  const nh = Math.abs(height);
  
  // Quick bounding box rejection
  if (!isPointInRect(px, py, nx - hitDistance, ny - hitDistance, nw + hitDistance * 2, nh + hitDistance * 2)) {
    return false;
  }
  
  if (type === 'freedraw') {
    const free = element as FreedrawElement;
    // For single point, check dot radius
    if (free.points.length <= 1) {
      const p = free.points[0];
      return Math.hypot(px - (x + p.x), py - (y + p.y)) <= hitDistance;
    }
    for (let i = 0; i < free.points.length - 1; i++) {
      const p1 = free.points[i];
      const p2 = free.points[i + 1];
      if (isPointNearLine(px, py, x + p1.x, y + p1.y, x + p2.x, y + p2.y, hitDistance)) {
        return true;
      }
    }
    return false;
  }
  
  if (type === 'rectangle') {
    // Select the whole bounding box (not just the border stroke)
    return true;
  }
  
  if (type === 'ellipse') {
    // Select inside the ellipse
    const cx = nx + nw / 2;
    const cy = ny + nh / 2;
    const rx = nw / 2 + hitDistance;
    const ry = nh / 2 + hitDistance;
    return isPointInEllipse(px, py, cx, cy, rx, ry);
  }
  
  if (type === 'line' || type === 'arrow') {
    return isPointNearLine(px, py, x, y, x + width, y + height, hitDistance);
  }
  
  return false;
}
