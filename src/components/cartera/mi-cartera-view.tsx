'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Search, AlertTriangle, TrendingUp, Clock, Calendar,
  CheckCircle2, ChevronRight, Target, Zap,
} from 'lucide-react'
import { fmtCRC } from '@/lib/utils/formato'
import type { CarteraRow, KPIs } from '@/app/(app)/mi-cartera/page'

// ── Config visual ──────────────────────────────────────────────────────
type Prioridad = CarteraRow['prioridad']

const PRIORIDAD_CFG: Record<Prioridad, {
  label: string; bar: string; dot: string; bg: string; text: string; border: string
}> = {
  critico:     { label: 'Crítico',     bar: '#dc2626', dot: '#dc2626', bg: 'rgba(220,38,38,0.10)',  text: '#dc2626', border: 'rgba(220,38,38,0.25)'  },
  urgente:     { label: 'Urgente',     bar: '#f97316', dot: '#f97316', bg: 'rgba(249,115,22,0.10)', text: '#f97316', border: 'rgba(249,115,22,0.25)'  },
  seguimiento: { label: 'Seguimiento', bar: '#f59e0b', dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)', text: '#ca8a04', border: 'rgba(245,158,11,0.25)'  },
  rutina:      { label: 'Rutina',      bar: '#22c55e', dot: '#22c55e', bg: 'rgba(34,197,94,0.10)',  text: '#15803d', border: 'rgba(34,197,94,0.25)'   },
}

const TRAMO_CFG: Record<string, { bg: string; text: string }> = {
  'Al día':      { bg: 'rgba(0,158,227,0.12)',   text: '#0369a1' },
  '1-30 días':   { bg: 'rgba(245,158,11,0.12)',  text: '#92400e' },
  '31-60 días':  { bg: 'rgba(249,115,22,0.12)',  text: '#c2410c' },
  '61-90 días':  { bg: 'rgba(239,68,68,0.12)',   text: '#b91c1c' },
  '91-120 días': { bg: 'rgba(220,38,38,0.12)',   text: '#991b1b' },
  '+120 días':   { bg: 'rgba(153,27,27,0.15)',   text: '#7f1d1d' },
}

// ── Tipos internos ──────────────────────────────────────────────────────
type TabId           = 'agenda' | 'cartera'
type FiltroPrioridad = 'todos' | Prioridad
type FiltroGestion   = 'todos' | 'pendientes' | 'hoy'

// ── Helpers ──────────────────────────────────────────────────────────────
function labelContacto(dias: number): { label: string; color: string } {
  if (dias === 0)   return { label: 'Hoy',         color: '#15803d' }
  if (dias === 1)   return { label: 'Ayer',         color: '#64748b' }
  if (dias <= 6)    return { label: `${dias}d`,     color: '#64748b' }
  if (dias <= 13)   return { label: `${dias}d`,     color: '#ca8a04' }
  if (dias === 999) return { label: 'Sin gestión',  color: '#dc2626' }
  return                   { label: `${dias}d`,     color: '#dc2626' }
}

function fmtFechaCorta(iso: string): string {
  const p = iso.slice(0, 10).split('-')
  return `${p[2]}/${p[1]}`
}

// ── Columnas tabla (header + fila comparten el mismo grid) ─────────────
const GRID = '18px 1fr 150px 110px 46px 118px 88px'

