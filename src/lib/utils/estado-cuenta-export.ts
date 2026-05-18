'use client'
/**
 * Utilidades de exportación para Estado de Cuenta
 * Genera PDF (jsPDF + autotable) y Excel (SheetJS) con formato profesional.
 *
 * Estas funciones usan importaciones DINÁMICAS para evitar problemas SSR.
 * Sólo llamar desde Client Components.
 */

import type { Factura } from '@/types/database'

// ── Tipos ──────────────────────────────────────────────────────────────
export interface CuentaBancaria {
  banco:  string
  moneda: string
  tipo:   string  // 'cuenta' | 'sinpe'
  numero: string
  iban?:  string | null
}

export interface EstadoCuentaExportParams {
  facturas:          Factura[]
  clienteNombre:     string
  contribuyente:     string
  clienteCod:        string
  observaciones?:    string
  cuentas:           CuentaBancaria[]
  fechaCorte:        string   // dd/MM/yyyy
  analistaNombre:    string
  analistaEmail:     string
  analistaTelefono?: string | null
  analistaWhatsapp?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmtPDF(n: number): string {
  return 'CRC ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtFechaPDF(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length < 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/** Días de vencimiento (positivo = vencida) */
function diasVenc(fv: string, hoy: string): number {
  return Math.floor((new Date(hoy).getTime() - new Date(fv).getTime()) / 86400000)
}

/** Etiqueta de estado para una factura */
export function estadoLabelExport(fv: string | null | undefined, hoy: string): string {
  if (!fv) return 'Sin fecha'
  const d = diasVenc(fv, hoy)
  if (d < 0)  return `Vence en ${Math.abs(d)}d`
  if (d === 0) return 'Vence hoy'
  return `Vencida ${d}d`
}

/** Calcula aging por tramo desde las facturas */
export function calcAging(facturas: Factura[], hoy: string) {
  const r = { aldia: 0, m1_30: 0, m31_60: 0, m61_90: 0, m91_120: 0, m120plus: 0 }
  for (const f of facturas) {
    if (!f.saldo || f.saldo <= 0 || !f.fecha_vencimiento) continue
    const d = diasVenc(f.fecha_vencimiento, hoy)
    if (d < 0)        r.aldia    += f.saldo
    else if (d <= 30) r.m1_30    += f.saldo
    else if (d <= 60) r.m31_60   += f.saldo
    else if (d <= 90) r.m61_90   += f.saldo
    else if (d <= 120) r.m91_120 += f.saldo
    else              r.m120plus += f.saldo
  }
  return r
}

// ══════════════════════════════════════════════════════════════════════
// PDF — FORMATO PROFESIONAL
// ══════════════════════════════════════════════════════════════════════

/** Descarga el PDF directamente en el navegador */
export async function exportarEstadoCuentaPDF(params: EstadoCuentaExportParams): Promise<void> {
  const doc = await buildEstadoCuentaDoc(params)
  const safe = params.clienteCod.replace(/[^a-zA-Z0-9-]/g, '')
  doc.save(`estado-cuenta-${safe}.pdf`)
}

/** Retorna el PDF como base64 (para adjuntar en email) */
export async function generarEstadoCuentaBase64(params: EstadoCuentaExportParams): Promise<string> {
  const doc = await buildEstadoCuentaDoc(params)
  const dataUri = doc.output('datauristring') as string
  return dataUri.split(',')[1] ?? ''
}

// ── Construcción del documento PDF ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildEstadoCuentaDoc(params: EstadoCuentaExportParams): Promise<any> {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const {
    facturas, clienteNombre, contribuyente, clienteCod,
    observaciones, cuentas, fechaCorte,
    analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp,
  } = params

  const hoy        = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
  const aging      = calcAging(facturas, hoy)
  const totalSaldo = facturas.reduce((s, f) => s + (f.saldo || 0), 0)
  const totalMonto = facturas.reduce((s, f) => s + (f.monto || 0), 0)
  const totalVenc  = aging.m1_30 + aging.m31_60 + aging.m61_90 + aging.m91_120 + aging.m120plus
  const nFacturas  = facturas.filter(f => (f.saldo ?? 0) > 0).length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW = 210
  const ML = 12, MR = 12
  const CW = PW - ML - MR  // 186 mm

  // ──────────────────────────────────────────────────────────────────
  // HEADER (barra navy)
  // ──────────────────────────────────────────────────────────────────
  doc.setFillColor(0, 59, 92)
  doc.rect(0, 0, PW, 38, 'F')

  // Subtítulo SIC
  doc.setTextColor(0, 158, 227)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('SIC  COFERSA  |  CREDITO Y COBRO', ML, 13)

  // Título principal
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(17)
  doc.text('Estado de Cuenta', ML, 26)

