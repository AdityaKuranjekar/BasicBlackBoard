/**
 * CanvasEngine — Orchestrates all canvas rendering for Infinite Blackboard.
 *
 * ══════════════════════════════════════════════════════════
 * Three-Canvas Architecture
 * ══════════════════════════════════════════════════════════
 *
 * The visible drawing surface is composed of three stacked <canvas>
 * elements (plus a fourth for UI), each with a dedicated responsibility:
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  Layer 3 — UI Canvas          z-index: 3        │  ← Eraser cursor, pointer events
 *   │  Layer 2 — Active Canvas      z-index: 2        │  ← Live stroke being drawn
 *   │  Layer 1 — Stroke Canvas      z-index: 1        │  ← All committed strokes
 *   │  Layer 0 — Background Canvas  z-index: 0        │  ← Background fill + grid
 *   └─────────────────────────────────────────────────┘
 *
 * Benefits of this separation:
 *   • Background only re-renders when colour/grid/viewport changes
 *   • Committed strokes only re-render when the stroke list changes
 *   • The live active stroke can be redrawn every pointer event (sub-ms)
 *     without disturbing the other layers
 *   • The eraser cursor can be updated independently at 60fps
 *
 * ══════════════════════════════════════════════════════════
 * HiDPI / Retina Support
 * ══════════════════════════════════════════════════════════
 *
 * iPad Retina displays have devicePixelRatio = 2 (or 3 on ProMotion).
 * If we set canvas.width = CSS width, every pixel maps to 4 physical
 * pixels, producing blurry strokes. We counter this by:
 *   • Setting canvas.width = cssWidth × devicePixelRatio
 *   • Applying ctx.scale(dpr, dpr) at the start of every render pass
 *
 * The result: crisp, sub-pixel accurate rendering on all displays.
 *
 * ══════════════════════════════════════════════════════════
 * Viewport Transform
 * ══════════════════════════════════════════════════════════
 *
 * For the stroke layers we call ctx.setTransform() to map from world
 * coordinates to screen coordinates in a single step:
 *
 *   ctx.setTransform(
 *     scale * dpr,  0,
 *     0,            scale * dpr,
 *     -offsetX * scale * dpr,
 *     -offsetY * scale * dpr
 *   );
 *
 * After this call, drawing in world coordinates produces the correct
 * screen position at the current zoom level.
 *
 * The background/UI layers use direct screen-space coordinates (no
 * viewport transform) for efficiency and pixel-perfect rendering.
 */

import type { Stroke, Point, ViewportState, GridMode } from '../types';
import { renderStroke, renderActiveStroke } from './StrokeRenderer';
import { renderGrid } from './GridRenderer';

export class CanvasEngine {
  // Canvas 2D rendering contexts for each layer
  private bgCtx:     CanvasRenderingContext2D;
  private strokeCtx: CanvasRenderingContext2D;
  private activeCtx: CanvasRenderingContext2D;
  private uiCtx:     CanvasRenderingContext2D;

  // Physical dimensions = CSS dimensions × devicePixelRatio
  private physWidth  = 0;
  private physHeight = 0;
  // CSS pixel dimensions (layout space)
  private cssWidth   = 0;
  private cssHeight  = 0;
  // Device pixel ratio (1 on standard, 2 on Retina, 2-3 on iPad Pro)
  private dpr        = 1;

  constructor(
    bgCanvas:     HTMLCanvasElement,
    strokeCanvas: HTMLCanvasElement,
    activeCanvas: HTMLCanvasElement,
    uiCanvas:     HTMLCanvasElement
  ) {
    // getContext('2d') cannot return null when called on a real canvas element
    this.bgCtx     = bgCanvas.getContext('2d')!;
    this.strokeCtx = strokeCanvas.getContext('2d')!;
    this.activeCtx = activeCanvas.getContext('2d')!;
    this.uiCtx     = uiCanvas.getContext('2d')!;
  }

  // ─────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────

  /**
   * Resize all four canvases to match the new viewport dimensions.
   *
   * Must be called:
   *   • On component mount (initial size)
   *   • Whenever the window / container resizes
   *   • After orientation change on iPad
   *
   * Setting canvas.width clears all pixel data, so a full re-render
   * must follow this call.
   *
   * @param cssWidth  - Container width in CSS pixels
   * @param cssHeight - Container height in CSS pixels
   * @param dpr       - window.devicePixelRatio (typically 1–3)
   */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr        = dpr;
    this.cssWidth   = cssWidth;
    this.cssHeight  = cssHeight;
    this.physWidth  = Math.round(cssWidth  * dpr);
    this.physHeight = Math.round(cssHeight * dpr);

