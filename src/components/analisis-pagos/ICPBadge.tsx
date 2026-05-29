'use client'

import type { IcpClasificacion } from '@/types/analisis-pagos'

// ── Helpers exportados ────────────────────────────────────────────────────────

export function icpClasificacion(score: number): IcpClasificacion {
  if (score >= 85) return 'EXCELENTE'
  if (score >= 70) return 'BUENO'
  if (score >= 50) return 'REGULAR'
  if (score >= 25) return 'MALO'
  return 'MUY MALO'
}

export function icpColorPrimary(score: number): string {
  if (score >= 85) return '#16a34a'
  if (score >= 70) return '#22c55e'
  if (score >= 50) return '#f59e0b'
  if (score >= 25) return '#ea580c'
  return '#dc2626'
}

const ICP_CFG: Record<IcpClasificacion, { bg: string; text: string }> = {
  EXCELENTE:  { bg: 'rgba(22,163,74,0.12)',  text: '#15803d' },
  BUENO:      { bg: 'rgba(34,197,94,0.12)',  text: '#166534' },
  REGULAR:    { bg: 'rgba(245,158,11,0.12)', text: '#92400e' },
  MALO:       { bg: 'rgba(234,88,12,0.12)',  text: '#9a3412' },
  'MUY MALO': { bg: 'rgba(220,38,38,0.12)',  text: '#991b1b' },
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  score?:         number
  clasificacion?: string
  size?:          'sm' | 'md'
}

export default function ICPBadge({ score, clasificacion, size = 'md' }: Props) {
  const cls = (clasificacion as IcpClasificacion)
    ?? (score !== undefined ? icpClasificacion(score) : 'REGULAR')
  const cfg = ICP_CFG[cls] ?? ICP_CFG['REGULAR']
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'

  return (
    <span
      className={`${textSize} font-bold px-2 py-0.5 rounded-full whitespace-nowrap`}
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cls}
    </span>
  )
}
