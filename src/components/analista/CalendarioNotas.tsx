'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { CalendarEvent } from '@/lib/services/googleCalendarService'
import { ChevronLeft, ChevronRight, Calendar, FileText, Check, Loader2 } from 'lucide-react'

interface Props {
  eventos: CalendarEvent[]
  hoyStr: string  // YYYY-MM-DD (Costa Rica)
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// Devuelve YYYY-MM-DD de una fecha local sin desfase de zona horaria
function toYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Nombre del mes en español
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CalendarioNotas({ eventos, hoyStr }: Props) {
  const hoy = new Date(hoyStr + 'T12:00:00') // mediodía para evitar desfases
  const [viewYear,  setViewYear]  = useState(hoy.getFullYear())
  const [viewMonth, setViewMonth] = useState(hoy.getMonth())   // 0-indexed
  const [selected,  setSelected]  = useState<string>(hoyStr)
  const [nota,      setNota]      = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading,   setLoading]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Índice: fecha YYYY-MM-DD → colores de eventos de ese día
  const eventosPorDia = useRef<Map<string, string[]>>(new Map())
  useEffect(() => {
    const m = new Map<string, string[]>()
    for (const e of eventos) {
      // Eventos pueden abarcar varios días
      const start = new Date(e.start + 'T12:00:00')
      const end   = new Date(e.end   + 'T12:00:00')
      const cur   = new Date(start)
      while (cur <= end) {
        const k = toYMD(cur.getFullYear(), cur.getMonth(), cur.getDate())
        if (!m.has(k)) m.set(k, [])
        m.get(k)!.push(e.colorHex)
        cur.setDate(cur.getDate() + 1)
      }
    }
    eventosPorDia.current = m
  }, [eventos])

