import React from 'react';

export default function Field({ label, value, onChange, placeholder, type = 'text', required }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
      />
    </label>
  );
}

export function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-tint bg-paper text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green"
      >
        {children}
      </select>
    </label>
  );
}
