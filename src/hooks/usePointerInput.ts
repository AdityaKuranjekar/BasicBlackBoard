/**
 * usePointerInput — Handles all pointer events for the drawing canvas.
 *
 * ══════════════════════════════════════════════════════════
 * Supported Input Types
 * ══════════════════════════════════════════════════════════
 *
 *   pointerType === 'pen'   → Apple Pencil (or Wacom stylus on desktop)
 *   pointerType === 'touch' → Finger touch (pan / pinch gestures only)
 *   pointerType === 'mouse' → Mouse (for desktop development/testing)
 *
 * ══════════════════════════════════════════════════════════
 * Palm Rejection — State-Based Lock (not timer-based)
 * ══════════════════════════════════════════════════════════
 *
 * The naive approach is a timer: "if pen was active within 500ms,
 * ignore touch." This fails because:
 *   • A teacher resting their palm before picking up the pencil triggers it
 *   • The 500ms window is arbitrary and wrong at the edges
 *
 * Our approach (used by GoodNotes and Notability):
 *
 *   penLocked = true  when ANY pen pointer is in the DOWN state
 *   penLocked = false when ALL pen pointers are in the UP state
 *
 *   While penLocked:
 *     • ALL touch events are completely ignored (palm rejection)
 *     • Touch can only resume after the pen is fully lifted
 *
 * This is reliable because the OS reports pen and touch as separate
 * pointer streams. The pen is always down before the palm contacts
 * the screen — so penLocked engages before any palm touches arrive.
 *
 * ══════════════════════════════════════════════════════════
 * Gesture Handling
 * ══════════════════════════════════════════════════════════
 *
 *   1 touch  → pan (translate viewport)
 *   2 touches → pinch-zoom + pan simultaneously
 *   pen/mouse → draw or erase (based on active tool)
 *
 * ══════════════════════════════════════════════════════════
 * Why PointerEvents instead of TouchEvents?
 * ══════════════════════════════════════════════════════════
 *
 *   • PointerEvents unify mouse, touch, and pen into one API
 *   • e.pressure gives Apple Pencil pressure (0–1)
 *   • e.pointerType lets us distinguish pen from finger
 *   • setPointerCapture() keeps events flowing even if the finger
 *     leaves the element (prevents gesture drops)
 *   • Supported in all modern browsers including Safari 13.1+
 */

