/**
 * ClearConfirmModal — Confirmation dialog for "Clear Board" action.
 *
 * Shown before wiping all strokes. The destructive action is significant
 * enough to warrant a confirmation step, but the UI should be fast — a
 * teacher clearing the board mid-lesson needs this to be instant.
 *
 * Design:
 *   • Dark glassmorphism panel centred on screen
 *   • Backdrop blur overlay (non-interactive area dismisses modal)
 *   • Two buttons: Cancel (neutral) and Clear (destructive red)
 *   • Large touch targets (min 48px) for iPad use
 */

import { useEffect, useRef } from 'react';

interface ClearConfirmModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when the user confirms the clear action */
  onConfirm: () => void;
  /** Called when the user cancels or clicks outside */
  onCancel: () => void;
}

export function ClearConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
}: ClearConfirmModalProps) {
  // Focus the Cancel button on open for keyboard accessibility
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Small delay so the animation starts before focus is applied
      setTimeout(() => cancelBtnRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-modal-title"
    >
      <div
        className="modal-panel"
        onClick={e => e.stopPropagation()} // Prevent backdrop click from bubbling
      >
        {/* Icon */}
        <div className="modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </div>

        <h2 id="clear-modal-title" className="modal-title">Clear the Board?</h2>
        <p className="modal-body">
          This will erase all strokes. You can undo this action immediately after.
        </p>

        <div className="modal-actions">
          <button
            ref={cancelBtnRef}
            className="modal-btn modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="modal-btn modal-btn-confirm"
            onClick={onConfirm}
          >
            Clear Board
          </button>
        </div>
      </div>
    </div>
  );
}
