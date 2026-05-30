'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import ReporteShell from '@/components/reportes/ReporteShell'
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis'
import DetalleBloqueados from './detalle-bloqueados'
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla'
import type { MoraVendedorResult, MoraVendedorRow } from '@/types/reportes'

type Vista = 'resumen' | 'detalle'

// ── Columnas para export ──────────────────────────────────────────────────
const COLUMNAS: ColumnaReporte[] = [
  { key: 'vendedor_nombre', label: 'Vendedor',   align: 'left',  format: 'text', width: 48 },
  { key: 'supervisor_cod',  label: 'Supervisor', align: 'left',  format: 'text', width: 22 },
  { key: 'total_clientes',  label: 'Clientes',   align: 'right', format: 'int',  width: 16 },
  { key: 'cartera_total',   label: 'Cartera',    align: 'right', format: 'crc',  width: 28 },
  { key: 'no_vencido',      label: 'No vencido', align: 'right', format: 'crc',  width: 28 },
  { key: 'mora_1_30',       label: '1-30d',      align: 'right', format: 'crc',  width: 26 },
  { key: 'mora_31_60',      label: '31-60d',     align: 'right', format: 'crc',  width: 26 },
  { key: 'mora_61_90',      label: '61-90d',     align: 'right', format: 'crc',  width: 26 },
  { key: 'mora_91_120',     label: '91-120d',    align: 'right', format: 'crc',  width: 26 },
  { key: 'mora_120_plus',   label: '+120d',      align: 'right', format: 'crc',  width: 26 },
  { key: 'mora_total',      label: 'Mora total', align: 'right', format: 'crc',  width: 28 },
  { key: 'pct_mora',        label: '% Mora',     align: 'right', format: 'pct',  width: 14 },
]

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />)}
      </div>
      <div className="bg-white rounded-xl border h-80 animate-pulse" />
    </div>
  )
}

interface Props { generadoPor: string }

