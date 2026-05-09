'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, CheckCircle2, XCircle, Clock, ChevronRight,
  TrendingUp, Shield, FileText, X,
  ShieldOff, RefreshCw, PauseCircle, PlayCircle, AlertTriangle,
  Percent, ArrowLeftRight, Gift, Tag, Package, RotateCcw, FileEdit, MoreHorizontal,
} from 'lucide-react'
import { fmtFecha, fmtM } from '@/lib/utils/formato'
import type { Solicitud, EstadoSolicitud } from '@/types/database'

// ── Configuración visual por tipo (cubre slugs nuevos + legacy uppercase) ─
type TipoCfgEntry = { label: string; icon: React.ReactNode; color: string; area: string }

const TIPO_CFG: Record<string, TipoCfgEntry> = {
  // ── slugs nuevos ────────────────────────────────────────
  aumento_limite:       { label: 'Aumento de límite',        icon: <TrendingUp    size={13} />, color: '#009ee3', area: 'Coordinador' },
  excepcion_credito:    { label: 'Excepción de crédito',     icon: <ShieldOff     size={13} />, color: '#f59e0b', area: 'Coordinador' },
  cambio_condicion:     { label: 'Cambio de condición',      icon: <RefreshCw     size={13} />, color: '#0ea5e9', area: 'Coordinador' },
  suspension_temporal:  { label: 'Suspensión temporal',      icon: <PauseCircle   size={13} />, color: '#dc2626', area: 'Coordinador' },
  reactivacion_cliente: { label: 'Reactivación de cliente',  icon: <PlayCircle    size={13} />, color: '#16a34a', area: 'Coordinador' },
  caso_especial:        { label: 'Caso especial',            icon: <AlertTriangle size={13} />, color: '#dc2626', area: 'Coordinador' },
  descuento_no_aplicado:{ label: 'Descuento no aplicado',    icon: <Percent       size={13} />, color: '#16a34a', area: 'Comercial'   },
  diferencia_precio:    { label: 'Diferencia de precio',     icon: <ArrowLeftRight size={13}/>, color: '#16a34a', area: 'Comercial'   },
  regalia_bonificacion: { label: 'Regalía / Bonificación',   icon: <Gift          size={13} />, color: '#16a34a', area: 'Comercial'   },
  beneficio_mercadeo:   { label: 'Beneficio de mercadeo',    icon: <Tag           size={13} />, color: '#16a34a', area: 'Comercial'   },
  mercaderia_faltante:  { label: 'Mercadería faltante',      icon: <Package       size={13} />, color: '#f59e0b', area: 'Logística'   },
  devolucion_mercaderia:{ label: 'Devolución de mercadería', icon: <RotateCcw     size={13} />, color: '#f59e0b', area: 'Logística'   },
  garantias:            { label: 'Garantías',                icon: <Shield        size={13} />, color: '#f59e0b', area: 'Logística'   },
  refacturacion:        { label: 'Refacturación',            icon: <FileEdit      size={13} />, color: '#f59e0b', area: 'Logística'   },
  otra_solicitud:       { label: 'Otra solicitud',           icon: <MoreHorizontal size={13}/>, color: '#9ca3af', area: 'Otro'        },
  // ── legacy uppercase (compatibilidad con registros viejos) ──────────
  AUMENTO_LIMITE:       { label: 'Aumento de límite',        icon: <TrendingUp size={13} />, color: '#009ee3', area: 'Coordinador' },
  EXCEPCION_CREDITO:    { label: 'Excepción de crédito',     icon: <Shield     size={13} />, color: '#f59e0b', area: 'Coordinador' },
  NOTA_CREDITO:         { label: 'Nota de crédito',          icon: <FileText   size={13} />, color: '#8b5cf6', area: 'Coordinador' },
}

// Color del área
const AREA_CFG: Record<string, { bg: string; text: string }> = {
  Coordinador: { bg: '#dbeafe', text: '#1d4ed8' },
  Comercial:   { bg: '#dcfce7', text: '#15803d' },
  Logística:   { bg: '#fef9c3', text: '#a16207' },
  Otro:        { bg: '#f1f5f9', text: '#475569' },
}

const TIPO_FALLBACK: TipoCfgEntry = { label: 'Solicitud', icon: <MoreHorizontal size={13} />, color: '#9ca3af', area: 'Otro' }

