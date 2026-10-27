import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelButton = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    cancelButton.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busy) onCancelRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy]);

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <div className="confirm-dialog-icon"><AlertTriangle size={19} /></div>
        <button className="icon-button confirm-dialog-close" type="button" aria-label="Close confirmation" onClick={onCancel} disabled={busy}><X size={16} /></button>
        <p className="eyebrow">PLEASE CONFIRM</p>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description" className="confirm-dialog-description">{description}</p>
        <div className="confirm-dialog-actions">
          <button ref={cancelButton} className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Keep repository</button>
          <button className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Removing…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
