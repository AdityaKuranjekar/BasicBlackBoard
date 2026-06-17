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

export type ElementType = 'freedraw' | 'rectangle' | 'ellipse' | 'arrow' | 'line';

/** Base properties common to all canvas elements */
export interface CanvasElementBase {
  /** Unique identifier */
  id: string;
  /** The type of element */
  type: ElementType;
  /** Bounding box X coordinate (top-left) in world space */
  x: number;
  /** Bounding box Y coordinate (top-left) in world space */
  y: number;
  /** Bounding box width in world space */
  width: number;
  /** Bounding box height in world space */
  height: number;
  /** Stroke/outline CSS color string */
  strokeColor: string;
  /** Base stroke width in world pixels */
  strokeWidth: number;
  /** Whether the element has been marked as deleted (for sync/undo) */
  isDeleted?: boolean;
}

/** A freehand drawn stroke */
export interface FreedrawElement extends CanvasElementBase {
  type: 'freedraw';
  /** Ordered sequence of points relative to the bounding box (x,y) */
  points: Point[];
}

/** A geometric shape element */
export interface ShapeElement extends CanvasElementBase {
  type: 'rectangle' | 'ellipse' | 'arrow' | 'line';
  /** Optional fill color (transparent if not provided) */
  fillColor?: string;
}

/** Any renderable element on the canvas */
export type CanvasElement = FreedrawElement | ShapeElement;

// ─────────────────────────────────────────────
// Tool & Mode enums
// ─────────────────────────────────────────────

/** Active drawing tool */
export type Tool = 'pen' | 'eraser' | 'hand' | 'select' | 'rectangle' | 'ellipse' | 'arrow' | 'line';

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

/** Represents a single page (infinite canvas) */
export interface PageData {
  id: string;
  past: CanvasElement[][];
  present: CanvasElement[];
  future: CanvasElement[][];
  viewport: ViewportState;
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
