/**
 * Stroke rendering engine using Quadratic Bézier smoothing.
 *
 * ══════════════════════════════════════════════════════════
 * Why Quadratic Bézier (not Catmull-Rom)?
 * ══════════════════════════════════════════════════════════
 *
 * Catmull-Rom splines produce very smooth curves but are expensive to
 * evaluate (requires look-ahead to the next point) and can over-smooth
 * teacher handwriting — characters like '2', 'S', and 'e' that have
 * tight corners become unrecognisably round.
 *
 * Quadratic Bézier smoothing (the "midpoint method") is:
 *   • Used by Apple Notes, OneNote, and Excalidraw
 *   • Lightweight — no look-ahead or matrix operations
 *   • Naturally smooth without distorting sharp corners
 *   • Renders in O(n) time where n = number of sampled points
 *
 * Algorithm:
 *   For consecutive points A, B, C:
 *     Move to midpoint(A, B)
 *     Draw quadratic bezier with control=B, end=midpoint(B, C)
 *   This creates G1-continuous curves that faithfully follow the
 *   drawn path while eliminating high-frequency jitter.
 *
 * ══════════════════════════════════════════════════════════
 * Pressure Sensitivity
 * ══════════════════════════════════════════════════════════
 *
 * Apple Pencil supplies pressure in the range [0, 1].
 * We map this to stroke width via: width × (0.5 + pressure × 0.5)
 *   • pressure 0.0 → 50% of base width (very light touch)
 *   • pressure 0.5 → 75% (default for non-pressure input)
 *   • pressure 1.0 → 100% (full press)
 *
 * We use the average pressure over the entire stroke for the line width.
 * This avoids expensive per-segment width changes while still producing
 * natural-feeling strokes that respond to writing pressure.
 */

import type { Point, Stroke } from '../types';

// ─────────────────────────────────────────────
// Main rendering functions
// ─────────────────────────────────────────────

/**
 * Render a completed stroke onto a canvas context.
 *
 * The context must already have the viewport transform applied
 * (via CanvasEngine.applyViewportTransform) so drawing occurs in
 * world coordinates.
 *
 * @param ctx    - 2D context with world-space transform active
 * @param stroke - Stroke to draw
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke
): void {
  const { points, color, width } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';

  if (points.length === 1) {
    // ── Single tap ─── render as a filled circle (dot)
    const p = points[0];
    const radius = (width * (0.5 + p.pressure * 0.5)) / 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(radius, 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // ── Pressure-sensitive width ──────────────────────────────
  // Use average pressure across all sampled points.
  const avgPressure =
    points.reduce((sum, p) => sum + p.pressure, 0) / points.length;
  ctx.lineWidth = width * (0.5 + avgPressure * 0.5);

  // ── Quadratic Bézier smoothing ────────────────────────────
  ctx.beginPath();

  if (points.length === 2) {
    // Only two points — draw a straight line segment
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    // Start at the first point, advance to the midpoint between
    // points[0] and points[1] so the curve starts smoothly.
    const startMidX = (points[0].x + points[1].x) / 2;
    const startMidY = (points[0].y + points[1].y) / 2;
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(startMidX, startMidY);

    // For each interior point, draw a quadratic bezier:
    //   control point = current point (B)
    //   end point     = midpoint(B, C) — the "landing" for the next segment
    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    }

    // Finish at the last point
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Render the currently active (in-progress) stroke.
 *
 * Identical algorithm to renderStroke but accepts raw Point[] so it
 * can be called during drawing before the stroke is finalised.
 *
 * @param ctx      - Canvas context with viewport transform applied
 * @param points   - Points sampled so far in this gesture
 * @param color    - Stroke color
 * @param width    - Base stroke width
 */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number
): void {
  if (points.length === 0) return;

  // Reuse renderStroke by constructing a temporary stroke object.
  // The 'id' field is irrelevant here — it's only used for history tracking.
  renderStroke(ctx, {
    id:    'active',
    points,
    color,
    width,
    tool:  'pen',
  });
}
