import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, children, onClose, wide }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-ink/40 flex items-start justify-center overflow-y-auto p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-paper text-ink rounded-lg border border-tint my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="w-8 h-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-stone-100 flex items-center justify-center text-xl leading-none"
          >×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
