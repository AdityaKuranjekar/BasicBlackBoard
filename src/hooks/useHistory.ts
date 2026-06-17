/**
 * useHistory — CanvasElement-based undo/redo with a bounded history stack.
 *
 * ══════════════════════════════════════════════════════════
 * Design Decisions
 * ══════════════════════════════════════════════════════════
 *
 * Why CanvasElement-based (not pixel-based)?
 *   Pixel-based undo would require storing entire canvas bitmaps.
 *   On an iPad Retina display (2732×2048 @2×): one snapshot ≈ 44 MB.
 *   That's impractical. Storing CanvasElement objects is cheap because
 *   JavaScript arrays hold references — copying CanvasElement[] is O(n)
 *   reference copies, not deep-copies of the point data.
 *
 * Why bounded at MAX_HISTORY_STEPS?
 *   After a 3-hour lecture, a teacher may accumulate 5,000–10,000
 *   strokes. An unlimited history would grow indefinitely. Bounding
 *   at 500 steps (well beyond any real "I need to go back 10 steps"
 *   need) prevents memory bloat without impacting usability.
 *
 * ══════════════════════════════════════════════════════════
 * State Model (Elm-style)
 * ══════════════════════════════════════════════════════════
 *
 *   past    — array of CanvasElement[] snapshots (oldest first)
 *   present — current CanvasElement[] (what's on the board right now)
 *   future  — array of CanvasElement[] snapshots that were undone (most recent first)
 *
 * Undo: pop from past, push present to future, restore popped snapshot
 * Redo: pop from future, push present to past, restore popped snapshot
 * New CanvasElement: push present to past, add CanvasElement to present, clear future
 *
 * The future is cleared on any new action, which is the standard undo
 * semantics used by all major applications.
 */

import { useState, useCallback } from 'react';
import type { CanvasElement } from '../types';
import { MAX_HISTORY_STEPS } from '../constants';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface HistoryState {
  /** Snapshots of previous states — oldest at index 0 */
  past: CanvasElement[][];
  /** The current CanvasElement list displayed on the board */
  present: CanvasElement[];
  /** Snapshots of states that were undone — most-recent-undone at index 0 */
  future: CanvasElement[][];
}

export interface UseHistoryReturn {
  /** Current CanvasElement list */
  strokes: CanvasElement[];
  /** Add a single new CanvasElement (from a pen-up event) */
  pushStroke: (CanvasElement: CanvasElement) => void;
  /**
   * Replace the entire CanvasElement list (used for erase and clear operations).
   * @param saveToHistory - Set to false only for intermediate erase preview
   *                        where you'll call it again on pointerup with true.
   */
  setStrokes: (newStrokes: CanvasElement[], saveToHistory?: boolean) => void;
  /** Restore the previous state */
  undo: () => void;
  /** Re-apply an undone state */
  redo: () => void;
  /** Whether undo is currently possible */
  canUndo: boolean;
  /** Whether redo is currently possible */
  canRedo: boolean;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

/**
 * useHistory
 *
 * Provides CanvasElement-level undo/redo with a bounded memory footprint.
 * All state updates produce new objects — the history stack is
 * immutable and safe to use in React state.
 */
export function useHistory(): UseHistoryReturn {
  const [history, setHistory] = useState<HistoryState>({
    past:    [],
    present: [],
    future:  [],
  });

  // ── Add a single new CanvasElement ───────────────────────────────
  const pushStroke = useCallback((CanvasElement: CanvasElement) => {
    setHistory(prev => ({
      // Keep at most MAX_HISTORY_STEPS past snapshots to bound memory
      past:    [...prev.past.slice(-(MAX_HISTORY_STEPS - 1)), prev.present],
      present: [...prev.present, CanvasElement],
      future:  [], // Any new action invalidates the redo stack
    }));
  }, []);

  // ── Replace the entire CanvasElement list ────────────────────────
  const setStrokes = useCallback(
    (newStrokes: CanvasElement[], saveToHistory = true) => {
      setHistory(prev => ({
        past: saveToHistory
          ? [...prev.past.slice(-(MAX_HISTORY_STEPS - 1)), prev.present]
          : prev.past,
        present: newStrokes,
        future:  saveToHistory ? [] : prev.future,
      }));
    },
    []
  );

  // ── Undo ──────────────────────────────────────────────────
  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev; // Nothing to undo

      const newPresent = prev.past[prev.past.length - 1];
      return {
        past:    prev.past.slice(0, -1),
        present: newPresent,
        future:  [prev.present, ...prev.future], // Save current for redo
      };
    });
  }, []);

  // ── Redo ──────────────────────────────────────────────────
  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev; // Nothing to redo

      const newPresent = prev.future[0];
      return {
        past:    [...prev.past, prev.present], // Save current for undo
        present: newPresent,
        future:  prev.future.slice(1),
      };
    });
  }, []);

  return {
    strokes:    history.present,
    pushStroke,
    setStrokes,
    undo,
    redo,
    canUndo:    history.past.length > 0,
    canRedo:    history.future.length > 0,
  };
}
