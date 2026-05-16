'use client'

/**
 * DetalleSolicitud — Header + cambio de estado + comentarios + historial.
 * Sin correo ni notificación (fuera de alcance del sprint).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Link2, Clock, MessageSquare, History, Send, Loader2,
} from 'lucide-react'
import {
  AREA_MAP, ESTADO_CFG, PRIORIDAD_CFG, ESTADOS_OFICIALES,
  numeroSolicitud, slaEstado,
} from '@/lib/solicitudes/catalogo'
import type { Solicitud } from '@/types/database'
import type {
  ComentarioConAutor, HistorialConAutor, GestionOrigenLink,
} from '@/app/(app)/solicitudes/[id]/page'

const SLA_COLOR = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' } as const

function estadoStyle(estado: string) {
  if (estado in ESTADO_CFG) {
    const c = ESTADO_CFG[estado as keyof typeof ESTADO_CFG]
    return { bg: c.bg, text: c.text }
  }
  return { bg: '#f1f5f9', text: '#475569' }
}

function iniciales(n: string) {
  const p = n.trim().split(/\s+/)
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase()
}

function fechaHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface Props {
  solicitud:         Solicitud
  comentarios:       ComentarioConAutor[]
  historial:         HistorialConAutor[]
  gestionOrigen:     GestionOrigenLink | null
  solicitanteNombre: string
  rol:               'COORDINADOR' | 'ANALISTA'
}

export default function DetalleSolicitud({
  solicitud, comentarios: comIni, historial: histIni, gestionOrigen, solicitanteNombre,
}: Props) {
  const router = useRouter()

  const [estado,     setEstado]     = useState(solicitud.estado)
  const [nuevoEstado, setNuevoEstado] = useState(solicitud.estado)
  const [notaEstado, setNotaEstado] = useState('')
  const [savingEst,  setSavingEst]  = useState(false)
  const [errEst,     setErrEst]     = useState('')

  const [comentarios, setComentarios] = useState<ComentarioConAutor[]>(comIni)
  const [historial,   setHistorial]   = useState<HistorialConAutor[]>(histIni)
  const [nuevoCom,    setNuevoCom]    = useState('')
  const [savingCom,   setSavingCom]   = useState(false)
  const [errCom,      setErrCom]      = useState('')

  const est   = estadoStyle(estado)
  const areaD = solicitud.area ? AREA_MAP[solicitud.area as keyof typeof AREA_MAP] : null
  const pr    = solicitud.prioridad ? PRIORIDAD_CFG[solicitud.prioridad] : null
  const sla   = slaEstado(solicitud.created_at, solicitud.sla_vencimiento)

  // ── Cambiar estado ─────────────────────────────────────────────────
  async function guardarEstado() {
    if (nuevoEstado === estado) { setErrEst('Seleccioná un estado distinto al actual'); return }
    setSavingEst(true); setErrEst('')
    try {
      const res = await fetch(`/api/solicitudes/${solicitud.id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_nuevo: nuevoEstado, nota: notaEstado.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErrEst(d.error ?? 'Error al cambiar el estado'); setSavingEst(false); return }
      setEstado(nuevoEstado)
      setHistorial(prev => [{
        id: crypto.randomUUID(),
        solicitud_id: solicitud.id,
        estado_anterior: d.estado_anterior ?? estado,
        estado_nuevo: nuevoEstado,
        usuario_id: '',
        nota: notaEstado.trim() || null,
        created_at: new Date().toISOString(),
        autor_nombre: 'Vos',
      }, ...prev])
      setNotaEstado('')
      router.refresh()
    } catch {
      setErrEst('Error de conexión. Intentá de nuevo.')
    } finally {
      setSavingEst(false)
    }
  }

  // ── Agregar comentario ─────────────────────────────────────────────
  async function agregarComentario() {
    if (!nuevoCom.trim()) return
    setSavingCom(true); setErrCom('')
    try {
      const res = await fetch(`/api/solicitudes/${solicitud.id}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenido: nuevoCom.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErrCom(d.error ?? 'Error al guardar el comentario'); setSavingCom(false); return }
      const c = d.comentario
      setComentarios(prev => [...prev, {
        id: c.id, solicitud_id: solicitud.id, usuario_id: c.usuario_id,
        contenido: c.contenido, created_at: c.created_at,
        autor_nombre: c.usuario_nombre ?? 'Vos',
      }])
      setNuevoCom('')
    } catch {
      setErrCom('Error de conexión. Intentá de nuevo.')
    } finally {
      setSavingCom(false)
    }
  }

  const card = 'bg-white rounded-xl border border-gray-100 shadow-sm'

  return (
    <div className="p-5 space-y-4" style={{ backgroundColor: '#f0f4f8', minHeight: '100%' }}>

      {/* Volver */}
      <button onClick={() => router.push('/solicitudes')}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Volver a solicitudes
      </button>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-gray-50" style={{ backgroundColor: '#fafbfc' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-wider text-gray-400">{numeroSolicitud(solicitud.id)}</p>
              <h1 className="text-[18px] font-bold text-gray-800">{solicitud.tipo}</h1>
              <p className="text-[13px] text-gray-500 mt-0.5">
                {solicitud.cliente_nombre || solicitud.cliente_cod}
                {solicitud.cliente_cod && <span className="text-gray-400 font-mono"> · {solicitud.cliente_cod}</span>}
              </p>
            </div>
            <span className="flex items-center gap-1 text-[12px] font-bold rounded-full px-3 py-1.5 whitespace-nowrap"
              style={{ backgroundColor: est.bg, color: est.text }}>
              <span style={{ fontSize: 7 }}>●</span> {estado}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {areaD && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                style={{ backgroundColor: areaD.bg, color: areaD.color }}>{areaD.label}</span>
            )}
            {pr && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                style={{ backgroundColor: pr.bg, color: pr.text }}>{solicitud.prioridad}</span>
            )}
            {sla.vencido && solicitud.sla_vencimiento && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                style={{ backgroundColor: '#dc2626', color: '#fff' }}>SLA VENCIDO</span>
            )}
          </div>
        </div>

        {/* Grid de datos */}
        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px]">
          <Dato label="Responsable" valor={solicitud.responsable_nombre || '—'} sub={solicitud.responsable_email || ''} />
          <Dato label="Solicitante" valor={solicitanteNombre} />
          <Dato label="Creada" valor={fechaHora(solicitud.created_at)} />
          <Dato label="Actualizada" valor={fechaHora(solicitud.updated_at)} />
          {solicitud.sla_vencimiento && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1">
                <Clock size={10} /> SLA — vence {fechaHora(solicitud.sla_vencimiento)}
              </p>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{ width: `${Math.max(3, sla.pct)}%`, backgroundColor: SLA_COLOR[sla.nivel] }} />
              </div>
            </div>
          )}
        </div>

        {/* Descripción */}
        {(solicitud.descripcion || solicitud.justificacion) && (
          <div className="px-5 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Descripción</p>
            <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">
              {solicitud.descripcion || solicitud.justificacion}
            </p>
            {solicitud.observaciones_internas && (
              <div className="mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: '#f8fafc', borderLeft: '3px solid #94a3b8' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Observaciones internas</p>
                <p className="text-[12px] text-gray-600">{solicitud.observaciones_internas}</p>
              </div>
            )}
          </div>
        )}

        {/* Link gestión origen */}
        {gestionOrigen && (
          <div className="px-5 pb-4">
            <button
              onClick={() => router.push(`/clientes/${encodeURIComponent(gestionOrigen.cliente_cod)}`)}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:opacity-80"
              style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' }}
            >
              <Link2 size={13} />
              Gestión origen · {gestionOrigen.tipo} · {gestionOrigen.resultado} →
            </button>
          </div>
        )}
      </div>

      {/* ── CAMBIO DE ESTADO ────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        <p className="text-[13px] font-bold text-gray-800 mb-3">Cambiar estado</p>
        {errEst && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 font-semibold mb-3">
            {errEst}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 bg-white focus:outline-none focus:border-[#009ee3]">
            {ESTADOS_OFICIALES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input
            value={notaEstado} onChange={e => setNotaEstado(e.target.value)}
            placeholder="Nota del cambio (opcional)"
            className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-[#009ee3]"
          />
          <button onClick={guardarEstado} disabled={savingEst || nuevoEstado === estado}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#009ee3' }}>
            {savingEst ? <Loader2 size={14} className="animate-spin" /> : null}
            Guardar estado
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── COMENTARIOS ──────────────────────────────────────────── */}
        <div className={`${card} p-5`}>
          <p className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <MessageSquare size={15} /> Comentarios internos
          </p>
          <div className="flex gap-2 mb-4">
            <input
              value={nuevoCom} onChange={e => setNuevoCom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agregarComentario() } }}
              placeholder="Escribí un comentario…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-[#009ee3]"
            />
            <button onClick={agregarComentario} disabled={savingCom || !nuevoCom.trim()}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-bold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: '#009ee3' }}>
              {savingCom ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
          {errCom && <p className="text-[12px] text-red-600 font-semibold mb-2">{errCom}</p>}
          {comentarios.length === 0 ? (
            <p className="text-[12px] text-gray-400 text-center py-6">Sin comentarios todavía</p>
          ) : (
            <ul className="space-y-3">
              {[...comentarios].reverse().map(c => (
                <li key={c.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                    {iniciales(c.autor_nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px]">
                      <span className="font-bold text-gray-700">{c.autor_nombre}</span>
                      <span className="text-gray-400"> · {fechaHora(c.created_at)}</span>
                    </p>
                    <p className="text-[13px] text-gray-600 mt-0.5">{c.contenido}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── HISTORIAL DE ESTADOS ─────────────────────────────────── */}
        <div className={`${card} p-5`}>
          <p className="text-[13px] font-bold text-gray-800 mb-3 flex items-center gap-1.5">
            <History size={15} /> Historial de estados
          </p>
          {historial.length === 0 ? (
            <p className="text-[12px] text-gray-400 text-center py-6">Sin cambios de estado</p>
          ) : (
            <ul className="space-y-3 border-l-2 border-gray-100 pl-4">
              {historial.map(h => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: '#009ee3' }} />
                  <p className="text-[12px]">
                    <span className="text-gray-400">{h.estado_anterior ?? '—'}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="font-bold text-gray-700">{h.estado_nuevo}</span>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {h.autor_nombre} · {fechaHora(h.created_at)}
                  </p>
                  {h.nota && <p className="text-[12px] text-gray-600 mt-0.5">{h.nota}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  )
}

function Dato({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <p className="text-[13px] font-semibold text-gray-700 truncate">{valor}</p>
      {sub ? <p className="text-[11px] text-gray-400 truncate">{sub}</p> : null}
    </div>
  )
}
