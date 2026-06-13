/**
 * Application-wide constants for Infinite Blackboard.
 *
 * Centralising these makes it easy to tune behaviour without
 * hunting through component code.
 */

import type { AppSettings, ViewportState } from '../types';

// ─────────────────────────────────────────────
// History limits
// ─────────────────────────────────────────────

/**
 * Maximum undo steps kept in memory.
 *
 * After 3 hours of teaching a class, a teacher may accumulate
 * thousands of strokes. Keeping an unlimited history wastes memory
 * because old undo steps are never needed. 500 strokes is well
 * beyond any realistic "I need to undo 10 steps" scenario.
 */
export const MAX_HISTORY_STEPS = 500;

// ─────────────────────────────────────────────
// Colour palette
// ─────────────────────────────────────────────

/**
 * Chalk-style preset colour swatches.
 * Slightly warm/muted to look natural on the dark blackboard background.
 */
export const CHALK_COLORS = [
  '#F5F5F0', // chalk white  (default)
  '#FFE066', // soft yellow
  '#80CFFF', // sky blue
  '#80F0A0', // mint green
  '#FF9E9E', // salmon pink
  '#FFB347', // warm orange
  '#C9B1FF', // lavender
  '#80F0E8', // teal
];

/** Background preset colour values */
export const BACKGROUND_PRESETS: Record<string, string> = {
  blackboard: '#1C3A2A',
  whiteboard: '#F8F8F6',
  midnight:   '#0F1117',
};

// ─────────────────────────────────────────────
// Grid
// ─────────────────────────────────────────────

/** Spacing between grid lines/dots in world-space pixels at scale 1.0 */
export const GRID_SPACING = 50;

// ─────────────────────────────────────────────
// Viewport / Camera
// ─────────────────────────────────────────────

/** Minimum zoom level (10%) */
export const MIN_SCALE = 0.1;

/** Maximum zoom level (1000%) */
export const MAX_SCALE = 10;

/**
 * Origin rebasing threshold in world units.
 *
 * At scale 1, this equals 500,000 virtual pixels — roughly 1,300 metres
 * at 96 DPI. Far more than any teacher would ever pan in a session.
 * Beyond this threshold, we shift all stroke coordinates and reset the
 * camera offset to prevent IEEE 754 floating-point precision loss.
 *
 * See: engine/Viewport.ts → maybeRebaseOrigin()
 */
export const REBASE_THRESHOLD = 500_000;

// ─────────────────────────────────────────────
// Default state
// ─────────────────────────────────────────────

/** Initial application settings on first load */
export const DEFAULT_SETTINGS: AppSettings = {
  tool:            'pen',
  penColor:        '#F5F5F0',   // chalk white
  penWidth:        3,
  eraserWidth:     30,
  backgroundColor: BACKGROUND_PRESETS.blackboard,
  gridMode:        'none',
};

/** Initial camera state — world origin maps to screen top-left */
export const DEFAULT_VIEWPORT: ViewportState = {
  offsetX: 0,
  offsetY: 0,
  scale:   1,
};
