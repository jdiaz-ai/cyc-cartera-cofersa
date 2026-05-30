'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC, fmtFecha } from '@/lib/utils/formato'
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis'
import VendedorEnvioPanel from '@/components/reportes/VendedorEnvioPanel'
import { htmlPlazoEspecialVendedor, asuntoPlazoEspecial } from '@/lib/reportes/email-vendedor'
import type { PlazoEspecialResult, PlazoEspecialVendedor, PlazoEspecialFactura } from '@/types/reportes'

function Skeleton() {
  return (
    <div className="px-5 py-5 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-xl border h-20 animate-pulse" />)}</div>
      <div className="bg-white rounded-xl border h-64 animate-pulse" />
    </div>
  )
}

const fechaHoy = () => {
  const d = new Date(Date.now() - 6 * 3600_000)
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`
}

export default function PlazoEspecialCliente() {
  const [data,    setData]    = useState<PlazoEspecialResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: result, error: err } = await (supabase as any).rpc('fn_reporte_plazo_especial')
      if (err) throw err
      setData(result as PlazoEspecialResult)
    } catch { setError('Error al cargar facturas con plazo especial.') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <Skeleton />
  if (error) return (
    <div className="px-5 py-5"><div className="bg-white rounded-xl border border-red-100 p-8 text-center">
      <p className="text-red-600 text-sm font-semibold">{error}</p>
      <button onClick={fetchData} className="mt-3 text-[#009ee3] text-sm font-semibold hover:underline">Reintentar</button>
    </div></div>
  )
  if (!data) return null

  const { kpis, vendedores } = data
  const fecha = fechaHoy()

  const kpisStrip = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICardAnalisis label="Facturas plazo especial" valor={`${kpis.total_facturas}`} sub="con saldo ≥ ₡1.000" color="#003B5C" />
      <KPICardAnalisis label="Saldo total"              valor={fmtCRC(kpis.saldo_total)} sub="plazo especial"     color="#009ee3" />
      <KPICardAnalisis label="Vencidas"                  valor={`${kpis.vencidas}`}       sub="requieren gestión"  color="#dc2626" />
      <KPICardAnalisis label="Vendedores"                valor={`${kpis.total_vendedores}`} sub="con plazo especial" color="#f59e0b" />
    </div>
  )

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5">
        <VendedorEnvioPanel<PlazoEspecialVendedor>
          vendedores={vendedores}
          kpis={kpisStrip}
          buildSubject={v => asuntoPlazoEspecial(v, fecha)}
          buildHtml={v => htmlPlazoEspecialVendedor(v, fecha)}
          renderResumen={v => (
            <span>
              {v.n_facturas} factura{v.n_facturas !== 1 ? 's' : ''} · {fmtCRC(v.saldo_total)}
              {v.vencidas > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}> · {v.vencidas} vencida{v.vencidas !== 1 ? 's' : ''}</span>}
            </span>
          )}
          renderDetalle={v => <TablaFacturas facturas={v.facturas} />}
        />
      </div>
    </div>
  )
}

function TablaFacturas({ facturas }: { facturas: PlazoEspecialFactura[] }) {
  return (
    <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
      <colgroup>
        <col style={{ width: '150px' }} /><col style={{ width: '22%' }} /><col style={{ width: '90px' }} />
        <col style={{ width: '90px' }} /><col style={{ width: '70px' }} /><col style={{ width: '70px' }} />
        <col style={{ width: '110px' }} /><col style={{ width: '110px' }} /><col style={{ width: '80px' }} />
      </colgroup>
      <thead>
        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {([['Factura','left'],['Cliente','left'],['Emisión','center'],['Vence','center'],['Plazo Fac.','center'],['Plazo Cli.','center'],['Monto','right'],['Saldo','right'],['Días','center']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
            <th key={l} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: a }}>{l}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {facturas.map((f, i) => {
          const color = f.vencida ? '#dc2626' : f.dias_a_vencer <= 7 ? '#ea580c' : '#16a34a'
          return (
            <tr key={`${f.documento}-${i}`} style={{ borderBottom: '1px solid #f1f5f9', background: f.vencida ? '#fff5f5' : 'transparent' }}>
              <td style={{ padding: '6px 10px', fontSize: '10px', color: '#64748b', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.documento}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#0f172a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.cliente_nombre}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>{fmtFecha(f.fecha_emision)}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#374151', textAlign: 'center', fontWeight: 600 }}>{fmtFecha(f.fecha_vencimiento)}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#374151', textAlign: 'center' }}>{f.plazo_factura}d</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>{f.plazo_cliente}d</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#475569', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(f.monto)}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', color: '#0f172a', fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(f.saldo)}</td>
              <td style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 700, color, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{f.vencida ? `${f.dias_a_vencer}d` : `+${f.dias_a_vencer}d`}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
