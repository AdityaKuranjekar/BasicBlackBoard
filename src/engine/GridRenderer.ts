/**
 * Infinite grid renderer for the background canvas.
 *
 * ══════════════════════════════════════════════════════════
 * Design
 * ══════════════════════════════════════════════════════════
 *
 * The grid extends infinitely in all directions and follows the
 * viewport transform — as you pan and zoom, the grid moves with
 * the drawing surface.
 *
 * We deliberately do NOT use ctx.setTransform() for the grid.
 * Instead we compute grid line positions directly in screen space.
 * This lets us:
 *   • Keep grid line widths at a constant 1 screen pixel (always crisp)
 *   • Keep dot sizes at a consistent visual weight regardless of zoom
 *
 * Performance:
 *   We only draw grid lines/dots that fall within the visible area
 *   (plus one cell of padding). The number of iterations is therefore
 *   bounded by: (canvasWidth / spacing) × (canvasHeight / spacing)
 *   For a 1366×1024 iPad at spacing=50 that is roughly 550 operations —
 *   negligible even inside a requestAnimationFrame loop.
 *
 * Adaptive colour:
 *   We infer the background lightness from the hex colour to choose
 *   a grid colour that provides gentle contrast without distraction.
 */

import type { ViewportState, GridMode } from '../types';
import { GRID_SPACING } from '../constants';

/**
 * Draw the grid overlay onto the background canvas context.
 *
 * @param ctx             - Background canvas 2D context (CSS-pixel coordinate space)
 * @param viewport        - Current camera state
 * @param gridMode        - 'none' | 'dots' | 'squares'
 * @param canvasWidthCSS  - Canvas width in CSS pixels
 * @param canvasHeightCSS - Canvas height in CSS pixels
 * @param backgroundColor - Current background colour (hex) — used to auto-select grid colour
 */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  gridMode: GridMode,
  canvasWidthCSS: number,
  canvasHeightCSS: number,
  backgroundColor: string
): void {
  if (gridMode === 'none') return;

  const { offsetX, offsetY, scale } = viewport;

  // ── Adaptive grid colour ──────────────────────────────────
  // Choose a subtle grid colour that works on both light and dark backgrounds.
  const dark = isColorDark(backgroundColor);
  const lineColor = dark
    ? 'rgba(255, 255, 255, 0.10)'
    : 'rgba(0, 0, 0, 0.08)';
  const dotColor = dark
    ? 'rgba(255, 255, 255, 0.22)'
    : 'rgba(0, 0, 0, 0.18)';

  // ── Visible world bounds ──────────────────────────────────
  // Calculate the world-space rectangle currently visible on screen.
  const worldLeft   = offsetX;
  const worldTop    = offsetY;
  const worldRight  = offsetX + canvasWidthCSS  / scale;
  const worldBottom = offsetY + canvasHeightCSS / scale;

  // First grid line to the top-left of the visible area
  const startX = Math.floor(worldLeft  / GRID_SPACING) * GRID_SPACING;
  const startY = Math.floor(worldTop   / GRID_SPACING) * GRID_SPACING;

  // Inline world→screen helpers (no ctx transform needed)
  const wx2sx = (wx: number): number => (wx - offsetX) * scale;
  const wy2sy = (wy: number): number => (wy - offsetY) * scale;

  // ── Square grid ───────────────────────────────────────────
  if (gridMode === 'squares') {
    ctx.save();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1;

    ctx.beginPath();

    // Vertical lines
    for (
      let wx = startX;
      wx <= worldRight + GRID_SPACING;
      wx += GRID_SPACING
    ) {
      const sx = wx2sx(wx);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvasHeightCSS);
    }

    // Horizontal lines
    for (
      let wy = startY;
      wy <= worldBottom + GRID_SPACING;
      wy += GRID_SPACING
    ) {
      const sy = wy2sy(wy);
      ctx.moveTo(0, sy);
      ctx.lineTo(canvasWidthCSS, sy);
    }

    ctx.stroke();
    ctx.restore();
  }

  // ── Dot grid ──────────────────────────────────────────────
  else if (gridMode === 'dots') {
    // Dot radius scales gently with zoom so dots are always visible
    // but never become so large they obscure writing.
    const dotRadius = Math.min(3.5, Math.max(1, scale * 2.5));

    ctx.save();
    ctx.fillStyle = dotColor;

    for (
      let wx = startX;
      wx <= worldRight + GRID_SPACING;
      wx += GRID_SPACING
    ) {
      const sx = wx2sx(wx);
      // Quick horizontal cull
      if (sx < -dotRadius || sx > canvasWidthCSS + dotRadius) continue;

      for (
        let wy = startY;
        wy <= worldBottom + GRID_SPACING;
        wy += GRID_SPACING
      ) {
        const sy = wy2sy(wy);
        // Quick vertical cull
        if (sy < -dotRadius || sy > canvasHeightCSS + dotRadius) continue;

        ctx.beginPath();
        ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Determine whether a hex colour is perceptually "dark".
 * Used to pick a contrasting grid colour.
 *
 * Formula: perceived luminance (ITU-R BT.601)
 *   L = 0.299R + 0.587G + 0.114B
 * Colours with L < 128 are considered dark.
 */
function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true; // Default to dark for invalid colours

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}