export default function MoraVendedorCliente({ generadoPor }: Props) {
  const [vista,      setVista]      = useState<Vista>('resumen')
  const [data,       setData]       = useState<MoraVendedorResult | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [supervisor, setSupervisor] = useState('')
  const [exportando, setExportando] = useState(false)

  // Toggle Resumen ↔ Detalle (compartido por ambas vistas)
  const toggle = (
    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#E2E8F0' }}>
      {([['resumen', 'Resumen de mora'], ['detalle', 'Clientes bloqueados']] as [Vista, string][]).map(([v, label]) => (
        <button key={v} onClick={() => setVista(v)}
          className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap"
          style={{
            background: vista === v ? 'white' : 'transparent',
            color:      vista === v ? '#003B5C' : '#94a3b8',
            boxShadow:  vista === v ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
          }}>
          {label}
        </button>
      ))}
    </div>
  )

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc('fn_reporte_mora_vendedor')
      if (err) throw err
      setData(result as MoraVendedorResult)
    } catch {
      setError('Error al cargar el reporte de mora por vendedor.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Vista Detalle (clientes bloqueados) — componente propio con su panel de envío
  if (vista === 'detalle') return <DetalleBloqueados toggle={toggle} />

  if (loading) return <div className="px-5 py-5"><Skeleton /></div>
  if (error) return (
    <div className="px-5 py-5">
      <div className="bg-white rounded-xl border border-red-100 p-8 text-center">
        <p className="text-red-600 text-sm font-semibold">{error}</p>
        <button onClick={fetchData} className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline">Reintentar</button>
      </div>
    </div>
  )
  if (!data) return null

  const { kpis, rows } = data
  const supervisores = [...new Set(rows.map(r => r.supervisor_cod).filter(s => s && s !== '—'))].sort()
  const rowsFiltradas = supervisor ? rows.filter(r => r.supervisor_cod === supervisor) : rows

  // Totales de la vista filtrada
  const tot = rowsFiltradas.reduce((acc, r) => ({
    total_clientes: acc.total_clientes + r.total_clientes,
    cartera_total:  acc.cartera_total + r.cartera_total,
    no_vencido:     acc.no_vencido + r.no_vencido,
    mora_1_30:      acc.mora_1_30 + r.mora_1_30,
    mora_31_60:     acc.mora_31_60 + r.mora_31_60,
    mora_61_90:     acc.mora_61_90 + r.mora_61_90,
    mora_91_120:    acc.mora_91_120 + r.mora_91_120,
    mora_120_plus:  acc.mora_120_plus + r.mora_120_plus,
    mora_total:     acc.mora_total + r.mora_total,
  }), {
    total_clientes: 0, cartera_total: 0, no_vencido: 0, mora_1_30: 0, mora_31_60: 0,
    mora_61_90: 0, mora_91_120: 0, mora_120_plus: 0, mora_total: 0,
  })
  const totPctMora = tot.cartera_total > 0 ? Math.round(tot.mora_total / tot.cartera_total * 1000) / 10 : 0

  function exportParams() {
    const sufijo = supervisor ? `-${supervisor}` : ''
    return {
      filas: rowsFiltradas as unknown as Record<string, unknown>[],
      columnas: COLUMNAS,
      titulo: 'Mora por Vendedor',
      subtitulo: supervisor ? `Supervisor: ${supervisor}` : 'Todos los vendedores',
      meta: [
        { label: 'Cartera total', value: fmtCRC(tot.cartera_total) },
        { label: 'Mora total',    value: fmtCRC(tot.mora_total) },
        { label: '% Mora',        value: `${totPctMora}%` },
        { label: 'Vendedores',    value: `${rowsFiltradas.length}` },
      ],
      totales: { ...tot, pct_mora: totPctMora },
      orientacion: 'landscape' as const,
      nombreArchivo: `mora-por-vendedor${sufijo}`,
      generadoPor,
    }
  }

  async function onPDF()   { setExportando(true); try { await exportTablaPDF(exportParams()) }   finally { setExportando(false) } }
  async function onExcel() { setExportando(true); try { await exportTablaExcel(exportParams()) } finally { setExportando(false) } }

  const filtros = (
    <>
      {toggle}
      {supervisores.length > 0 && (
        <select
          value={supervisor}
          onChange={e => setSupervisor(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] bg-white text-gray-700 focus:outline-none"
          style={{ minWidth: '180px' }}
        >
          <option value="">Todos los supervisores</option>
          {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </>
  )

  const kpisStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis label="Cartera total" valor={fmtCRC(kpis.cartera_total)} sub="sync más reciente" color="#003B5C" />
      <KPICardAnalisis label="Mora total"    valor={fmtCRC(kpis.mora_total)}    sub="saldo vencido"     color="#dc2626" />
      <KPICardAnalisis label="% Mora"         valor={`${kpis.pct_mora}%`}        sub="sobre cartera"     color="#f59e0b" />
      <KPICardAnalisis label="Vendedores"     valor={`${kpis.total_vendedores}`} sub="con cartera"       color="#009ee3" />
    </div>
  )

  return (
    <ReporteShell filtros={filtros} kpis={kpisStrip} onExportPDF={onPDF} onExportExcel={onExcel} exportando={exportando}>
      <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            {rowsFiltradas.length} vendedor{rowsFiltradas.length !== 1 ? 'es' : ''}
          </span>
          <span className="text-[11px] text-gray-400">Ordenado por mayor mora</span>
        </div>

        <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <colgroup>
            <col style={{ width: '36px' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {([
                ['#', 'center'], ['Vendedor', 'left'], ['Supervisor', 'left'], ['Clientes', 'right'],
                ['Cartera', 'right'], ['No vencido', 'right'], ['1-30d', 'right'], ['31-60d', 'right'],
                ['61-90d', 'right'], ['+90d', 'right'], ['Mora total', 'right'], ['% Mora', 'right'],
              ] as [string, React.CSSProperties['textAlign']][]).map(([l, a]) => (
                <th key={l} style={{
                  padding: '8px 10px', fontSize: '10px', fontWeight: 600, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: a,
                }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((row: MoraVendedorRow, idx) => {
              const pctColor = row.pct_mora > 30 ? '#dc2626' : row.pct_mora >= 15 ? '#f59e0b' : '#16a34a'
              return (
                <tr key={`${row.vendedor_cod}-${idx}`}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: '11px', fontWeight: 500, color: '#94a3b8' }}>{idx + 1}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.vendedor_nombre}</p>
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.supervisor_cod !== '—' ? row.supervisor_cod : '—'}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{row.total_clientes}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.cartera_total)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.no_vencido)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_1_30)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#ea580c', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_31_60)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_61_90)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '11px', color: '#991b1b', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_91_120 + row.mora_120_plus)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_total)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: pctColor, fontVariantNumeric: 'tabular-nums' }}>{row.pct_mora}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
              <td colSpan={3} style={{ padding: '10px', fontSize: '11px', fontWeight: 700, color: '#003B5C', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{tot.total_clientes}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.cartera_total)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.no_vencido)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.mora_1_30)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.mora_31_60)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.mora_61_90)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#003B5C', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.mora_91_120 + tot.mora_120_plus)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(tot.mora_total)}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{totPctMora}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReporteShell>
  )
}
