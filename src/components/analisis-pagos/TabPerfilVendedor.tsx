'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import KPICardAnalisis from './KPICardAnalisis'
import ICPBar         from './ICPBar'
import type { VendedorResult, VendedorRow } from '@/types/analisis-pagos'

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_,i) => <div key={i} className="bg-white rounded-xl border h-24 animate-pulse" />)}
      </div>
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  )
}

interface Props {
  periodo:   number
  userEmail: string | null
}

export default function TabPerfilVendedor({ periodo, userEmail }: Props) {
  const [data,    setData]    = useState<VendedorResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [orden,   setOrden]   = useState('icp_asc')
  const [supervisor, setSupervisor] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc(
        'fn_analisis_perfil_vendedor',
        { p_email: userEmail ?? null, p_meses: periodo, p_orden: orden }
      )
      if (err) throw err
      setData(result as VendedorResult)
    } catch { setError('Error al cargar datos de vendedores.') }
    finally   { setLoading(false) }
  }, [userEmail, periodo, orden])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Skeleton />
  if (error)   return (
    <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
      <p className="text-red-600 text-sm font-semibold">{error}</p>
    </div>
  )
  if (!data) return null

  const { kpis, rows } = data

  // Filtrar por supervisor si se seleccionó
  const supervisores = [...new Set(rows.map(r => r.supervisor_cod).filter(s => s && s !== '—'))].sort()
  const rowsFiltradas = supervisor ? rows.filter(r => r.supervisor_cod === supervisor) : rows

  return (
    <div className="space-y-4">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4" style={{ borderTop: '3px solid #16a34a' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Mejor ICP promedio</p>
          <p className="text-base font-black text-gray-800 truncate">{kpis.mejor_icp_vendedor || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{kpis.mejor_icp_valor} pts promedio</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4" style={{ borderTop: '3px solid #dc2626' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Mayor concentración riesgo</p>
          <p className="text-base font-black text-gray-800 truncate">{kpis.mayor_riesgo_vendedor || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{kpis.mayor_riesgo_pct}% clientes con ICP {'<'} 50</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4" style={{ borderTop: '3px solid #009ee3' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Mayor % pago puntual</p>
          <p className="text-base font-black text-gray-800 truncate">{kpis.mejor_puntual_vendedor || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{kpis.mejor_puntual_pct}% pagan a tiempo</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4" style={{ borderTop: '3px solid #f59e0b' }}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Peor días atraso prom.</p>
          <p className="text-base font-black text-gray-800 truncate">{kpis.peor_dias_vendedor || '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{kpis.peor_dias_valor}d promedio de atraso</p>
        </div>
      </div>

      {/* Controles */}
      <div className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex flex-wrap gap-3 items-center">
        {supervisores.length > 0 && (
          <select
            value={supervisor}
            onChange={e => setSupervisor(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
            style={{ minWidth: '160px' }}
          >
            <option value="">Todos los supervisores</option>
            {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          value={orden}
          onChange={e => setOrden(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
          style={{ minWidth: '200px' }}
        >
          <option value="icp_asc">ICP ascendente (peores primero)</option>
          <option value="icp_desc">ICP descendente (mejores primero)</option>
          <option value="puntual">Mayor % pago puntual</option>
          <option value="dias">Más días de atraso</option>
          <option value="criticos">Más clientes críticos</option>
        </select>
        <span className="text-[11px] text-gray-400 ml-auto">{rowsFiltradas.length} vendedores</span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        {/* Encabezados */}
        <div
          className="hidden md:grid px-4 py-2 border-b border-gray-100 bg-slate-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
          style={{ gridTemplateColumns: '28px 1fr 100px 160px 110px 100px 110px' }}
        >
          <span>#</span>
          <span>Vendedor</span>
          <span className="text-right">Clientes</span>
          <span className="text-center">ICP promedio</span>
          <span className="text-right">% Pago puntual</span>
          <span className="text-right">Días atraso</span>
          <span className="text-right">Clientes críticos</span>
        </div>

        {rowsFiltradas.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-400">Sin datos para el filtro seleccionado</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {rowsFiltradas.map((row: VendedorRow, idx: number) => (
              <div
                key={row.vendedor_cod || idx}
                className="hidden md:grid px-4 py-3 items-center hover:bg-slate-50/60 transition-colors"
                style={{ gridTemplateColumns: '28px 1fr 100px 160px 110px 100px 110px', gap: '8px' }}
              >
                <span className="text-[11px] text-gray-300 font-bold tabular-nums">{idx+1}</span>

                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 truncate">{row.vendedor_nombre}</p>
                  <p className="text-[10px] text-gray-400">{row.supervisor_cod !== '—' ? `Sup: ${row.supervisor_cod}` : ''}</p>
                </div>

                <p className="text-[12px] font-bold tabular-nums text-gray-700 text-right">{row.total_clientes}</p>

                <div>
                  <ICPBar score={row.icp_promedio} />
                </div>

                <p className="text-[12px] font-bold tabular-nums text-right"
                   style={{ color: row.pct_a_tiempo >= 70 ? '#16a34a' : row.pct_a_tiempo >= 50 ? '#f59e0b' : '#dc2626' }}>
                  {row.pct_a_tiempo}%
                </p>

                <p className="text-[12px] font-bold tabular-nums text-right text-gray-700">{row.dias_atraso_prom}d</p>

                <p className="text-[12px] font-bold tabular-nums text-right"
                   style={{ color: row.clientes_criticos > 0 ? '#dc2626' : '#16a34a' }}>
                  {row.clientes_criticos}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
