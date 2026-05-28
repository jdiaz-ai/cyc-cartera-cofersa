'use client'

import { Timer, TrendingDown, TrendingUp, Minus } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────
export interface DSOPunto {
  anio:       number
  mes:        number
  dso:        number
  ventas90d:  number   // ventas rolling 3m con IVA
  esEstimado: boolean  // true cuando la cartera no corresponde a ese mes real
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function colorDso(d: number) {
  if (d > 45) return '#ef4444'
  if (d > 35) return '#f59e0b'
  return '#16a34a'
}

function bgDso(d: number) {
  if (d > 45) return 'rgba(239,68,68,0.08)'
  if (d > 35) return 'rgba(245,158,11,0.08)'
  return 'rgba(22,163,74,0.08)'
}

// ── Componente ────────────────────────────────────────────────────────
export default function DSOTendenciaCard({ puntos }: { puntos: DSOPunto[] }) {
  if (puntos.length === 0) return null

  const sorted  = [...puntos].sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.mes - b.mes)
  const ultimo  = sorted[sorted.length - 1]
  const previo  = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  const delta   = previo ? +(ultimo.dso - previo.dso).toFixed(1) : null
  const maxDso  = Math.max(...sorted.map(p => p.dso), 1)

  const deltaBadge = delta === null ? null : delta === 0 ? (
    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#64748b' }}>
      <Minus size={12} /> Sin cambio
    </span>
  ) : delta > 0 ? (
    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#ef4444' }}>
      <TrendingUp size={12} /> +{delta}d vs mes anterior
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#16a34a' }}>
      <TrendingDown size={12} /> {delta}d vs mes anterior
    </span>
  )

  return (
    <div style={{
      background: 'white', borderRadius: '16px',
      border: '1px solid #E2E8F0', borderTop: '3px solid #003B5C',
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="px-6 py-4 flex items-center justify-between"
           style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(0,59,92,0.08)' }}>
            <Timer size={15} style={{ color: '#003B5C' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Evolución DSO</h2>
            <p className="text-xs text-gray-400">
              Días de cobro · basado en ventas reales por período
            </p>
          </div>
        </div>

        {/* Delta + valor actual */}
        <div className="flex items-center gap-3">
          {deltaBadge}
          <div className="text-right">
            <div className="text-xl font-black tabular-nums"
                 style={{ color: colorDso(ultimo.dso), lineHeight: 1.1 }}>
              {ultimo.dso.toFixed(1)}d
            </div>
            <div className="text-[10px] text-gray-400 font-medium">
              {MESES[ultimo.mes - 1]} {String(ultimo.anio).slice(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Barras por mes ───────────────────────────────────────────── */}
      <div className="px-6 py-4">
        <div className="flex items-end gap-2">
          {sorted.map((p, i) => {
            const barH  = maxDso > 0 ? Math.max(Math.round((p.dso / maxDso) * 80), 12) : 12
            const color = colorDso(p.dso)
            const isLast = i === sorted.length - 1
            const label = `${MESES[p.mes - 1]} ${String(p.anio).slice(2)}`
            return (
              <div key={`${p.anio}-${p.mes}`}
                   className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                {/* Valor */}
                <span className="text-[11px] font-black tabular-nums"
                      style={{ color: isLast ? color : '#94a3b8' }}>
                  {p.dso.toFixed(1)}d
                </span>
                {/* Barra */}
                <div className="w-full relative flex items-end justify-center"
                     style={{ height: '88px' }}>
                  <div
                    className="w-full rounded-t-md transition-all duration-700"
                    style={{
                      height:     `${barH}px`,
                      background: isLast ? color : `${color}60`,
                      outline:    isLast ? `2px solid ${color}` : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                </div>
                {/* Label mes */}
                <span className="text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: isLast ? '#1e293b' : '#94a3b8' }}>
                  {label}
                </span>
                {/* Badge estimado */}
                {p.esEstimado && (
                  <span className="text-[8px] font-bold uppercase"
                        style={{ color: '#cbd5e1' }}>
                    est.
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Líneas de referencia */}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
            &gt;45d — Crítico
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />
            35–45d — Atención
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#16a34a' }} />
            ≤35d — Saludable
          </span>
          <span className="ml-auto text-[10px] text-gray-300 font-medium italic">
            * meses sin snapshot real de cartera usan valor actual
          </span>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="px-6 py-3 flex items-center justify-between"
           style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9' }}>
        <span className="text-xs text-gray-400">
          Benchmark sector ferretero costarricense
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>≤35d</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>35–45d</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs font-semibold" style={{ color: '#ef4444' }}>&gt;45d</span>
        </div>
      </div>
    </div>
  )
}
