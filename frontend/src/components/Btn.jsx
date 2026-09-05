import React from 'react';

export default function Btn({ children, onClick, kind = 'primary', size = 'md', disabled, title, type = 'button', className = '' }) {
  const base = 'rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const sizes = { sm: 'text-xs px-2.5 py-1', md: 'text-sm px-4 py-2' };
  const kinds = {
    primary: 'bg-green text-paper hover:bg-deep border border-green',
    ghost: 'text-ink bg-paper hover:bg-fog border border-tint',
    danger: 'text-deep bg-paper hover:bg-fog border border-deep',
  };
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick}
      className={`${base} ${sizes[size]} ${kinds[kind]} ${className}`}>
      {children}
    </button>
  );
}
