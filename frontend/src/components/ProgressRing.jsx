import React, { useEffect, useRef, useState } from 'react';

// A number that eases toward its target instead of jumping — used on headline stats.
export function useCountUp(value, ms = 600) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = typeof value === 'number' ? value : 0;
    if (from === to) { setShown(to); return; }
    let raf, start;
    const step = (t) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

// A small completion ring — one series, so it needs no legend (the caption names it).
export default function ProgressRing({ pct, size = 76, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shownPct = useCountUp(pct);
  const offset = c - (Math.max(0, Math.min(100, shownPct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" fill="none" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} className="ring-fill" fill="none" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-ink font-serif" style={{ fontSize: size * 0.24, fontWeight: 600 }}>
        {shownPct}%
      </text>
    </svg>
  );
}
