'use client'

import { useState, useMemo, useCallback } from 'react'
import { CalendarRange, Download, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Gestion } from '@/types/database'

// ── Helpers ──────────────────────────────────────────────────────

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function calcularMetricas(gestiones: Gestion[]) {
  const porTipo: Record<string, number>      = {}
  const porResultado: Record<string, number> = {}
  let promesasGeneradas = 0
  let gestionesConExito = 0

  for (const g of gestiones) {
    // Por tipo
    porTipo[g.tipo] = (porTipo[g.tipo] ?? 0) + 1

    // Por resultado
    porResultado[g.resultado] = (porResultado[g.resultado] ?? 0) + 1

    // Promesas generadas
    if (g.resultado === 'Promesa OK') promesasGeneradas++

    // Éxito: promesa, cobro o convenio
    if (['Promesa OK', 'Pagó', 'Aceptó convenio'].includes(g.resultado)) gestionesConExito++
  }

  return { porTipo, porResultado, promesasGeneradas, gestionesConExito }
}

// Color por resultado
function colorResultado(resultado: string): { bg: string; text: string } {
  if (resultado === 'Promesa OK' || resultado === 'Pagó' || resultado === 'Aceptó convenio') {
    return { bg: '#f0fdf4', text: '#166534' }
  }
  if (resultado === 'No contestó' || resultado === 'No ubicado') {
    return { bg: '#fef2f2', text: '#991b1b' }
  }
  if (resultado === 'Email enviado' || resultado === 'Estado de cuenta enviado') {
    return { bg: '#f0f9ff', text: '#0369a1' }
  }
  return { bg: '#f9fafb', text: '#6b7280' }
}

// ── Props ─────────────────────────────────────────────────────────

interface Props {
  gestionesIniciales: Gestion[]
  inicioMesDefault: string
  finMesDefault: string
  userEmail: string
}

// ── Componente ────────────────────────────────────────────────────

