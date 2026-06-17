/**
 * Viewport / Camera utilities for the infinite canvas.
 *
 * ══════════════════════════════════════════════════════════
 * Coordinate Systems
 * ══════════════════════════════════════════════════════════
 *
 * World Space
 *   The abstract, infinite plane where all strokes live.
 *   Units are "world pixels" — 1 unit ≈ 1 CSS pixel at scale 1.
 *   No origin constraint; values can be negative or very large.
 *
 * Screen Space
 *   CSS pixel coordinates as seen by the user on the device.
 *   Origin (0, 0) is always the top-left corner of the canvas.
 *
 * Transform Equations:
 *   screenX = (worldX − offsetX) × scale
 *   screenY = (worldY − offsetY) × scale
 *   worldX  = screenX / scale + offsetX
 *   worldY  = screenY / scale + offsetY
 *
 * ══════════════════════════════════════════════════════════
 * Origin Rebasing (Virtual Infinite Canvas)
 * ══════════════════════════════════════════════════════════
 *
 * After extensive panning, the camera offset (offsetX/Y) grows very
 * large. IEEE 754 double-precision floats start losing sub-pixel
 * accuracy above ~10^15, but visible jitter begins well before that
 * (around 10^6 for high-DPI screens). We counter this by periodically
 * rebasing the origin: shifting all stored CanvasElement coordinates so that
 * the camera offset returns to near-zero. This is the same technique
 * used by applications like Miro and Figma.
 */

import type { ViewportState, CanvasElement } from '../types';
import { MIN_SCALE, MAX_SCALE, REBASE_THRESHOLD } from '../constants';

// ─────────────────────────────────────────────
// Coordinate Conversion
// ─────────────────────────────────────────────

/**
 * Convert a screen-space position to world-space coordinates.
 *
 * @param sx - Screen X in CSS pixels
 * @param sy - Screen Y in CSS pixels
 * @param vp - Current viewport state
 */
export function screenToWorld(
  sx: number,
  sy: number,
  vp: ViewportState
): { x: number; y: number } {
  return {
    x: sx / vp.scale + vp.offsetX,
    y: sy / vp.scale + vp.offsetY,
  };
}

/**
 * Convert a world-space position to screen-space coordinates.
 *
 * @param wx - World X
 * @param wy - World Y
 * @param vp - Current viewport state
 */
export function worldToScreen(
  wx: number,
  wy: number,
  vp: ViewportState
): { x: number; y: number } {
  return {
    x: (wx - vp.offsetX) * vp.scale,
    y: (wy - vp.offsetY) * vp.scale,
  };
}

// ─────────────────────────────────────────────
// Viewport Manipulation
// ─────────────────────────────────────────────

/**
 * Pan the viewport by a screen-space delta.
 *
 * Dragging a finger/pencil by (dx, dy) CSS pixels moves the world
 * origin in the opposite direction: the visible portion of the world
 * shifts right/down when you drag left/up.
 *
 * Formula: newOffset = oldOffset − delta / scale
 * (Dividing by scale ensures consistent "feel" at any zoom level.)
 */
export function panViewport(
  vp: ViewportState,
  dx: number,
  dy: number
): ViewportState {
  return {
    ...vp,
    offsetX: vp.offsetX - dx / vp.scale,
    offsetY: vp.offsetY - dy / vp.scale,
  };
}

/**
 * Zoom the viewport around a focal point (in screen space).
 *
 * The world point currently under the focal pixel remains fixed on
 * screen after the zoom — this is the "pinch-to-zoom" feel users expect.
 *
 * Derivation:
 *   worldFocal = focalScreen / oldScale + oldOffset        (1)
 *   worldFocal = focalScreen / newScale + newOffset        (2)
 *   Rearranging (2): newOffset = worldFocal − focalScreen / newScale
 *
 * @param vp      - Current viewport
 * @param factor  - Scale multiplier (>1 zooms in, <1 zooms out)
 * @param focalX  - Screen-space X of the focal point
 * @param focalY  - Screen-space Y of the focal point
 */
export function zoomViewport(
  vp: ViewportState,
  factor: number,
  focalX: number,
  focalY: number
): ViewportState {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
  if (newScale === vp.scale) return vp; // Already at limit — no change

  // World coordinate that sits under the focal screen pixel
  const worldFocalX = focalX / vp.scale + vp.offsetX;
  const worldFocalY = focalY / vp.scale + vp.offsetY;

  return {
    scale:   newScale,
    offsetX: worldFocalX - focalX / newScale,
    offsetY: worldFocalY - focalY / newScale,
  };
}

// ─────────────────────────────────────────────
// Origin Rebasing
// ─────────────────────────────────────────────

/**
 * Rebase the world origin if the camera offset has grown too large.
 *
 * This prevents floating-point precision degradation during very long
 * panning sessions. The operation is mathematically transparent — all
 * strokes move by the same delta, so the visual result is identical.
 *
 * Algorithm:
 *   1. Check if |offsetX| or |offsetY| exceeds REBASE_THRESHOLD
 *   2. If so, shift every CanvasElement point by (−offsetX, −offsetY)
 *   3. Reset the camera offset to (0, 0)
 *
 * Effect on CanvasElement data: all point.x − offsetX, all point.y − offsetY
 * Effect on viewport:    offsetX → 0, offsetY → 0
 *
 * @returns The (possibly rebased) strokes and viewport, plus a flag
 *          indicating whether a rebase actually occurred.
 */
export function maybeRebaseOrigin(
  strokes: CanvasElement[],
  viewport: ViewportState
): { strokes: CanvasElement[]; viewport: ViewportState; rebased: boolean } {
  const { offsetX, offsetY } = viewport;
  const needsRebase =
    Math.abs(offsetX) >= REBASE_THRESHOLD ||
    Math.abs(offsetY) >= REBASE_THRESHOLD;

  if (!needsRebase) {
    return { strokes, viewport, rebased: false };
  }

  // Translate all CanvasElement coordinates so the camera reset is invisible to the user
  const rebasedStrokes: CanvasElement[] = strokes.map(element => {
    return { ...element, x: element.x - offsetX, y: element.y - offsetY } as CanvasElement;
  });

  const rebasedViewport: ViewportState = {
    ...viewport,
    offsetX: 0,
    offsetY: 0,
  };

  return { strokes: rebasedStrokes, viewport: rebasedViewport, rebased: true };
}
