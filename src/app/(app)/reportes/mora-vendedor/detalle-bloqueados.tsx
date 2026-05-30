'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC, fmtFecha } from '@/lib/utils/formato'
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis'
import VendedorEnvioPanel from '@/components/reportes/VendedorEnvioPanel'
import { htmlBloqueadosVendedor, asuntoBloqueados } from '@/lib/reportes/email-vendedor'
import type { BloqueadosResult, BloqueadosVendedor, BloqueadoCliente } from '@/types/reportes'

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />)}</div>
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  )
}

const fechaHoy = () => {
  const d = new Date(Date.now() - 6 * 3600_000)
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`
}

export default function DetalleBloqueados({ toggle }: { toggle: React.ReactNode }) {
  const [data,    setData]    = useState<BloqueadosResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [verGer,  setVerGer]  = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc('fn_reporte_bloqueados')
      if (err) throw err
      setData(result as BloqueadosResult)
    } catch { setError('Error al cargar clientes bloqueados.') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fecha = fechaHoy()

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">{toggle}</div>

        {loading ? <Skeleton /> : error ? (
          <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
            <p className="text-red-600 text-sm font-semibold">{error}</p>
            <button onClick={fetchData} className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline">Reintentar</button>
          </div>
        ) : !data ? null : (
          <VendedorEnvioPanel<BloqueadosVendedor>
            vendedores={data.vendedores}
            kpis={
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPICardAnalisis label="Clientes bloqueados" valor={`${data.kpis.total_bloqueados}`} sub="vencido >30d ≥ ₡1.000" color="#dc2626" />
                <KPICardAnalisis label="Saldo vencido total" valor={fmtCRC(data.kpis.saldo_vencido_total)} sub="acumulado" color="#003B5C" />
                <KPICardAnalisis label="Críticos >120 días"   valor={`${data.kpis.criticos_120}`} sub="clientes" color="#991b1b" />
                <KPICardAnalisis label="Vendedores"            valor={`${data.kpis.total_vendedores}`} sub={`corte ${fmtFecha(data.kpis.fecha_semana)}`} color="#f59e0b" />
              </div>
            }
            buildSubject={v => asuntoBloqueados(v, fecha)}
            buildHtml={v => htmlBloqueadosVendedor(v, fecha)}
            renderResumen={v => (
              <span>
                {v.n_clientes} cliente{v.n_clientes !== 1 ? 's' : ''} · <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmtCRC(v.saldo_vencido)}</span>
                {v.criticos_120 > 0 && <span style={{ color: '#991b1b' }}> · {v.criticos_120} críticos &gt;120d</span>}
              </span>
            )}
            renderDetalle={v => <TablaClientes clientes={v.clientes} />}
            extras={
              <div className="space-y-4 mt-2">
                {/* Resumen Gerencial */}
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <button onClick={() => setVerGer(x => !x)} className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-gray-100">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Resumen Gerencial — ranking por saldo vencido</span>
                    {verGer ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  </button>
                  {verGer && (
                    <div className="overflow-x-auto">
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                        <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          {([['#','center'],['Vendedor','left'],['Clientes','right'],['Saldo vencido','right'],['% del total','right'],['Críticos >120','right']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
                            <th key={l} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: a }}>{l}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {data.gerencial.map((g, i) => {
                            const pct = data.kpis.saldo_vencido_total > 0 ? Math.round(g.saldo_vencido / data.kpis.saldo_vencido_total * 1000) / 10 : 0
                            return (
                              <tr key={g.vendedor_nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{i + 1}</td>
                                <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{g.vendedor_nombre}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{g.n_clientes}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(g.saldo_vencido)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{pct}%</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: g.criticos_120 > 0 ? '#ea580c' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{g.criticos_120 || '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Escalación */}
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-100">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Escalación — clientes ≥3 semanas consecutivas bloqueados
                    </span>
                  </div>
                  {data.escalacion.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-gray-400">
                      Aún no hay clientes en escalación. Se irán detectando a medida que se acumule el histórico semanal.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                        <thead><tr style={{ background: '#fff5f5', borderBottom: '1px solid #f0c9c0' }}>
                          {([['Código','left'],['Cliente','left'],['Vendedor','left'],['Semanas','center'],['Saldo vencido','right']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
                            <th key={l} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#7B0000', textTransform: 'uppercase', textAlign: a }}>{l}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {data.escalacion.map(e => (
                            <tr key={e.cliente_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>{e.cliente_cod}</td>
                              <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{e.cliente_nombre}</td>
                              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#475569' }}>{e.vendedor_nombre}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <span style={{ background: e.semanas >= 6 ? '#7B0000' : '#C00000', color: '#fff', fontWeight: 700, padding: '1px 7px', borderRadius: '3px', fontSize: '11px' }}>{e.semanas} sem</span>
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(e.saldo_vencido)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}

function TablaClientes({ clientes }: { clientes: BloqueadoCliente[] }) {
  return (
    <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
      <colgroup>
        <col style={{ width: '90px' }} /><col style={{ width: '22%' }} /><col style={{ width: '70px' }} />
        <col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
        <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '11%' }} />
      </colgroup>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {([['Código','left'],['Cliente','left'],['Sem.','center'],['1-30d','right'],['31-60d','right'],['61-90d','right'],['91-120d','right'],['+120d','right'],['Saldo venc.','right']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
            <th key={l} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: a }}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {clientes.map((c, i) => {
          const crit = c.m120 > 0
          return (
            <tr key={`${c.cliente_cod}-${i}`} style={{ borderBottom: '1px solid #f1f5f9', background: crit ? '#fff7ed' : 'transparent' }}>
              <td style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>{c.cliente_cod}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente_nombre}</td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                {c.es_nuevo
                  ? <span style={{ background: '#28A745', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', fontSize: '9px' }}>NUEVO</span>
                  : <span style={{ background: c.semanas >= 3 ? '#C00000' : '#6C757D', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', fontSize: '10px' }}>{c.semanas}</span>}
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{c.m1_30 > 0 ? fmtCRC(c.m1_30) : '—'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#ea580c', fontVariantNumeric: 'tabular-nums' }}>{c.m31_60 > 0 ? fmtCRC(c.m31_60) : '—'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{c.m61_90 > 0 ? fmtCRC(c.m61_90) : '—'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{c.m91_120 > 0 ? fmtCRC(c.m91_120) : '—'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', fontWeight: crit ? 800 : 400, color: '#991b1b', fontVariantNumeric: 'tabular-nums' }}>{c.m120 > 0 ? fmtCRC(c.m120) : '—'}</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: '11px', fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(c.saldo_vencido)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