  // Fecha de corte (derecha)
  doc.setTextColor(170, 205, 230)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de corte:', PW - MR, 18, { align: 'right' })
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(fechaCorte, PW - MR, 27, { align: 'right' })

  let y = 44

  // ──────────────────────────────────────────────────────────────────
  // DATOS DEL CLIENTE
  // ──────────────────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.rect(ML, y, CW, 22, 'FD')

  doc.setTextColor(148, 163, 184)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENTE', ML + 4, y + 7)
  doc.text('CONTRIBUYENTE / CEDULA', ML + CW * 0.52 + 4, y + 7)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  const nom = clienteNombre.length > 38 ? clienteNombre.slice(0, 35) + '...' : clienteNombre
  doc.text(nom, ML + 4, y + 16)
  doc.setFontSize(10)
  doc.text(contribuyente, ML + CW * 0.52 + 4, y + 16)

  y += 28

  // ──────────────────────────────────────────────────────────────────
  // 3 KPI CARDS
  // ──────────────────────────────────────────────────────────────────
  const kpiW = (CW - 4) / 3
  const kpiH = 24
  const kpis = [
    { label: 'SALDO TOTAL PENDIENTE', value: fmtPDF(totalSaldo) },
    { label: 'TOTAL VENCIDO',         value: fmtPDF(totalVenc)  },
    { label: 'FACTURAS PENDIENTES',   value: `${nFacturas} facturas` },
  ]
  kpis.forEach((kpi, i) => {
    const x = ML + i * (kpiW + 2)
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(226, 232, 240)
    doc.rect(x, y, kpiW, kpiH, 'FD')
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(kpi.label, x + 4, y + 8, { maxWidth: kpiW - 8 })
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(kpi.value, x + 4, y + 19, { maxWidth: kpiW - 8 })
  })

  y += kpiH + 7

  // ──────────────────────────────────────────────────────────────────
  // DISTRIBUCIÓN POR ANTIGÜEDAD (6 cajas)
  // ──────────────────────────────────────────────────────────────────
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DISTRIBUCION POR ANTIGUEDAD', ML, y)
  y += 4

  const agingData = [
    { label: 'Al dia',      color: [0,   158, 227] as const, amount: aging.aldia    },
    { label: '1-30 dias',   color: [245, 158,  11] as const, amount: aging.m1_30   },
    { label: '31-60 dias',  color: [249, 115,  22] as const, amount: aging.m31_60  },
    { label: '61-90 dias',  color: [239,  68,  68] as const, amount: aging.m61_90  },
    { label: '91-120 dias', color: [220,  38,  38] as const, amount: aging.m91_120 },
    { label: '+120 dias',   color: [153,  27,  27] as const, amount: aging.m120plus },
  ]
  const agingBoxW  = (CW - 5) / 6
  const agingBoxH  = 30
  const agingBarH  = 4

  agingData.forEach((tramo, i) => {
    const x   = ML + i * (agingBoxW + 1)
    const pct = totalSaldo > 0 ? Math.round((tramo.amount / totalSaldo) * 100) : 0
    const [r, g, b] = tramo.color

    // Barra de color arriba
    doc.setFillColor(r, g, b)
    doc.rect(x, y, agingBoxW, agingBarH, 'F')

    // Cuerpo de caja
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.rect(x, y + agingBarH, agingBoxW, agingBoxH - agingBarH, 'FD')

    // Label tramo
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(tramo.label, x + 2, y + agingBarH + 7, { maxWidth: agingBoxW - 4 })

    // Monto
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(fmtPDF(tramo.amount), x + 2, y + agingBarH + 16, { maxWidth: agingBoxW - 4 })

    // Porcentaje (color del tramo)
    doc.setTextColor(r, g, b)
    doc.setFontSize(8)
    doc.text(`${pct}%`, x + 2, y + agingBarH + 24)
  })

  y += agingBoxH + 9

  // ──────────────────────────────────────────────────────────────────
  // OBSERVACIONES (opcional)
  // ──────────────────────────────────────────────────────────────────
  if (observaciones?.trim()) {
    const obsText = observaciones.trim()
    const obsLines = doc.splitTextToSize(obsText, CW - 12) as string[]
    const obsH = Math.max(18, obsLines.length * 4.5 + 12)

    // Borde cyan izquierdo + fondo
    doc.setFillColor(240, 249, 255)
    doc.rect(ML + 2, y, CW - 2, obsH, 'F')
    doc.setFillColor(0, 158, 227)
    doc.rect(ML, y, 2, obsH, 'F')

    doc.setTextColor(3, 105, 161)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text('Observaciones del analista:', ML + 6, y + 7)
    doc.setFont('helvetica', 'italic')
    doc.text(obsLines, ML + 6, y + 13)

    y += obsH + 6
  }

