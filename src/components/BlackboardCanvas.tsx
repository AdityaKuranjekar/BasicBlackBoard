/**
 * BlackboardCanvas — The core drawing surface component.
 *
 * ══════════════════════════════════════════════════════════
 * Canvas Layering (bottom → top)
 * ══════════════════════════════════════════════════════════
 *
 *   [0] bgCanvas     — Background colour fill + infinite grid
 *   [1] strokeCanvas — All committed (finalised) strokes
 *   [2] activeCanvas — The stroke currently being drawn
 *   [3] uiCanvas     — Eraser cursor; receives all pointer events
 *
 * All four canvases are 100% width/height, position:absolute,
 * stacked via z-index. Only the top (uiCanvas) receives pointer
 * events; the others have pointer-events:none.
 *
 * ══════════════════════════════════════════════════════════
 * Rendering Triggers
 * ══════════════════════════════════════════════════════════
 *
 *   Background rerenders when: backgroundColor, gridMode, or viewport changes
 *   Strokes rerenders when:    strokes[] or viewport changes
 *   Active rerenders when:     pointer moves during drawing (every ~16ms)
 *   UI rerenders when:         pointer moves over canvas (eraser cursor)
 *
 * ══════════════════════════════════════════════════════════
 * Erase History
 * ══════════════════════════════════════════════════════════
 *
 * Erasing is a continuous gesture (pointerdown → many pointermoves →
 * pointerup). We want ONE undo entry for the whole gesture. So:
 *   • onEraseStart: saves a "before-erase" snapshot ref
 *   • onErase:      applies the eraser in real-time (immediate visual feedback)
 *   • onEraseEnd:   calls setStrokes(current, saveToHistory=true)
 *
 * The parent (App) tracks whether the erase-history-snapshot was taken.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Stroke, Point, ViewportState, AppSettings } from '../types';
import { CanvasEngine } from '../engine/CanvasEngine';
import { applyEraser } from '../engine/HitTest';
import { usePointerInput } from '../hooks/usePointerInput';
import { nanoid } from '../utils/nanoid';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface BlackboardCanvasProps {
  settings: AppSettings;
  strokes: Stroke[];
  viewport: ViewportState;
  /** Called when a complete stroke gesture ends (pen lifts) */
  onStrokeCommit: (stroke: Stroke) => void;
  /**
   * Called while erasing with the updated stroke list.
   * @param newStrokes   - Stroke list after applying current eraser position
   * @param saveHistory  - True only on pointerup (final erase commit)
   */
  onErase: (newStrokes: Stroke[], saveHistory: boolean) => void;
  /** Called when the viewport changes due to pan or pinch gesture */
  onViewportChange: (vp: ViewportState) => void;
  /** Called when a two-finger swipe left is detected */
  onSwipeLeft?: () => void;
  /** Called when a two-finger swipe right is detected */
  onSwipeRight?: () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export const BlackboardCanvas = React.memo(function BlackboardCanvas({
  settings,
  strokes,
  viewport,
  onStrokeCommit,
  onErase,
  onViewportChange,
  onSwipeLeft,
  onSwipeRight,
}: BlackboardCanvasProps) {
  // ── Canvas element refs ────────────────────────────────────
  const bgCanvasRef     = useRef<HTMLCanvasElement>(null);
  const strokeCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);

  // The UI canvas is state-based so usePointerInput gets a reactive value
  // (React refs don't trigger effect re-runs when .current changes).
  const [uiCanvas, setUiCanvas] = useState<HTMLCanvasElement | null>(null);

  // Container div for ResizeObserver
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Engine instance (imperative rendering API) ─────────────
  const engineRef = useRef<CanvasEngine | null>(null);

  // ── Local drawing state ────────────────────────────────────
  // Points of the stroke currently being drawn.
  // Stored as a ref (not state) — it updates at pointer-event frequency
  // (~60–120 Hz) and we don't want React re-renders for every sample.
  const activePointsRef = useRef<Point[]>([]);

  // ── Erase state ───────────────────────────────────────────
  // The strokes snapshot taken before the erase gesture began.
  // Used to generate a single undo entry for the whole gesture.
  const preEraseStrokesRef = useRef<Stroke[] | null>(null);
  // The "live" stroke list during erasing (updated without pushing to history)
  const liveErasedStrokesRef = useRef<Stroke[]>(strokes);

  // Keep live erased strokes in sync when not erasing
  useEffect(() => {
    liveErasedStrokesRef.current = strokes;
  }, [strokes]);

  // ── Keep viewport/settings refs for render callbacks ──────
  const viewportRef  = useRef(viewport);
  const settingsRef  = useRef(settings);
  useEffect(() => { viewportRef.current  = viewport;  }, [viewport]);
  useEffect(() => { settingsRef.current  = settings;  }, [settings]);

  // ─────────────────────────────────────────────
  // Engine Initialisation (runs once after mount)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const bg     = bgCanvasRef.current;
    const stroke = strokeCanvasRef.current;
    const active = activeCanvasRef.current;
    if (!bg || !stroke || !active || !uiCanvas || !containerRef.current) return;

    // Instantiate the engine
    const engine = new CanvasEngine(bg, stroke, active, uiCanvas);
    engineRef.current = engine;

    // Initial size
    const rect = containerRef.current.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    engine.resize(rect.width, rect.height, dpr);

    // Initial render
    engine.renderBackground(
      settingsRef.current.backgroundColor,
      settingsRef.current.gridMode,
      viewportRef.current
    );
    engine.renderStrokes(liveErasedStrokesRef.current, viewportRef.current);
  }, [uiCanvas]); // Re-init if uiCanvas mounts

  // ─────────────────────────────────────────────
  // ResizeObserver — keep canvases sized to container
  // ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      const engine = engineRef.current;
      if (!engine) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        engine.resize(width, height, dpr);
        // Full re-render after resize
        engine.renderBackground(
          settingsRef.current.backgroundColor,
          settingsRef.current.gridMode,
          viewportRef.current
        );
        engine.renderStrokes(liveErasedStrokesRef.current, viewportRef.current);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ─────────────────────────────────────────────
  // Re-render when background settings change
  // ─────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.renderBackground(
      settings.backgroundColor,
      settings.gridMode,
      viewport
    );
  }, [settings.backgroundColor, settings.gridMode, viewport]);

  // ─────────────────────────────────────────────
  // Re-render when stroke list or viewport changes
  // ─────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.renderStrokes(strokes, viewport);
  }, [strokes, viewport]);

  // ─────────────────────────────────────────────
  // Pointer Input Handlers
  // ─────────────────────────────────────────────

  const handleStrokeStart = useCallback((point: Point) => {
    activePointsRef.current = [point];
    engineRef.current?.renderActiveStroke(
      [point],
      settingsRef.current.penColor,
      settingsRef.current.penWidth,
      viewportRef.current
    );
  }, []);

  const handleStrokePoint = useCallback((point: Point) => {
    activePointsRef.current.push(point);
    engineRef.current?.renderActiveStroke(
      activePointsRef.current,
      settingsRef.current.penColor,
      settingsRef.current.penWidth,
      viewportRef.current
    );
  }, []);

  const handleStrokeEnd = useCallback(() => {
    const pts = activePointsRef.current;
    if (pts.length > 0) {
      const newStroke: Stroke = {
        id:     nanoid(),
        points: pts,
        color:  settingsRef.current.penColor,
        width:  settingsRef.current.penWidth,
        tool:   'pen',
      };
      onStrokeCommit(newStroke);
    }
    activePointsRef.current = [];
    engineRef.current?.clearActiveStroke();
  }, [onStrokeCommit]);

  const handleEraseStart = useCallback(() => {
    // Take snapshot for single-undo-entry semantics
    preEraseStrokesRef.current = liveErasedStrokesRef.current;
  }, []);

  const handleErase = useCallback(
    (wx: number, wy: number, worldRadius: number) => {
      const newStrokes = applyEraser(
        liveErasedStrokesRef.current,
        wx,
        wy,
        worldRadius
      );
      liveErasedStrokesRef.current = newStrokes;
      // Update display immediately but don't push history yet
      onErase(newStrokes, false);
    },
    [onErase]
  );

  const handleEraseEnd = useCallback(() => {
    // Commit the erased state as one undoable step
    onErase(liveErasedStrokesRef.current, true);
    preEraseStrokesRef.current = null;
  }, [onErase]);

  const handleEraserMove = useCallback((sx: number, sy: number) => {
    engineRef.current?.renderEraserCursor(
      sx,
      sy,
      settingsRef.current.eraserWidth / 2
    );
  }, []);

  const handleEraserLeave = useCallback(() => {
    engineRef.current?.clearUI();
  }, []);

  // ── Wire up pointer input to the UI canvas ─────────────────
  usePointerInput({
    canvasEl:         uiCanvas,
    tool:             settings.tool,
    penWidth:         settings.penWidth,
    eraserWidth:      settings.eraserWidth,
    penColor:         settings.penColor,
    viewport,
    onStrokeStart:    handleStrokeStart,
    onStrokePoint:    handleStrokePoint,
    onStrokeEnd:      handleStrokeEnd,
    onErase:          handleErase,
    onEraseStart:     handleEraseStart,
    onEraseEnd:       handleEraseEnd,
    onViewportChange,
    onEraserMove:     handleEraserMove,
    onEraserLeave:    handleEraserLeave,
    onSwipeLeft,
    onSwipeRight,
  });

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  const canvasStyle: React.CSSProperties = {
    position:      'absolute',
    top:           0,
    left:          0,
    width:         '100%',
    height:        '100%',
    pointerEvents: 'none', // Only the UI canvas receives events
  };

  return (
    <div
      ref={containerRef}
      style={{
        position:           'fixed',
        inset:              0,
        overflow:           'hidden',
        userSelect:         'none',
        WebkitUserSelect:   'none',
        // Prevent iOS rubber-band scroll on the container
        overscrollBehavior: 'none',
      }}
    >
      {/* Layer 0 — Background (colour + grid) */}
      <canvas ref={bgCanvasRef}     style={{ ...canvasStyle, zIndex: 0 }} />

      {/* Layer 1 — Committed strokes */}
      <canvas ref={strokeCanvasRef} style={{ ...canvasStyle, zIndex: 1 }} />

      {/* Layer 2 — Active stroke being drawn right now */}
      <canvas ref={activeCanvasRef} style={{ ...canvasStyle, zIndex: 2 }} />

      {/* Layer 3 — UI overlay (eraser cursor) + pointer event target */}
      <canvas
        ref={setUiCanvas}
        className={`canvas-tool-${settings.tool}`}
        style={{
          ...canvasStyle,
          zIndex:       3,
          pointerEvents: 'all',     // This layer receives events
          touchAction:  'none',     // Prevent browser from hijacking touches
          cursor:       (settings.tool === 'hand' || settings.tool === 'pen') ? undefined : 'none',
        }}
      />
    </div>
  );
});
