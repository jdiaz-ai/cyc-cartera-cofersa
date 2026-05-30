'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC, fmtFecha } from '@/lib/utils/formato'
import ReporteShell from '@/components/reportes/ReporteShell'
import KPICardAnalisis from '@/components/analisis-pagos/KPICardAnalisis'
import ICPBadge from '@/components/analisis-pagos/ICPBadge'
import DSOTendenciaCard from '@/components/coordinador/DSOTendenciaCard'
import { exportTablaPDF, exportTablaExcel, type ColumnaReporte } from '@/lib/reportes/export-tabla'
import type { ResumenEjecutivoData } from './page'
import type { ConcentracionRow } from '@/types/analisis-pagos'

const TRAMOS = [
  { key: 'noVencido', label: 'Al día',   color: '#16a34a' },
  { key: 'm130',      label: '1-30d',    color: '#d97706' },
  { key: 'm3160',     label: '31-60d',   color: '#ea580c' },
  { key: 'm6190',     label: '61-90d',   color: '#ef4444' },
  { key: 'm91120',    label: '91-120d',  color: '#dc2626' },
  { key: 'm120',      label: '+120d',    color: '#991b1b' },
] as const

const COLUMNAS_TOP: ColumnaReporte[] = [
  { key: 'rank',           label: '#',            align: 'center', format: 'int',  width: 12 },
  { key: 'cliente_nombre', label: 'Cliente',      align: 'left',  format: 'text', width: 70 },
  { key: 'vendedor_nombre',label: 'Vendedor',     align: 'left',  format: 'text', width: 50 },
  { key: 'mora_total',     label: 'Mora total',   align: 'right', format: 'crc',  width: 38 },
  { key: 'pct_mora',       label: '% Mora',       align: 'right', format: 'pct',  width: 20 },
  { key: 'pct_acumulado',  label: '% Acumulado',  align: 'right', format: 'pct',  width: 24 },
]

interface Props { data: ResumenEjecutivoData; generadoPor: string }