  // ──────────────────────────────────────────────────────────────────
  // DETALLE DE FACTURAS
  // ──────────────────────────────────────────────────────────────────
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('DETALLE DE FACTURAS', ML, y)
  y += 4

  // Ordenar: vencidas primero (más antiguas primero), luego por vencer
  const facturasSorted = [...facturas]
    .filter(f => (f.saldo ?? 0) > 0)
    .sort((a, b) => {
      const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento, hoy) : -9999
      const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento, hoy) : -9999
      return db - da
    })

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Documento', 'Emision', 'Vencimiento', 'Monto', 'Saldo', 'Estado']],
    body: facturasSorted.map(f => [
      f.documento ?? '—',
      fmtFechaPDF(f.fecha_documento),
      fmtFechaPDF(f.fecha_vencimiento),
      fmtPDF(f.monto ?? 0),
      fmtPDF(f.saldo ?? 0),
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ]),
    foot: [['Total', '', '', fmtPDF(totalMonto), fmtPDF(totalSaldo), '']],
    styles:      { fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    headStyles:  { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
    footStyles:  { fillColor: [248, 250, 252], textColor: [30, 41, 59], fontStyle: 'bold',
                   lineWidth: { top: 0.5 }, lineColor: [203, 213, 225] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30 },
      3: { halign: 'right' },
      4: { halign: 'right', textColor: [220, 38, 38] },
      5: { cellWidth: 26 },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section !== 'body' || data.column.index !== 5) return
      const v = String(data.cell.raw ?? '')
      if (v.startsWith('Vencida'))      data.cell.styles.textColor = [220, 38, 38]
      else if (v === 'Vence hoy')       data.cell.styles.textColor = [234, 88, 12]
      else if (v.startsWith('Vence en')) data.cell.styles.textColor = [22, 163, 74]
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 60
  y += 9

  // ──────────────────────────────────────────────────────────────────
  // INFORMACIÓN PARA PAGOS (CRC)
  // ──────────────────────────────────────────────────────────────────
  const cuentasCRC = cuentas.filter(c => c.moneda === 'CRC' && c.tipo === 'cuenta')
  const sinpe      = cuentas.find(c => c.tipo === 'sinpe')

  if (cuentasCRC.length > 0 || sinpe) {
    if (y + 55 > 280) { doc.addPage(); y = 20 }

    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMACION PARA PAGOS EN COLONES (CRC)', ML, y)
    y += 4

    const rowH   = 10
    const blockH = (cuentasCRC.length * rowH) + (sinpe ? 12 : 0) + 14

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.rect(ML, y, CW, blockH, 'FD')

    // Cabecera de columnas
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    const cx = [ML + 4, ML + 58, ML + 108]
    doc.text('BANCO',     cx[0], y + 9)
    doc.text('N. CUENTA', cx[1], y + 9)
    doc.text('IBAN',      cx[2], y + 9)
    y += 14

    cuentasCRC.forEach(c => {
      doc.setTextColor(30, 41, 59)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.text(c.banco,           cx[0], y)
      doc.text(c.numero,          cx[1], y)
      doc.text(c.iban ?? '',      cx[2], y)
      y += rowH
    })

    if (sinpe) {
      y += 2
      doc.setFillColor(236, 253, 245)
      doc.rect(ML, y, CW, 10, 'F')
      doc.setTextColor(5, 150, 105)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.text(`Sinpe Movil:  ${sinpe.numero}`, ML + 4, y + 7)
      y += 14
    } else {
      y += 4
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // FOOTER
  // ──────────────────────────────────────────────────────────────────
  if (y + 20 > 280) { doc.addPage(); y = 20 }

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.rect(ML, y, CW, 18, 'FD')

  // Izquierda — datos del analista
  doc.setTextColor(148, 163, 184)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('EJECUTIVO DE CUENTA', ML + 4, y + 6)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const contactParts = [analistaNombre, analistaEmail]
  if (analistaTelefono) contactParts.push(`Tel: ${analistaTelefono}`)
  if (analistaWhatsapp) contactParts.push(`WA: ${analistaWhatsapp}`)
  doc.text(contactParts.join('  |  '), ML + 4, y + 14, { maxWidth: CW * 0.70 })

  // Derecha — créditos SIC
  doc.setTextColor(148, 163, 184)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(`SIC  Cofersa  ©  2026`, PW - MR - 4, y + 10, { align: 'right' })
  doc.text(`Codigo: ${clienteCod}`, PW - MR - 4, y + 15, { align: 'right' })

  return doc
}

// ══════════════════════════════════════════════════════════════════════
// EXCEL — FORMATO PROFESIONAL
// ══════════════════════════════════════════════════════════════════════

/** Descarga el Excel directamente en el navegador */
export function exportarEstadoCuentaExcel(params: EstadoCuentaExportParams): void {
  const { clienteCod } = params
  generarEstadoCuentaExcelBuffer(params).then(buffer => {
    import('xlsx').then(XLSX => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `estado-cuenta-${clienteCod.replace(/[^a-zA-Z0-9-]/g, '')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      // Use XLSX to suppress TS unused import
      void XLSX
    })
  })
}

/** Retorna el Excel como base64 (para adjuntar en email) */
export async function generarEstadoCuentaExcelBase64(params: EstadoCuentaExportParams): Promise<string> {
  const buffer = await generarEstadoCuentaExcelBuffer(params)
  const bytes  = new Uint8Array(buffer)
  let binary   = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function generarEstadoCuentaExcelBuffer(params: EstadoCuentaExportParams): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx')
  const { facturas, clienteNombre, contribuyente, clienteCod, fechaCorte, observaciones,
          analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp, cuentas } = params

  const hoy  = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
  const aging = calcAging(facturas, hoy)
  const totalSaldo  = facturas.reduce((s, f) => s + (f.saldo || 0), 0)
  const totalMonto  = facturas.reduce((s, f) => s + (f.monto || 0), 0)
  const totalVenc   = aging.m1_30 + aging.m31_60 + aging.m61_90 + aging.m91_120 + aging.m120plus

  const rows: (string | number | null)[][] = []

  // Encabezado
  rows.push(['COFERSA — ESTADO DE CUENTA', null, null, null, null, null])
  rows.push([`Cliente: ${clienteNombre}`, null, null, null, null, null])
  rows.push([`Contribuyente: ${contribuyente}`, null, null, null, null, null])
  rows.push([`Codigo: ${clienteCod}`, null, null, `Fecha de corte: ${fechaCorte}`, null, null])
  rows.push([])

  // Resumen KPIs
  rows.push(['RESUMEN', null, null, null, null, null])
  rows.push(['Saldo total pendiente', totalSaldo, null, 'Total vencido', totalVenc, null])
  rows.push(['Facturas pendientes', facturas.filter(f=>(f.saldo??0)>0).length, null, null, null, null])
  rows.push([])

  // Aging
  rows.push(['DISTRIBUCION POR ANTIGUEDAD (saldo)'])
  rows.push(['Al dia', aging.aldia, null, '1-30 dias', aging.m1_30, null])
  rows.push(['31-60 dias', aging.m31_60, null, '61-90 dias', aging.m61_90, null])
  rows.push(['91-120 dias', aging.m91_120, null, '+120 dias', aging.m120plus, null])
  rows.push([])

  // Observaciones
  if (observaciones?.trim()) {
    rows.push(['OBSERVACIONES'])
    rows.push([observaciones.trim()])
    rows.push([])
  }

  // Tabla de facturas
  rows.push(['DETALLE DE FACTURAS'])
  rows.push(['Documento', 'F. Emision', 'F. Vencimiento', 'Monto (CRC)', 'Saldo (CRC)', 'Estado'])

  const facturasSorted = [...facturas]
    .filter(f => (f.saldo ?? 0) > 0)
    .sort((a, b) => {
      const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento, hoy) : -9999
      const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento, hoy) : -9999
      return db - da
    })

  for (const f of facturasSorted) {
    rows.push([
      f.documento ?? '—',
      f.fecha_documento ?? '—',
      f.fecha_vencimiento ?? '—',
      f.monto ?? 0,
      f.saldo ?? 0,
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ])
  }
  rows.push(['TOTAL', null, null, totalMonto, totalSaldo, null])
  rows.push([])

  // Cuentas bancarias CRC
  const cuentasCRC = cuentas.filter(c => c.moneda === 'CRC' && c.tipo === 'cuenta')
  const sinpe      = cuentas.find(c => c.tipo === 'sinpe')
  if (cuentasCRC.length > 0 || sinpe) {
    rows.push(['INFORMACION PARA PAGOS (COLONES CRC)'])
    rows.push(['Banco', 'N. Cuenta', 'IBAN', null, null, null])
    for (const c of cuentasCRC) {
      rows.push([c.banco, c.numero, c.iban ?? '—', null, null, null])
    }
    if (sinpe) rows.push([`Sinpe Movil: ${sinpe.numero}`, null, null, null, null, null])
    rows.push([])
  }

  // Footer analista
  rows.push(['Ejecutivo de cuenta:', analistaNombre, analistaEmail,
    analistaTelefono ?? '', analistaWhatsapp ?? '', null])
  rows.push(['SIC Cofersa © 2026'])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta')

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
