'use client'

// src/components/analista/NotasRapidas.tsx
// Textarea de notas con auto-guardado. Columna derecha del dashboard.
// Extraído de CalendarioNotas.tsx — solo la sección de notas, sin el calendario.

import { useState, useCallback, useRef, useEffect } from 'react'
import { FileText, Check, Loader2 } from 'lucide-react'

interface Props {
  hoyStr: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
]

function labelFecha(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}

export default function NotasRapidas({ hoyStr }: Props) {
  const [nota,      setNota]      = useState('')
  const [loaded,    setLoaded]    = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargarNota = useCallback(async () => {
    try {
      const res  = await fetch(`/api/notas-rapidas?fecha=${hoyStr}`)
      const data = await res.json()
      setNota(data.contenido ?? '')
    } catch {
      // sin conexión — campo vacío
    } finally {
      setLoaded(true)
    }
  }, [hoyStr])

  useEffect(() => {
    cargarNota()
  }, [cargarNota])

  // Limpiar debounce pendiente al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const guardarNota = useCallback(async (contenido: string) => {
    setSaveState('saving')
    try {
      const res = await fetch('/api/notas-rapidas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fecha: hoyStr, contenido }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    } catch {
      setSaveState('error')
    }
    setTimeout(() => setSaveState('idle'), 2000)
  }, [hoyStr])

  function handleChange(v: string) {
    setNota(v)
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => guardarNota(v), 1000)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex-1" style={{ borderTop: '3px solid #009EE3' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={13} style={{ color: '#009ee3' }} />
          <span className="text-xs font-medium text-slate-700">Notas Rápidas</span>
        </div>
        <div className="text-[10px] h-4 flex items-center gap-1">
          {saveState === 'saving' && (
            <>
              <Loader2 size={10} className="animate-spin text-slate-400" />
              <span className="text-slate-400">Guardando...</span>
            </>
          )}
          {saveState === 'saved' && (
            <>
              <Check size={10} className="text-emerald-500" />
              <span className="text-emerald-500">Guardado</span>
            </>
          )}
          {saveState === 'error' && (
            <span className="text-red-500">Error al guardar</span>
          )}
        </div>
      </div>

      <div className="p-3">
        <p className="text-[10px] text-slate-400 mb-2">{labelFecha(hoyStr)}</p>
        {!loaded ? (
          <div className="flex justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <textarea
            value={nota}
            onChange={e => handleChange(e.target.value)}
            placeholder="Notas del día..."
            rows={4}
            aria-label="Notas del día"
            className="w-full resize-none border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 bg-white focus:outline-none focus:border-[#009ee3] transition"
            style={{ fontFamily: 'Nunito, sans-serif', lineHeight: '1.6' }}
          />
        )}
        <p className="text-[9px] text-slate-400 text-right mt-1">
          Guardado automático
        </p>
      </div>
    </div>
  )
}