const ESTADO_CFG: Record<EstadoSolicitud, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  PENDIENTE:   { label: 'Pendiente',   bg: '#fef9c3', text: '#a16207', icon: <Clock       size={11} /> },
  EN_REVISION: { label: 'En revisión', bg: '#e0f2fe', text: '#0369a1', icon: <ChevronRight size={11} /> },
  APROBADA:    { label: 'Aprobada',    bg: '#dcfce7', text: '#15803d', icon: <CheckCircle2 size={11} /> },
  RECHAZADA:   { label: 'Rechazada',   bg: '#fee2e2', text: '#dc2626', icon: <XCircle      size={11} /> },
}

type TabCoord = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTA'

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  solicitudes: Solicitud[]
  rol:         'COORDINADOR' | 'ANALISTA'
  userEmail:   string
  userName:    string
  coordId:     string
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function ListaSolicitudes({ solicitudes: init, rol, coordId }: Props) {
  const router = useRouter()
  const [sols,      setSols]      = useState<Solicitud[]>(init)
  const [tabCoord,  setTabCoord]  = useState<TabCoord>('PENDIENTE')
  const [modal,     setModal]     = useState<Solicitud | null>(null)
  const [accion,    setAccion]    = useState<'APROBADA' | 'RECHAZADA' | null>(null)
  const [comentario,setComentario]= useState('')
  const [loading,   setLoading]   = useState(false)
  const [errModal,  setErrModal]  = useState('')

  // ── Filtrado por tab (coordinador) ────────────────────────────────
  const filtradas = useMemo(() => {
    if (rol === 'ANALISTA') return sols
    if (tabCoord === 'PENDIENTE')   return sols.filter(s => s.estado === 'PENDIENTE')
    if (tabCoord === 'EN_REVISION') return sols.filter(s => s.estado === 'EN_REVISION')
    return sols.filter(s => s.estado === 'APROBADA' || s.estado === 'RECHAZADA')
  }, [sols, tabCoord, rol])

  const pendCount = sols.filter(s => s.estado === 'PENDIENTE').length
  const revCount  = sols.filter(s => s.estado === 'EN_REVISION').length

  // ── Aprobar / Rechazar ────────────────────────────────────────────
  async function confirmarResolucion() {
    if (!modal || !accion) return
    if (accion === 'RECHAZADA' && !comentario.trim()) {
      setErrModal('El comentario es obligatorio para rechazar.')
      return
    }
    setLoading(true)
    setErrModal('')
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('solicitudes')
      .update({ estado: accion, revisor_id: coordId, comentario_revisor: comentario })
      .eq('id', modal.id)
    if (error) { setErrModal('Error al guardar. Intentá de nuevo.'); setLoading(false); return }
    setSols(prev => prev.map(s => s.id === modal.id ? { ...s, estado: accion, comentario_revisor: comentario } : s))
    setModal(null); setAccion(null); setComentario(''); setLoading(false)
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* ── Header con botón nueva solicitud ──────────────────────── */}
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

      {/* ── Tabs (solo COORDINADOR) ───────────────────────────────── */}
      {rol === 'COORDINADOR' && (
        <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
          {([
            { key: 'PENDIENTE',   label: 'Pendientes',   count: pendCount },
            { key: 'EN_REVISION', label: 'En revisión',  count: revCount  },
            { key: 'RESUELTA',    label: 'Resueltas',    count: null      },
          ] as { key: TabCoord; label: string; count: number | null }[]).map(t => (
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

      {/* ── Lista de solicitudes ──────────────────────────────────── */}
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
        <div className="space-y-3">
          {filtradas.map(s => {
            const tipCfg  = TIPO_CFG[s.tipo] ?? TIPO_FALLBACK
            const estCfg  = ESTADO_CFG[s.estado]
            const areaCfg = AREA_CFG[tipCfg.area] ?? AREA_CFG['Otro']
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Franja superior de color por tipo */}
                <div className="h-0.5 w-full" style={{ backgroundColor: tipCfg.color }} />
                <div className="p-4">
                  <div className="flex items-start gap-4">

                    {/* ── Columna izquierda ────────────────── */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Tipo + Área */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1"
                          style={{ backgroundColor: tipCfg.color + '18', color: tipCfg.color }}
                        >
                          {tipCfg.icon} {tipCfg.label}
                        </span>
                        <span
                          className="text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide"
                          style={{ backgroundColor: areaCfg.bg, color: areaCfg.text }}
                        >
                          {tipCfg.area}
                        </span>
                      </div>

                      {/* Cliente */}
                      {(s.cliente_nombre || s.cliente_cod) && (
                        <div className="flex items-baseline gap-2">
                          {s.cliente_nombre && (
                            <p className="text-[13px] font-bold text-gray-800 truncate">{s.cliente_nombre}</p>
                          )}
                          {s.cliente_cod && (
                            <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">{s.cliente_cod}</span>
                          )}
                        </div>
                      )}

                      {/* Justificación */}
                      <p className="text-[12px] text-gray-500 leading-snug line-clamp-2">{s.justificacion}</p>

                      {/* Montos inline */}
                      {(s.monto_actual || s.monto_solicitado || s.monto) && (
                        <div className="flex flex-wrap gap-3">
                          {s.monto_actual != null && s.monto_actual > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Actual</p>
                              <p className="text-[12px] font-bold text-gray-700 tabular-nums">{fmtM(s.monto_actual)}</p>
                            </div>
                          )}
                          {s.monto_solicitado != null && s.monto_solicitado > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Solicitado</p>
                              <p className="text-[12px] font-bold tabular-nums" style={{ color: tipCfg.color }}>{fmtM(s.monto_solicitado)}</p>
                            </div>
                          )}
                          {s.monto != null && s.monto > 0 && !s.monto_solicitado && (
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Monto</p>
                              <p className="text-[12px] font-bold text-gray-700 tabular-nums">{fmtM(s.monto)}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comentario revisor */}
                      {s.comentario_revisor && (
                        <div className="rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: '#f0f9ff', borderLeft: '3px solid #009ee3' }}>
                          <p className="font-bold text-gray-400 text-[10px] uppercase tracking-wide mb-0.5">Respuesta del coordinador</p>
                          <p className="text-gray-600">{s.comentario_revisor}</p>
                        </div>
                      )}

                      {/* Fecha */}
                      <p className="text-[11px] text-gray-400">{fmtFecha(s.created_at)}</p>
                    </div>

                    {/* ── Columna derecha ──────────────────── */}
                    <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                      <span
                        className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap"
                        style={{ backgroundColor: estCfg.bg, color: estCfg.text }}
                      >
                        {estCfg.icon} {estCfg.label}
                      </span>

                      {/* Botones COORDINADOR */}
                      {rol === 'COORDINADOR' && (s.estado === 'PENDIENTE' || s.estado === 'EN_REVISION') && (
                        <div className="flex flex-col gap-1.5 w-full">
                          <button
                            onClick={() => { setModal(s); setAccion('APROBADA') }}
                            className="flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-3 py-1.5 transition hover:opacity-80 whitespace-nowrap"
                            style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
                          >
                            <CheckCircle2 size={12} /> Aprobar
                          </button>
                          <button
                            onClick={() => { setModal(s); setAccion('RECHAZADA') }}
                            className="flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg px-3 py-1.5 transition hover:opacity-80 whitespace-nowrap"
                            style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                          >
                            <XCircle size={12} /> Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL DE APROBACIÓN / RECHAZO
      ══════════════════════════════════════════════════════════════ */}
      {modal && accion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={e => { if (e.target === e.currentTarget) { setModal(null); setAccion(null) } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden" style={{ maxWidth: '480px' }}>
            {/* Header del modal */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid #e2e8f0' }}
            >
              <div className="flex items-center gap-2">
                {accion === 'APROBADA'
                  ? <CheckCircle2 size={18} className="text-green-500" />
                  : <XCircle      size={18} className="text-red-500" />}
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
              {/* Resumen de la solicitud */}
              <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: '#f8fafc' }}>
                <p className="text-[11px] font-bold text-gray-400 uppercase">{(TIPO_CFG[modal.tipo] ?? TIPO_FALLBACK).label}</p>
                <p className="text-[13px] font-bold text-gray-800">{modal.cliente_nombre ?? modal.cliente_cod}</p>
                <p className="text-[12px] text-gray-500">{modal.justificacion}</p>
              </div>

              {errModal && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700 font-semibold">
                  {errModal}
                </div>
              )}

              {/* Comentario */}
              <div>
                <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  Comentario {accion === 'RECHAZADA' ? '(obligatorio)' : '(opcional)'}
                </label>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  rows={3}
                  placeholder={accion === 'RECHAZADA' ? 'Explicá el motivo del rechazo...' : 'Agregar comentario...'}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition resize-none"
                />
              </div>

              {/* Botones */}
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
                  {loading ? 'Guardando...' : accion === 'APROBADA' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
