'use client'

import { useState } from 'react'
import { AlertCircle, X, Save } from 'lucide-react'

export interface SemaforoData { [clave: string]: string }

interface Props { semaforo: SemaforoData }

const inputN = 'w-20 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

const CAMPOS = [
  {
    nivel: 'ROJO', color: '#dc2626', bg: '#fef2f2', border: '#fecaca',
    campos: [
      { clave: 'semaforo_rojo_mora_dias',        label: 'Mora mayor a (días)',          hint: 'Cliente con facturas en tramo ≥ N días de mora' },
      { clave: 'semaforo_rojo_sin_gestion_dias', label: 'Sin gestión ≥ (días)',          hint: 'Cliente sin ninguna gestión registrada en los últimos N días' },
    ],
  },
  {
    nivel: 'ÁMBAR', color: '#d97706', bg: '#fffbeb', border: '#fde68a',
    campos: [
      { clave: 'semaforo_ambar_mora_min',         label: 'Mora entre (días, mín)',       hint: 'Tramo mínimo de mora para activar ámbar' },
      { clave: 'semaforo_ambar_mora_max',         label: 'Mora entre (días, máx)',       hint: 'Tramo máximo de mora para activar ámbar' },
      { clave: 'semaforo_ambar_promesa_dias',     label: 'Promesa vence en < (días)',    hint: 'Promesa de pago que vence en menos de N días' },
      { clave: 'semaforo_ambar_sin_gestion_dias', label: 'Sin gestión ≥ (días)',         hint: 'Cliente sin gestión en los últimos N días (menor urgencia)' },
    ],
  },
  {
    nivel: 'VERDE', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0',
    campos: [] as { clave: string; label: string; hint: string }[],
    nota: 'Los clientes con mora solo en el tramo 1-30 días se clasifican automáticamente como VERDE.',
  },
]

export default function TabSemaforo({ semaforo: init }: Props) {
  const [form,    setForm]    = useState<Record<string, string>>(init)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null); setSaved(false)
    // Convertir a números para la API
    const payload: Record<string, number> = {}
    for (const [k, v] of Object.entries(form)) {
      const n = parseInt(v, 10)
      if (isNaN(n) || n < 0) { setError(`Valor inválido en "${k}": debe ser un número positivo`); setLoading(false); return }
      payload[k] = n
    }
    try {
      const res = await fetch('/api/configuracion/semaforo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />{error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {CAMPOS.map(grupo => (
        <div key={grupo.nivel} className="rounded-xl border p-5 space-y-4"
          style={{ backgroundColor: grupo.bg, borderColor: grupo.border }}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: grupo.color }} />
            <h3 className="text-sm font-bold" style={{ color: grupo.color }}>{grupo.nivel}</h3>
          </div>
          {'nota' in grupo && grupo.nota && (
            <p className="text-[12px]" style={{ color: grupo.color }}>{grupo.nota}</p>
          )}
          {grupo.campos.map(campo => (
            <div key={campo.clave} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">{campo.label}</p>
                <p className="text-xs text-gray-500">{campo.hint}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number" min={0} max={365}
                  value={form[campo.clave] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [campo.clave]: e.target.value }))}
                  className={inputN}
                  required
                />
                <span className="text-xs text-gray-400">días</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Nota de aplicación */}
      <p className="text-xs text-gray-400 text-center">
        Los cambios aplican en el próximo cálculo del semáforo (en la siguiente sincronización del GAS).
      </p>

      <div className="flex justify-end">
        <button type="submit" disabled={loading}
          className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60 transition"
          style={{ backgroundColor: '#009ee3' }}>
          <Save size={14} />
          {loading ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar reglas del semáforo'}
        </button>
      </div>
    </form>
  )
}