export default function ResumenEjecutivoCliente({ data, generadoPor }: Props) {
  const [exportando, setExportando] = useState(false)
  const [showEnviar, setShowEnviar] = useState(false)
  const [para,      setPara]      = useState('')
  const [cc,        setCc]        = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [enviado,   setEnviado]   = useState(false)
  const [errEnvio,  setErrEnvio]  = useState<string | null>(null)
  const c = data.concentracion

  const dsoColor = data.dso > 45 ? '#ef4444' : data.dso > 35 ? '#f59e0b' : '#16a34a'

  function htmlResumenEjecutivo(): string {
    const NAVY = '#003B5C', CYAN = '#009ee3'
    const dColor = data.dso > 45 ? '#ef4444' : data.dso > 35 ? '#f59e0b' : '#16a34a'

    // ── 5 KPI cards ──────────────────────────────────────────────────────
    const kpis = [
      { label: 'Cartera total',   valor: fmtCRC(data.cartera),    sub: `${data.nClientes} clientes`, color: NAVY },
      { label: '% Mora',          valor: `${data.pctMora}%`,      sub: fmtCRC(data.mora),            color: '#dc2626' },
      { label: 'DSO',             valor: `${data.dso}d`,          sub: 'días de cobro',              color: dColor },
      { label: 'Vencido >30d',    valor: `${data.pctVenc30}%`,    sub: fmtCRC(data.venc30),          color: '#ea580c' },
      { label: 'Clientes en mora',valor: `${data.nMora}`,         sub: `de ${data.nClientes}`,       color: '#f59e0b' },
    ]
    const kpiCells = kpis.map(k => `
      <td width="20%" style="padding:3px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-top:3px solid ${k.color};border-radius:6px;">
          <tr><td style="padding:8px 10px;text-align:center;">
            <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.4px;">${k.label}</div>
            <div style="font-size:17px;font-weight:800;color:${NAVY};margin-top:3px;">${k.valor}</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:2px;">${k.sub}</div>
          </td></tr>
        </table>
      </td>`).join('')

    // ── Barra de aging ───────────────────────────────────────────────────
    const tramos = TRAMOS.map(t => ({ ...t, val: data[t.key] as number }))
    const segs = tramos.filter(t => t.val > 0).map(t => {
      const pct = data.cartera > 0 ? (t.val / data.cartera) * 100 : 0
      return `<td style="background:${t.color};color:#fff;font-size:10px;font-weight:700;text-align:center;padding:7px 0;white-space:nowrap;" width="${pct.toFixed(2)}%">${pct >= 6 ? Math.round(pct) + '%' : ''}</td>`
    }).join('')
    const leyenda = tramos.map(t => `
      <td style="padding:3px 10px 3px 0;font-size:10px;color:#555;white-space:nowrap;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${t.color};margin-right:4px;"></span>${t.label}: <b>${fmtCRC(t.val)}</b>
      </td>`).join('')

    // ── Top 10 deudores ──────────────────────────────────────────────────
    const thS = `background:${NAVY};color:#fff;padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;`
    const top = (c?.top10 ?? [])
    const filasTop = top.map((r, i) => {
      const acum = r.pct_acumulado > 40 ? '#dc2626' : '#E36C00'
      return `<tr style="background:${i % 2 === 0 ? '#FBFBFB' : '#fff'};">
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:center;color:#94a3b8;font-weight:700;">${r.rank}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;font-weight:600;color:#0f172a;">${(r.cliente_nombre || '').replace(/</g,'&lt;')}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;color:#475569;">${(r.vendedor_nombre || '').replace(/</g,'&lt;')}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;font-weight:700;color:#dc2626;white-space:nowrap;">${fmtCRC(r.mora_total)}</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;color:#64748b;">${r.pct_mora}%</td>
        <td style="border:1px solid #eee;padding:5px 8px;font-size:11px;text-align:right;font-weight:700;color:${acum};">${r.pct_acumulado}%</td>
      </tr>`
    }).join('')

    const hhiColor = c?.kpis.hhi_nivel === 'ALTO' ? '#dc2626' : c?.kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a'
    const concBlock = c ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px;">
        <tr>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-top:3px solid ${hhiColor};border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Concentración HHI</div><div style="font-size:16px;font-weight:800;color:${hhiColor};">${c.kpis.hhi_nivel}</div><div style="font-size:9px;color:#94a3b8;">${(c.kpis.hhi_valor ?? 0).toLocaleString()} pts</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Top 10 / mora</div><div style="font-size:16px;font-weight:800;color:${NAVY};">${c.kpis.pct_top10}%</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Top 3 vendedores</div><div style="font-size:16px;font-weight:800;color:${CYAN};">${c.kpis.pct_top3_vendedores}%</div></td></tr></table></td>
          <td width="25%" style="padding:3px;"><table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;"><tr><td style="padding:8px;text-align:center;"><div style="font-size:9px;color:#94a3b8;text-transform:uppercase;">Clientes "Grandes"</div><div style="font-size:16px;font-weight:800;color:#f59e0b;">${c.kpis.pct_grandes}%</div></td></tr></table></td>
        </tr>
      </table>` : ''

    return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
          <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">SIC · Sistema Inteligente de Cobranza — Cofersa</div>
          <div style="font-size:18px;color:#fff;font-weight:bold;margin-top:1px;">Resumen Ejecutivo de Cartera</div>
          <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">Corte: <b style="color:#fff;">${fmtFecha(data.fechaCorte)}</b></div>
        </td><td style="background:#F4A61C;width:8px;border-radius:0 6px 0 0;"></td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0 8px;"><tr>${kpiCells}</tr></table>

      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;">Antigüedad de la cartera</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:6px;overflow:hidden;"><tr>${segs}</tr></table>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px;"><tr>${leyenda}</tr></table>

      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 6px;">Top 10 deudores — Total: ${fmtCRC(c?.total_mora ?? 0)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr>
          <th style="${thS}text-align:center;">#</th><th style="${thS}text-align:left;">Cliente</th>
          <th style="${thS}text-align:left;">Vendedor</th><th style="${thS}text-align:right;">Mora total</th>
          <th style="${thS}text-align:right;">% Mora</th><th style="${thS}text-align:right;">% Acum.</th>
        </tr></thead>
        <tbody>${filasTop}</tbody>
      </table>

      ${concBlock}

      <div style="margin-top:16px;font-size:10px;color:#94a3b8;border-top:1px solid #eee;padding-top:8px;">
        Reporte generado desde <b style="color:${CYAN};">SIC</b> — Sistema Inteligente de Cobranza · Cofersa · por ${generadoPor}.
      </div>
    </div>`
  }

  async function enviarCorreo() {
    const toList = para.split(/[;,]/).map(s => s.trim()).filter(Boolean)
    if (toList.length === 0) { setErrEnvio('Ingresá al menos un correo.'); return }
    setEnviando(true); setErrEnvio(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/reportes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList.join(', '),
          cc: cc.split(/[;,]/).map(s => s.trim()).filter(Boolean),
          subject: `SIC · Resumen Ejecutivo de Cartera — ${fmtFecha(data.fechaCorte)}`,
          html: htmlResumenEjecutivo(),
          providerToken: session?.provider_token ?? null,
          providerRefreshToken: session?.provider_refresh_token ?? null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.email_sent) {
        setEnviado(true)
        setTimeout(() => { setShowEnviar(false); setEnviado(false); setPara(''); setCc('') }, 1600)
      } else {
        setErrEnvio(d.error || 'No se pudo enviar el correo.')
      }
    } catch {
      setErrEnvio('Error de red al enviar.')
    } finally {
      setEnviando(false)
    }
  }

  function exportParams() {
    const top = (c?.top10 ?? []) as ConcentracionRow[]
    return {
      filas: top as unknown as Record<string, unknown>[],
      columnas: COLUMNAS_TOP,
      titulo: 'Resumen Ejecutivo de Cartera',
      subtitulo: `Fecha de corte: ${fmtFecha(data.fechaCorte)} · Top 10 deudores`,
      meta: [
        { label: 'Cartera total', value: fmtCRC(data.cartera) },
        { label: '% Mora',        value: `${data.pctMora}%` },
        { label: 'DSO',           value: `${data.dso}d` },
        { label: 'Venc. >30d',    value: fmtCRC(data.venc30) },
      ],
      orientacion: 'landscape' as const,
      nombreArchivo: 'resumen-ejecutivo-cartera',
      generadoPor,
    }
  }

  async function onPDF()   { setExportando(true); try { await exportTablaPDF(exportParams()) }   finally { setExportando(false) } }
  async function onExcel() { setExportando(true); try { await exportTablaExcel(exportParams()) } finally { setExportando(false) } }

  const kpisStrip = (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <KPICardAnalisis compact label="Cartera total"   valor={fmtCRC(data.cartera)}   sub={`${data.nClientes} clientes`} color="#003B5C" />
      <KPICardAnalisis compact label="% Mora"           valor={`${data.pctMora}%`}     sub={fmtCRC(data.mora)}            color="#dc2626" />
      <KPICardAnalisis compact label="DSO"              valor={`${data.dso}d`}         sub="días de cobro"               color={dsoColor} />
      <KPICardAnalisis compact label="Vencido >30d"     valor={`${data.pctVenc30}%`}   sub={fmtCRC(data.venc30)}          color="#ea580c" />
      <KPICardAnalisis compact label="Clientes en mora" valor={`${data.nMora}`}        sub={`de ${data.nClientes}`}       color="#f59e0b" />
    </div>
  )

  return (
    <ReporteShell kpis={kpisStrip} onExportPDF={onPDF} onExportExcel={onExcel} onEnviar={() => setShowEnviar(true)} exportando={exportando}>

      {/* Modal de envío */}
      {showEnviar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
             onClick={() => !enviando && setShowEnviar(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-[15px] font-bold text-gray-900">Enviar Resumen Ejecutivo</h3>
                <p className="text-[12px] text-gray-400">Se envía el resumen en el cuerpo del correo</p>
              </div>
              <button onClick={() => !enviando && setShowEnviar(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {enviado ? (
              <div className="p-10 flex flex-col items-center text-center">
                <CheckCircle2 size={42} style={{ color: '#22c55e' }} className="mb-3" />
                <p className="text-[14px] font-bold text-gray-800">Resumen enviado</p>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Para</label>
                  <input type="text" value={para} onChange={e => setPara(e.target.value)}
                    placeholder="correo@cofersa.cr; otro@cofersa.cr"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">CC (opcional)</label>
                  <input type="text" value={cc} onChange={e => setCc(e.target.value)}
                    placeholder="copia@cofersa.cr"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200" />
                </div>
                <p className="text-[11px] text-gray-400">Podés poner varios correos separados por <b>;</b> o <b>,</b></p>
                {errEnvio && (
                  <div className="rounded-lg border px-3 py-2 flex items-start gap-2" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                    <AlertCircle size={14} style={{ color: '#dc2626', marginTop: '1px', flexShrink: 0 }} />
                    <div>
                      <p className="text-[12px] font-semibold text-red-700">{errEnvio}</p>
                      {/Google|expirada|401/i.test(errEnvio) && <p className="text-[11px] text-red-500 mt-0.5">Cerrá sesión y volvé a entrar con Google, luego reintentá.</p>}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setShowEnviar(false)} disabled={enviando}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-gray-600">Cancelar</button>
                  <button onClick={enviarCorreo} disabled={enviando}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: '#009ee3' }}>
                    {enviando ? <Loader2 size={13} className="animate-spin" /> : null} Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aging consolidado */}
      <div className="bg-white rounded-xl border border-slate-100 p-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Antigüedad de la cartera — corte {fmtFecha(data.fechaCorte)}
        </p>
        <div style={{ display: 'flex', height: '34px', borderRadius: '8px', overflow: 'hidden', gap: '1px' }}>
          {TRAMOS.map(t => {
            const val = data[t.key] as number
            const pct = data.cartera > 0 ? (val / data.cartera) * 100 : 0
            if (pct <= 0) return null
            return (
              <div key={t.key} title={`${t.label}: ${fmtCRC(val)}`}
                   style={{ width: `${pct}%`, minWidth: pct >= 4 ? undefined : '2px', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pct >= 6 && <span style={{ fontSize: '10px', fontWeight: 700, color: 'white' }}>{Math.round(pct)}%</span>}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {TRAMOS.map(t => (
            <div key={t.key} className="flex items-center gap-1.5">
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: t.color }} />
              <span className="text-[10px] text-gray-500">{t.label}</span>
              <span className="text-[10px] font-bold tabular-nums text-gray-700">{fmtCRC(data[t.key] as number)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* DSO trend */}
      {data.dsoTendencia.length > 0 && <DSOTendenciaCard puntos={data.dsoTendencia} />}

      {/* Concentración: top 10 + HHI */}
      {c && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top 10 deudores */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Top 10 deudores — Total: {fmtCRC(c.total_mora)}
              </p>
            </div>
            <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '90px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {([['#','center'],['Cliente','left'],['Vendedor','left'],['Mora total','right'],['% Acum.','right']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
                    <th key={l} style={{ padding: '8px 10px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: a }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.top10.map((row: ConcentracionRow) => {
                  const acumColor = row.pct_acumulado > 40 ? '#dc2626' : '#f59e0b'
                  return (
                    <tr key={row.cliente_cod} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#003B5C' }}>{row.rank}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cliente_nombre}</p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{row.cliente_cod}</p>
                      </td>
                      <td style={{ padding: '9px 10px', fontSize: '11px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.vendedor_nombre}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtCRC(row.mora_total)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: acumColor, fontVariantNumeric: 'tabular-nums' }}>{row.pct_acumulado}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* HHI + concentración */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col items-center text-center"
                 style={{ borderTop: `3px solid ${c.kpis.hhi_nivel === 'ALTO' ? '#dc2626' : c.kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a'}` }}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Concentración (HHI)</p>
              <p className="text-2xl font-black leading-tight" style={{ color: c.kpis.hhi_nivel === 'ALTO' ? '#dc2626' : c.kpis.hhi_nivel === 'MEDIO' ? '#f59e0b' : '#16a34a' }}>
                {c.kpis.hhi_nivel}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{(c.kpis.hhi_valor ?? 0).toLocaleString()} pts HHI</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Top 10 / mora total</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#003B5C' }}>{c.kpis.pct_top10}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Top 3 vendedores</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#009ee3' }}>{c.kpis.pct_top3_vendedores}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Clientes &quot;Grandes&quot;</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: '#f59e0b' }}>{c.kpis.pct_grandes}%</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <span className="text-[11px] text-gray-500">Peor deudor:</span>
                {c.top10[0] && <ICPBadge clasificacion={c.top10[0].clasificacion ?? 'REGULAR'} size="sm" />}
              </div>
            </div>
          </div>
        </div>
      )}

    </ReporteShell>
  )
}
