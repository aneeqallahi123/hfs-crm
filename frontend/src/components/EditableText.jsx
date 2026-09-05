import React, { useState, useEffect } from 'react';

// Inline text that commits on blur / Enter, so editing doesn't thrash state.
export default function EditableText({ value, onSave, placeholder, className, mono }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder={placeholder}
      className={`bg-transparent text-ink border border-transparent hover:border-tint focus:border-green focus:bg-paper rounded px-1.5 py-0.5 focus:outline-none ${mono ? 'font-mono' : ''} ${className || ''}`}
    />
  );
}
