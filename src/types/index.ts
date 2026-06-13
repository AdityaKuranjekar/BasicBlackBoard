/**
 * Core TypeScript types for Infinite Blackboard.
 *
 * Coordinate systems:
 *   - World space  : the abstract, infinite drawing plane (no bounds)
 *   - Screen space : CSS pixel coordinates on the physical display
 *
 * All stroke data is stored in world space. The CanvasEngine applies the
 * viewport transform at render time to convert to screen coordinates.
 */

// ─────────────────────────────────────────────
// Drawing primitives
// ─────────────────────────────────────────────

/** A single sampled point from a drawing gesture */
export interface Point {
  /** X position in world coordinates */
  x: number;
  /** Y position in world coordinates */
  y: number;
  /**
   * Pen pressure in the range [0, 1].
   * Apple Pencil provides true pressure; touch/mouse defaults to 0.5.
   */
  pressure: number;
}

/** A complete drawn stroke (a single lift-free gesture) */
export interface Stroke {
  /** Unique identifier — used for undo/redo tracking */
  id: string;
  /** Ordered sequence of world-space points captured during the gesture */
  points: Point[];
  /** CSS color string, e.g. '#F5F5F0' */
  color: string;
  /** Base stroke width in world pixels (modulated by pressure at render time) */
  width: number;
  /** The tool that created this stroke */
  tool: 'pen';
}

// ─────────────────────────────────────────────
// Tool & Mode enums
// ─────────────────────────────────────────────

/** Active drawing tool */
export type Tool = 'pen' | 'eraser' | 'hand';

/** Background grid overlay type */
export type GridMode = 'none' | 'dots' | 'squares';

// ─────────────────────────────────────────────
// Camera / Viewport
// ─────────────────────────────────────────────

/**
 * Camera transform state for the infinite canvas.
 *
 * Coordinate transform equations:
 *   screenX = (worldX − offsetX) × scale
 *   screenY = (worldY − offsetY) × scale
 *   worldX  = screenX / scale + offsetX
 *   worldY  = screenY / scale + offsetY
 *
 * offsetX/Y represent the world-space coordinates visible at the
 * top-left corner of the screen (pixel 0,0).
 */
export interface ViewportState {
  /** World-space X coordinate at the left edge of the screen */
  offsetX: number;
  /** World-space Y coordinate at the top edge of the screen */
  offsetY: number;
  /** Zoom scale factor (1.0 = 100%, 2.0 = 200%, etc.) */
  scale: number;
}

// ─────────────────────────────────────────────
// Application state
// ─────────────────────────────────────────────

/** All application-wide user settings */
export interface AppSettings {
  tool: Tool;
  penColor: string;
  penWidth: number;
  eraserWidth: number;
  backgroundColor: string;
  gridMode: GridMode;
}

/** Screen-space position and visibility of the eraser cursor overlay */
export interface EraserCursorState {
  /** CSS pixel X of cursor center */
  x: number;
  /** CSS pixel Y of cursor center */
  y: number;
  /** Whether to show the cursor circle */
  visible: boolean;
}
