/**
 * BlackboardCanvas — The core drawing surface component.
 *
 * ══════════════════════════════════════════════════════════
 * Canvas Layering (bottom → top)
 * ══════════════════════════════════════════════════════════
 *
 *   [0] bgCanvas     — Background colour fill + infinite grid
 *   [1] strokeCanvas — All committed (finalised) strokes
 *   [2] activeCanvas — The CanvasElement currently being drawn
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
import type { CanvasElement, Point, ViewportState, AppSettings, ElementType } from '../types';
import { CanvasEngine } from '../engine/CanvasEngine';
import { applyEraser } from '../engine/HitTest';
import { hitTestElement } from '../engine/Geometry';
import { usePointerInput } from '../hooks/usePointerInput';
import { nanoid } from '../utils/nanoid';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface BlackboardCanvasProps {
  settings: AppSettings;
  strokes: CanvasElement[];
  viewport: ViewportState;
  /** Called when a complete CanvasElement gesture ends (pen lifts) */
  onStrokeCommit: (CanvasElement: CanvasElement) => void;
  /**
   * Called while erasing with the updated CanvasElement list.
   * @param newStrokes   - CanvasElement list after applying current eraser position
   * @param saveHistory  - True only on pointerup (final erase commit)
   */
  onErase: (newStrokes: CanvasElement[], saveHistory: boolean) => void;
  /** Called when a selected element is moved or resized */
  onElementUpdate: (element: CanvasElement) => void;
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
  onElementUpdate,
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
  // Points of the CanvasElement currently being drawn.
  // Stored as a ref (not state) — it updates at pointer-event frequency
  // (~60–120 Hz) and we don't want React re-renders for every sample.
  const activePointsRef = useRef<Point[]>([]);

  // ── Erase state ───────────────────────────────────────────
  // The strokes snapshot taken before the erase gesture began.
  // Used to generate a single undo entry for the whole gesture.
  const preEraseStrokesRef = useRef<CanvasElement[] | null>(null);
  // The "live" CanvasElement list during erasing (updated without pushing to history)
  const liveErasedStrokesRef = useRef<CanvasElement[]>(strokes);

  // Keep live erased strokes in sync when not erasing
  useEffect(() => {
    liveErasedStrokesRef.current = strokes;
  }, [strokes]);

  // Always-current strokes ref so callbacks can read latest without stale closures
  const strokesRef = useRef(strokes);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

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
    const CanvasElement = strokeCanvasRef.current;
    const active = activeCanvasRef.current;
    if (!bg || !CanvasElement || !active || !uiCanvas || !containerRef.current) return;

    // Instantiate the engine
    const engine = new CanvasEngine(bg, CanvasElement, active, uiCanvas);
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

  const [selectedElementId, setSelectedElementIdState] = useState<string | null>(null);
  const selectedElementIdRef = useRef<string | null>(null);
  const setSelectedElementId = useCallback((id: string | null) => {
    selectedElementIdRef.current = id;
    setSelectedElementIdState(id);
  }, []);

  // ─────────────────────────────────────────────
  // Re-render when CanvasElement list or viewport changes
  // ─────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.renderStrokes(strokes, viewport, selectedElementId);
  }, [strokes, viewport, selectedElementId]);

  // ─────────────────────────────────────────────
  // Initialisation & Resize
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // Select / Drag / Resize interaction
  // ─────────────────────────────────────────────

  type HandleName = 'tl'|'tm'|'tr'|'ml'|'mr'|'bl'|'bm'|'br'|'move'|null;
  type SelectInteraction = {
    elementId: string;
    handle: HandleName;
    // Original element geometry at pointer-down
    origX: number; origY: number; origW: number; origH: number;
    // Pointer position at pointer-down (world coords)
    startX: number; startY: number;
  };
  const selectRef = useRef<SelectInteraction | null>(null);

  const HANDLE_PADDING = 8;
  const HANDLE_SIZE = 8;

  /** Returns which resize handle (if any) the pointer hit, or 'move' if inside element */
  function getHandle(px: number, py: number, el: CanvasElement): HandleName {
    const nx = Math.min(el.x, el.x + el.width);
    const ny = Math.min(el.y, el.y + el.height);
    const nw = Math.abs(el.width);
    const nh = Math.abs(el.height);
    const bx = nx - HANDLE_PADDING;
    const by = ny - HANDLE_PADDING;
    const bw = nw + HANDLE_PADDING * 2;
    const bh = nh + HANDLE_PADDING * 2;
    const hs = HANDLE_SIZE / 2 + 4; // slightly larger hit area

    const handles: Array<[HandleName, number, number]> = [
      ['tl', bx,       by      ],
      ['tm', bx+bw/2,  by      ],
      ['tr', bx+bw,    by      ],
      ['ml', bx,       by+bh/2 ],
      ['mr', bx+bw,    by+bh/2 ],
      ['bl', bx,       by+bh   ],
      ['bm', bx+bw/2,  by+bh   ],
      ['br', bx+bw,    by+bh   ],
    ];

    for (const [name, hx, hy] of handles) {
      if (Math.abs(px - hx) <= hs && Math.abs(py - hy) <= hs) return name;
    }

    // Inside bounding box = move
    if (px >= bx && px <= bx+bw && py >= by && py <= by+bh) return 'move';
    return null;
  }

  /** Apply a handle drag to produce a new element geometry */
  function applyHandleDrag(
    handle: HandleName,
    orig: { x: number; y: number; width: number; height: number },
    dx: number,
    dy: number
  ): { x: number; y: number; width: number; height: number } {
    let { x, y, width, height } = orig;
    if (handle === 'move') { return { x: x + dx, y: y + dy, width, height }; }
    if (handle === 'tl')   { return { x: x+dx, y: y+dy, width: width-dx, height: height-dy }; }
    if (handle === 'tm')   { return { x, y: y+dy, width, height: height-dy }; }
    if (handle === 'tr')   { return { x, y: y+dy, width: width+dx, height: height-dy }; }
    if (handle === 'ml')   { return { x: x+dx, y, width: width-dx, height }; }
    if (handle === 'mr')   { return { x, y, width: width+dx, height }; }
    if (handle === 'bl')   { return { x: x+dx, y, width: width-dx, height: height+dy }; }
    if (handle === 'bm')   { return { x, y, width, height: height+dy }; }
    if (handle === 'br')   { return { x, y, width: width+dx, height: height+dy }; }
    return { x, y, width, height };
  }

  const handleStrokeStart = useCallback((point: Point) => {
    const tool = settingsRef.current.tool;
    if (tool === 'select') {
      const currentStrokes = strokesRef.current;
      const selId = selectedElementIdRef.current;

      // If something already selected, first check if we hit a handle
      if (selId) {
        const selEl = currentStrokes.find(e => e.id === selId && !e.isDeleted);
        if (selEl) {
          const handle = getHandle(point.x, point.y, selEl);
          if (handle) {
            selectRef.current = {
              elementId: selId,
              handle,
              origX: selEl.x, origY: selEl.y,
              origW: selEl.width, origH: selEl.height,
              startX: point.x, startY: point.y,
            };
            engineRef.current?.renderStrokes(strokesRef.current, viewportRef.current, selId, selId);
            return;
          }
        }
      }

      // No handle hit — try to select a new element
      let hitId: string | null = null;
      for (let i = currentStrokes.length - 1; i >= 0; i--) {
        if (!currentStrokes[i].isDeleted && hitTestElement(point.x, point.y, currentStrokes[i])) {
          hitId = currentStrokes[i].id;
          break;
        }
      }

      setSelectedElementId(hitId);
      if (hitId) {
        const el = currentStrokes.find(e => e.id === hitId)!;
        selectRef.current = {
          elementId: hitId,
          handle: 'move',
          origX: el.x, origY: el.y,
          origW: el.width, origH: el.height,
          startX: point.x, startY: point.y,
        };
        engineRef.current?.renderStrokes(strokesRef.current, viewportRef.current, hitId, hitId);
      } else {
        selectRef.current = null;
      }
      return;
    }

    activePointsRef.current = [point];
    const type = tool === 'pen' ? 'freedraw' : tool as ElementType;
    
    const activeElement: CanvasElement = {
      id: 'active',
      type: type as any,
      points: [point],
      strokeColor: settingsRef.current.penColor,
      strokeWidth: settingsRef.current.penWidth,
      x: tool === 'pen' ? 0 : point.x,
      y: tool === 'pen' ? 0 : point.y,
      width: 0,
      height: 0
    };
    engineRef.current?.renderActiveStroke(activeElement, viewportRef.current);
  }, []);

  const handleStrokePoint = useCallback((point: Point) => {
    const tool = settingsRef.current.tool;
    if (tool === 'select') {
      const si = selectRef.current;
      if (!si) return;
      const dx = point.x - si.startX;
      const dy = point.y - si.startY;
      const newGeom = applyHandleDrag(si.handle, { x: si.origX, y: si.origY, width: si.origW, height: si.origH }, dx, dy);

      // Find the original element and apply new geometry for preview
      const el = strokesRef.current.find(e => e.id === si.elementId);
      if (el) {
        const preview: CanvasElement = { ...el, ...newGeom } as CanvasElement;
        // Render preview on the active (top) layer so it looks separate from committed
        engineRef.current?.renderActiveStroke(preview, viewportRef.current);
      }
      return;
    }
    
    activePointsRef.current.push(point);
    const type = tool === 'pen' ? 'freedraw' : tool as ElementType;
    const startPoint = activePointsRef.current[0];
    
    const activeElement: CanvasElement = {
      id: 'active',
      type: type as any,
      points: activePointsRef.current,
      strokeColor: settingsRef.current.penColor,
      strokeWidth: settingsRef.current.penWidth,
      x: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : startPoint.x) : Math.min(startPoint.x, point.x),
      y: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : startPoint.y) : Math.min(startPoint.y, point.y),
      width: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : point.x - startPoint.x) : Math.abs(point.x - startPoint.x),
      height: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : point.y - startPoint.y) : Math.abs(point.y - startPoint.y)
    };
    engineRef.current?.renderActiveStroke(activeElement, viewportRef.current);
  }, []);

  const onElementUpdateRef = useRef(onElementUpdate);
  useEffect(() => { onElementUpdateRef.current = onElementUpdate; }, [onElementUpdate]);

  const handleStrokeEnd = useCallback((lastPoint?: Point) => {
    const tool = settingsRef.current.tool;
    if (tool === 'select') {
      engineRef.current?.clearActiveStroke();
      const si = selectRef.current;
      if (si && lastPoint) {
        const dx = lastPoint.x - si.startX;
        const dy = lastPoint.y - si.startY;
        // Only commit if actually moved/resized
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          const newGeom = applyHandleDrag(si.handle, { x: si.origX, y: si.origY, width: si.origW, height: si.origH }, dx, dy);
          const el = strokesRef.current.find(e => e.id === si.elementId);
          if (el) {
            onElementUpdateRef.current({ ...el, ...newGeom } as CanvasElement);
          }
        }
      }
      selectRef.current = null;
      engineRef.current?.renderStrokes(strokesRef.current, viewportRef.current, selectedElementIdRef.current, null);
      return;
    }

    const pts = activePointsRef.current;
    if (pts.length > 0) {
      const type = tool === 'pen' ? 'freedraw' : tool as ElementType;
      const startPoint = pts[0];
      const endPoint = pts[pts.length - 1];
      
      const newStroke: CanvasElement = {
        id:     nanoid(),
        type: type as any,
        points: pts,
        strokeColor: settingsRef.current.penColor,
        strokeWidth: settingsRef.current.penWidth,
        x: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : startPoint.x) : Math.min(startPoint.x, endPoint.x),
        y: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : startPoint.y) : Math.min(startPoint.y, endPoint.y),
        width: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : endPoint.x - startPoint.x) : Math.abs(endPoint.x - startPoint.x),
        height: (tool === 'pen' || tool === 'line' || tool === 'arrow') ? (tool === 'pen' ? 0 : endPoint.y - startPoint.y) : Math.abs(endPoint.y - startPoint.y)
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

      {/* Layer 2 — Active CanvasElement being drawn right now */}
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
