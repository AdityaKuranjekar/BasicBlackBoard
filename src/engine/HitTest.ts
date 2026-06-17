import type { CanvasElement, FreedrawElement, Point } from '../types';
import { nanoid } from '../utils/nanoid';
import { hitTestElement } from './Geometry';

/**
 * Apply a circular area eraser to the CanvasElement list.
 *
 * For freehand strokes, any points that fall within the eraser circle are removed; 
 * strokes may be split into smaller pieces.
 * For geometric shapes, if the eraser intersects the shape's bounds/stroke, 
 * the entire shape is removed.
 *
 * @param elements       - Current world-space CanvasElement list
 * @param eraserCenterX  - Eraser centre X in world coordinates
 * @param eraserCenterY  - Eraser centre Y in world coordinates
 * @param eraserRadius   - Eraser radius in world coordinates
 */
export function applyEraser(
  elements: CanvasElement[],
  eraserCenterX: number,
  eraserCenterY: number,
  eraserRadius: number
): CanvasElement[] {
  const result: CanvasElement[] = [];

  for (const element of elements) {
    if (element.isDeleted) {
      result.push(element);
      continue;
    }

    if (element.type === 'freedraw') {
      // Step 1: quick bounding-box cull for freedraw
      if (!strokeMightIntersect(element as FreedrawElement, eraserCenterX, eraserCenterY, eraserRadius)) {
        result.push(element);
        continue;
      }
      // Step 2: split the stroke
      const segments = splitStroke(element as FreedrawElement, eraserCenterX, eraserCenterY, eraserRadius);
      result.push(...segments);
    } else {
      // For shapes, we use hitTestElement with the eraser radius as the margin
      const hit = hitTestElement(eraserCenterX, eraserCenterY, element, eraserRadius);
      if (hit) {
        // Shape is erased, we omit it from the result array (or mark it deleted if keeping history)
        // Since this returns a new array, omitting it is equivalent to erasing it.
      } else {
        result.push(element);
      }
    }
  }

  return result;
}

function strokeMightIntersect(
  element: FreedrawElement,
  cx: number,
  cy: number,
  r: number
): boolean {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  const { x, y } = element;
  
  for (const pt of element.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  
  // Transform bounding box by element's x/y
  minX += x;
  maxX += x;
  minY += y;
  maxY += y;

  return (
    cx + r >= minX &&
    cx - r <= maxX &&
    cy + r >= minY &&
    cy - r <= maxY
  );
}

function splitStroke(
  element: FreedrawElement,
  cx: number,
  cy: number,
  r: number
): CanvasElement[] {
  const result: CanvasElement[] = [];
  let currentPoints: Point[] = [];
  const r2 = r * r; 

  const { x, y } = element;

  for (const point of element.points) {
    const dx = (x + point.x) - cx;
    const dy = (y + point.y) - cy;
    const dist2 = dx * dx + dy * dy;

    if (dist2 <= r2) {
      if (currentPoints.length >= 2) {
        result.push({ ...element, id: nanoid(), points: currentPoints });
      }
      currentPoints = [];
    } else {
      currentPoints.push(point);
    }
  }

  if (currentPoints.length >= 2) {
    result.push({ ...element, id: nanoid(), points: currentPoints });
  }

  return result;
}
