'use client'

import { useState } from 'react'
import { Plus, Pencil, X, AlertCircle, UserX } from 'lucide-react'

export interface DirectorioRow {
  id: string; nombre: string; email: string
  cargo: string | null; area: string; activo: boolean; created_at: string
}

interface Props { contactos: DirectorioRow[] }

const AREAS = [
  'Ventas', 'Logística', 'Crédito y Cobro', 'Gerencia',
  'TI', 'Compras', 'Recursos Humanos', 'Contabilidad', 'Otro',
]

const inputC = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'
const thCls  = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider'
const tdCls  = 'py-2.5 px-3 text-sm text-gray-700'

export default function TabDirectorio({ contactos: init }: Props) {
  const [rows,         setRows]         = useState<DirectorioRow[]>(init)
  const [error,        setError]        = useState<string | null>(null)
  const [filtroArea,   setFiltroArea]   = useState('')
  const [busqueda,     setBusqueda]     = useState('')
  const [mostrarInac,  setMostrarInac]  = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [editTarget,   setEditTarget]   = useState<DirectorioRow | null>(null)
  const [confirmDeact, setConfirmDeact] = useState<DirectorioRow | null>(null)

  const filtered = rows.filter(c => {
    const q = busqueda.toLowerCase()
    const matchQ    = !q || c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    const matchArea = !filtroArea || c.area === filtroArea
    const matchAct  = mostrarInac || c.activo
    return matchQ && matchArea && matchAct
  })

  async function handleDeactivate(c: DirectorioRow) {
    try {
      const res = await fetch(`/api/configuracion/directorio/${c.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      setRows(prev => prev.map(r => r.id === c.id ? { ...r, activo: false } : r))
    } catch (e) { setError((e as Error).message) }
    setConfirmDeact(null)
  }

  const activos = rows.filter(r => r.activo).length

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-700">{activos} contacto{activos !== 1 ? 's' : ''} activo{activos !== 1 ? 's' : ''}</p>
          <p className="text-[11px] text-gray-400">Alimenta el autocomplete de correos en el SIC</p>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <input type="text" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className={inputC + ' w-48'} />
          <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} className={inputC + ' w-44'}>
            <option value="">Todas las áreas</option>
            {AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={mostrarInac} onChange={e => setMostrarInac(e.target.checked)} className="rounded" />
            Mostrar inactivos
          </label>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white"
            style={{ backgroundColor: '#009ee3' }}>
            <Plus size={14} /> Agregar contacto
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={thCls}>Nombre</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Cargo</th>
                <th className={thCls}>Área</th>
                <th className={thCls}>Estado</th>
                <th className={thCls}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">Sin resultados</td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className={tdCls + ' font-semibold'}>{c.nombre}</td>
                  <td className={tdCls + ' text-gray-500 font-mono text-xs'}>{c.email}</td>
                  <td className={tdCls + ' text-gray-500'}>{c.cargo ?? '—'}</td>
                  <td className={tdCls}>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">{c.area}</span>
                  </td>
                  <td className={tdCls}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditTarget(c)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Pencil size={12} /> Editar
                      </button>
                      {c.activo && (
                        <button onClick={() => setConfirmDeact(c)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                          <UserX size={12} /> Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <ModalContacto
          title="Agregar contacto"
          onClose={() => setShowAdd(false)}
          onSuccess={c => { setRows(prev => [...prev, c]); setShowAdd(false) }}
        />
      )}
      {editTarget && (
        <ModalContacto
          title="Editar contacto"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={c => { setRows(prev => prev.map(r => r.id === c.id ? c : r)); setEditTarget(null) }}
        />
      )}
      {confirmDeact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <p className="font-bold text-gray-900">¿Desactivar contacto?</p>
            <p className="text-sm text-gray-600">Se desactivará a <strong>{confirmDeact.nombre}</strong> del directorio. Ya no aparecerá en el autocomplete.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeact(null)} className="px-4 py-2 text-sm rounded-lg hover:bg-gray-100">Cancelar</button>
              <button onClick={() => handleDeactivate(confirmDeact)} className="px-4 py-2 text-sm font-bold text-white rounded-lg bg-red-500 hover:bg-red-600">Desactivar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal Crear / Editar ──────────────────────────────────────────────
function ModalContacto({
  title, initial, onClose, onSuccess,
}: { title: string; initial?: DirectorioRow; onClose: () => void; onSuccess: (c: DirectorioRow) => void }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    nombre: initial?.nombre ?? '', email: initial?.email ?? '',
    cargo: initial?.cargo ?? '', area: initial?.area ?? 'Ventas',
    activo: initial?.activo ?? true,
  })
  const [loading, setL] = useState(false)
  const [error, setErr] = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) { setErr('Nombre y email son requeridos'); return }
    setL(true); setErr('')
    try {
      const url    = isEdit ? `/api/configuracion/directorio/${initial!.id}` : '/api/configuracion/directorio'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = { nombre: form.nombre, email: form.email, cargo: form.cargo || undefined, area: form.area, ...(isEdit ? { activo: form.activo } : {}) }
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      onSuccess({ ...(initial ?? { id: json.data.id, created_at: new Date().toISOString() }), ...json.data } as DirectorioRow)
    } catch (e) { setErr((e as Error).message) }
    finally { setL(false) }
  }

  const iC = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} className={iC} required />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Cargo</label>
              <input value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} className={iC} placeholder="Ej: Gerente de Ventas" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={iC} required />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Área</label>
            <select value={form.area} onChange={set('area')} className={iC}>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: '#009ee3' }}>
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar contacto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
