// src/lib/reportes/email-vendedor.ts
// Constructores de HTML para los correos por vendedor (Gmail-safe, inline CSS).
// Espejo del diseño de los GAS, con branding Cofersa.

import { fmtCRC } from '@/lib/utils/formato'
import type { BloqueadosVendedor, PlazoEspecialVendedor } from '@/types/reportes'

const NAVY = '#003B5C'
const CYAN = '#009ee3'
const ROJO = '#C00000'
const NARANJA = '#E36C00'

function firma(): string {
  return `
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.3;color:#333;">
    <div style="font-weight:700;color:#1a1a1a;">Crédito y Cobro — Cofersa</div>
    <div style="color:#666;">¡Su Mayorista Preferido!</div>
  </div>`
}

function th(label: string, align = 'center'): string {
  return `<th style="background:${NAVY};color:#fff;border:1px solid #1a2f55;padding:7px 8px;text-align:${align};font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">${label}</th>`
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ══════════════════════════════════════════════════════════════════════
// CLIENTES BLOQUEADOS
// ══════════════════════════════════════════════════════════════════════

export function asuntoBloqueados(v: BloqueadosVendedor, fechaStr: string): string {
  return `Cofersa | Clientes Bloqueados — ${v.vendedor_nombre.toUpperCase()} — ${fechaStr}`
}

export function htmlBloqueadosVendedor(v: BloqueadosVendedor, fechaStr: string): string {
  const tdN = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:right;font-size:11px;white-space:nowrap;'
  const tdT = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:left;font-size:11px;'
  const tdC = 'border:1px solid #DEE2E6;padding:6px 8px;text-align:center;font-size:11px;'

  const filas = v.clientes.map((c, i) => {
    const crit = c.m120 > 0
    const bg = crit ? '#FFF3E0' : (i % 2 === 0 ? '#FBFBFB' : '#FFFFFF')
    const semBadge = c.es_nuevo
      ? '<span style="background:#28A745;color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;">NUEVO</span>'
      : `<span style="background:${c.semanas >= 3 ? ROJO : '#6C757D'};color:#fff;font-weight:700;padding:1px 6px;border-radius:3px;font-size:10px;">${c.semanas}</span>`
    return `<tr style="background:${bg};">
      <td style="${tdN}">${esc(c.cliente_cod)}</td>
      <td style="${tdT}">${esc(c.cliente_nombre)}</td>
      <td style="${tdC}">${semBadge}</td>
      <td style="${tdN}">${c.no_vencido > 0 ? fmtCRC(c.no_vencido) : ''}</td>
      <td style="${tdN}">${c.m1_30 > 0 ? fmtCRC(c.m1_30) : ''}</td>
      <td style="${tdN}">${c.m31_60 > 0 ? fmtCRC(c.m31_60) : ''}</td>
      <td style="${tdN}">${c.m61_90 > 0 ? fmtCRC(c.m61_90) : ''}</td>
      <td style="${tdN}">${c.m91_120 > 0 ? fmtCRC(c.m91_120) : ''}</td>
      <td style="${tdN}${crit ? `color:${NARANJA};font-weight:800;` : ''}">${c.m120 > 0 ? fmtCRC(c.m120) : ''}</td>
      <td style="${tdN}">${c.total > 0 ? fmtCRC(c.total) : ''}</td>
      <td style="${tdN}font-weight:800;color:${ROJO};">${fmtCRC(c.saldo_vencido)}</td>
    </tr>`
  }).join('')

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:960px;">
    <div style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
      <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">Crédito y Cobro — Cofersa</div>
      <div style="font-size:18px;color:#fff;font-weight:bold;">Clientes Bloqueados</div>
      <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">Vendedor: <b style="color:#fff;">${esc(v.vendedor_nombre)}</b> &nbsp;|&nbsp; Corte: <b style="color:#fff;">${fechaStr}</b></div>
    </div>
    <p style="font-size:12.5px;margin:14px 0 8px;">Estimado(a) ${esc(v.vendedor_nombre)}, a continuación sus <b>clientes bloqueados</b> (saldo vencido ≥31 días):</p>
    <div style="font-size:12.5px;margin:0 0 12px;">
      <b>Resumen —</b> Clientes: <b>${v.n_clientes}</b> |
      Saldo vencido: <b style="color:${ROJO};">${fmtCRC(v.saldo_vencido)}</b>
      ${v.criticos_120 > 0 ? ` | Críticos &gt;120d: <b style="color:${NARANJA};">${v.criticos_120}</b>` : ''}
    </div>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        ${th('Código','right')}${th('Cliente','left')}${th('Sem.')}
        ${th('No venc.','right')}${th('1-30d','right')}${th('31-60d','right')}
        ${th('61-90d','right')}${th('91-120d','right')}${th('+120d','right')}
        ${th('Total','right')}${th('Saldo venc.','right')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="color:#666;font-size:11px;margin-top:10px;">Las filas en naranja corresponden a clientes con saldo mayor a 120 días. La columna SEM. indica semanas consecutivas bloqueado.</p>
    ${firma()}
  </div>`
}

// ══════════════════════════════════════════════════════════════════════
// FACTURAS PLAZO ESPECIAL
// ══════════════════════════════════════════════════════════════════════

export function asuntoPlazoEspecial(v: PlazoEspecialVendedor, fechaStr: string): string {
  return v.vencidas > 0
    ? `⚠ ATENCIÓN: ${v.vencidas} ${v.vencidas === 1 ? 'factura VENCIDA' : 'facturas VENCIDAS'} (Plazo Especial) – ${v.vendedor_nombre} – ${fechaStr}`
    : `✓ Facturas Plazo Especial al día – ${v.vendedor_nombre} – ${fechaStr}`
}

function fmtFechaCorta(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function htmlPlazoEspecialVendedor(v: PlazoEspecialVendedor, fechaStr: string): string {
  const tdN = 'border:1px solid #DEE2E6;padding:5px 8px;text-align:right;font-size:11px;white-space:nowrap;'
  const tdT = 'border:1px solid #DEE2E6;padding:5px 8px;text-align:left;font-size:11px;'
  const tdC = 'border:1px solid #DEE2E6;padding:5px 8px;text-align:center;font-size:11px;'

  const filas = v.facturas.map((f, i) => {
    const est = f.vencida
      ? { bg: '#FFF0F0', badge: ROJO, label: 'VENCIDA' }
      : (f.dias_a_vencer <= 7 ? { bg: '#FFFBF0', badge: NARANJA, label: 'PRÓXIMA' } : { bg: i % 2 === 0 ? '#FBFBFB' : '#FFFFFF', badge: '#1A7A40', label: 'AL DÍA' })
    const diasTxt = f.vencida
      ? `<span style="color:${ROJO};font-weight:bold;">${f.dias_a_vencer} d</span>`
      : `<span style="color:${f.dias_a_vencer <= 7 ? NARANJA : '#1A7A40'};">+${f.dias_a_vencer} d</span>`
    return `<tr style="background:${est.bg};">
      <td style="${tdT}font-style:italic;color:#555;">${esc(f.documento)}</td>
      <td style="${tdT}">${esc(f.cliente_nombre)}</td>
      <td style="${tdC}">${fmtFechaCorta(f.fecha_emision)}</td>
      <td style="${tdC}font-weight:bold;">${fmtFechaCorta(f.fecha_vencimiento)}</td>
      <td style="${tdC}">${f.plazo_factura} d</td>
      <td style="${tdC}">${f.plazo_cliente} d</td>
      <td style="${tdN}">${fmtCRC(f.monto)}</td>
      <td style="${tdN}font-weight:bold;">${fmtCRC(f.saldo)}</td>
      <td style="${tdC}">${diasTxt}</td>
      <td style="${tdC}"><span style="background:${est.badge};color:#fff;font-size:10px;font-weight:bold;padding:1px 6px;border-radius:10px;white-space:nowrap;">${est.label}</span></td>
    </tr>`
  }).join('')

  const cierre = v.vencidas > 0
    ? `<p style="font-size:12px;color:${ROJO};font-weight:bold;margin:12px 0 4px;">⚠ Hay ${v.vencidas} ${v.vencidas === 1 ? 'factura vencida' : 'facturas vencidas'} que requieren atención inmediata para evitar bloqueos al cliente.</p>`
    : `<p style="font-size:12px;color:#444;margin:12px 0 4px;">Todos los documentos se encuentran al día. Dar seguimiento oportuno para mantener esta condición.</p>`

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:980px;">
    <div style="background:${NAVY};padding:14px 18px;border-radius:6px 6px 0 0;">
      <div style="font-size:10px;color:#A8C4E0;letter-spacing:1px;text-transform:uppercase;">Crédito y Cobro — Cofersa</div>
      <div style="font-size:18px;color:#fff;font-weight:bold;">Facturas con Plazo Especial</div>
      <div style="font-size:12px;color:#A8C4E0;margin-top:2px;">Vendedor: <b style="color:#fff;">${esc(v.vendedor_nombre)}</b> &nbsp;|&nbsp; Corte: <b style="color:#fff;">${fechaStr}</b></div>
    </div>
    <div style="font-size:12.5px;margin:14px 0 12px;">
      <b>Resumen —</b> Facturas: <b>${v.n_facturas}</b> |
      Vencidas: <b style="color:${v.vencidas > 0 ? ROJO : '#1A7A40'};">${v.vencidas}</b> |
      Saldo total: <b style="color:${NAVY};">${fmtCRC(v.saldo_total)}</b>
    </div>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        ${th('Factura','left')}${th('Cliente','left')}${th('Emisión')}${th('Vence')}
        ${th('Plazo Fac.')}${th('Plazo Cli.')}${th('Monto','right')}${th('Saldo','right')}
        ${th('Días')}${th('Estado')}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${cierre}
    ${firma()}
  </div>`
}
