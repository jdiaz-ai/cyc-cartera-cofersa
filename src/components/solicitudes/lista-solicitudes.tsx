'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, CheckCircle2, XCircle, Clock, X,
  TrendingUp, ShieldOff, RefreshCw, PauseCircle, PlayCircle, AlertTriangle,
  Percent, ArrowLeftRight, Gift, Tag, Package, RotateCcw, Shield, FileEdit,
  MoreHorizontal, FileText,
} from 'lucide-react'
import { fmtFecha } from '@/lib/utils/formato'
import type { Solicitud, EstadoSolicitud } from '@/types/database'

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN VISUAL
// ═══════════════════════════════════════════════════════════════════════

interface TipoCfg { label: string; icon: React.ReactNode; area: string; accentColor: string }

const TIPO_CFG: Record<string, TipoCfg> = {
  // slugs nuevos
  aumento_limite:        { label: 'Aumento de límite',        icon: <TrendingUp     size={12} />, area: 'Coordinador',    accentColor: '#2563eb' },
  excepcion_credito:     { label: 'Excepción de crédito',     icon: <ShieldOff      size={12} />, area: 'Coordinador',    accentColor: '#d97706' },
  cambio_condicion:      { label: 'Cambio de condición',      icon: <RefreshCw      size={12} />, area: 'Coordinador',    accentColor: '#2563eb' },
  suspension_temporal:   { label: 'Suspensión temporal',      icon: <PauseCircle    size={12} />, area: 'Coordinador',    accentColor: '#dc2626' },
  reactivacion_cliente:  { label: 'Reactivación de cliente',  icon: <PlayCircle     size={12} />, area: 'Coordinador',    accentColor: '#16a34a' },
  caso_especial:         { label: 'Caso especial',            icon: <AlertTriangle  size={12} />, area: 'Coordinador',    accentColor: '#dc2626' },
  descuento_no_aplicado: { label: 'Descuento no aplicado',    icon: <Percent        size={12} />, area: 'Área comercial', accentColor: '#16a34a' },
  diferencia_precio:     { label: 'Diferencia de precio',     icon: <ArrowLeftRight size={12} />, area: 'Área comercial', accentColor: '#16a34a' },
  regalia_bonificacion:  { label: 'Regalía / Bonificación',   icon: <Gift           size={12} />, area: 'Área comercial', accentColor: '#16a34a' },
  beneficio_mercadeo:    { label: 'Beneficio de mercadeo',    icon: <Tag            size={12} />, area: 'Área comercial', accentColor: '#16a34a' },
  mercaderia_faltante:   { label: 'Mercadería faltante',      icon: <Package        size={12} />, area: 'Área logística', accentColor: '#d97706' },
  devolucion_mercaderia: { label: 'Devolución de mercadería', icon: <RotateCcw      size={12} />, area: 'Área logística', accentColor: '#d97706' },
  garantias:             { label: 'Garantías',                icon: <Shield         size={12} />, area: 'Área logística', accentColor: '#d97706' },
  refacturacion:         { label: 'Refacturación',            icon: <FileEdit       size={12} />, area: 'Área logística', accentColor: '#d97706' },
  otra_solicitud:        { label: 'Otra solicitud',           icon: <MoreHorizontal size={12} />, area: 'Otro',           accentColor: '#6b7280' },
  // legacy uppercase
  AUMENTO_LIMITE:        { label: 'Aumento de límite',        icon: <TrendingUp     size={12} />, area: 'Coordinador',    accentColor: '#2563eb' },
  EXCEPCION_CREDITO:     { label: 'Excepción de crédito',     icon: <ShieldOff      size={12} />, area: 'Coordinador',    accentColor: '#d97706' },
  NOTA_CREDITO:          { label: 'Nota de crédito',          icon: <FileText       size={12} />, area: 'Coordinador',    accentColor: '#7c3aed' },
}
const TIPO_FALLBACK: TipoCfg = { label: 'Solicitud', icon: <MoreHorizontal size={12} />, area: 'Otro', accentColor: '#6b7280' }