import { useEffect, useRef } from 'react';
import type { Point, ViewportState, Tool } from '../types';
import { screenToWorld, panViewport, zoomViewport } from '../engine/Viewport';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface UsePointerInputOptions {
  /** The topmost canvas element that receives pointer events (the UI canvas) */
  canvasEl: HTMLCanvasElement | null;
  /** Active tool selected by the user */
  tool: Tool;
  /** Base pen stroke width in world pixels */
  penWidth: number;
  /** Eraser diameter in screen-space CSS pixels */
  eraserWidth: number;
  /** Current pen colour */
  penColor: string;
  /** Current camera state (needs to be fresh on every event) */
  viewport: ViewportState;
  /** Called when a new stroke begins (pen/mouse down) */
  onStrokeStart: (point: Point) => void;
  /** Called for each subsequent point in the stroke (pen/mouse move) */
  onStrokePoint: (point: Point) => void;
  /** Called when the stroke ends (pen/mouse up or cancel). Receives the last world point if available. */
  onStrokeEnd: (lastPoint?: Point) => void;
  /**
   * Called while the eraser is moving.
   * @param worldX      - Eraser centre X in world coordinates
   * @param worldY      - Eraser centre Y in world coordinates
   * @param worldRadius - Eraser radius in world coordinates
   */
  onErase: (worldX: number, worldY: number, worldRadius: number) => void;
  /** Called when the eraser gesture starts (for history snapshot) */
  onEraseStart: () => void;
  /** Called when the eraser gesture ends (to commit one undo entry) */
  onEraseEnd: () => void;
  /** Called when the viewport should change (pan or zoom) */
  onViewportChange: (newViewport: ViewportState) => void;
  /** Called when the eraser cursor should move (screen coordinates) */
  onEraserMove: (screenX: number, screenY: number) => void;
  /** Called when the pointer leaves the canvas */
  onEraserLeave: () => void;
  /** Called when a two-finger swipe left is detected */
  onSwipeLeft?: () => void;
  /** Called when a two-finger swipe right is detected */
  onSwipeRight?: () => void;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function usePointerInput({
  canvasEl,
  tool,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  penWidth: _penWidth,
  eraserWidth,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  penColor: _penColor,
  viewport,
  onStrokeStart,
  onStrokePoint,
  onStrokeEnd,
  onErase,
  onEraseStart,
  onEraseEnd,
  onViewportChange,
  onEraserMove,
  onEraserLeave,
  onSwipeLeft,
  onSwipeRight,
}: UsePointerInputOptions): void {
  // ── Refs for values that event handlers need to read ─────
  // We use refs (not state) so event handlers always see the latest
  // value without needing to be re-registered on every render.

  /** True while any pen pointer is in the down state */
  const penLockedRef    = useRef(false);
  /** True while actively drawing (pen down in pen mode) */
  const isDrawingRef    = useRef(false);
  /** True while actively erasing (pen/mouse down in eraser mode) */
  const isErasingRef    = useRef(false);

  /** Always-fresh viewport reference for event handlers */
  const viewportRef     = useRef(viewport);
  const toolRef         = useRef(tool);
  const eraserWidthRef  = useRef(eraserWidth);

  // Keep refs in sync with latest prop values
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { eraserWidthRef.current = eraserWidth; }, [eraserWidth]);

  /**
   * Active touch map: pointerId → last screen position.
   * Used to compute pan and pinch deltas between events.
   */
  const activeTouchesRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  /** Tracks two-finger swipe state */
  const swipeDataRef = useRef({
    startX: 0,
    startY: 0,
    active: false,
    swiped: false,
  });

  /** Double tap state */
  const lastTouchDownRef = useRef<{time: number, x: number, y: number} | null>(null);

  // ── Callback refs — stable references for event listeners ─
  // We store callbacks in refs so we never need to remove/re-add
  // event listeners when the parent component re-renders.
  const onStrokeStartRef    = useRef(onStrokeStart);
  const onStrokePointRef    = useRef(onStrokePoint);
  const onStrokeEndRef      = useRef(onStrokeEnd);
  const onEraseRef          = useRef(onErase);
  const onEraseStartRef     = useRef(onEraseStart);
  const onEraseEndRef       = useRef(onEraseEnd);
  const onViewportChangeRef = useRef(onViewportChange);
  const onEraserMoveRef     = useRef(onEraserMove);
  const onEraserLeaveRef    = useRef(onEraserLeave);
  const onSwipeLeftRef      = useRef(onSwipeLeft);
  const onSwipeRightRef     = useRef(onSwipeRight);

  useEffect(() => { onStrokeStartRef.current    = onStrokeStart;    }, [onStrokeStart]);
  useEffect(() => { onStrokePointRef.current    = onStrokePoint;    }, [onStrokePoint]);
  useEffect(() => { onStrokeEndRef.current      = onStrokeEnd;      }, [onStrokeEnd]);
  useEffect(() => { onEraseRef.current          = onErase;          }, [onErase]);
  useEffect(() => { onEraseStartRef.current     = onEraseStart;     }, [onEraseStart]);
  useEffect(() => { onEraseEndRef.current       = onEraseEnd;       }, [onEraseEnd]);
  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { onEraserMoveRef.current     = onEraserMove;     }, [onEraserMove]);
  useEffect(() => { onEraserLeaveRef.current    = onEraserLeave;    }, [onEraserLeave]);
  useEffect(() => { onSwipeLeftRef.current      = onSwipeLeft;      }, [onSwipeLeft]);
  useEffect(() => { onSwipeRightRef.current     = onSwipeRight;     }, [onSwipeRight]);

  // Track the most recent world-space point so onStrokeEnd can receive it
  const lastWorldPointRef = useRef<Point | null>(null);

  // ── Main effect — register event listeners ────────────────
  useEffect(() => {
    if (!canvasEl) return;
    // Assign to a const so TypeScript's control-flow narrowing applies
    // inside all nested event-handler functions.
    const el = canvasEl;

    // ──────────────────────────────────────────────────────────
    // Helper: convert PointerEvent screen position → world Point
    // ──────────────────────────────────────────────────────────
    function eventToWorldPoint(e: PointerEvent): Point {
      const rect = canvasEl!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = screenToWorld(sx, sy, viewportRef.current);
      return {
        x,
        y,
        // Apple Pencil provides real pressure; mouse/touch report 0 or undefined
        // We fall back to 0.5 (medium) for non-pressure-sensitive input.
        pressure: e.pressure > 0 ? e.pressure : 0.5,
      };
    }

    // ──────────────────────────────────────────────────────────
    // pointerdown
    // ──────────────────────────────────────────────────────────
    function handlePointerDown(e: PointerEvent): void {
      // Prevent iOS/iPadOS from stealing the event for scroll/zoom
      e.preventDefault();
      e.stopPropagation();

      const isPen   = e.pointerType === 'pen';
      const isTouch = e.pointerType === 'touch';
      const isMouse = e.pointerType === 'mouse';

      // ── Pen / Stylus ────────────────────────────────────────
      if (isPen) {
        /**
         * PALM REJECTION: Engage the pen lock.
         * From this moment until the pen lifts, ALL touch events are
         * ignored. The OS reports pen events before any palm contacts,
         * so the lock is always in place before palm touches arrive.
         */
        penLockedRef.current = true;

        // Cancel any in-flight touch gestures (safety measure)
        activeTouchesRef.current.clear();

        // Capture the pointer so we keep receiving events even if the
        // pen moves outside the canvas element boundary.
        el.setPointerCapture(e.pointerId);

        const isDrawingTool = ['pen', 'rectangle', 'ellipse', 'arrow', 'line', 'select'].includes(toolRef.current);
        if (isDrawingTool) {
          isDrawingRef.current = true;
          onStrokeStartRef.current(eventToWorldPoint(e));
        } else if (toolRef.current === 'eraser') {
          isErasingRef.current = true;
          onEraseStartRef.current(); // Save history snapshot before first erase
          const pt = eventToWorldPoint(e);
          const r  = eraserWidthRef.current / 2 / viewportRef.current.scale;
          onEraseRef.current(pt.x, pt.y, r);
          const rect2 = el.getBoundingClientRect();
          onEraserMoveRef.current(e.clientX - rect2.left, e.clientY - rect2.top);
        } else if (toolRef.current === 'hand') {
          activeTouchesRef.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
          });
        }
      }

      // ── Touch ───────────────────────────────────────────────
      else if (isTouch) {
        /**
         * PALM REJECTION: Ignore ALL touch input while the pen is down.
         * This is the core of the state-based palm rejection strategy.
         */
        if (penLockedRef.current) return;

        // Double tap detection for page navigation
        const now = Date.now();
        const last = lastTouchDownRef.current;
        if (last && (now - last.time) < 300) {
          const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
          if (dist < 30) {
            const width = window.innerWidth;
            if (e.clientX < width * 0.25) {
              if (onSwipeRightRef.current) onSwipeRightRef.current(); // Prev Page
            } else if (e.clientX > width * 0.75) {
              if (onSwipeLeftRef.current) onSwipeLeftRef.current(); // Next Page
            }
            lastTouchDownRef.current = null;
            return; // Prevent further touch processing for this double tap
          }
        }
        lastTouchDownRef.current = { time: now, x: e.clientX, y: e.clientY };

        activeTouchesRef.current.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
        });
        el.setPointerCapture(e.pointerId);

        if (activeTouchesRef.current.size === 2) {
          if (isDrawingRef.current) {
            isDrawingRef.current = false;
            onStrokeEndRef.current(lastWorldPointRef.current ?? undefined);
          }
          if (isErasingRef.current) {
            isErasingRef.current = false;
            onEraseEndRef.current();
          }

          const [t1, t2] = Array.from(activeTouchesRef.current.values());
          swipeDataRef.current = {
            startX: (t1.x + t2.x) / 2,
            startY: (t1.y + t2.y) / 2,
            active: true,
            swiped: false,
          };
        } else if (activeTouchesRef.current.size === 1) {
          // Only hand tool is allowed for touch now
          // A single finger always behaves like the hand tool (panning)
          activeTouchesRef.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
          });
        }
      }

      // ── Mouse (desktop fallback) ────────────────────────────
      else if (isMouse) {
        el.setPointerCapture(e.pointerId);

        const isDrawingTool = ['pen', 'rectangle', 'ellipse', 'arrow', 'line', 'select'].includes(toolRef.current);
        if (isDrawingTool) {
          isDrawingRef.current = true;
          onStrokeStartRef.current(eventToWorldPoint(e));
        } else if (toolRef.current === 'eraser') {
          isErasingRef.current = true;
          onEraseStartRef.current();
          const pt = eventToWorldPoint(e);
          const r  = eraserWidthRef.current / 2 / viewportRef.current.scale;
          onEraseRef.current(pt.x, pt.y, r);
        } else if (toolRef.current === 'hand') {
          activeTouchesRef.current.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
          });
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // pointermove
    // ──────────────────────────────────────────────────────────
    function handlePointerMove(e: PointerEvent): void {
      e.preventDefault();

      const isPen   = e.pointerType === 'pen';
      const isTouch = e.pointerType === 'touch';
      const isMouse = e.pointerType === 'mouse';

      // ── Pen / Mouse ─────────────────────────────────────────
      if (isPen || isMouse) {
        const rect = el.getBoundingClientRect();
        const sx   = e.clientX - rect.left;
        const sy   = e.clientY - rect.top;

        if (isDrawingRef.current) {
          const wp = eventToWorldPoint(e);
          lastWorldPointRef.current = wp;
          onStrokePointRef.current(wp);
        } else if (isErasingRef.current) {
          const pt = eventToWorldPoint(e);
          const r  = eraserWidthRef.current / 2 / viewportRef.current.scale;
          onEraseRef.current(pt.x, pt.y, r);
          onEraserMoveRef.current(sx, sy);
        } else if (toolRef.current === 'eraser') {
          // Hover preview (not yet erasing — just show cursor)
          onEraserMoveRef.current(sx, sy);
        } else if (toolRef.current === 'hand' && activeTouchesRef.current.has(e.pointerId)) {
          // Pan viewport
          const prevPos = activeTouchesRef.current.get(e.pointerId)!;
          const dx = e.clientX - prevPos.x;
          const dy = e.clientY - prevPos.y;
          const newVP = panViewport(viewportRef.current, dx, dy);
          onViewportChangeRef.current(newVP);
          activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
      }

      // ── Touch (pan / pinch) ─────────────────────────────────
      else if (isTouch) {
        if (penLockedRef.current) return; // Palm rejection active

        const touches = activeTouchesRef.current;
        if (!touches.has(e.pointerId)) return; // Unknown touch

        const prevPos = touches.get(e.pointerId)!;

        if (touches.size === 1) {
          // ── Single finger → pan ──────────────────────────────
          // Single finger touch always pans
          const dx = e.clientX - prevPos.x;
          const dy = e.clientY - prevPos.y;
          const newVP = panViewport(viewportRef.current, dx, dy);
          onViewportChangeRef.current(newVP);
        } else if (touches.size === 2) {
          // ── Two fingers → pinch-zoom + pan ───────────────────
          // Find the OTHER touch's current (already-updated) position.
          let otherId   = -1;
          let otherPos  = { x: 0, y: 0 };
          for (const [id, pos] of touches) {
            if (id !== e.pointerId) { otherId = id; otherPos = pos; break; }
          }
          if (otherId === -1) {
            touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
            return;
          }

          // Current position of THIS finger
          const currX = e.clientX;
          const currY = e.clientY;

          // Compute distance BEFORE and AFTER this finger moved.
          // "Other" finger position hasn't changed this frame — it's
          // the value from its last pointermove event.
          const prevDist = Math.hypot(prevPos.x - otherPos.x, prevPos.y - otherPos.y);

          if (prevDist > 1) { // Guard against near-zero to avoid division issues
            let newVP = viewportRef.current;

            // Also pan by the midpoint movement
            const prevMidX = (prevPos.x + otherPos.x) / 2;
            const prevMidY = (prevPos.y + otherPos.y) / 2;
            const currMidX = (currX + otherPos.x) / 2;
            const currMidY = (currY + otherPos.y) / 2;
            newVP = panViewport(newVP, currMidX - prevMidX, currMidY - prevMidY);

            onViewportChangeRef.current(newVP);
          }
        }

        // Update the position for this touch point
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    }

    // ──────────────────────────────────────────────────────────
    // pointerup / pointercancel
    // ──────────────────────────────────────────────────────────
    function handlePointerUp(e: PointerEvent): void {
      e.preventDefault();

      const isPen   = e.pointerType === 'pen';
      const isTouch = e.pointerType === 'touch';
      const isMouse = e.pointerType === 'mouse';

      if (isPen || isMouse) {
        if (isDrawingRef.current) {
          isDrawingRef.current = false;
          onStrokeEndRef.current(lastWorldPointRef.current ?? undefined); // Commit the stroke
        }
        if (isErasingRef.current) {
          isErasingRef.current = false;
          onEraseEndRef.current(); // Push one undo entry for the full erase gesture
        }

        if (toolRef.current === 'hand') {
          activeTouchesRef.current.delete(e.pointerId);
        }

        if (isPen) {
          /**
           * PALM REJECTION: Release the pen lock.
           * Touch events are only re-enabled after the pen fully lifts.
           */
          penLockedRef.current = false;
        }
      } else if (isTouch) {
        if (penLockedRef.current) return;
        
        if (activeTouchesRef.current.size === 1) {
          if (isDrawingRef.current) {
            isDrawingRef.current = false;
            onStrokeEndRef.current(lastWorldPointRef.current ?? undefined);
          } else if (isErasingRef.current) {
            isErasingRef.current = false;
            onEraseEndRef.current();
          }
        }
        
        if (activeTouchesRef.current.size === 2) {
          swipeDataRef.current.active = false;
        }
        
        activeTouchesRef.current.delete(e.pointerId);
      }
    }

    // ──────────────────────────────────────────────────────────
    // pointerleave — clear eraser cursor when pointer exits canvas
    // ──────────────────────────────────────────────────────────
    function handlePointerLeave(e: PointerEvent): void {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        onEraserLeaveRef.current();
      }
    }

    // ──────────────────────────────────────────────────────────
    // wheel — desktop mouse zoom
    // ──────────────────────────────────────────────────────────
    function handleWheel(e: WheelEvent): void {
      e.preventDefault(); // Prevent browser scroll

      const rect   = el.getBoundingClientRect();
      const focalX = e.clientX - rect.left;
      const focalY = e.clientY - rect.top;

      // Normalise deltaY across different wheel modes (pixel, line, page)
      const delta =
        e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY :
        e.deltaMode === WheelEvent.DOM_DELTA_LINE  ? e.deltaY * 16 :
        e.deltaY * 100;

      const factor  = 1 - delta * 0.001;
      const newVP   = zoomViewport(viewportRef.current, factor, focalX, focalY);
      onViewportChangeRef.current(newVP);
    }

    // ── Register listeners ────────────────────────────────────
    // passive:false is required for preventDefault() to work inside
    // touch and wheel handlers on iOS/iPadOS.
    el.addEventListener('pointerdown',   handlePointerDown,   { passive: false });
    el.addEventListener('pointermove',   handlePointerMove,   { passive: false });
    el.addEventListener('pointerup',     handlePointerUp,     { passive: false });
    el.addEventListener('pointercancel', handlePointerUp,     { passive: false });
    el.addEventListener('pointerleave',  handlePointerLeave,  { passive: false });
    el.addEventListener('wheel',         handleWheel,         { passive: false });

    return () => {
      el.removeEventListener('pointerdown',   handlePointerDown);
      el.removeEventListener('pointermove',   handlePointerMove);
      el.removeEventListener('pointerup',     handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerUp);
      el.removeEventListener('pointerleave',  handlePointerLeave);
      el.removeEventListener('wheel',         handleWheel);
    };
  }, [canvasEl]); // Re-register only when canvas element changes (mounts/unmounts)
}

