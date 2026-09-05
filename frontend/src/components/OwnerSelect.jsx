import React from 'react';

const CHEVRON = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%231C1C1C' stroke-opacity='.45' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")";

// Compact, borderless owner picker for rows. Reads as text until you click it.
export default function OwnerSelect({ value, team, onChange, className = '' }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title={value ? `Owner: ${value} — click to reassign` : 'Assign to someone'}
      className={`text-[11px] rounded-md pl-1.5 pr-4 py-0.5 cursor-pointer shrink-0 appearance-none bg-transparent bg-no-repeat bg-[right_2px_center] border border-transparent hover:border-tint focus:outline-none focus:border-green ${value ? 'text-slate-600' : 'text-slate-400 italic'} ${className}`}
      style={{ backgroundImage: CHEVRON }}
    >
      <option value="">assign</option>
      {team.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
    </select>
  );
}