// Colores de área
const AREA_CFG: Record<string, { bg: string; color: string }> = {
  'Coordinador':    { bg: 'rgba(59,130,246,0.12)',  color: '#2563eb' },
  'Área comercial': { bg: 'rgba(34,197,94,0.12)',   color: '#16a34a' },
  'Área logística': { bg: 'rgba(245,158,11,0.12)',  color: '#d97706' },
  'Otro':           { bg: 'var(--color-background-secondary, #f1f5f9)', color: '#6b7280' },
}

// Colores de estado
const ESTADO_CFG: Record<EstadoSolicitud, { label: string; bg: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: 'rgba(245,158,11,0.15)',  color: '#d97706' },
  APROBADA:  { label: 'Aprobada',  bg: 'rgba(34,197,94,0.15)',   color: '#16a34a' },
  RECHAZADA: { label: 'Rechazada', bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
}
const ESTADO_FALLBACK = { label: 'Pendiente', bg: 'rgba(245,158,11,0.15)', color: '#d97706' }

type TabCoord = 'PENDIENTE' | 'RESUELTA'

// ═══════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════
interface Props {
  solicitudes:    Solicitud[]
  rol:            'COORDINADOR' | 'ANALISTA'
  userEmail:      string
  userName:       string
  coordId:        string
  solicitanteMap: Record<string, string>  // solicitante_id → nombre
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════
export default function ListaSolicitudes({
  solicitudes: init, rol, coordId, solicitanteMap,
}: Props) {
  const router  = useRouter()
  const [sols,       setSols]       = useState<Solicitud[]>(init)
  const [tabCoord,   setTabCoord]   = useState<TabCoord>('PENDIENTE')
  const [modal,      setModal]      = useState<Solicitud | null>(null)
  const [accion,     setAccion]     = useState<'APROBADA' | 'RECHAZADA' | null>(null)
  const [comentario, setComentario] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [errModal,   setErrModal]   = useState('')

  // ── Filtrado por tab ─────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    if (rol === 'ANALISTA') return sols
    if (tabCoord === 'PENDIENTE') return sols.filter(s => s.estado === 'PENDIENTE')
    return sols.filter(s => s.estado === 'APROBADA' || s.estado === 'RECHAZADA')
  }, [sols, tabCoord, rol])

  const pendCount = sols.filter(s => s.estado === 'PENDIENTE').length

  // ── Aprobar / Rechazar ───────────────────────────────────────────────
  async function confirmarResolucion() {
    if (!modal || !accion) return
    if (accion === 'RECHAZADA' && !comentario.trim()) {
      setErrModal('El comentario es obligatorio para rechazar.')
      return
    }
    setLoading(true); setErrModal('')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('solicitudes')
      .update({ estado: accion, revisor_id: coordId, comentario_revisor: comentario })
      .eq('id', modal.id)
    if (error) { setErrModal('Error al guardar. Intentá de nuevo.'); setLoading(false); return }
    setSols(prev => prev.map(s =>
      s.id === modal.id ? { ...s, estado: accion, comentario_revisor: comentario } : s
    ))
    setModal(null); setAccion(null); setComentario(''); setLoading(false)
  }

  // ── Cancelar (analista) ──────────────────────────────────────────────
  async function cancelarSolicitud(sol: Solicitud) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('solicitudes')
      .update({ estado: 'RECHAZADA', comentario_revisor: 'Cancelada por el analista' })
      .eq('id', sol.id)
    setSols(prev => prev.map(s =>
      s.id === sol.id ? { ...s, estado: 'RECHAZADA' as EstadoSolicitud, comentario_revisor: 'Cancelada por el analista' } : s
    ))
  }

  // ── Helpers de fecha ─────────────────────────────────────────────────
  function fmtFechaHora(iso: string) {
    try {
      const d = new Date(iso)
      const dia = d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
      const hora = d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false })
      return `${dia} · ${hora}`
    } catch { return iso }
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => router.push('/solicitudes/nueva')}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Plus size={14} /> Nueva solicitud
        </button>
      </div>

      {/* Tabs — solo COORDINADOR */}
      {rol === 'COORDINADOR' && (
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
          {([
            { key: 'PENDIENTE' as TabCoord, label: 'Pendientes', count: pendCount },
            { key: 'RESUELTA'  as TabCoord, label: 'Resueltas',  count: null      },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTabCoord(t.key)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold transition"
              style={tabCoord === t.key
                ? { backgroundColor: '#009ee3', color: 'white' }
                : { color: '#94a3b8' }}
            >
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span
                  className="rounded-full text-[10px] font-black px-1.5 py-0.5"
                  style={tabCoord === t.key
                    ? { backgroundColor: 'rgba(255,255,255,0.25)', color: 'white' }
                    : { backgroundColor: '#fee2e2', color: '#dc2626' }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 size={36} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">
            {tabCoord === 'PENDIENTE' ? '¡Sin solicitudes pendientes!' : 'Sin solicitudes en esta sección.'}
          </p>
          {rol === 'ANALISTA' && (
            <p className="text-[11px] text-gray-400 mt-1">Creá una nueva solicitud con el botón de arriba.</p>
          )}
        </div>
      ) : (
        <div className="space-y-[10px]">
          {filtradas.map(s => {
            const tipCfg  = TIPO_CFG[s.tipo] ?? TIPO_FALLBACK
            const estCfg  = ESTADO_CFG[s.estado as EstadoSolicitud] ?? ESTADO_FALLBACK
            const areaCfg = AREA_CFG[tipCfg.area] ?? AREA_CFG['Otro']
            const solNombre = s.solicitante_id ? (solicitanteMap[s.solicitante_id] ?? '—') : '—'

            return (
              <div
                key={s.id}
                className="bg-white rounded-xl overflow-hidden transition-colors"
                style={{
                  border: '0.5px solid var(--color-border-tertiary, #e2e8f0)',
                  borderRadius: '12px',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-secondary, #cbd5e1)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-tertiary, #e2e8f0)')}
              >
                <div style={{ padding: '16px' }}>

                  {/* ── FILA 1: Badges ───────────────────────────────── */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {/* Tipo badge */}
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{
                        background: 'var(--color-background-secondary, #f8fafc)',
                        border: '0.5px solid var(--color-border-secondary, #e2e8f0)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: tipCfg.accentColor,
                      }}
                    >
                      {tipCfg.icon} {tipCfg.label}
                    </span>

                    {/* Área badge */}
                    <span
                      style={{
                        background: areaCfg.bg,
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: areaCfg.color,
                      }}
                    >
                      {tipCfg.area}
                    </span>

                    {/* Estado badge — alineado a la derecha */}
                    <span className="ml-auto inline-flex items-center gap-1"
                      style={{
                        background: estCfg.bg,
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: estCfg.color,
                      }}
                    >
                      <span style={{ fontSize: '8px' }}>●</span> {estCfg.label}
                    </span>
                  </div>

                  {/* ── FILA 2: Grid 3 columnas ──────────────────────── */}
                  <div
                    className="grid gap-3 mb-3"
                    style={{
                      gridTemplateColumns: '1fr 1fr 1fr',
                      background: 'var(--color-background-secondary, #f8fafc)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    {/* Columna: Cliente */}
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary, #64748b)', marginBottom: '4px' }}>
                        Cliente
                      </p>
                      <p
                        className="truncate"
                        style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary, #0f172a)', marginBottom: '2px' }}
                      >
                        {s.cliente_nombre ?? '—'}
                      </p>
                      {s.cliente_cod && (
                        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748b)', fontFamily: 'monospace' }}>
                          {s.cliente_cod}
                        </p>
                      )}
                    </div>

                    {/* Columna: Enviado a */}
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary, #64748b)', marginBottom: '4px' }}>
                        Enviado a
                      </p>
                      {s.para_email ? (
                        <>
                          <p className="truncate" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary, #0f172a)', marginBottom: '2px' }}>
                            {s.para_email}
                          </p>
                          {s.cc_emails && s.cc_emails.length > 0 && (
                            <p className="truncate" style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748b)' }}>
                              CC: {s.cc_emails.join(', ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-secondary, #94a3b8)' }}>
                          Sin destinatario registrado
                        </p>
                      )}
                    </div>

                    {/* Columna: Creada por */}
                    <div>
                      <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary, #64748b)', marginBottom: '4px' }}>
                        Creada por
                      </p>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary, #0f172a)', marginBottom: '2px' }}>
                        {solNombre}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--color-text-secondary, #64748b)' }}>
                        {fmtFechaHora(s.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* ── FILA 3: Nota + acciones ───────────────────────── */}
                  <div className="flex items-start justify-between gap-3">
                    {/* Nota */}
                    <div className="flex-1 min-w-0">
                      {s.justificacion && (
                        <p
                          className="line-clamp-2"
                          style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-text-secondary, #64748b)' }}
                        >
                          &ldquo;{s.justificacion}&rdquo;
                        </p>
                      )}
                      {s.comentario_revisor && (
                        <div className="mt-2 rounded-lg px-3 py-2"
                          style={{ backgroundColor: '#f0f9ff', borderLeft: '3px solid #009ee3' }}>
                          <p style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                            Respuesta
                          </p>
                          <p style={{ fontSize: '12px', color: '#334155' }}>{s.comentario_revisor}</p>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Ver cliente */}
                      {s.cliente_cod && (
                        <button
                          onClick={() => router.push(`/clientes/${s.cliente_cod}`)}
                          className="flex items-center gap-1 transition hover:opacity-80"
                          style={{
                            border: '0.5px solid var(--color-border-secondary, #cbd5e1)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--color-text-primary, #0f172a)',
                            background: 'white',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Ver cliente →
                        </button>
                      )}

                      {/* Cancelar — analista, pendiente */}
                      {rol === 'ANALISTA' && s.estado === 'PENDIENTE' && (
                        <button
                          onClick={() => cancelarSolicitud(s)}
                          className="transition hover:opacity-80"
                          style={{
                            border: '0.5px solid #ef4444',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#ef4444',
                            background: 'white',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Cancelar solicitud
                        </button>
                      )}

                      {/* Rechazar + Aprobar — coordinador, pendiente */}
                      {rol === 'COORDINADOR' && s.estado === 'PENDIENTE' && (
                        <>
                          <button
                            onClick={() => { setModal(s); setAccion('RECHAZADA') }}
                            className="transition hover:opacity-80"
                            style={{
                              border: '0.5px solid #ef4444',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#ef4444',
                              background: 'white',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Rechazar
                          </button>
                          <button
                            onClick={() => { setModal(s); setAccion('APROBADA') }}
                            className="transition hover:opacity-90"
                            style={{
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'white',
                              background: '#009ee3',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Aprobar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          MODAL DE APROBACIÓN / RECHAZO
      ════════════════════════════════════════════════════════ */}
      {modal && accion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) { setModal(null); setAccion(null) } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden" style={{ maxWidth: '480px' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
              <div className="flex items-center gap-2">
                {accion === 'APROBADA'
                  ? <CheckCircle2 size={18} className="text-green-500" />
                  : <XCircle      size={18} className="text-red-500"   />}
                <h2 className="text-[15px] font-bold text-gray-900">
                  {accion === 'APROBADA' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
                </h2>
              </div>
              <button
                onClick={() => { setModal(null); setAccion(null); setComentario('') }}
                className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
                style={{ width: '32px', height: '32px', color: '#94a3b8' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Resumen */}
              <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: '#f8fafc' }}>
                <p className="text-[11px] font-bold text-gray-400 uppercase">
                  {(TIPO_CFG[modal.tipo] ?? TIPO_FALLBACK).label}
                </p>
                <p className="text-[13px] font-bold text-gray-800">{modal.cliente_nombre ?? modal.cliente_cod}</p>
                <p className="text-[12px] text-gray-500">{modal.justificacion}</p>
              </div>

              {errModal && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 font-semibold">
                  {errModal}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Nota {accion === 'RECHAZADA' ? '(obligatoria)' : '(opcional)'}
                </label>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  rows={3}
                  placeholder={accion === 'RECHAZADA' ? 'Explicá el motivo del rechazo...' : 'Agregar comentario...'}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setModal(null); setAccion(null); setComentario('') }}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarResolucion}
                  disabled={loading}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60"
                  style={{ backgroundColor: accion === 'APROBADA' ? '#22c55e' : '#dc2626' }}
                >
                  {loading
                    ? 'Guardando...'
                    : accion === 'APROBADA' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