export default function GestionesPeriodoCliente({
  gestionesIniciales,
  inicioMesDefault,
  finMesDefault,
  userEmail,
}: Props) {
  const [fechaInicio, setFechaInicio] = useState(inicioMesDefault)
  const [fechaFin,    setFechaFin]    = useState(finMesDefault)
  const [gestiones, setGestiones]     = useState<Gestion[]>(gestionesIniciales)
  const [cargando, setCargando]       = useState(false)

  // Re-consultar cuando cambia el rango
  const buscarGestiones = useCallback(async (inicio: string, fin: string) => {
    setCargando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('gestiones')
      .select('*')
      .eq('analista_email', userEmail)
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
    setGestiones((data ?? []) as Gestion[])
    setCargando(false)
  }, [userEmail])

  function handleRango() {
    buscarGestiones(fechaInicio, fechaFin)
  }

  // Métricas calculadas
  const metricas = useMemo(() => calcularMetricas(gestiones), [gestiones])
  const tasaExito = gestiones.length > 0
    ? ((metricas.gestionesConExito / gestiones.length) * 100).toFixed(1)
    : '0.0'

  // ── Export PDF ──────────────────────────────────────────────────
  async function exportarPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    // Encabezado
    doc.setFillColor(0, 59, 92)     // #003B5C
    doc.rect(0, 0, 297, 18, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('COFERSA — Reporte de Gestiones del Período', 12, 12)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`${fmtFecha(fechaInicio)} al ${fmtFecha(fechaFin)}  ·  Generado: ${fmtFecha(new Date().toISOString())}`, 12, 17)

    // Métricas resumen
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total gestiones: ${gestiones.length}`, 12, 27)
    doc.text(`Promesas generadas: ${metricas.promesasGeneradas}`, 70, 27)
    doc.text(`Tasa de éxito: ${tasaExito}%`, 140, 27)

    // Tabla de gestiones
    autoTable(doc, {
      startY: 32,
      head: [['Fecha', 'Hora', 'Cliente', 'Tipo', 'Resultado', 'Nota']],
      body: gestiones.map(g => [
        fmtFecha(g.fecha),
        g.hora ?? '—',
        `${(g as Gestion & { cliente_nombre?: string }).cliente_nombre ?? g.cliente_cod ?? '—'}`,
        g.tipo,
        g.resultado,
        g.nota ? (g.nota.length > 60 ? g.nota.slice(0, 60) + '…' : g.nota) : '—',
      ]),
      headStyles: {
        fillColor: [0, 158, 227],   // #009ee3
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 16 },
        2: { cellWidth: 60 },
        3: { cellWidth: 24 },
        4: { cellWidth: 30 },
        5: { cellWidth: 'auto' },
      },
      margin: { left: 12, right: 12 },
    })

    const fecha = new Date().toISOString().slice(0, 10)
    doc.save(`gestiones-periodo-${fecha}.pdf`)
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestiones del Período</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Actividad de cobro registrada en el rango seleccionado
          </p>
        </div>
        <button
          onClick={exportarPDF}
          disabled={gestiones.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          style={{ backgroundColor: '#003B5C', fontSize: '13px' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#002a44' }}
          onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#003B5C' }}
        >
          <Download size={14} />
          Exportar PDF
        </button>
      </div>

      {/* Selector de rango */}
      <div
        className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 mb-5 w-fit"
      >
        <CalendarRange size={16} className="text-gray-400" />
        <label className="text-sm text-gray-600 font-medium">Desde</label>
        <input
          type="date"
          value={fechaInicio}
          onChange={e => setFechaInicio(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none"
        />
        <span className="text-gray-400">—</span>
        <label className="text-sm text-gray-600 font-medium">Hasta</label>
        <input
          type="date"
          value={fechaFin}
          onChange={e => setFechaFin(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none"
        />
        <button
          onClick={handleRango}
          disabled={cargando}
          className="rounded-lg px-3 py-1.5 text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: '#009ee3', fontSize: '12px' }}
        >
          {cargando ? 'Cargando…' : 'Aplicar'}
        </button>
      </div>

      {gestiones.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
          <FileText size={48} className="text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Sin gestiones en este período</h2>
          <p className="text-sm text-gray-500 max-w-md">
            No se encontraron gestiones registradas entre {fmtFecha(fechaInicio)} y {fmtFecha(fechaFin)}.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total gestiones',       valor: gestiones.length,               color: '#003B5C' },
              { label: 'Promesas generadas',     valor: metricas.promesasGeneradas,     color: '#009ee3' },
              { label: 'Gestiones con éxito',   valor: metricas.gestionesConExito,     color: '#22c55e' },
              { label: 'Tasa de éxito',          valor: `${tasaExito}%`,               color: '#f59e0b' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="uppercase tracking-wide font-bold text-gray-400" style={{ fontSize: '10px' }}>
                  {k.label}
                </p>
                <p className="font-bold mt-1" style={{ fontSize: '22px', color: k.color }}>
                  {k.valor}
                </p>
              </div>
            ))}
          </div>

          {/* Fila de desglose: por tipo + por resultado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {/* Por tipo */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Por tipo</p>
              <div className="space-y-2">
                {Object.entries(metricas.porTipo)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tipo, count]) => (
                    <div key={tipo} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{tipo}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round((count / gestiones.length) * 100)}%`,
                              backgroundColor: '#009ee3',
                            }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-6 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Por resultado */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Por resultado</p>
              <div className="space-y-2">
                {Object.entries(metricas.porResultado)
                  .sort((a, b) => b[1] - a[1])
                  .map(([resultado, count]) => {
                    const { bg, text } = colorResultado(resultado)
                    return (
                      <div key={resultado} className="flex items-center justify-between">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                          style={{ background: bg, color: text, fontSize: '11px' }}
                        >
                          {resultado}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">{count}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Detalle — {gestiones.length} gestiones
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {['Fecha', 'Hora', 'Cliente', 'Tipo', 'Resultado', 'Nota'].map(h => (
                      <th
                        key={h}
                        className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide"
                        style={{ fontSize: '10px', color: '#9ca3af' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gestiones.map((g, i) => {
                    const { bg, text } = colorResultado(g.resultado)
                    return (
                      <tr
                        key={g.id}
                        style={{ borderBottom: i < gestiones.length - 1 ? '1px solid #f9fafb' : 'none' }}
                      >
                        <td className="px-4 py-2.5 text-gray-600" style={{ fontSize: '13px' }}>
                          {fmtFecha(g.fecha)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400" style={{ fontSize: '13px' }}>
                          {g.hora ?? '—'}
                        </td>
                        <td className="px-4 py-2.5" style={{ fontSize: '13px' }}>
                          <p className="font-semibold text-gray-900">{(g as Gestion & { cliente_nombre?: string }).cliente_nombre ?? g.cliente_cod}</p>
                          <p className="text-gray-400" style={{ fontSize: '11px' }}>{g.cliente_cod}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600" style={{ fontSize: '13px' }}>
                          {g.tipo}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 font-semibold"
                            style={{ background: bg, color: text, fontSize: '11px' }}
                          >
                            {g.resultado}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 max-w-xs" style={{ fontSize: '12px' }}>
                          <span className="line-clamp-2">{g.nota || '—'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
