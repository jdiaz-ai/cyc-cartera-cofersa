'use client'
/**
 * Utilidades de exportación para Estado de Cuenta
 * Genera PDF (jsPDF + autotable) y Excel (SheetJS) en formato simple y profesional.
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

/** Formato CR sin prefijo: 38.543,27  (para columnas cuyo encabezado ya dice CRC) */
function fmtPDF(n: number): string {
  const [intPart, decPart] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart
}

/** Formato CR con prefijo para KPIs y totales: CRC 38.543,27 */
function fmtPDFLabel(n: number): string {
  return 'CRC ' + fmtPDF(n)
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
  if (d < 0)   return `Vence en ${Math.abs(d)}d`
  if (d === 0) return 'Vence hoy'
  return `Vencida ${d}d`
}

/** Calcula aging por tramo desde las facturas */
export function calcAging(facturas: Factura[], hoy: string) {
  const r = { aldia: 0, m1_30: 0, m31_60: 0, m61_90: 0, m91_120: 0, m120plus: 0 }
  for (const f of facturas) {
    if (!f.saldo || f.saldo <= 0 || !f.fecha_vencimiento) continue
    const d = diasVenc(f.fecha_vencimiento, hoy)
    if (d < 0)         r.aldia    += f.saldo
    else if (d <= 30)  r.m1_30    += f.saldo
    else if (d <= 60)  r.m31_60   += f.saldo
    else if (d <= 90)  r.m61_90   += f.saldo
    else if (d <= 120) r.m91_120  += f.saldo
    else               r.m120plus += f.saldo
  }
  return r
}

/** Carga una imagen como data URL para usar en jsPDF */
async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res  = await fetch(src)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader     = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror   = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════════

/** Descarga el PDF directamente en el navegador */
export async function exportarEstadoCuentaPDF(params: EstadoCuentaExportParams): Promise<void> {
  const doc  = await buildEstadoCuentaDoc(params)
  const safe = params.clienteCod.replace(/[^a-zA-Z0-9-]/g, '')
  doc.save(`estado-cuenta-${safe}.pdf`)
}

/** Retorna el PDF como base64 (para adjuntar en email) */
export async function generarEstadoCuentaBase64(params: EstadoCuentaExportParams): Promise<string> {
  const doc     = await buildEstadoCuentaDoc(params)
  const dataUri = doc.output('datauristring') as string
  return dataUri.split(',')[1] ?? ''
}

