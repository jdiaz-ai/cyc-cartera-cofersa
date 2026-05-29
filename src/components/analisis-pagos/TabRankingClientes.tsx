'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import KPICardAnalisis from './KPICardAnalisis'
import ICPBar         from './ICPBar'
import ICPBadge       from './ICPBadge'
import type { RankingResult, RankingRow, IcpClasificacion } from '@/types/analisis-pagos'

const PER_PAGE = 25

const CLASIFICACIONES: IcpClasificacion[] = ['EXCELENTE','BUENO','REGULAR','MALO','MUY MALO']

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-100 h-24 animate-pulse" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-slate-100 h-10 animate-pulse" />
      <div className="bg-white rounded-xl border border-slate-100 h-64 animate-pulse" />
    </div>
  )
}

interface Props {
  periodo:   number
  userEmail: string | null
}

export default function TabRankingClientes({ periodo, userEmail }: Props) {
  const [data,        setData]        = useState<RankingResult | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [page,        setPage]        = useState(1)
  const [busqueda,    setBusqueda]    = useState('')
  const [clasificacion, setClasificacion] = useState<string>('')
  const [dimension,   setDimension]   = useState<string>('')
  const [orden,       setOrden]       = useState<string>('icp_asc')
  const [inputValue,  setInputValue]  = useState('')

  // Debounce búsqueda
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(inputValue), 400)
    return () => clearTimeout(t)
  }, [inputValue])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc(
        'fn_analisis_ranking_clientes',
        {
          p_email:         userEmail ?? null,
          p_meses:         periodo,
          p_offset:        (page - 1) * PER_PAGE,
          p_limit:         PER_PAGE,
          p_clasificacion: clasificacion || null,
          p_dimension:     dimension     || null,
          p_busqueda:      busqueda      || null,
          p_orden:         orden,
        }
      )
      if (err) throw err
      setData(result as RankingResult)
    } catch {
      setError('Error al cargar el ranking. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [userEmail, periodo, page, busqueda, clasificacion, dimension, orden])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset page cuando cambian los filtros o el período
  useEffect(() => { setPage(1) }, [busqueda, clasificacion, dimension, orden, periodo])

  if (loading) return <Skeleton />
  if (error)   return (
    <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
      <p className="text-red-600 font-semibold text-sm">{error}</p>
      <button onClick={fetchData} className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline">Reintentar</button>
    </div>
  )
  if (!data)   return null

  const { kpis, total, rows } = data
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="space-y-4">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICardAnalisis
          label="ICP promedio cartera"
          valor={`${kpis.icp_promedio}`}
          sub="sobre 100 puntos"
          color="#009ee3"
        />
        <KPICardAnalisis
          label="Pagan a tiempo"
          valor={`${kpis.pct_pagan_tiempo}%`}
          sub="pagan antes o en fecha"
          color="#16a34a"
        />
        <KPICardAnalisis
          label="Pagadores críticos"
          valor={String(kpis.criticos_count)}
          sub="ICP < 25 — MUY MALO"
          color="#dc2626"
        />
        <KPICardAnalisis
          label="Días atraso prom."
          valor={`${kpis.dias_atraso_promedio}d`}
          sub="ponderado por período"
          color="#f59e0b"
        />
      </div>

      {/* Filtros */}
      <div
        className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex flex-wrap gap-3 items-center"
      >
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
        </div>

        {/* Clasificación ICP */}
        <select
          value={clasificacion}
          onChange={e => setClasificacion(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '140px' }}
        >
          <option value="">Todas las clasificaciones</option>
          {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Dimensión */}
        <select
          value={dimension}
          onChange={e => setDimension(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '130px' }}
        >
          <option value="">Todas las dimensiones</option>
          <option value="Grandes">Grandes</option>
          <option value="Medianos">Medianos</option>
          <option value="Pequeños">Pequeños</option>
          <option value="Canal Moderno">Canal Moderno</option>
        </select>

        {/* Ordenar */}
        <select
          value={orden}
          onChange={e => setOrden(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none"
          style={{ minWidth: '200px' }}
        >
          <option value="icp_asc">ICP ascendente (peores primero)</option>
          <option value="icp_desc">ICP descendente (mejores primero)</option>
          <option value="dias_asc">Más días de atraso</option>
          <option value="cartera_desc">Mayor cartera</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {/* Sub-header */}
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            {total.toLocaleString()} cliente{total !== 1 ? 's' : ''} con historial de pagos
          </span>
          <span className="text-[11px] text-gray-400">Período: últimos {periodo} meses</span>
        </div>

        {/* Encabezados */}
        <div className="hidden md:grid px-4 py-2 border-b border-gray-100 bg-slate-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
             style={{ gridTemplateColumns: '36px minmax(160px,2fr) minmax(120px,1fr) 180px 130px 110px 130px' }}>
          <span>#</span>
          <span>Cliente</span>
          <span>Vendedor</span>
          <span className="text-center">Score ICP</span>
          <span className="text-center">Clasificación</span>
          <span className="text-right">Días atraso</span>
          <span className="text-right">Mora activa</span>
        </div>

        {/* Filas */}
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400">Sin clientes para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map((row: RankingRow, idx: number) => (
              <RankingFila
                key={row.cliente_cod}
                row={row}
                num={(page - 1) * PER_PAGE + idx + 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl border border-slate-100 flex items-center justify-between px-4 py-2.5">
          <span className="text-[11px] text-gray-400">
            {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p-1)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition disabled:opacity-40"
              style={{ color: '#374151' }}
            >
              <ChevronLeft size={12} /> Anterior
            </button>
            <span className="text-[12px] font-bold text-gray-700 px-2">{page} / {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p+1)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition disabled:opacity-40"
              style={{ color: '#374151' }}
            >
              Siguiente <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Fila individual ────────────────────────────────────────────────────────────

function RankingFila({ row, num }: { row: RankingRow; num: number }) {
  const tendIcon =
    row.tendencia_3m < -3  ? <TrendingDown size={12} style={{ color: '#dc2626' }} /> :
    row.tendencia_3m >  3  ? <TrendingUp   size={12} style={{ color: '#16a34a' }} /> :
                             <Minus        size={12} style={{ color: '#94a3b8' }} />

  const tendLabel =
    row.tendencia_3m < -3  ? `▼ ${Math.abs(Math.round(row.tendencia_3m))} pts` :
    row.tendencia_3m >  3  ? `▲ ${Math.abs(Math.round(row.tendencia_3m))} pts`  :
                             '— sin cambio'

  const tendColor =
    row.tendencia_3m < -3  ? '#dc2626' :
    row.tendencia_3m >  3  ? '#16a34a' : '#94a3b8'

  return (
    <div
      className="grid px-4 py-3 items-center hover:bg-slate-50/60 transition-colors"
      style={{ gridTemplateColumns: '36px minmax(160px,2fr) minmax(120px,1fr) 180px 130px 110px 130px', gap: '8px' }}
    >
      {/* # */}
      <span className="text-[11px] text-gray-300 font-bold tabular-nums">{num}</span>

      {/* Cliente */}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-800 truncate leading-tight">{row.cliente_nombre}</p>
        <p className="text-[10px] font-mono text-gray-400">{row.cliente_cod}</p>
      </div>

      {/* Vendedor */}
      <p className="text-[11px] text-gray-500 truncate">{row.vendedor_nombre}</p>

      {/* Score ICP con barra */}
      <div className="hidden md:block">
        <ICPBar score={row.icp_score} />
      </div>

      {/* Clasificación */}
      <div className="hidden md:flex justify-center">
        <ICPBadge clasificacion={row.clasificacion} size="sm" />
      </div>

      {/* Días atraso + tendencia */}
      <div className="hidden md:block text-right">
        <span className="text-[12px] font-bold tabular-nums text-gray-700">{row.dias_atraso_prom}d</span>
        <div className="flex items-center justify-end gap-0.5 mt-0.5">
          {tendIcon}
          <span className="text-[9px] font-semibold tabular-nums" style={{ color: tendColor }}>
            {tendLabel}
          </span>
        </div>
      </div>

      {/* Mora activa (sync más reciente) */}
      <div className="hidden md:block text-right">
        {row.cartera_actual > 0 ? (
          <span className="text-[11px] font-semibold tabular-nums text-gray-700">
            {fmtCRC(row.cartera_actual)}
          </span>
        ) : (
          <span className="text-[11px] text-gray-300">Al día</span>
        )}
      </div>
    </div>
  )
}
