'use client'

import { useState, useEffect, useCallback } from 'react'
import { Lock, Shield, TrendingDown, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import KPICardAnalisis from './KPICardAnalisis'
import ICPBadge, { icpColorPrimary } from './ICPBadge'
import type { ConcentracionResult, ConcentracionRow } from '@/types/analisis-pagos'

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_,i) => <div key={i} className="bg-white rounded-xl border h-24 animate-pulse" />)}
      </div>
      <div className="bg-white rounded-xl border h-16 animate-pulse" />
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  )
}

interface Props {
  esAnalista: boolean
}

export default function TabConcentracion({ esAnalista }: Props) {
  const [data,    setData]    = useState<ConcentracionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // El tab verifica el rol — analistas ven un mensaje, no datos
  const fetchData = useCallback(async () => {
    if (esAnalista) return setLoading(false)
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc('fn_analisis_concentracion')
      if (err) throw err
      setData(result as ConcentracionResult)
    } catch { setError('Error al cargar datos de concentración.') }
    finally   { setLoading(false) }
  }, [esAnalista])

  useEffect(() => { fetchData() }, [fetchData])

  // Analista — acceso restringido
  if (esAnalista) return (
    <div className="bg-white rounded-xl border border-slate-100 p-12 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
           style={{ background: 'rgba(0,59,92,0.06)' }}>
        <Lock size={24} style={{ color: '#003B5C', opacity: 0.4 }} />
      </div>
      <p className="text-sm font-semibold text-gray-600 mb-1">Vista disponible para el coordinador</p>
      <p className="text-[12px] text-gray-400 max-w-sm leading-relaxed">
        El análisis de concentración de riesgo es una herramienta gerencial. Contactá al coordinador para revisar esta información.
      </p>
    </div>
  )

  if (loading) return <Skeleton />
  if (error)   return (
    <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
      <p className="text-red-600 text-sm font-semibold">{error}</p>
    </div>
  )
  if (!data) return null

  const { kpis, top10, total_mora } = data

  const hhhColor =
    kpis.hhi_nivel === 'ALTO' ? '#dc2626' :
    kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a'

  return (
    <div className="space-y-4">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICardAnalisis
          label="Top 10 / mora total"
          valor={`${kpis.pct_top10 ?? 0}%`}
          sub="concentrado en 10 clientes"
          color="#003B5C"
          icon={<BarChart3 size={14} />}
        />
        <KPICardAnalisis
          label="Top 3 vendedores"
          valor={`${kpis.pct_top3_vendedores ?? 0}%`}
          sub="de la mora total"
          color="#009ee3"
          icon={<TrendingDown size={14} />}
        />
        <KPICardAnalisis
          label='Clientes "Grandes"'
          valor={`${kpis.pct_grandes ?? 0}%`}
          sub="de la mora total"
          color="#f59e0b"
          icon={<Shield size={14} />}
        />
        <div
          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col"
          style={{ borderTop: `3px solid ${hhhColor}` }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
               style={{ background: `${hhhColor}18` }}>
            <span style={{ color: hhhColor }}><BarChart3 size={14} /></span>
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Índice HHI</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: hhhColor }}>
            {kpis.hhi_nivel}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">{(kpis.hhi_valor ?? 0).toLocaleString()} puntos</p>
        </div>
      </div>

      {/* Barra visual de distribución */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Distribución de mora — Top 10 vs resto
        </p>
        <div className="flex h-8 rounded-lg overflow-hidden gap-px">
          {top10.map((row: ConcentracionRow) => {
            const color = row.icp_score !== null ? icpColorPrimary(row.icp_score) : '#94a3b8'
            return (
              <div
                key={row.cliente_cod}
                title={`${row.cliente_nombre}: ${row.pct_mora}%`}
                className="h-full transition-opacity hover:opacity-75 cursor-pointer"
                style={{ width: `${row.pct_mora}%`, background: color, minWidth: '2px' }}
              />
            )
          })}
          <div
            className="flex-1 h-full bg-slate-200"
            title="Resto de la cartera"
          />
        </div>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {top10.map((row: ConcentracionRow) => {
            const color = row.icp_score !== null ? icpColorPrimary(row.icp_score) : '#94a3b8'
            return (
              <div key={row.cliente_cod} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                <span className="text-[9px] text-gray-500 truncate" style={{ maxWidth: '90px' }}>
                  {row.cliente_nombre.split(' ')[0]}
                </span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-200 flex-shrink-0" />
            <span className="text-[9px] text-gray-500">Resto</span>
          </div>
        </div>
      </div>

      {/* Tabla Top 10 */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            Top 10 clientes por mora · Total: {fmtCRC(total_mora)}
          </p>
        </div>

        {/* Encabezados */}
        <div
          className="hidden md:grid px-4 py-2 border-b border-gray-100 bg-slate-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider"
          style={{ gridTemplateColumns: '28px 1fr 130px 130px 80px 80px 120px' }}
        >
          <span>#</span>
          <span>Cliente</span>
          <span>Vendedor</span>
          <span className="text-right">Mora total</span>
          <span className="text-right">% mora</span>
          <span className="text-center">ICP</span>
          <span className="text-right">% acumulado</span>
        </div>

        <div className="divide-y divide-gray-50">
          {top10.map((row: ConcentracionRow) => {
            const acumColor = row.pct_acumulado > 40 ? '#dc2626' : row.pct_acumulado > 25 ? '#f59e0b' : '#374151'
            return (
              <div
                key={row.cliente_cod}
                className="hidden md:grid px-4 py-3 items-center hover:bg-slate-50/60 transition-colors"
                style={{ gridTemplateColumns: '28px 1fr 130px 130px 80px 80px 120px', gap: '8px' }}
              >
                <span
                  className="text-[12px] font-black tabular-nums"
                  style={{ color: '#003B5C' }}
                >
                  {row.rank}
                </span>

                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 truncate">{row.cliente_nombre}</p>
                  <p className="text-[10px] font-mono text-gray-400">{row.cliente_cod}</p>
                </div>

                <p className="text-[11px] text-gray-500 truncate">{row.vendedor_nombre}</p>

                <p className="text-[12px] font-bold tabular-nums text-gray-800 text-right">
                  {fmtCRC(row.mora_total)}
                </p>

                <p className="text-[12px] font-bold tabular-nums text-right text-gray-600">
                  {row.pct_mora}%
                </p>

                <div className="flex justify-center">
                  {row.clasificacion ? (
                    <ICPBadge clasificacion={row.clasificacion} size="sm" />
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </div>

                <p
                  className="text-[12px] font-black tabular-nums text-right"
                  style={{ color: acumColor }}
                >
                  {row.pct_acumulado}%
                  {row.pct_acumulado > 40 && (
                    <span className="text-[9px] ml-1">⚠</span>
                  )}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
