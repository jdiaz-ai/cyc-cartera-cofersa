'use client'

import { useState } from 'react'
import { Plus, Pencil, X, AlertCircle } from 'lucide-react'

export interface UsuarioRow {
  id: string; nombre: string; email: string; rol: 'COORDINADOR' | 'ANALISTA'
  iniciales: string; color: string; activo: boolean
  meta_individual: number; telefono: string | null; whatsapp: string | null
  created_at: string
}

interface Props { usuarios: UsuarioRow[] }

const inputC = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'
const thCls  = 'py-2.5 px-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider'
const tdCls  = 'py-2.5 px-3 text-sm text-gray-700'
const DOMINIOS = ['cofersa.cr', 'mayoreo.biz']

export default function TabUsuarios({ usuarios: init }: Props) {
  const [rows,       setRows]       = useState<UsuarioRow[]>(init)
  const [error,      setError]      = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<UsuarioRow | null>(null)
  const [showAdd,    setShowAdd]    = useState(false)

  function dominioBadge(email: string) {
    const d = email.split('@')[1]
    return d === 'mayoreo.biz'
      ? <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ml-1" style={{ background: '#f0fdf4', color: '#15803d' }}>@mayoreo.biz</span>
      : <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ml-1" style={{ background: '#e0f2fe', color: '#0369a1' }}>@cofersa.cr</span>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            {rows.length} usuario{rows.length !== 1 ? 's' : ''} registrado{rows.length !== 1 ? 's' : ''}
          </p>
          <p className="text-[11px] text-gray-400">Dominios: @cofersa.cr · @mayoreo.biz</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white ml-auto"
          style={{ backgroundColor: '#009ee3' }}>
          <Plus size={14} /> Agregar usuario
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {rows.map(u => (
          <div key={u.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
            {/* Avatar */}
            <div className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[13px] font-bold"
              style={{ width: 36, height: 36, backgroundColor: u.color }}>
              {u.iniciales}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{u.nombre}</p>
              <p className="text-xs text-gray-400">{u.email}{dominioBadge(u.email)}</p>
            </div>
            {/* Badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={u.rol === 'COORDINADOR'
                  ? { backgroundColor: '#003B5C', color: 'white' }
                  : { backgroundColor: '#e0f2fe', color: '#0369a1' }
                }>{u.rol}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                u.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>{u.activo ? 'Activo' : 'Inactivo'}</span>
              <button onClick={() => setEditTarget(u)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">
                <Pencil size={12} /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <ModalUsuario
          title="Agregar usuario"
          onClose={() => setShowAdd(false)}
          onSuccess={u => { setRows(prev => [...prev, u]); setShowAdd(false) }}
        />
      )}
      {editTarget && (
        <ModalUsuario
          title="Editar usuario"
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={u => {
            setRows(prev => prev.map(r => r.id === u.id ? u : r))
            setEditTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────
function ModalUsuario({
  title, initial, onClose, onSuccess,
}: { title: string; initial?: UsuarioRow; onClose: () => void; onSuccess: (u: UsuarioRow) => void }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    nombre:          initial?.nombre         ?? '',
    email:           initial?.email          ?? '',
    rol:             initial?.rol            ?? 'ANALISTA' as 'COORDINADOR' | 'ANALISTA',
    iniciales:       initial?.iniciales      ?? '',
    color:           initial?.color          ?? '#009ee3',
    meta_individual: String(initial?.meta_individual ?? 0),
    telefono:        initial?.telefono       ?? '',
    whatsapp:        initial?.whatsapp       ?? '',
    activo:          initial?.activo         ?? true,
  })
  const [loading, setL]   = useState(false)
  const [error,   setErr] = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))
  }
  function setBool(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value === 'true' }))
  }

  // Auto-sugerir iniciales al escribir nombre
  function handleNombre(e: React.ChangeEvent<HTMLInputElement>) {
    const nombre = e.target.value
    const auto = nombre.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase()
    setForm(prev => ({ ...prev, nombre, iniciales: prev.iniciales || auto }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) { setErr('Nombre y email son requeridos'); return }
    const dominio = form.email.split('@')[1]
    if (!DOMINIOS.includes(dominio)) { setErr('Solo se permiten correos @cofersa.cr o @mayoreo.biz'); return }
    setL(true); setErr('')
    try {
      const url    = isEdit ? `/api/configuracion/usuarios/${initial!.id}` : '/api/configuracion/usuarios'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = isEdit
        ? { nombre: form.nombre, rol: form.rol, activo: form.activo, meta_individual: Number(form.meta_individual), telefono: form.telefono || null, whatsapp: form.whatsapp || null, iniciales: form.iniciales, color: form.color }
        : { nombre: form.nombre, email: form.email, rol: form.rol, iniciales: form.iniciales, color: form.color, meta_individual: Number(form.meta_individual), telefono: form.telefono || null, whatsapp: form.whatsapp || null }
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error')
      onSuccess({ ...(initial ?? { id: json.data.id, created_at: new Date().toISOString() }), ...json.data } as UsuarioRow)
    } catch (e) { setErr((e as Error).message) }
    finally { setL(false) }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Nombre completo *</label>
            <input value={form.nombre} onChange={handleNombre} className={inputCls} required />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Email corporativo *</label>
              <input type="email" value={form.email} onChange={set('email')} className={inputCls} required placeholder="nombre@cofersa.cr" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Rol</label>
              <select value={form.rol} onChange={set('rol')} className={inputCls}>
                <option value="ANALISTA">ANALISTA</option>
                <option value="COORDINADOR">COORDINADOR</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Estado</label>
                <select value={String(form.activo)} onChange={setBool('activo')} className={inputCls}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Iniciales</label>
              <input value={form.iniciales} onChange={set('iniciales')} className={inputCls} maxLength={2} placeholder="AB" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Color avatar</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={set('color')} className="h-9 w-12 rounded border border-gray-200 cursor-pointer" />
                <span className="text-xs text-gray-500">{form.color}</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Meta individual (gestiones/mes)</label>
            <input type="number" min={0} value={form.meta_individual} onChange={set('meta_individual')} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Teléfono</label>
              <input value={form.telefono} onChange={set('telefono')} className={inputCls} placeholder="+506 1234-5678" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">WhatsApp</label>
              <input value={form.whatsapp} onChange={set('whatsapp')} className={inputCls} placeholder="+50612345678" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: '#009ee3' }}>
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
