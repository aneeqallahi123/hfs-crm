import React from 'react';
import { statusValue, statusStyle, statusOptions } from '../lib/metrics.js';

const CHEVRON = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%231C1C1C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")";

// The status control. Shows the stage word, offers only the moves that make sense for this item.
export default function StatusSelect({ it, onChange, className = '' }) {
  return (
    <select
      value={statusValue(it)}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title="Change status"
      className={`text-[11px] rounded-full border pl-2.5 pr-6 py-0.5 focus:outline-none cursor-pointer shrink-0 appearance-none bg-no-repeat bg-[right_6px_center] ${statusStyle(it)} ${className}`}
      style={{ backgroundImage: CHEVRON }}
    >
      {statusOptions(it).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
