/**
 * App.tsx — Root application component.
 *
 * Manages all top-level state and wires together:
 *   • BlackboardCanvas  — The drawing surface
 *   • Toolbar           — Tool selection and settings
 *   • ClearConfirmModal — Destructive-action confirmation
 *
 * ══════════════════════════════════════════════════════════
 * State Architecture
 * ══════════════════════════════════════════════════════════
 *
 *   strokes    — managed by useHistory hook (provides undo/redo)
 *   viewport   — camera position and zoom (managed here with useState)
 *   settings   — tool, colours, widths, background, grid (useState)
 *
 * All state lives here so that:
 *   1. The canvas receives the complete CanvasElement list and can re-render
 *   2. The toolbar can reflect the current settings
 *   3. Undo/redo affect both the display and the history stack
 *
 * ══════════════════════════════════════════════════════════
 * Keyboard Shortcuts
 * ══════════════════════════════════════════════════════════
 *
 *   Ctrl/Cmd + Z  → Undo
 *   Ctrl/Cmd + Y  → Redo
 *   Ctrl/Cmd + Shift + Z → Redo (macOS convention)
 *   P             → Switch to Pen tool
 *   E             → Switch to Eraser tool
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CanvasElement, AppSettings, ViewportState } from './types';
import { DEFAULT_SETTINGS, MIN_SCALE, MAX_SCALE } from './constants';
import { usePages } from './hooks/usePages';
import { maybeRebaseOrigin, zoomViewport } from './engine/Viewport';
import { BlackboardCanvas } from './components/BlackboardCanvas';
import { Toolbar }           from './components/Toolbar';
import { ClearConfirmModal } from './components/ClearConfirmModal';

export default function App() {
  // ── Drawing history (undo/redo) ────────────────────────────
  const {
    pages,
    activePageIndex,
    addPage,
    nextPage,
    prevPage,
    strokes,
    viewport,
    pushStroke,
    setStrokes,
    setViewport,
    undo,
    redo,
    canUndo,
    canRedo,
  } = usePages();

  // ── UI settings ────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // ── Clear board modal ──────────────────────────────────────
  const [showClearModal, setShowClearModal] = useState(false);

  // ─────────────────────────────────────────────
  // Settings updater
  // ─────────────────────────────────────────────

  const handleSettingsChange = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  // ─────────────────────────────────────────────
  // Canvas event handlers
  // ─────────────────────────────────────────────

  /** Called when a CanvasElement gesture completes (pen lifts) */
  const handleStrokeCommit = useCallback((CanvasElement: CanvasElement) => {
    pushStroke(CanvasElement);
  }, [pushStroke]);

  /** Called when a selected element is moved or resized */
  const handleElementUpdate = useCallback((updatedElement: CanvasElement) => {
    setStrokes(
      strokes.map(s => s.id === updatedElement.id ? updatedElement : s),
      true // Save to history for undo
    );
  }, [strokes, setStrokes]);

  /**
   * Called during and after an erase gesture.
   *
   * @param newStrokes  - Updated CanvasElement list after applying eraser
   * @param saveHistory - True only on pointerup (commit one undo entry)
   */
  const handleErase = useCallback(
    (newStrokes: CanvasElement[], saveHistory: boolean) => {
      setStrokes(newStrokes, saveHistory);
    },
    [setStrokes]
  );

  /**
   * Called when pan or pinch changes the viewport.
   * After updating, check whether origin rebasing is needed to
   * prevent floating-point precision issues during long sessions.
   */
  const handleViewportChange = useCallback((newVP: ViewportState) => {
    setViewport(newVP);
    // Periodically rebase the origin when the camera drifts very far
    // (done asynchronously to avoid blocking the gesture handler)
    setTimeout(() => {
      setViewport(vp => {
        const { viewport: rebased, strokes: rs, rebased: didRebase } =
          maybeRebaseOrigin(strokes, vp);
        if (didRebase) {
          // Also update strokes — do this in the next tick via setStrokes
          // We can't call setStrokes here because this is inside setViewport
          // so we use a ref-based approach instead
          setStrokes(rs, false);
          return rebased;
        }
        return vp;
      });
    }, 0);
  }, [strokes, setStrokes]);

  // ─────────────────────────────────────────────
  // Clear board
  // ─────────────────────────────────────────────

  const handleClearConfirm = useCallback(() => {
    setStrokes([], true); // Push empty state (undoable)
    setShowClearModal(false);
  }, [setStrokes]);

  // ─────────────────────────────────────────────
  // Zoom controls
  // ─────────────────────────────────────────────

  const isZoomingRef = useRef(false);

  const handleZoom = useCallback((direction: 'in' | 'out') => {
    if (isZoomingRef.current) return;
    
    // Lesser sensitivity for toolbar zoom buttons (was 1.25, now 1.1)
    const factor = direction === 'in' ? 1.1 : 1 / 1.1;
    
    setViewport(currentVP => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentVP.scale * factor));
      
      if (targetScale === currentVP.scale) return currentVP;

      isZoomingRef.current = true;
      const startScale = currentVP.scale;
      const startTime = performance.now();
      const duration = 200;
      
      const initialVP = currentVP;

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const t = Math.min(1, elapsed / duration);
        const easeT = 1 - Math.pow(1 - t, 3); // easeOutCubic
        
        const currentScale = startScale + (targetScale - startScale) * easeT;
        const currentFactor = currentScale / initialVP.scale;
        
        const newVP = zoomViewport(initialVP, currentFactor, centerX, centerY);
        setViewport(newVP);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          isZoomingRef.current = false;
        }
      };
      
      requestAnimationFrame(animate);
      return currentVP; // Do not update synchronously, let animation handle it
    });
  }, []);

  // ─────────────────────────────────────────────
  // Keyboard shortcuts
  // ─────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;

      if (meta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

      // Tool shortcuts (only when not typing in an input)
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'p' || e.key === 'P') handleSettingsChange({ tool: 'pen' });
      if (e.key === 'e' || e.key === 'E') handleSettingsChange({ tool: 'eraser' });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSettingsChange]);

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <>
      {/* Full-screen drawing canvas (behind everything) */}
      <BlackboardCanvas
        settings={settings}
        strokes={strokes}
        viewport={viewport}
        onStrokeCommit={handleStrokeCommit}
        onErase={handleErase}
        onElementUpdate={handleElementUpdate}
        onViewportChange={handleViewportChange}
        onSwipeLeft={nextPage}
        onSwipeRight={prevPage}
      />

      {/* Floating left toolbar (above canvas, below modal) */}
      <Toolbar
        settings={settings}
        canUndo={canUndo}
        canRedo={canRedo}
        onSettingsChange={handleSettingsChange}
        onUndo={undo}
        onRedo={redo}
        onClear={() => setShowClearModal(true)}
        onZoomIn={() => handleZoom('in')}
        onZoomOut={() => handleZoom('out')}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        onAddPage={addPage}
        hasMultiplePages={pages.length > 1}
        currentPageIndex={activePageIndex}
        totalPages={pages.length}
      />

      {/* Clear confirmation modal */}
      <ClearConfirmModal
        isOpen={showClearModal}
        onConfirm={handleClearConfirm}
        onCancel={() => setShowClearModal(false)}
      />
    </>
  );
}
