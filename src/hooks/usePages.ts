import { useState, useCallback } from 'react';
import type { Stroke, ViewportState, PageData } from '../types';
import { MAX_HISTORY_STEPS, DEFAULT_VIEWPORT } from '../constants';
import { nanoid } from '../utils/nanoid';

export interface UsePagesReturn {
  pages: PageData[];
  activePageIndex: number;
  activePageId: string;
  
  // Page Navigation & Management
  addPage: () => void;
  nextPage: () => void;
  prevPage: () => void;

  // Active Page State
  strokes: Stroke[];
  viewport: ViewportState;
  
  // Active Page Actions
  pushStroke: (stroke: Stroke) => void;
  setStrokes: (newStrokes: Stroke[], saveToHistory?: boolean) => void;
  setViewport: (viewport: ViewportState | ((vp: ViewportState) => ViewportState)) => void;
  undo: () => void;
  redo: () => void;
  
  canUndo: boolean;
  canRedo: boolean;
}

export function usePages(): UsePagesReturn {
  const [pages, setPages] = useState<PageData[]>([
    {
      id: nanoid(),
      past: [],
      present: [],
      future: [],
      viewport: DEFAULT_VIEWPORT,
    }
  ]);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const activePage = pages[activePageIndex];

  // ── Page Management ──────────────────────────────────────────

  const addPage = useCallback(() => {
    setPages(prev => [
      ...prev,
      {
        id: nanoid(),
        past: [],
        present: [],
        future: [],
        viewport: DEFAULT_VIEWPORT,
      }
    ]);
    setActivePageIndex(pages.length); // The new page will be at the end
  }, [pages.length]);

  const nextPage = useCallback(() => {
    setActivePageIndex(prev => Math.min(prev + 1, pages.length - 1));
  }, [pages.length]);

  const prevPage = useCallback(() => {
    setActivePageIndex(prev => Math.max(prev - 1, 0));
  }, []);

  // ── Active Page State Updaters ──────────────────────────────

  const updateActivePage = useCallback((updater: (page: PageData) => PageData) => {
    setPages(prev => prev.map((p, i) => i === activePageIndex ? updater(p) : p));
  }, [activePageIndex]);

  const pushStroke = useCallback((stroke: Stroke) => {
    updateActivePage(page => ({
      ...page,
      past: [...page.past.slice(-(MAX_HISTORY_STEPS - 1)), page.present],
      present: [...page.present, stroke],
      future: [],
    }));
  }, [updateActivePage]);

  const setStrokes = useCallback(
    (newStrokes: Stroke[], saveToHistory = true) => {
      updateActivePage(page => ({
        ...page,
        past: saveToHistory
          ? [...page.past.slice(-(MAX_HISTORY_STEPS - 1)), page.present]
          : page.past,
        present: newStrokes,
        future: saveToHistory ? [] : page.future,
      }));
    },
    [updateActivePage]
  );

  const setViewport = useCallback(
    (viewportOrUpdater: ViewportState | ((vp: ViewportState) => ViewportState)) => {
      updateActivePage(page => ({
        ...page,
        viewport: typeof viewportOrUpdater === 'function' 
          ? viewportOrUpdater(page.viewport) 
          : viewportOrUpdater
      }));
    },
    [updateActivePage]
  );

  const undo = useCallback(() => {
    updateActivePage(page => {
      if (page.past.length === 0) return page; // Nothing to undo

      const newPresent = page.past[page.past.length - 1];
      return {
        ...page,
        past: page.past.slice(0, -1),
        present: newPresent,
        future: [page.present, ...page.future], // Save current for redo
      };
    });
  }, [updateActivePage]);

  const redo = useCallback(() => {
    updateActivePage(page => {
      if (page.future.length === 0) return page; // Nothing to redo

      const newPresent = page.future[0];
      return {
        ...page,
        past: [...page.past, page.present], // Save current for undo
        present: newPresent,
        future: page.future.slice(1),
      };
    });
  }, [updateActivePage]);

  return {
    pages,
    activePageIndex,
    activePageId: activePage.id,
    
    addPage,
    nextPage,
    prevPage,

    strokes: activePage.present,
    viewport: activePage.viewport,
    
    pushStroke,
    setStrokes,
    setViewport,
    undo,
    redo,
    
    canUndo: activePage.past.length > 0,
    canRedo: activePage.future.length > 0,
  };
}
