'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, AlertTriangle, TrendingUp, Clock, Calendar,
  CheckCircle2, ChevronRight, Target,
} from 'lucide-react'
import { fmtCRC } from '@/lib/utils/formato'
import type { CarteraRow, KPIs } from '@/app/(app)/mi-cartera/page'

// ── Config visual ─────────────────────────────────────────────────────
type Prioridad = CarteraRow['prioridad']

const PRIORIDAD_CFG: Record<Prioridad, {
  label: string; dot: string; bg: string; text: string; border: string
}> = {
  critico:     { label: 'Crítico',     dot: '#dc2626', bg: 'rgba(220,38,38,0.10)',  text: '#dc2626', border: 'rgba(220,38,38,0.25)'  },
  urgente:     { label: 'Urgente',     dot: '#f97316', bg: 'rgba(249,115,22,0.10)', text: '#f97316', border: 'rgba(249,115,22,0.25)'  },
  seguimiento: { label: 'Seguimiento', dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)', text: '#ca8a04', border: 'rgba(245,158,11,0.25)'  },
  rutina:      { label: 'Rutina',      dot: '#22c55e', bg: 'rgba(34,197,94,0.10)',  text: '#15803d', border: 'rgba(34,197,94,0.25)'   },
}

const TRAMO_CFG: Record<string, { bg: string; text: string }> = {
  'Al día':      { bg: 'rgba(0,158,227,0.12)',   text: '#0369a1' },
  '1-30 días':   { bg: 'rgba(245,158,11,0.12)',  text: '#92400e' },
  '31-60 días':  { bg: 'rgba(249,115,22,0.12)',  text: '#c2410c' },
  '61-90 días':  { bg: 'rgba(239,68,68,0.12)',   text: '#b91c1c' },
  '91-120 días': { bg: 'rgba(220,38,38,0.12)',   text: '#991b1b' },
  '+120 días':   { bg: 'rgba(153,27,27,0.15)',   text: '#7f1d1d' },
}

// ── Tipos internos ─────────────────────────────────────────────────────
type FiltroPrioridad = 'todos' | Prioridad
type FiltroGestion   = 'todos' | 'pendientes' | 'hoy'

// ── Helpers ────────────────────────────────────────────────────────────
function labelContacto(dias: number): { label: string; color: string } {
  if (dias === 0)   return { label: 'Hoy',        color: '#15803d' }
  if (dias === 1)   return { label: 'Ayer',        color: '#64748b' }
  if (dias <= 6)    return { label: `${dias}d`,    color: '#64748b' }
  if (dias <= 13)   return { label: `${dias}d`,    color: '#ca8a04' }
  if (dias === 999) return { label: 'Sin gestión', color: '#dc2626' }
  return               { label: `${dias}d`,        color: '#dc2626' }
}

function fmtFechaCorta(iso: string): string {
  // "2026-05-15" → "15/05"
  const p = iso.slice(0, 10).split('-')
  return `${p[2]}/${p[1]}`
}

