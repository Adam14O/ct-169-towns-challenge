import React from 'react'

function cx(...v){return v.filter(Boolean).join(' ')}

export function Button({ className='', style, disabled, children, ...props }) {
  return (
    <button
      disabled={disabled}
      className={cx(className)}
      style={{
        padding:'10px 14px',
        borderRadius:'10px',
        border:'1px solid #cbd5e1',
        background: disabled ? '#e2e8f0' : '#0f172a',
        color: disabled ? '#64748b' : 'white',
        display:'inline-flex',
        alignItems:'center',
        gap:'6px'
      }}
      {...props}
    >
      {children}
    </button>
  )
}
