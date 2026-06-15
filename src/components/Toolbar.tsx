/**
 * Toolbar — Left-side floating vertical toolbar.
 *
 * ══════════════════════════════════════════════════════════
 * Why Left Side?
 * ══════════════════════════════════════════════════════════
 *
 * A bottom-centre toolbar is partially covered by a teacher's writing
 * hand. Popular note-taking apps (GoodNotes, Notability, Concepts)
 * all place the toolbar on the side for this reason.
 *
 * Left side chosen as default; right-handed teachers may prefer left
 * so their writing hand doesn't cover tools.
 *
 * ══════════════════════════════════════════════════════════
 * Layout
 * ══════════════════════════════════════════════════════════
 *
 *   ┌────────────┐
 *   │  ✏ Pen     │  ← Tool selector (shows settings panel inline)
 *   │  ◯ Eraser  │
 *   │  ─────     │  divider
 *   │  ↩ Undo    │
 *   │  ↪ Redo    │
 *   │  ─────     │
 *   │  # Grid    │  ← Opens grid panel
 *   │  🎨 BG     │  ← Opens background panel
 *   │  ─────     │
 *   │  🗑 Clear   │
 *   │  ─────     │
 *   │  « Collapse│
 *   └────────────┘
 *
 * When collapsed, only icons are shown (no labels, narrower toolbar).
 * Settings panels slide in to the right of the toolbar.
 *
 * ══════════════════════════════════════════════════════════
 * Touch Targets
 * ══════════════════════════════════════════════════════════
 *
 * All interactive elements are at least 48×48px — Apple HIG minimum
 * for comfortable touch interaction.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppSettings, Tool, GridMode } from '../types';
import { CHALK_COLORS, BACKGROUND_PRESETS } from '../constants';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ToolbarProps {
  settings: AppSettings;
  canUndo: boolean;
  canRedo: boolean;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  onAddPage: () => void;
  hasMultiplePages: boolean;
  currentPageIndex: number;
  totalPages: number;
}

// Which settings panel is currently open
type OpenPanel = 'pen' | 'eraser' | 'grid' | 'background' | null;

// ─────────────────────────────────────────────
// SVG Icon helpers
// ─────────────────────────────────────────────

const PenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

const EraserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16l11-11 6 6-3.5 3.5"/>
    <path d="M6.5 17.5l4-4"/>
  </svg>
);

const HandIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0v4"/>
    <path d="M14 10V5a2 2 0 0 0-4 0v5"/>
    <path d="M10 10.5V4a2 2 0 0 0-4 0v9"/>
    <path d="m2 15 5.58-5.59a2 2 0 0 1 2.82 0l1.6 1.59"/>
    <path d="M22 15a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/>
  </svg>
);

const UndoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4"/>
    <path d="M20 20v-7a4 4 0 00-4-4H4"/>
  </svg>
);

const RedoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 14 20 9 15 4"/>
    <path d="M4 20v-7a4 4 0 014-4h12"/>
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
  </svg>
);

const BackgroundIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a10 10 0 010 20"/>
    <path d="M12 2v20"/>
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {collapsed
      ? <polyline points="9 18 15 12 9 6"/>   /* chevron-right = expand */
      : <polyline points="15 18 9 12 15 6"/>  /* chevron-left  = collapse */
    }
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14"/>
    <path d="M5 12h14"/>
  </svg>
);

const MinusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// ─────────────────────────────────────────────
// Sub-components (settings panels)
// ─────────────────────────────────────────────

interface PenPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}

