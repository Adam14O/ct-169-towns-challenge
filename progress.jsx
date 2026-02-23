import React from 'react'

export function Progress({ value=0, className='', style }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className={className} style={{ width:'100%', height:'10px', background:'#e2e8f0', borderRadius:'999px', overflow:'hidden', ...style }}>
      <div style={{ width:`${v}%`, height:'100%', background:'#0f172a' }} />
    </div>
  )
}
