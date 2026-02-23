import React from 'react'

function cx(...v){return v.filter(Boolean).join(' ')}

export function Badge({ className='', variant, style, ...props }) {
  const bg = variant === 'secondary' ? '#f1f5f9' : '#e2e8f0'
  return <span className={cx(className)} style={{display:'inline-flex',alignItems:'center',border:'1px solid #cbd5e1',background:bg,padding:'4px 8px',borderRadius:'999px',fontSize:'12px',...style}} {...props} />
}
