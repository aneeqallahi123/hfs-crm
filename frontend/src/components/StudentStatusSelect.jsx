import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { statusLabel, statusStyle, statusOptions, statusValue } from '../lib/metrics.js';
import Modal from './Modal.jsx';

export default function StudentStatusSelect({ it, onChange }) {
  const [open, setOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const isComplete = it.status === 'Completed';

  function openDropdown(e) {
    e.stopPropagation();
    if (isComplete) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX });
    }
    setOpen(true);
  }

  function handleSelect(e, value) {
    e.stopPropagation();
    setOpen(false);
    if (value === 'Completed') {
      setConfirmComplete(true);
    } else {
      onChange(value);
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = statusOptions(it);
  const current = statusValue(it);

  return (
    <>
      <button
        ref={btnRef}
        onClick={openDropdown}
        title={isComplete ? 'Task is complete' : 'Change status'}
        className={`text-[11px] rounded-full border pl-2.5 pr-5 py-0.5 shrink-0 relative ${statusStyle(it)} ${isComplete ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
      >
        {statusLabel(it)}
        {!isComplete && (
          <svg className="absolute right-1.5 top-1/2 -translate-y-1/2" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && createPortal(
        <div
          className="fixed z-50"
          style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="bg-paper border border-tint rounded-lg shadow-md py-1 min-w-[120px]">
            {options.map(([v, l]) => (
              <button
                key={v}
                onClick={(e) => handleSelect(e, v)}
                className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center gap-2 hover:bg-fog transition-colors ${v === current ? 'text-ink font-medium' : 'text-slate-600'}`}
              >
                <span className={`w-3 shrink-0 ${v === current ? 'text-green' : 'text-transparent'}`}>✓</span>
                {l}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {confirmComplete && (
        <Modal title="Mark as complete?" onClose={() => setConfirmComplete(false)}>
          <p className="text-sm text-slate-600 mb-6">
            Have you reviewed this task properly? You will not be able to change its status again.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmComplete(false)}
              className="px-4 py-2 text-sm rounded-md border border-tint text-ink hover:bg-fog transition-colors"
            >
              Revisit task again
            </button>
            <button
              onClick={() => { setConfirmComplete(false); onChange('Completed'); }}
              className="px-4 py-2 text-sm rounded-md bg-green text-white hover:bg-green/90 transition-colors"
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