  // Carga la nota del día seleccionado
  const cargarNota = useCallback(async (fecha: string) => {
    setLoading(true)
    setNota('')
    setSaveState('idle')
    try {
      const res  = await fetch(`/api/notas-rapidas?fecha=${fecha}`)
      const data = await res.json()
      setNota(data.contenido ?? '')
    } catch {
      // sin conexión — continuar con campo vacío
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarNota(selected)
  }, [selected, cargarNota])

  // Auto-save con debounce 1 s
  const guardarNota = useCallback(async (contenido: string, fecha: string) => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/notas-rapidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, contenido }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
    // Vuelve a idle después de 2 s
    setTimeout(() => setSaveState('idle'), 2000)
  }, [])

  function handleNotaChange(v: string) {
    setNota(v)
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => guardarNota(v, selected), 1000)
  }

  // ── Navegación del calendario ──────────────────────────────────────────
  function prevMes() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMes() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // ── Construcción de la grilla ──────────────────────────────────────────
  // Primer día del mes (0=Dom...6=Sab → convertir a Lun=0)
  const primerDia    = new Date(viewYear, viewMonth, 1)
  const diasEnMes    = new Date(viewYear, viewMonth + 1, 0).getDate()
  // getDay(): 0=Dom → queremos Lunes como columna 0
  const offsetLunes  = (primerDia.getDay() + 6) % 7  // Dom(0)→6, Lun(1)→0, ...

  const celdas: (number | null)[] = [
    ...Array(offsetLunes).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]
  // Rellenar hasta múltiplo de 7
  while (celdas.length % 7 !== 0) celdas.push(null)

  // ── Eventos del día seleccionado ──────────────────────────────────────
  const eventosHoySelected = eventos.filter(e => {
    const start = new Date(e.start + 'T12:00:00')
    const end   = new Date(e.end   + 'T12:00:00')
    const sel   = new Date(selected + 'T12:00:00')
    return sel >= start && sel <= end
  })

  // ── Formato de fecha para mostrar ─────────────────────────────────────
  function labelFecha(ymd: string) {
    const [y, m, d] = ymd.split('-').map(Number)
    return `${MESES[m - 1]} ${d}, ${y}`
  }

  const isPasado = (ymd: string) => ymd < hoyStr
  const isHoy    = (ymd: string) => ymd === hoyStr

  return (
    <div className="flex flex-col gap-4">

      {/* ── Mini Calendario ─────────────────────────────────── */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '0.5px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        {/* Header navegación */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '0.5px solid #f3f4f6' }}>
          <button
            onClick={prevMes}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
            style={{ color: '#6b7280' }}
          >
            <ChevronLeft size={14} />
          </button>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', letterSpacing: '-0.01em' }}>
            {MESES[viewMonth]} {viewYear}
          </p>
          <button
            onClick={nextMes}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
            style={{ color: '#6b7280' }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Días de la semana */}
        <div className="grid grid-cols-7 px-3 pt-2 pb-1">
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="text-center" style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.05em' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grilla de días */}
        <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
          {celdas.map((dia, idx) => {
            if (dia === null) return <div key={`e-${idx}`} />

            const ymd         = toYMD(viewYear, viewMonth, dia)
            const pasado      = isPasado(ymd)
            const esHoy       = isHoy(ymd)
            const esSelected  = ymd === selected
            const colores     = eventosPorDia.current.get(ymd) ?? []
            const tieneEvento = colores.length > 0

            let numColor   = '#1f2937'
            let bgColor    = 'transparent'
            let cursor     = 'pointer'

            if (pasado) {
              numColor = '#d1d5db'
              cursor   = 'default'
            } else if (esSelected && esHoy) {
              bgColor  = '#0369a1'
              numColor = '#ffffff'
            } else if (esSelected) {
              bgColor  = '#009ee3'
              numColor = '#ffffff'
            } else if (esHoy) {
              bgColor  = '#e0f2fe'
              numColor = '#0369a1'
            }

            return (
              <button
                key={ymd}
                disabled={pasado}
                onClick={() => !pasado && setSelected(ymd)}
                className="relative flex flex-col items-center justify-center rounded-md transition-colors"
                style={{
                  height: '28px',
                  background: bgColor,
                  cursor,
                  outline: 'none',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: esHoy || esSelected ? 700 : 400, color: numColor, lineHeight: 1 }}>
                  {dia}
                </span>
                {tieneEvento && (
                  <div className="flex gap-0.5 mt-0.5">
                    {colores.slice(0, 3).map((c, ci) => (
                      <div key={ci} style={{ width: '3px', height: '3px', borderRadius: '50%', background: esSelected ? 'rgba(255,255,255,0.8)' : c }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Notas Rápidas ────────────────────────────────────── */}
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '0.5px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '0.5px solid #f3f4f6' }}>
          <div className="flex items-center gap-2">
            <FileText size={13} style={{ color: '#009ee3' }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#1f2937' }}>Notas Rápidas</span>
          </div>
          {/* Indicador de guardado */}
          <div style={{ fontSize: '10px', height: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {saveState === 'saving' && (
              <>
                <Loader2 size={10} className="animate-spin" style={{ color: '#9ca3af' }} />
                <span style={{ color: '#9ca3af' }}>Guardando...</span>
              </>
            )}
            {saveState === 'saved' && (
              <>
                <Check size={10} style={{ color: '#22c55e' }} />
                <span style={{ color: '#22c55e' }}>Guardado</span>
              </>
            )}
            {saveState === 'error' && (
              <span style={{ color: '#dc2626' }}>Error al guardar</span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Fecha seleccionada */}
          <div className="flex items-center gap-2">
            <Calendar size={11} style={{ color: '#009ee3', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#0369a1' }}>{labelFecha(selected)}</span>
            {isHoy(selected) && (
              <span style={{ fontSize: '9px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '20px' }}>HOY</span>
            )}
          </div>

          {/* Eventos de ese día */}
          {eventosHoySelected.length > 0 && (
            <div className="space-y-1">
              {eventosHoySelected.map(e => (
                <div key={e.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: '#f0f4f8' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: e.colorHex, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.summary}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Textarea de nota */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={16} className="animate-spin" style={{ color: '#9ca3af' }} />
            </div>
          ) : (
            <textarea
              value={nota}
              onChange={e => handleNotaChange(e.target.value)}
              placeholder={isPasado(selected)
                ? 'Este día ya pasó — no se pueden editar notas'
                : 'Agregá tus notas del día...'}
              disabled={isPasado(selected)}
              rows={3}
              style={{
                width: '100%',
                resize: 'none',
                border: '0.5px solid #e5e7eb',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#374151',
                background: isPasado(selected) ? '#f9fafb' : '#ffffff',
                outline: 'none',
                fontFamily: 'Nunito, sans-serif',
                lineHeight: '1.6',
              }}
              onFocus={e => { if (!isPasado(selected)) e.target.style.borderColor = '#009ee3' }}
              onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
            />
          )}

          {/* Hint */}
          {!isPasado(selected) && (
            <p style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'right' }}>
              Guardado automático al escribir
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
