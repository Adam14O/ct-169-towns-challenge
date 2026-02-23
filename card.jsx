import React from 'react'

function cx(...v){return v.filter(Boolean).join(' ')}

export function Card({ className='', style, ...props }) {
  return <div className={cx(className)} style={{ background:'#fff', border:'1px solid #e2e8f0', ...style }} {...props} />
}
export function CardHeader({ className='', style, ...props }) {
  return <div className={cx(className)} style={{ padding:'16px', ...style }} {...props} />
}
export function CardContent({ className='', style, ...props }) {
  return <div className={cx(className)} style={{ padding:'16px', ...style }} {...props} />
}
export function CardTitle({ className='', style, ...props }) {
  return <div className={cx(className)} style={{ fontWeight:700, fontSize:'1.1rem', ...style }} {...props} />
}