function PenSettingsPanel({ settings, onChange }: PenPanelProps) {
  return (
    <div className="settings-panel">
      <p className="settings-label">Color</p>
      <div className="color-swatches">
        {CHALK_COLORS.map(color => (
          <button
            key={color}
            className={`color-swatch ${settings.penColor === color ? 'active' : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange({ penColor: color })}
            title={color}
            aria-label={`Select color ${color}`}
          />
        ))}
        {/* Custom colour picker */}
        <label className="color-swatch color-swatch-custom" title="Custom color">
          <span>+</span>
          <input
            type="color"
            value={settings.penColor}
            onChange={e => onChange({ penColor: e.target.value })}
            style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
          />
        </label>
      </div>

      <p className="settings-label">Stroke Width</p>
      <div className="slider-row">
        <span className="slider-min">Thin</span>
        <input
          type="range"
          min={1}
          max={20}
          step={0.5}
          value={settings.penWidth}
          onChange={e => onChange({ penWidth: Number(e.target.value) })}
          className="slider"
        />
        <span className="slider-max">Thick</span>
      </div>
      <div className="stroke-preview">
        <svg width="100%" height="16">
          <line
            x1="8" y1="8" x2="calc(100% - 8)" y2="8"
            stroke={settings.penColor}
            strokeWidth={Math.min(settings.penWidth, 12)}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

interface EraserPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}

function EraserSettingsPanel({ settings, onChange }: EraserPanelProps) {
  return (
    <div className="settings-panel">
      <p className="settings-label">Eraser Size</p>
      <div className="slider-row">
        <span className="slider-min">S</span>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={settings.eraserWidth}
          onChange={e => onChange({ eraserWidth: Number(e.target.value) })}
          className="slider"
        />
        <span className="slider-max">XL</span>
      </div>
      {/* Visual preview of eraser size */}
      <div className="eraser-preview">
        <div
          className="eraser-circle"
          style={{
            width:  settings.eraserWidth / 2,
            height: settings.eraserWidth / 2,
          }}
        />
      </div>
    </div>
  );
}

interface GridPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}

function GridSettingsPanel({ settings, onChange }: GridPanelProps) {
  const modes: { value: GridMode; label: string; icon: string }[] = [
    { value: 'none',    label: 'None',   icon: '○' },
    { value: 'dots',    label: 'Dots',   icon: '∷' },
    { value: 'squares', label: 'Grid',   icon: '⊞' },
  ];

  return (
    <div className="settings-panel">
      <p className="settings-label">Background Grid</p>
      <div className="mode-buttons">
        {modes.map(m => (
          <button
            key={m.value}
            className={`mode-btn ${settings.gridMode === m.value ? 'active' : ''}`}
            onClick={() => onChange({ gridMode: m.value })}
          >
            <span className="mode-btn-icon">{m.icon}</span>
            <span className="mode-btn-label">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface BackgroundPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}

function BackgroundSettingsPanel({ settings, onChange }: BackgroundPanelProps) {
  const presets = [
    { key: 'blackboard', label: 'Blackboard', color: BACKGROUND_PRESETS.blackboard },
    { key: 'whiteboard', label: 'Whiteboard', color: BACKGROUND_PRESETS.whiteboard },
    { key: 'midnight',   label: 'Midnight',   color: BACKGROUND_PRESETS.midnight   },
  ];

  return (
    <div className="settings-panel">
      <p className="settings-label">Background</p>
      <div className="bg-presets">
        {presets.map(p => (
          <button
            key={p.key}
            className={`bg-preset ${settings.backgroundColor === p.color ? 'active' : ''}`}
            style={{ backgroundColor: p.color }}
            onClick={() => onChange({ backgroundColor: p.color })}
            title={p.label}
          >
            <span className="bg-preset-label">{p.label}</span>
          </button>
        ))}
      </div>
      <p className="settings-label" style={{ marginTop: 12 }}>Custom Color</p>
      <label className="custom-color-label">
        <div
          className="custom-color-preview"
          style={{ backgroundColor: settings.backgroundColor }}
        />
        <span className="custom-color-text">
          {settings.backgroundColor.toUpperCase()}
        </span>
        <input
          type="color"
          value={settings.backgroundColor}
          onChange={e => onChange({ backgroundColor: e.target.value })}
          className="custom-color-input"
        />
      </label>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Toolbar Component
// ─────────────────────────────────────────────

export function Toolbar({
  settings,
  canUndo,
  canRedo,
  onSettingsChange,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onNextPage,
  onPrevPage,
  onAddPage,
  currentPageIndex,
  totalPages,
}: ToolbarProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [collapsed, setCollapsed]  = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close open panel when clicking outside the toolbar container
  useEffect(() => {
    if (!openPanel) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };

    // Use capture phase to catch the event before canvas stops propagation
    document.addEventListener('pointerdown', handleClickOutside, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, { capture: true });
    };
  }, [openPanel]);

  // Toggle a panel: open it if closed, close it if already open
  const togglePanel = useCallback((panel: OpenPanel) => {
    setOpenPanel(prev => (prev === panel ? null : panel));
  }, []);

  // Tool buttons also switch the active tool
  const selectTool = useCallback((tool: Tool, panel: OpenPanel) => {
    onSettingsChange({ tool });
    setOpenPanel(prev => (prev === panel ? null : panel));
  }, [onSettingsChange]);

  const isPen    = settings.tool === 'pen';
  const isEraser = settings.tool === 'eraser';
  const isHand   = settings.tool === 'hand';

  // For collapsed state logic:
  const collapsedSecondaryTool = isEraser ? 'pen' : 'eraser';

  return (
    <div ref={toolbarRef} className={`toolbar-container ${collapsed ? 'collapsed' : ''}`}>
      {/* ── Main toolbar strip ─── */}
      <div className="toolbar">

        {/* App brand dot */}
        {!collapsed && (
          <div className="toolbar-brand" title="Infinite Blackboard">
            <div className="brand-dot" />
          </div>
        )}

        {!collapsed && <div className="toolbar-divider" />}

        {/* Pen tool */}
        {(!collapsed || collapsedSecondaryTool === 'pen') && (
          <button
            id="tool-pen"
            className={`toolbar-btn ${isPen ? 'active' : ''}`}
            onClick={() => selectTool('pen', 'pen')}
            title="Pen (P)"
            aria-pressed={isPen}
          >
            <span className="btn-icon"><PenIcon /></span>
            {!collapsed && <span className="btn-label">Pen</span>}
          </button>
        )}

        {/* Eraser tool */}
        {(!collapsed || collapsedSecondaryTool === 'eraser') && (
          <button
            id="tool-eraser"
            className={`toolbar-btn ${isEraser ? 'active' : ''}`}
            onClick={() => selectTool('eraser', 'eraser')}
            title="Eraser (E)"
            aria-pressed={isEraser}
          >
            <span className="btn-icon"><EraserIcon /></span>
            {!collapsed && <span className="btn-label">Eraser</span>}
          </button>
        )}

        {/* Hand tool */}
        {!collapsed && (
          <button
            id="tool-hand"
            className={`toolbar-btn ${isHand ? 'active' : ''}`}
            onClick={() => selectTool('hand', null)}
            title="Pan/Hand (H)"
            aria-pressed={isHand}
          >
            <span className="btn-icon"><HandIcon /></span>
            {!collapsed && <span className="btn-label">Hand</span>}
          </button>
        )}

        {!collapsed && <div className="toolbar-divider" />}

        {/* Undo */}
        {!collapsed && (
          <button
            id="btn-undo"
            className={`toolbar-btn ${!canUndo ? 'disabled' : ''}`}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <span className="btn-icon"><UndoIcon /></span>
            {!collapsed && <span className="btn-label">Undo</span>}
          </button>
        )}

        {/* Redo */}
        {!collapsed && (
          <button
            id="btn-redo"
            className={`toolbar-btn ${!canRedo ? 'disabled' : ''}`}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <span className="btn-icon"><RedoIcon /></span>
            {!collapsed && <span className="btn-label">Redo</span>}
          </button>
        )}

        {!collapsed && <div className="toolbar-divider" />}

        {/* Grid settings */}
        {!collapsed && (
          <button
            id="btn-grid"
            className={`toolbar-btn ${openPanel === 'grid' ? 'panel-open' : ''}`}
            onClick={() => togglePanel('grid')}
            title="Grid"
          >
            <span className="btn-icon"><GridIcon /></span>
            {!collapsed && <span className="btn-label">Grid</span>}
            {settings.gridMode !== 'none' && <span className="indicator-dot" />}
          </button>
        )}

        {/* Background settings */}
        {!collapsed && (
          <button
            id="btn-background"
            className={`toolbar-btn ${openPanel === 'background' ? 'panel-open' : ''}`}
            onClick={() => togglePanel('background')}
            title="Background"
          >
            <span className="btn-icon"><BackgroundIcon /></span>
            {!collapsed && <span className="btn-label">Background</span>}
            <span
              className="color-indicator"
              style={{ backgroundColor: settings.backgroundColor }}
            />
          </button>
        )}

        {!collapsed && <div className="toolbar-divider" />}

        {/* Zoom Controls */}
        {!collapsed && (
          <button className="toolbar-btn" onClick={onZoomIn} title="Zoom In">
            <span className="btn-icon"><PlusIcon /></span>
            {!collapsed && <span className="btn-label">Zoom In</span>}
          </button>
        )}
        {!collapsed && (
          <button className="toolbar-btn" onClick={onZoomOut} title="Zoom Out">
            <span className="btn-icon"><MinusIcon /></span>
            {!collapsed && <span className="btn-label">Zoom Out</span>}
          </button>
        )}

        {!collapsed && <div className="toolbar-divider" />}

        {/* Page Navigation */}
        {!collapsed && (
          <div className="toolbar-pagination">
            <button 
              className={`toolbar-btn ${currentPageIndex === 0 ? 'disabled' : ''}`} 
              onClick={onPrevPage} 
              disabled={currentPageIndex === 0}
              title="Previous Page"
            >
              <span className="btn-icon"><ChevronLeftIcon /></span>
            </button>
            <span className="pagination-text">{currentPageIndex + 1} / {totalPages}</span>
            <button 
              className={`toolbar-btn ${currentPageIndex === totalPages - 1 ? 'disabled' : ''}`} 
              onClick={onNextPage} 
              disabled={currentPageIndex === totalPages - 1}
              title="Next Page"
            >
              <span className="btn-icon"><ChevronRightIcon /></span>
            </button>
          </div>
        )}

        {/* Add Page (always visible) */}
        <button className="toolbar-btn" onClick={onAddPage} title="Add Page">
          <span className="btn-icon"><PlusIcon /></span>
          {!collapsed && <span className="btn-label">Add Page</span>}
        </button>

        {!collapsed && <div className="toolbar-divider" />}

        {/* Clear board */}
        {!collapsed && (
          <button
            id="btn-clear"
            className="toolbar-btn toolbar-btn-danger"
            onClick={onClear}
            title="Clear Board"
          >
            <span className="btn-icon"><TrashIcon /></span>
            {!collapsed && <span className="btn-label">Clear</span>}
          </button>
        )}

        <div className="toolbar-spacer" />

        {/* Collapse toggle (pinned to bottom) */}
        <button
          id="btn-collapse"
          className="toolbar-btn toolbar-btn-collapse"
          onClick={() => { setCollapsed(c => !c); setOpenPanel(null); }}
          title={collapsed ? 'Expand toolbar' : 'Collapse toolbar'}
        >
          <span className="btn-icon"><CollapseIcon collapsed={collapsed} /></span>
        </button>
      </div>

      {/* ── Settings panels (slide in to the right) ─── */}
      {openPanel && (
        <div className="panel-container">
          {openPanel === 'pen' && (
            <PenSettingsPanel settings={settings} onChange={onSettingsChange} />
          )}
          {openPanel === 'eraser' && (
            <EraserSettingsPanel settings={settings} onChange={onSettingsChange} />
          )}
          {openPanel === 'grid' && (
            <GridSettingsPanel settings={settings} onChange={onSettingsChange} />
          )}
          {openPanel === 'background' && (
            <BackgroundSettingsPanel settings={settings} onChange={onSettingsChange} />
          )}
        </div>
      )}
    </div>
  );
}