// ── Props ────────────────────────────────────────────────────────────────
interface Props {
  rows: CarteraRow[]
  kpis: KPIs
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function MiCarteraView({ rows, kpis }: Props) {
  const [tab,             setTab]             = useState<TabId>('agenda')
  const [busquedaAgenda,  setBusquedaAgenda]  = useState('')
  const [busqueda,        setBusqueda]        = useState('')
  const [filtroPrioridad, setFiltroPrioridad] = useState<FiltroPrioridad>('todos')
  const [filtroGestion,   setFiltroGestion]   = useState<FiltroGestion>('todos')

  // ── Agenda del Día ─────────────────────────────────────────────────
  const { agendaActivos, agendaHoy } = useMemo(() => {
    const match = (r: CarteraRow) => {
      if (!r.en_agenda) return false
      if (busquedaAgenda) {
        const q = busquedaAgenda.toLowerCase()
        if (
          !r.cliente_nombre.toLowerCase().includes(q) &&
          !r.cliente_cod.toLowerCase().includes(q)
        ) return false
      }
      return true
    }
    const filtered = rows.filter(match)
    return {
      agendaActivos: filtered.filter(r => !r.gestionado_hoy),
      agendaHoy:     filtered.filter(r =>  r.gestionado_hoy),
    }
  }, [rows, busquedaAgenda])

  const totalAgenda = useMemo(() => rows.filter(r => r.en_agenda).length, [rows])

  // ── Mi Cartera Completa ────────────────────────────────────────────
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

  const cuentaPri = useMemo(() => {
    const c: Record<Prioridad, number> = { critico: 0, urgente: 0, seguimiento: 0, rutina: 0 }
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
            TABS
        ════════════════════════════════ */}
        <div
          className="flex gap-0.5 rounded-xl p-1 w-fit"
          style={{ backgroundColor: '#e2e8f0' }}
        >
          {([
            { id: 'agenda'  as TabId, label: 'Agenda del Día',      count: totalAgenda },
            { id: 'cartera' as TabId, label: 'Mi Cartera Completa',  count: rows.length },
          ]).map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-semibold transition-all whitespace-nowrap"
              style={{
                backgroundColor: tab === id ? 'white'       : 'transparent',
                color:           tab === id ? '#1e293b'     : '#94a3b8',
                boxShadow:       tab === id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {label}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                style={{
                  backgroundColor: tab === id ? '#009ee3' : '#cbd5e1',
                  color: 'white',
                  minWidth: '18px',
                  textAlign: 'center',
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* ════════════════════════════════
            TAB: AGENDA DEL DÍA
        ════════════════════════════════ */}
        {tab === 'agenda' && (
          <AgendaTab
            activos={agendaActivos}
            hoy={agendaHoy}
            busqueda={busquedaAgenda}
            onBusqueda={setBusquedaAgenda}
            totalRows={rows.length}
          />
        )}

        {/* ════════════════════════════════
            TAB: MI CARTERA COMPLETA
        ════════════════════════════════ */}
        {tab === 'cartera' && (
          <CarteraTab
            rows={rows}
            rowsFiltradas={rowsFiltradas}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            filtroPrioridad={filtroPrioridad}
            onFiltroPrioridad={setFiltroPrioridad}
            filtroGestion={filtroGestion}
            onFiltroGestion={setFiltroGestion}
            cuentaPri={cuentaPri}
            cuentaGes={cuentaGes}
          />
        )}

      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: AGENDA DEL DÍA
// ══════════════════════════════════════════════════════════════════════════
function AgendaTab({
  activos, hoy, busqueda, onBusqueda, totalRows,
}: {
  activos:    CarteraRow[]
  hoy:        CarteraRow[]
  busqueda:   string
  onBusqueda: (v: string) => void
  totalRows:  number
}) {
  const totalAgenda = activos.length + hoy.length

  if (totalRows === 0) {
    return (
      <EmptyState
        icon={<Target size={40} />}
        title="No hay clientes asignados a tu cartera"
        sub="Contactá al coordinador para revisar la asignación"
      />
    )
  }

  return (
    <div className="space-y-3">
      {/* Barra de búsqueda + conteo */}
      <div className="flex items-center gap-3">
        <div className="relative" style={{ flex: '1 1 220px', maxWidth: '280px' }}>
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusqueda(e.target.value)}
            placeholder="Buscar en la agenda…"
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          />
        </div>
        {totalAgenda > 0 && (
          <span className="text-[11px] text-gray-400">
            {activos.length} pendiente{activos.length !== 1 ? 's' : ''}
            {hoy.length > 0
              ? ` · ${hoy.length} gestionado${hoy.length !== 1 ? 's' : ''} hoy`
              : ''}
          </span>
        )}
      </div>

      {totalAgenda === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={40} />}
          title="¡Agenda del día completada!"
          sub="No hay clientes que requieran gestión prioritaria hoy"
          success
        />
      ) : (
        <>
          {/* Cards pendientes */}
          {activos.length > 0 && (
            <div className="space-y-2">
              {activos.map(row => (
                <AgendaCard key={row.cliente_cod} row={row} />
              ))}
            </div>
          )}

          {/* Separador + cards gestionados hoy */}
          {hoy.length > 0 && (
            <>
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-dashed border-gray-200" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  ✓ Gestionados hoy ({hoy.length})
                </span>
                <div className="flex-1 border-t border-dashed border-gray-200" />
              </div>
              <div className="space-y-2">
                {hoy.map(row => (
                  <AgendaCard key={row.cliente_cod} row={row} gestionadoHoy />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Tarjeta de agenda ────────────────────────────────────────────────────
function AgendaCard({ row, gestionadoHoy }: { row: CarteraRow; gestionadoHoy?: boolean }) {
  const priCfg   = PRIORIDAD_CFG[row.prioridad]
  const tramoCfg = TRAMO_CFG[row.tramo_peor] ?? TRAMO_CFG['Al día']
  const uc       = labelContacto(row.dias_sin_gestion)

  return (
    <div
      className="bg-white rounded-xl border overflow-hidden flex transition-shadow hover:shadow-sm"
      style={{
        borderColor: gestionadoHoy ? '#e2e8f0' : priCfg.border,
        borderWidth: '0.5px',
        opacity:     gestionadoHoy ? 0.45 : 1,
      }}
    >
      {/* Barra de color izquierda */}
      <div
        className="flex-shrink-0"
        style={{
          width:           '4px',
          backgroundColor: gestionadoHoy ? '#d1d5db' : priCfg.bar,
        }}
      />

      {/* Contenido */}
      <div className="flex-1 px-4 py-3 min-w-0">
        {/* Fila 1: nombre + badge */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className="text-[14px] font-bold text-gray-800 leading-tight truncate">
            {row.cliente_nombre}
          </span>
          {gestionadoHoy ? (
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
              style={{
                backgroundColor: 'rgba(34,197,94,0.12)',
                color:           '#15803d',
                border:          '1px solid rgba(34,197,94,0.25)',
              }}
            >
              <CheckCircle2 size={10} />
              Hoy
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold flex-shrink-0"
              style={{
                backgroundColor: priCfg.bg,
                color:           priCfg.text,
                border:          `1px solid ${priCfg.border}`,
              }}
            >
              {priCfg.label}
            </span>
          )}
        </div>

        {/* Fila 2: código · vendedor */}
        <p className="text-[11px] text-gray-400 mb-2 leading-tight">
          <span className="font-mono">{row.cliente_cod}</span>
          {' · '}
          <span>Vendedor: {row.vendedor_nombre}</span>
        </p>

        {/* Fila 3: motivo (solo si no fue gestionado hoy) */}
        {!gestionadoHoy && row.motivo && (
          <div
            className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 mb-3"
            style={{
              backgroundColor: priCfg.bg,
              borderLeft:      `3px solid ${priCfg.bar}`,
            }}
          >
            <Zap
              size={11}
              className="flex-shrink-0 mt-px"
              style={{ color: priCfg.bar }}
            />
            <span
              className="text-[11px] font-medium leading-tight"
              style={{ color: priCfg.text }}
            >
              {row.motivo}
            </span>
          </div>
        )}

        {/* Fila 4: stats + botón */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Stats */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Mora */}
            <StatChip label="Mora">
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: row.mora_total > 0 ? '#1e293b' : '#d1d5db' }}
              >
                {row.mora_total > 0 ? fmtCRC(row.mora_total) : '—'}
              </span>
            </StatChip>

            <Divider />

            {/* Tramo */}
            <StatChip label="Tramo">
              <span
                className="inline-block text-[10px] font-semibold rounded px-1.5 py-0.5"
                style={{ backgroundColor: tramoCfg.bg, color: tramoCfg.text }}
              >
                {row.tramo_peor}
              </span>
            </StatChip>

            <Divider />

            {/* Último contacto */}
            <StatChip label="Últ. contacto">
              <span className="text-[11px] font-semibold" style={{ color: uc.color }}>
                {uc.label}
              </span>
            </StatChip>

            {/* Promesa (si existe) */}
            {row.promesa_activa && row.promesa_fecha && (
              <>
                <Divider />
                <StatChip label="Promesa">
                  <span className="text-[11px] font-semibold" style={{ color: '#d97706' }}>
                    {fmtFechaCorta(row.promesa_fecha)}
                  </span>
                </StatChip>
              </>
            )}
          </div>

          {/* Botón acción (oculto si ya fue gestionado hoy) */}
          {!gestionadoHoy && (
            <Link
              href={`/clientes/${encodeURIComponent(row.cliente_cod)}?from=mi-cartera`}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold transition hover:opacity-85 whitespace-nowrap flex-shrink-0"
              style={{ backgroundColor: '#009ee3', color: 'white' }}
            >
              Gestionar cliente
              <ChevronRight size={10} />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: MI CARTERA COMPLETA
// ══════════════════════════════════════════════════════════════════════════
function CarteraTab({
  rows, rowsFiltradas, busqueda, onBusqueda,
  filtroPrioridad, onFiltroPrioridad,
  filtroGestion, onFiltroGestion,
  cuentaPri, cuentaGes,
}: {
  rows:              CarteraRow[]
  rowsFiltradas:     CarteraRow[]
  busqueda:          string
  onBusqueda:        (v: string) => void
  filtroPrioridad:   FiltroPrioridad
  onFiltroPrioridad: (v: FiltroPrioridad) => void
  filtroGestion:     FiltroGestion
  onFiltroGestion:   (v: FiltroGestion) => void
  cuentaPri:         Record<Prioridad, number>
  cuentaGes:         { pendientes: number; hoy: number }
}) {
  return (
    <div className="space-y-3">

      {/* ── Barra de filtros ──────────────────────────────────── */}
      <div
        className="bg-white rounded-xl border shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center"
        style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
      >
        {/* Búsqueda */}
        <div className="relative" style={{ flex: '1 1 180px', minWidth: '160px' }}>
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={busqueda}
            onChange={e => onBusqueda(e.target.value)}
            placeholder="Buscar cliente o código…"
            className="w-full rounded-lg border pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-300 transition"
            style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
          />
        </div>

        {/* Pills de prioridad */}
        <div className="flex gap-1.5 flex-wrap">
          {(['todos', 'critico', 'urgente', 'seguimiento', 'rutina'] as const).map(p => {
            const cfg    = p !== 'todos' ? PRIORIDAD_CFG[p] : null
            const count  = p === 'todos' ? rows.length : cuentaPri[p]
            const active = filtroPrioridad === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => onFiltroPrioridad(p)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? (cfg?.bg ?? 'rgba(0,158,227,0.12)') : '#f1f5f9',
                  color:           active ? (cfg?.text ?? '#009ee3')             : '#94a3b8',
                  border:          active
                    ? `1px solid ${cfg?.border ?? 'rgba(0,158,227,0.3)'}`
                    : '1px solid transparent',
                }}
              >
                {cfg && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cfg.dot }}
                  />
                )}
                {p === 'todos' ? 'Todos' : cfg!.label}
                <span className="ml-0.5 opacity-50">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Toggle gestión */}
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ backgroundColor: '#f1f5f9' }}
        >
          {([
            { val: 'todos'      as FiltroGestion, label: 'Todos'                                },
            { val: 'pendientes' as FiltroGestion, label: `Pendientes (${cuentaGes.pendientes})` },
            { val: 'hoy'        as FiltroGestion, label: `Gestionados hoy (${cuentaGes.hoy})`   },
          ]).map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => onFiltroGestion(val)}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all whitespace-nowrap"
              style={{
                backgroundColor: filtroGestion === val ? 'white'       : 'transparent',
                color:           filtroGestion === val ? '#374151'     : '#94a3b8',
                boxShadow:       filtroGestion === val
                  ? '0 1px 2px rgba(0,0,0,0.06)'
                  : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────── */}
      {rowsFiltradas.length === 0 ? (
        <EmptyState
          icon={<Target size={40} />}
          title={
            rows.length === 0
              ? 'No hay clientes asignados a tu cartera'
              : 'Sin resultados para estos filtros'
          }
          sub={
            rows.length === 0
              ? 'Contactá al coordinador para revisar la asignación'
              : 'Probá ampliando los criterios de búsqueda'
          }
        />
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
                    gap:                 '10px',
                    backgroundColor:     row.gestionado_hoy ? '#f0fdf4'   : undefined,
                    opacity:             row.gestionado_hoy ? 0.7          : 1,
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

                  {/* ICP */}
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
                      href={`/clientes/${encodeURIComponent(row.cliente_cod)}?from=mi-cartera`}
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
  )
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTES UTILITARIOS
// ══════════════════════════════════════════════════════════════════════════

function StatChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] text-gray-400 leading-none whitespace-nowrap">{label}:</span>
      <span className="leading-none">{children}</span>
    </div>
  )
}

function Divider() {
  return (
    <span
      className="flex-shrink-0"
      style={{ width: '1px', height: '12px', backgroundColor: '#e2e8f0' }}
    />
  )
}

function EmptyState({
  icon, title, sub, success,
}: {
  icon:     React.ReactNode
  title:    string
  sub:      string
  success?: boolean
}) {
  return (
    <div
      className="bg-white rounded-xl border shadow-sm px-6 py-14 flex flex-col items-center text-center"
      style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}
    >
      <div className="mb-3" style={{ color: success ? '#22c55e' : '#e2e8f0' }}>{icon}</div>
      <p className="text-[14px] font-semibold text-gray-500 mb-1">{title}</p>
      <p className="text-[12px] text-gray-400">{sub}</p>
    </div>
  )
}

// ── KpiCard ──────────────────────────────────────────────────────────────
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