    // Apply physical dimensions to all four canvases.
    // Note: setting .width also resets the canvas context state,
    // so any transforms or styles must be re-applied after resize.
    for (const ctx of [this.bgCtx, this.strokeCtx, this.activeCtx, this.uiCtx]) {
      ctx.canvas.width  = this.physWidth;
      ctx.canvas.height = this.physHeight;
    }
  }

  // ─────────────────────────────────────────────
  // Layer 0: Background
  // ─────────────────────────────────────────────

  /**
   * Render the background layer: solid colour fill and optional grid.
   *
   * Called when:
   *   • Background colour changes
   *   • Grid mode changes
   *   • Viewport pans or zooms (grid lines must shift/scale)
   *   • After resize
   *
   * @param backgroundColor - CSS hex colour string (e.g. '#1C3A2A')
   * @param gridMode        - 'none' | 'dots' | 'squares'
   * @param viewport        - Current camera state (needed for grid positioning)
   */
  renderBackground(
    backgroundColor: string,
    gridMode: GridMode,
    viewport: ViewportState
  ): void {
    const ctx = this.bgCtx;

    // Solid background fill
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, this.physWidth, this.physHeight);

    // Grid overlay (operates in CSS-pixel space for consistent line widths)
    ctx.save();
    ctx.scale(this.dpr, this.dpr); // Scale up for physical pixel precision
    renderGrid(ctx, viewport, gridMode, this.cssWidth, this.cssHeight, backgroundColor);
    ctx.restore();
  }

  // ─────────────────────────────────────────────
  // Layer 1: Committed Strokes
  // ─────────────────────────────────────────────

  /**
   * Render all committed strokes onto the stroke canvas.
   *
   * Called when:
   *   • A new stroke is committed (pen lifted)
   *   • Undo / redo changes the stroke list
   *   • Viewport pans or zooms (strokes must reposition)
   *   • After resize
   *
   * Full re-render is O(n_strokes × avg_points_per_stroke). For up to
   * 5,000 strokes this completes in < 5ms on modern hardware.
   *
   * @param strokes  - Complete world-space stroke list to render
   * @param viewport - Current camera state
   */
  renderStrokes(strokes: Stroke[], viewport: ViewportState): void {
    const ctx = this.strokeCtx;
    ctx.clearRect(0, 0, this.physWidth, this.physHeight);

    if (strokes.length === 0) return;

    ctx.save();
    // Apply viewport → screen transform (includes DPR scaling)
    this.applyViewportTransform(ctx, viewport);

    for (const stroke of strokes) {
      renderStroke(ctx, stroke);
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────────
  // Layer 2: Active (Live) Stroke
  // ─────────────────────────────────────────────

  /**
   * Render the stroke currently being drawn by the user.
   *
   * Called on every pointer move event during a drawing gesture.
   * This layer is cleared and redrawn from scratch each time to
   * avoid cumulative rendering artifacts.
   *
   * @param points   - Points sampled so far in the current gesture
   * @param color    - Stroke colour
   * @param width    - Base stroke width in world pixels
   * @param viewport - Current camera state
   */
  renderActiveStroke(
    points: Point[],
    color: string,
    width: number,
    viewport: ViewportState
  ): void {
    const ctx = this.activeCtx;
    ctx.clearRect(0, 0, this.physWidth, this.physHeight);

    if (points.length === 0) return;

    ctx.save();
    this.applyViewportTransform(ctx, viewport);
    renderActiveStroke(ctx, points, color, width);
    ctx.restore();
  }

  /** Clear the active stroke canvas (called when a stroke is committed or cancelled) */
  clearActiveStroke(): void {
    this.activeCtx.clearRect(0, 0, this.physWidth, this.physHeight);
  }

  // ─────────────────────────────────────────────
  // Layer 3: UI Overlay (Eraser Cursor)
  // ─────────────────────────────────────────────

  /**
   * Render the eraser cursor — a circle that follows the pointer.
   *
   * Drawn in screen space (CSS pixels × DPR) so the cursor size
   * matches the user-configured eraser radius regardless of zoom level.
   *
   * @param screenX    - Cursor centre X in CSS pixels
   * @param screenY    - Cursor centre Y in CSS pixels
   * @param radiusCss  - Cursor radius in CSS pixels
   */
  renderEraserCursor(screenX: number, screenY: number, radiusCss: number): void {
    const ctx = this.uiCtx;
    ctx.clearRect(0, 0, this.physWidth, this.physHeight);

    ctx.save();
    ctx.scale(this.dpr, this.dpr); // Work in CSS-pixel space

    // Outer boundary circle
    ctx.beginPath();
    ctx.arc(screenX, screenY, radiusCss, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Inner fill (semi-transparent white tint)
    ctx.beginPath();
    ctx.arc(screenX, screenY, radiusCss, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();

    // Centre dot for precision targeting
    ctx.beginPath();
    ctx.arc(screenX, screenY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.restore();
  }

  /** Clear the UI overlay canvas (called when pointer leaves the canvas or tool changes) */
  clearUI(): void {
    this.uiCtx.clearRect(0, 0, this.physWidth, this.physHeight);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Apply the combined devicePixelRatio + viewport transform to a context.
   *
   * After this call, coordinates passed to drawing operations should be
   * in world space; the transform handles the conversion to screen pixels.
   *
   * Transform matrix (column-major):
   *   ┌ scale·dpr   0           -offsetX·scale·dpr ┐
   *   │ 0           scale·dpr   -offsetY·scale·dpr │
   *   └ 0           0           1                  ┘
   *
   * This is equivalent to:
   *   ctx.scale(dpr, dpr);
   *   ctx.scale(scale, scale);
   *   ctx.translate(-offsetX, -offsetY);
   */
  private applyViewportTransform(
    ctx: CanvasRenderingContext2D,
    vp: ViewportState
  ): void {
    const { offsetX, offsetY, scale } = vp;
    const s = scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, -offsetX * s, -offsetY * s);
  }
}
