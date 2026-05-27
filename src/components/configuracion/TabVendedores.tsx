'use client'

import { useState, useRef } from 'react'
import { Plus, X, CheckCircle2, AlertCircle, Users } from 'lucide-react'
import { fmtFechaHora } from '@/lib/utils/formato'

// ── Tipos ─────────────────────────────────────────────────────────────
export interface VendedorRow {
  cod: string; nombre: string; email: string | null; zona: string | null
  analista_email: string | null; asignado_por: string | null; asignado_en: string | null
  supervisor_cod: string | null; supervisor_nombre: string | null
}
export interface AnalistaBasico  { nombre: string; email: string; iniciales: string; color: string }
export interface SupervisorBasico { cod: string; nombre: string }

interface Props {
  vendedores:  VendedorRow[]
  analistas:   AnalistaBasico[]
  supervisores: SupervisorBasico[]
}

// ── Estilos comunes ───────────────────────────────────────────────────
const thCls  = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider'
const tdCls  = 'py-2.5 px-3 text-sm text-gray-700'
const inputC = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

// ── Componente ────────────────────────────────────────────────────────
export default function TabVendedores({ vendedores: init, analistas, supervisores }: Props) {
  const [rows,        setRows]        = useState<VendedorRow[]>(init)
  const [saving,      setSaving]      = useState<Record<string, boolean>>({})
  const [highlighted, setHighlighted] = useState<Record<string, boolean>>({})
  const [error,       setError]       = useState<string | null>(null)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroAn,    setFiltroAn]    = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Estadísticas ──────────────────────────────────────────────────
  const sinAsignacion = rows.filter(v => !v.analista_email).length
  const analistasActivos = new Set(rows.map(v => v.analista_email).filter(Boolean)).size

  // ── Filtro ────────────────────────────────────────────────────────
  const filtered = rows.filter(v => {
    const q = busqueda.toLowerCase()
    const matchQ  = !q || v.nombre.toLowerCase().includes(q) || v.cod.toLowerCase().includes(q)
    const matchAn = !filtroAn || v.analista_email === filtroAn
    return matchQ && matchAn
  })

  // ── Cambio de analista (optimistic update) ────────────────────────
  async function handleAnalistaChange(cod: string, nuevoEmail: string) {
    const emailFinal = nuevoEmail || null
    const anterior = rows.find(r => r.cod === cod)?.analista_email ?? null

    // Optimistic update
    setRows(prev => prev.map(r => r.cod === cod
      ? { ...r, analista_email: emailFinal, asignado_en: new Date().toISOString() }
      : r
    ))
    setSaving(prev => ({ ...prev, [cod]: true }))
    if (timerRef.current[cod]) clearTimeout(timerRef.current[cod])

    try {
      const res = await fetch(`/api/configuracion/vendedores/${cod}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analista_email: emailFinal }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Error al guardar')
      }
      // Éxito: highlight verde
      setHighlighted(prev => ({ ...prev, [cod]: true }))
      timerRef.current[cod] = setTimeout(() => {
        setHighlighted(prev => { const n = { ...prev }; delete n[cod]; return n })
      }, 1500)
    } catch (e) {
      // Revertir cambio
      setRows(prev => prev.map(r => r.cod === cod ? { ...r, analista_email: anterior } : r))
      setError((e as Error).message)
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[cod]; return n })
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total vendedores',    value: rows.length,    color: '#003B5C' },
          { label: 'Sin asignación',      value: sinAsignacion,  color: sinAsignacion > 0 ? '#dc2626' : '#22c55e' },
          { label: 'Analistas activos',   value: analistasActivos, color: '#009ee3' },
          { label: 'Con asignación',      value: rows.length - sinAsignacion, color: '#16a34a' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</p>
            <p className="text-[11px] text-gray-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros + botón */}
      <div className="flex items-center gap-3">
        <input
          type="text" placeholder="Buscar por nombre o código..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          className={inputC + ' flex-1 max-w-xs'}
        />
        <select value={filtroAn} onChange={e => setFiltroAn(e.target.value)} className={inputC + ' max-w-[200px]'}>
          <option value="">Todos los analistas</option>
          {analistas.map(a => (
            <option key={a.email} value={a.email}>{a.nombre}</option>
          ))}
        </select>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white ml-auto"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Plus size={14} /> Agregar vendedor
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={thCls}>Código</th>
                <th className={thCls}>Vendedor</th>
                <th className={thCls}>Zona</th>
                <th className={thCls}>Supervisor</th>
                <th className={thCls} style={{ minWidth: '200px' }}>Analista Asignado</th>
                <th className={thCls}>Última modificación</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">Sin resultados</td></tr>
              )}
              {filtered.map(v => (
                <tr
                  key={v.cod}
                  className="border-t border-gray-100 transition-colors"
                  style={highlighted[v.cod] ? { backgroundColor: '#f0fdf4' } : undefined}
                >
                  <td className={tdCls + ' font-mono text-xs text-gray-500'}>{v.cod}</td>
                  <td className={tdCls + ' font-semibold'}>{v.nombre}</td>
                  <td className={tdCls + ' text-gray-500'}>{v.zona ?? '—'}</td>
                  <td className={tdCls + ' text-gray-500'}>{v.supervisor_nombre ?? '—'}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <select
                        value={v.analista_email ?? ''}
                        onChange={e => handleAnalistaChange(v.cod, e.target.value)}
                        disabled={saving[v.cod]}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 transition disabled:opacity-50"
                        style={{ minWidth: '160px' }}
                      >
                        <option value="">Sin asignar</option>
                        {analistas.map(a => (
                          <option key={a.email} value={a.email}>{a.nombre}</option>
                        ))}
                      </select>
                      {saving[v.cod] && (
                        <span className="text-[11px] text-blue-500">guardando...</span>
                      )}
                      {highlighted[v.cod] && (
                        <CheckCircle2 size={14} className="text-green-500" />
                      )}
                    </div>
                  </td>
                  <td className={tdCls + ' text-[11px] text-gray-400'}>
                    {v.asignado_en ? (
                      <span title={v.asignado_por ?? ''}>
                        {fmtFechaHora(v.asignado_en)}
                        {v.asignado_por && (
                          <span className="block text-[10px]">{v.asignado_por.split('@')[0]}</span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal agregar vendedor */}
      {showModal && (
        <ModalAgregarVendedor
          analistas={analistas}
          supervisores={supervisores}
          onClose={() => setShowModal(false)}
          onSuccess={nuevo => {
            setRows(prev => [...prev, { ...nuevo, supervisor_nombre: null }])
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

// ── Modal Agregar Vendedor ────────────────────────────────────────────
function ModalAgregarVendedor({
  analistas, supervisores, onClose, onSuccess,
}: {
  analistas: AnalistaBasico[]
  supervisores: SupervisorBasico[]
  onClose: () => void
  onSuccess: (v: VendedorRow) => void
}) {
  const [form, setForm] = useState({ cod: '', nombre: '', email: '', zona: '', supervisor_cod: '', analista_email: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cod.trim() || !form.nombre.trim()) { setError('Código y nombre son requeridos'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/configuracion/vendedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod: form.cod.trim(), nombre: form.nombre.trim(),
          email: form.email || undefined, zona: form.zona || undefined,
          supervisor_cod: form.supervisor_cod || undefined,
          analista_email: form.analista_email || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear')
      onSuccess(json.data as VendedorRow)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Agregar vendedor</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Código *</label>
              <input value={form.cod} onChange={set('cod')} className={inputC} placeholder="Ej: 042" required />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre *</label>
              <input value={form.nombre} onChange={set('nombre')} className={inputC} placeholder="Nombre completo" required />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Correo</label>
            <input type="email" value={form.email} onChange={set('email')} className={inputC} placeholder="vendedor@cofersa.cr" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Zona</label>
              <input value={form.zona} onChange={set('zona')} className={inputC} placeholder="Ej: Zona Norte" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Supervisor</label>
              <select value={form.supervisor_cod} onChange={set('supervisor_cod')} className={inputC}>
                <option value="">Sin supervisor</option>
                {supervisores.map(s => <option key={s.cod} value={s.cod}>{s.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Analista Asignado</label>
            <select value={form.analista_email} onChange={set('analista_email')} className={inputC}>
              <option value="">Sin asignar</option>
              {analistas.map(a => <option key={a.email} value={a.email}>{a.nombre}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60"
              style={{ backgroundColor: '#009ee3' }}>
              {loading ? 'Guardando...' : 'Crear vendedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