// ── Construcción del documento PDF ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildEstadoCuentaDoc(params: EstadoCuentaExportParams): Promise<any> {
  const { default: jsPDF }     = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const {
    facturas, clienteNombre, contribuyente, clienteCod,
    observaciones, cuentas, fechaCorte,
    analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp,
  } = params

  const hoy        = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
  const totalSaldo = facturas.reduce((s, f) => s + (f.saldo || 0), 0)
  const totalMonto = facturas.reduce((s, f) => s + (f.monto || 0), 0)
  const aging      = calcAging(facturas, hoy)
  // Total vencido = todos los tramos excepto "al día"
  const totalVenc  = aging.m1_30 + aging.m31_60 + aging.m61_90 + aging.m91_120 + aging.m120plus
  const nPend      = facturas.filter(f => (f.saldo ?? 0) > 0).length

  // Precarga del logo antes de crear el doc
  const logoDataUrl = await loadImageAsDataUrl('/logo-cofersa.png')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = new (jsPDF as any)({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const PW = 210
  const ML = 12, MR = 12
  const CW = PW - ML - MR  // 186 mm

  // ─── HEADER (barra cyan corporativo #009EE3, compacta 24 mm) ────────
  const HEADER_H = 24
  doc.setFillColor(0, 158, 227)    // #009EE3 — cyan corporativo Cofersa
  doc.rect(0, 0, PW, HEADER_H, 'F')

  // Logo (izquierda) — altura 14 mm, ancho proporcional ≈ 36 mm
  // Sin fondo blanco: logo directamente sobre el header cyan
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', ML, 5, 36, 14)
  } else {
    // Fallback si el logo no carga
    doc.setTextColor(0, 59, 92)     // navy corporativo
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('COFERSA', ML, 15)
  }

  // Título (centro) — navy sobre cyan para contraste adecuado
  doc.setTextColor(0, 59, 92)       // #003B5C navy corporativo
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Estado de Cuenta', PW / 2, 15, { align: 'center' })

  // Fecha de corte (derecha) — navy para contraste
  doc.setTextColor(0, 59, 92)       // #003B5C navy corporativo
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Fecha de corte', PW - MR, 10, { align: 'right' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(fechaCorte, PW - MR, 18, { align: 'right' })

  let y = HEADER_H + 5

  // ─── DATOS DEL CLIENTE (18 mm) ───────────────────────────────────────
  const CLIENT_H = 18
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.rect(ML, y, CW, CLIENT_H, 'FD')

  // Separador vertical al 55% del ancho
  const divX = ML + CW * 0.55
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(divX, y + 3, divX, y + CLIENT_H - 3)

  // Nombre del cliente (izquierda)
  doc.setTextColor(163, 163, 163)   // #A3A3A3 gris claro corporativo
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENTE', ML + 5, y + 6)
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  const nom = clienteNombre.length > 44 ? clienteNombre.slice(0, 41) + '...' : clienteNombre
  doc.text(nom, ML + 5, y + 13)

  // Contribuyente (mitad derecha)
  doc.setTextColor(163, 163, 163)   // #A3A3A3 gris claro corporativo
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTRIBUYENTE / CEDULA', divX + 5, y + 6)
  doc.setTextColor(30, 41, 59)
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.text(contribuyente, divX + 5, y + 13)

  y += CLIENT_H + 4

  // ─── KPI ROW (3 tarjetas compactas, dos zonas: gris arriba + blanco abajo) ──
  // Mismo estilo que el email HTML: zona gris #f1f5f9 para el label,
  // zona blanca para el valor — igual que los cards del estado de cuenta por correo.
  const KPI_H        = 16    // mm — altura total del card
  const LABEL_ZONE_H = 6.5   // mm — altura de la zona gris (label)
  const kpiW         = (CW - 4) / 3
  const kpis = [
    { label: 'SALDO TOTAL PENDIENTE', value: fmtPDFLabel(totalSaldo) },
    { label: 'TOTAL VENCIDO',          value: fmtPDFLabel(totalVenc)  },
    { label: 'FACTURAS PENDIENTES',    value: `${nPend} documentos`   },
  ]
  kpis.forEach((k, i) => {
    const x  = ML + i * (kpiW + 2)
    const cx = x + kpiW / 2   // centro horizontal del card

    // Zona superior gris — label
    doc.setFillColor(241, 245, 249)   // #f1f5f9
    doc.setDrawColor(226, 232, 240)   // #e2e8f0
    doc.setLineWidth(0.2)
    doc.rect(x, y, kpiW, LABEL_ZONE_H, 'FD')

    // Zona inferior blanca — valor
    doc.setFillColor(255, 255, 255)
    doc.rect(x, y + LABEL_ZONE_H, kpiW, KPI_H - LABEL_ZONE_H, 'FD')

    // Label centrado en zona gris
    doc.setTextColor(100, 116, 139)   // #64748b gris slate
    doc.setFontSize(6)
    doc.setFont('helvetica', 'bold')
    doc.text(k.label, cx, y + 4.5, { align: 'center', maxWidth: kpiW - 6 })

    // Valor centrado en zona blanca
    doc.setTextColor(30, 41, 59)      // #1e293b casi negro
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(k.value, cx, y + LABEL_ZONE_H + 6.5, { align: 'center', maxWidth: kpiW - 6 })
  })

  y += KPI_H + 4

  // ─── OBSERVACIONES (opcional) ────────────────────────────────────────
  if (observaciones?.trim()) {
    const obsLines = doc.splitTextToSize(observaciones.trim(), CW - 10) as string[]
    const obsH     = Math.max(12, obsLines.length * 4 + 9)
    doc.setFillColor(240, 249, 255)
    doc.rect(ML + 2, y, CW - 2, obsH, 'F')
    doc.setFillColor(0, 158, 227)
    doc.rect(ML, y, 2, obsH, 'F')
    doc.setTextColor(3, 105, 161)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text('Nota del analista:', ML + 6, y + 6)
    doc.setFont('helvetica', 'italic')
    doc.text(obsLines, ML + 6, y + 11)
    y += obsH + 4
  }

  // ─── DETALLE DE FACTURAS ─────────────────────────────────────────────
  y += 4   // espacio extra antes del título de la sección
  doc.setTextColor(163, 163, 163)   // #A3A3A3 gris claro corporativo
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('DETALLE DE FACTURAS PENDIENTES', ML, y)
  y += 4

  // Ordenar: vencidas primero (mayor antigüedad primero)
  const facturasSorted = [...facturas]
    .filter(f => (f.saldo ?? 0) > 0)
    .sort((a, b) => {
      const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento, hoy) : -9999
      const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento, hoy) : -9999
      return db - da
    })

  // Anchos fijos: 42+22+26+32+32+32 = 186 = CW
  autoTable(doc, {
    startY:   y,
    margin:   { left: ML, right: MR },
    showFoot: 'lastPage',
    head: [['Documento', 'Emision', 'Vencimiento', 'Monto (CRC)', 'Saldo (CRC)', 'Estado']],
    body: facturasSorted.map(f => [
      f.documento ?? '—',
      fmtFechaPDF(f.fecha_documento),
      fmtFechaPDF(f.fecha_vencimiento),
      fmtPDF(f.monto ?? 0),
      fmtPDF(f.saldo ?? 0),
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ]),
    foot: [['Total', '', '', fmtPDF(totalMonto), fmtPDF(totalSaldo), '']],
    styles: {
      fontSize:    8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    headStyles: {
      fillColor:   [0, 158, 227],   // #009EE3 cyan corporativo Cofersa
      textColor:   [255, 255, 255],
      fontStyle:   'bold',
      fontSize:    7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    footStyles: {
      fillColor: [248, 250, 252],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
      lineWidth: { top: 0.4 },
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },    // Documento
      1: { cellWidth: 22 },                        // Emision
      2: { cellWidth: 26 },                        // Vencimiento
      3: { cellWidth: 32, halign: 'right' },       // Monto — mismo color que texto normal
      4: { cellWidth: 32, halign: 'right' },       // Saldo  — mismo color que Monto (sin rojo)
      5: { cellWidth: 32 },                        // Estado — colores corporativos vía didParseCell
    },
    // Colores corporativos Cofersa para la columna Estado
    // Guía Tipográfica: Rojo #D80236, Naranja #FF6F00, Verde #006400
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section !== 'body' || data.column.index !== 5) return
      const v = String(data.cell.raw ?? '')
      if (v.startsWith('Vencida'))       data.cell.styles.textColor = [216,   2,  54]  // #D80236 rojo
      else if (v === 'Vence hoy')        data.cell.styles.textColor = [255, 111,   0]  // #FF6F00 naranja
      else if (v.startsWith('Vence en')) data.cell.styles.textColor = [  0, 100,   0]  // #006400 verde
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 60
  y += 6

  // ─── SINPE (compacto, si existe) ──────────────────────────────────────
  const sinpe = cuentas.find(c => c.tipo === 'sinpe')
  if (sinpe) {
    if (y + 12 > 282) { doc.addPage(); y = 15 }
    doc.setFillColor(236, 253, 245)
    doc.setDrawColor(167, 243, 208)
    doc.setLineWidth(0.2)
    doc.rect(ML, y, CW, 10, 'FD')
    doc.setTextColor(5, 150, 105)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`SINPE Movil: ${sinpe.numero}`, ML + 4, y + 7)
    y += 14
  }

  // ─── PIE DE PÁGINA — ejecutivo de cuenta ─────────────────────────────
  if (y + 14 > 285) { doc.addPage(); y = 15 }

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.2)
  doc.rect(ML, y, CW, 14, 'FD')

  doc.setTextColor(148, 163, 184)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('EJECUTIVO DE CUENTA', ML + 4, y + 5)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  const contactParts = [analistaNombre, analistaEmail]
  if (analistaTelefono) contactParts.push(`Tel: ${analistaTelefono}`)
  if (analistaWhatsapp) contactParts.push(`WA: ${analistaWhatsapp}`)
  doc.text(contactParts.join('  |  '), ML + 4, y + 11, { maxWidth: CW * 0.72 })

  doc.setTextColor(148, 163, 184)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Cofersa © 2026   Cod: ${clienteCod}`, PW - MR - 2, y + 11, { align: 'right' })

  return doc
}

// ══════════════════════════════════════════════════════════════════════
// EXCEL — simple: encabezado + tabla de facturas + total
// ══════════════════════════════════════════════════════════════════════

/** Descarga el Excel directamente en el navegador */
export function exportarEstadoCuentaExcel(params: EstadoCuentaExportParams): void {
  const { clienteCod } = params
  generarEstadoCuentaExcelBuffer(params).then(buffer => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `estado-cuenta-${clienteCod.replace(/[^a-zA-Z0-9-]/g, '')}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
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
  const {
    facturas, clienteNombre, contribuyente, clienteCod, fechaCorte,
    analistaNombre, analistaEmail,
  } = params

  const hoy        = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
  const totalSaldo = facturas.reduce((s, f) => s + (f.saldo || 0), 0)
  const totalMonto = facturas.reduce((s, f) => s + (f.monto || 0), 0)

  const rows: (string | number | null)[][] = []

  // ── Encabezado ────────────────────────────────────────────────────────
  rows.push(['COFERSA — ESTADO DE CUENTA'])
  rows.push([`Cliente: ${clienteNombre}`])
  rows.push([`Contribuyente / Cedula: ${contribuyente}`])
  rows.push([`Codigo: ${clienteCod}`, null, null, null, `Fecha de corte: ${fechaCorte}`])
  rows.push([])

  // ── Cabeceras de columna ──────────────────────────────────────────────
  rows.push(['Documento', 'F. Emision', 'F. Vencimiento', 'Monto (CRC)', 'Saldo (CRC)', 'Estado'])

  // ── Facturas (vencidas primero, montos como números reales) ───────────
  const sorted = [...facturas]
    .filter(f => (f.saldo ?? 0) > 0)
    .sort((a, b) => {
      const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento, hoy) : -9999
      const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento, hoy) : -9999
      return db - da
    })

  for (const f of sorted) {
    rows.push([
      f.documento ?? '—',
      fmtFechaPDF(f.fecha_documento),    // DD/MM/YYYY
      fmtFechaPDF(f.fecha_vencimiento),  // DD/MM/YYYY
      Math.round((f.monto ?? 0) * 100) / 100,   // número real (sumable en Excel)
      Math.round((f.saldo ?? 0) * 100) / 100,   // número real (sumable en Excel)
      estadoLabelExport(f.fecha_vencimiento, hoy),
    ])
  }

  // ── Fila de totales ───────────────────────────────────────────────────
  rows.push([
    'TOTAL', null, null,
    Math.round(totalMonto * 100) / 100,
    Math.round(totalSaldo * 100) / 100,
    null,
  ])
  rows.push([])

  // ── Ejecutivo de cuenta ───────────────────────────────────────────────
  rows.push([`Ejecutivo: ${analistaNombre}`, null, null, null, analistaEmail])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 20 },  // Documento
    { wch: 14 },  // F. Emision
    { wch: 16 },  // F. Vencimiento
    { wch: 18 },  // Monto
    { wch: 18 },  // Saldo
    { wch: 16 },  // Estado
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