// ── Columnas de la tabla (header + row comparten el mismo grid) ────────
const GRID = '18px 1fr 150px 110px 46px 118px 88px'

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  rows: CarteraRow[]
  kpis: KPIs
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function MiCarteraView({ rows, kpis }: Props) {
  const [busqueda,        setBusqueda]        = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState<FiltroPrioridad>('todos')
  const [filtroGestion,   setFiltroGestion]   = useState<FiltroGestion>('todos')

  // ── Filtrado reactivo ──────────────────────────────────────────────
  const rowsFiltradas = useMemo(() => {
    return rows.filter(r => {
      if (busqueda) {
        const q = busqueda.toLowerCase()
        if (
          !r.cliente_nombre.toLowerCase().includes(q) &&
          !r.cliente_cod.toLowerCase().includes(q)
        ) return false
      }
      if (filtroPrioridad !== 'todos' && r.prioridad !== filtroPrioridad) return false
      if (filtroGestion === 'pendientes' && r.gestionado_hoy)  return false
      if (filtroGestion === 'hoy'        && !r.gestionado_hoy) return false
      return true
    })
  }, [rows, busqueda, filtroPrioridad, filtroGestion])

  // ── Conteos para badges ────────────────────────────────────────────
  const cuentaPri = useMemo(() => {
    const c = { critico: 0, urgente: 0, seguimiento: 0, rutina: 0 }
    rows.forEach(r => c[r.prioridad]++)
    return c
  }, [rows])

  const cuentaGes = useMemo(() => ({
    pendientes: rows.filter(r => !r.gestionado_hoy).length,
    hoy:        rows.filter(r =>  r.gestionado_hoy).length,
  }), [rows])

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">

        {/* ════════════════════════════════
            KPI CARDS
        ════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Mi mora total"
            valor={fmtCRC(kpis.moraTotal)}
            sub={kpis.moraTotal > 0 ? 'en tu cartera' : 'Sin mora activa'}
            color={kpis.moraTotal > 0 ? '#dc2626' : '#15803d'}
            icon={<AlertTriangle size={14} />}
          />
          <KpiCard
            label="Recuperado este mes"
            valor={fmtCRC(kpis.recuperadoMes)}
            sub="promesas cumplidas"
            color="#15803d"
            icon={<TrendingUp size={14} />}
            muted={kpis.recuperadoMes === 0}
          />
          <KpiCard
            label="Promesas activas"
            valor={String(kpis.promesasActivas)}
            sub="clientes con promesa"
            color={kpis.promesasActivas > 0 ? '#ca8a04' : '#15803d'}
            icon={<Calendar size={14} />}
          />
          <KpiCard
            label="Sin gestión +7d"
            valor={String(kpis.sinGestion7d)}
            sub="clientes a contactar"
            color={kpis.sinGestion7d > 0 ? '#dc2626' : '#15803d'}
            icon={<Clock size={14} />}
          />
        </div>

        {/* ════════════════════════════════
            BARRA DE FILTROS
        ════════════════════════════════ */}
        <div
          className="bg-white rounded-xl border shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center"
          style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
        >
          {/* Búsqueda */}
          <div className="relative" style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o código…"
              className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition"
              style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
            />
          </div>

          {/* Pills de prioridad */}
          <div className="flex gap-1.5 flex-wrap">
            {(['todos', 'critico', 'urgente', 'seguimiento', 'rutina'] as const).map(p => {
              const cfg     = p !== 'todos' ? PRIORIDAD_CFG[p] : null
              const count   = p === 'todos' ? rows.length : cuentaPri[p]
              const active  = filtroPrioridad === p
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFiltroPrioridad(p)}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
                  style={{
                    backgroundColor: active ? (cfg?.bg ?? 'rgba(0,158,227,0.12)') : '#f1f5f9',
                    color:           active ? (cfg?.text ?? '#009ee3')             : '#94a3b8',
                    border:          active ? `1px solid ${cfg?.border ?? 'rgba(0,158,227,0.3)'}` : '1px solid transparent',
                  }}
                >
                  {cfg && (
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cfg.dot }} />
                  )}
                  {p === 'todos' ? 'Todos' : cfg!.label}
                  <span className="ml-0.5 opacity-50">({count})</span>
                </button>
              )
            })}
          </div>

          {/* Toggle gestión */}
          <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: '#f1f5f9' }}>
            {([
              { val: 'todos'      as FiltroGestion, label: 'Todos'                              },
              { val: 'pendientes' as FiltroGestion, label: `Pendientes (${cuentaGes.pendientes})` },
              { val: 'hoy'        as FiltroGestion, label: `Gestionados hoy (${cuentaGes.hoy})`  },
            ]).map(({ val, label }) => (
              <button
                key={val}
                type="button"
                onClick={() => setFiltroGestion(val)}
                className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: filtroGestion === val ? 'white' : 'transparent',
                  color:           filtroGestion === val ? '#374151' : '#94a3b8',
                  boxShadow:       filtroGestion === val ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════
            TABLA
        ════════════════════════════════ */}
        {rowsFiltradas.length === 0 ? (
          <div
            className="bg-white rounded-xl border shadow-sm px-6 py-14 flex flex-col items-center text-center"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          >
            <Target size={40} className="mb-3" style={{ color: '#e2e8f0' }} />
            <p className="text-[14px] font-semibold text-gray-500 mb-1">
              {rows.length === 0
                ? 'No hay clientes asignados a tu cartera'
                : 'Sin resultados para estos filtros'}
            </p>
            <p className="text-[12px] text-gray-400">
              {rows.length === 0
                ? 'Contactá al coordinador para revisar la asignación'
                : 'Probá ampliando los criterios de búsqueda'}
            </p>
          </div>
        ) : (
          <div
            className="bg-white rounded-xl border shadow-sm overflow-hidden"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          >
            {/* Sub-header */}
            <div
              className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between"
              style={{ backgroundColor: '#f8fafc' }}
            >
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {rowsFiltradas.length} cliente{rowsFiltradas.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] text-gray-400 italic">
                Orden: urgencia → mora
              </span>
            </div>

            {/* Encabezados de columna */}
            <div
              className="grid items-center px-4 py-2 border-b border-gray-100"
              style={{ gridTemplateColumns: GRID, gap: '10px', backgroundColor: '#f8fafc' }}
            >
              <div />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Mora total</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tramo aging</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">ICP</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Último contacto</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Acción</span>
            </div>

            {/* Filas */}
            <div className="divide-y divide-gray-50">
              {rowsFiltradas.map(row => {
                const priCfg   = PRIORIDAD_CFG[row.prioridad]
                const tramoCfg = TRAMO_CFG[row.tramo_peor] ?? TRAMO_CFG['Al día']
                const uc       = labelContacto(row.dias_sin_gestion)

                return (
                  <div
                    key={row.cliente_cod}
                    className="grid items-center px-4 py-3 transition-colors hover:bg-slate-50/60"
                    style={{
                      gridTemplateColumns: GRID,
                      gap: '10px',
                      backgroundColor: row.gestionado_hoy ? '#f0fdf4' : undefined,
                      opacity:         row.gestionado_hoy ? 0.7 : 1,
                    }}
                  >
                    {/* Indicador de prioridad */}
                    <div className="flex items-center justify-center">
                      <div
                        className="rounded-full flex-shrink-0"
                        title={priCfg.label}
                        style={{ width: '8px', height: '8px', backgroundColor: priCfg.dot }}
                      />
                    </div>

                    {/* Nombre + código */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                          {row.cliente_nombre}
                        </span>
                        {row.gestionado_hoy && (
                          <CheckCircle2 size={12} className="flex-shrink-0" style={{ color: '#22c55e' }} />
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono">{row.cliente_cod}</span>
                    </div>

                    {/* Mora total */}
                    <div className="text-right">
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: row.mora_total > 0 ? '#1e293b' : '#d1d5db' }}
                      >
                        {row.mora_total > 0 ? fmtCRC(row.mora_total) : '—'}
                      </span>
                    </div>

                    {/* Tramo aging */}
                    <div>
                      <span
                        className="inline-block text-[11px] font-semibold rounded px-2 py-0.5 whitespace-nowrap"
                        style={{ backgroundColor: tramoCfg.bg, color: tramoCfg.text }}
                      >
                        {row.tramo_peor}
                      </span>
                    </div>

                    {/* ICP — pendiente de datos históricos */}
                    <div className="text-center">
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: '#d1d5db' }}
                        title="Sin datos históricos aún"
                      >
                        —
                      </span>
                    </div>

                    {/* Último contacto */}
                    <div>
                      <span
                        className="text-[12px] font-semibold leading-tight"
                        style={{ color: uc.color }}
                      >
                        {uc.label}
                      </span>
                      {row.promesa_activa && row.promesa_fecha && (
                        <p className="text-[10px] mt-0.5 font-medium" style={{ color: '#d97706' }}>
                          Promesa: {fmtFechaCorta(row.promesa_fecha)}
                        </p>
                      )}
                    </div>

                    {/* Acción */}
                    <div className="flex justify-end">
                      <Link
                        href={`/clientes/${encodeURIComponent(row.cliente_cod)}`}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition hover:opacity-85 whitespace-nowrap"
                        style={{ backgroundColor: '#009ee3', color: 'white' }}
                      >
                        Ver ficha
                        <ChevronRight size={10} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── KpiCard ─────────────────────────────────────────────────────────────
function KpiCard({
  label, valor, sub, color, icon, muted,
}: {
  label:  string
  valor:  string
  sub:    string
  color:  string
  icon:   React.ReactNode
  muted?: boolean
}) {
  const displayColor = muted ? '#d1d5db' : color
  return (
    <div
      className="bg-white rounded-xl border shadow-sm px-4 py-3"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider leading-tight">
          {label}
        </span>
        <span style={{ color: displayColor }}>{icon}</span>
      </div>
      <p
        className="text-[20px] font-bold tabular-nums leading-tight"
        style={{ color: displayColor }}
      >
        {valor}
      </p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
