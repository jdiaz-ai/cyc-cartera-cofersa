'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ClipboardList, Handshake, FileText, AlertTriangle,
  CheckCircle2, XCircle, Clock, Circle, Plus,
  Building2, Phone, Mail, CreditCard, User, Calendar, Tag,
  MailOpen, Receipt, MessageCircle, ChevronDown, FileDown, Send, Search,
} from 'lucide-react'
import { fmtM, fmtCRC, fmtCRC2, fmtFecha, fmtFechaHora, hoyISO } from '@/lib/utils/formato'
import { createClient } from '@/lib/supabase/client'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'
import ModalGestion from './modal-gestion'
import ModalNuevaSolicitud from './modal-nueva-solicitud'

// ── Tabs ───────────────────────────────────────────────────────────────
const TABS = [
  'Información',
  'Aging',
  'Estado de Cuenta',
  'Gestiones',
  'Promesas',
  'Emails',
  'Notas de Crédito',
  'Solicitudes',
] as const
type Tab = typeof TABS[number]

// ── Aging tramos ───────────────────────────────────────────────────────
const AGING_TRAMOS = [
  { key: 'no_vencido',    label: 'Al día',       color: '#009ee3' },
  { key: 'mora_1_30',     label: '1-30 días',    color: '#f59e0b' },
  { key: 'mora_31_60',    label: '31-60 días',   color: '#f97316' },
  { key: 'mora_61_90',    label: '61-90 días',   color: '#ef4444' },
  { key: 'mora_91_120',   label: '91-120 días',  color: '#dc2626' },
  { key: 'mora_120_plus', label: '+120 días',    color: '#991b1b' },
] as const

// ── Colores de resultado de gestión ────────────────────────────────────
const RESULTADO_COLORS: Record<string, { bg: string; text: string }> = {
  'Promesa OK':       { bg: '#dcfce7', text: '#15803d' },
  'Pagó':             { bg: '#dcfce7', text: '#15803d' },
  'No contestó':      { bg: '#f1f5f9', text: '#64748b' },
  'No ubicado':       { bg: '#fee2e2', text: '#dc2626' },
  'Email enviado':    { bg: '#e0f2fe', text: '#0369a1' },
  'Pendiente':        { bg: '#fef9c3', text: '#a16207' },
  'Aceptó convenio':  { bg: '#dcfce7', text: '#15803d' },
  'Llamar más tarde': { bg: '#f1f5f9', text: '#64748b' },
}

// ── Colores de estado de promesa ───────────────────────────────────────
const PROMESA_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDIENTE:     { bg: '#fef9c3', text: '#a16207', icon: <Clock       size={12} /> },
  CUMPLIDA:      { bg: '#dcfce7', text: '#15803d', icon: <CheckCircle2 size={12} /> },
  INCUMPLIDA:    { bg: '#fee2e2', text: '#dc2626', icon: <XCircle     size={12} /> },
  ABONO_PARCIAL: { bg: '#e0f2fe', text: '#0369a1', icon: <Circle      size={12} /> },
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  cartera:        Cartera
  maestro:        MaestroCliente | null
  facturas:       Factura[]
  gestiones:      Gestion[]
  promesas:       Promesa[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes:    any[]
  analistaNombre: string
  userEmail:      string
  esCoordinador:  boolean
}

// ── Colores de estado del cliente (rgba 15% bg + sólido text) ──────────
const ESTADO_CFG: Record<string, { bg: string; text: string }> = {
  Normal:     { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
  Bloqueado:  { bg: 'rgba(220,38,38,0.15)',   text: '#dc2626' },
  Convenio:   { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  Suspendido: { bg: 'rgba(249,115,22,0.15)',  text: '#f97316' },
}
const ESTADOS_OPCIONES = ['Normal', 'Bloqueado', 'Convenio', 'Suspendido']

// ── Colores de urgencia por tramo ──────────────────────────────────────
const URGENCIA_CFG: Record<string, { bg: string; text: string }> = {
  '1-30 días':   { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  '31-60 días':  { bg: 'rgba(249,115,22,0.15)',  text: '#f97316' },
  '61-90 días':  { bg: 'rgba(234,88,12,0.15)',   text: '#ea580c' },
  '91-120 días': { bg: 'rgba(220,38,38,0.15)',   text: '#dc2626' },
  '+120 días':   { bg: 'rgba(185,28,28,0.15)',   text: '#b91c1c' },
}

// ── Helpers Tab Estado de Cuenta ──────────────────────────────────────
function estadoFactura(f: Factura, hoy: string): { label: string; bg: string; color: string } {
  if (!f.saldo || f.saldo <= 0)    return { label: 'Pagada',    bg: '#f1f5f9', color: '#94a3b8' }
  if (!f.fecha_vencimiento)        return { label: 'Sin fecha', bg: '#f1f5f9', color: '#94a3b8' }
  const diff = Math.floor(
    (new Date(hoy).getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000
  )
  if (diff < 0)  return { label: `Vence en ${Math.abs(diff)}d`, bg: '#dcfce7', color: '#15803d' }
  if (diff === 0) return { label: 'Vence hoy',                  bg: '#ffedd5', color: '#c2410c' }
  return             { label: `Vencida ${diff}d`,               bg: '#fee2e2', color: '#dc2626' }
}

function facturaEnTramo(f: Factura, tramo: string, hoy: string): boolean {
  if (tramo === 'Todos') return true
  if (!f.fecha_vencimiento) return false
  const diff = Math.floor(
    (new Date(hoy).getTime() - new Date(f.fecha_vencimiento).getTime()) / 86400000
  )
  switch (tramo) {
    case 'Al día':      return diff < 0
    case '1-30 días':   return diff >= 1  && diff <= 30
    case '31-60 días':  return diff >= 31 && diff <= 60
    case '61-90 días':  return diff >= 61 && diff <= 90
    case '91-120 días': return diff >= 91 && diff <= 120
    case '+120 días':   return diff > 120
    default: return true
  }
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function FichaCliente({
  cartera, maestro, facturas, gestiones, promesas, solicitudes,
  analistaNombre, userEmail, esCoordinador,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [tab,               setTab]               = useState<Tab>('Información')
  const [modalGestion,      setModalGestion]      = useState(false)
  const [modalEmail,        setModalEmail]        = useState(false)
  const [modalEdoCta,       setModalEdoCta]       = useState(false)
  const [toast,             setToast]             = useState('')
  const [estadoLocal,       setEstadoLocal]       = useState(maestro?.estado_manual ?? 'Normal')
  const [estadoPendiente,   setEstadoPendiente]   = useState<string | null>(null)   // estado elegido pero sin confirmar
  const [loadingEstado,     setLoadingEstado]     = useState(false)
  const [filtroTramoEdoCta, setFiltroTramoEdoCta] = useState<string>('Todos')
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2500)
  }

  async function copiarTelefono() {
    const tel = maestro?.telefono ?? ''
    if (!tel) return
    try {
      await navigator.clipboard.writeText(tel)
      showToast('Teléfono copiado: ' + tel)
    } catch {
      showToast('No se pudo copiar')
    }
  }

  function abrirWhatsApp() {
    const tel = (maestro?.telefono ?? '').replace(/\D/g, '')
    if (!tel) return
    const numero = tel.startsWith('506') ? tel : '506' + tel
    window.open(`https://wa.me/${numero}`, '_blank')
  }

  // Paso 1: el coordinador elige — se guarda como pendiente y abre modal
  function elegirEstado(nuevoEstado: string) {
    if (nuevoEstado === estadoLocal) return
    setEstadoPendiente(nuevoEstado)
  }

  // Paso 2: confirmación en modal — llama a la API y notifica
  async function confirmarCambioEstado() {
    if (!estadoPendiente) return
    setLoadingEstado(true)
    const res = await fetch('/api/clientes/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_cod:    cartera.cliente_cod,
        estado:         estadoPendiente,
        estado_anterior: estadoLocal,
      }),
    })
    setLoadingEstado(false)
    if (res.ok) {
      setEstadoLocal(estadoPendiente)
      setEstadoPendiente(null)
      showToast(`Estado cambiado a ${estadoPendiente}`)
    } else {
      showToast('Error al actualizar estado')
      setEstadoPendiente(null)
    }
  }

  // ── Cálculos de mora ──────────────────────────────────────────────
  const mora_total =
    (cartera.mora_1_30     || 0) + (cartera.mora_31_60 || 0) +
    (cartera.mora_61_90    || 0) + (cartera.mora_91_120 || 0) +
    (cartera.mora_120_plus || 0)
  const pct_mora = cartera.total > 0 ? Math.round((mora_total / cartera.total) * 100) : 0
  const tramo_peor =
    (cartera.mora_120_plus || 0) > 0 ? '+120 días'   :
    (cartera.mora_91_120   || 0) > 0 ? '91-120 días' :
    (cartera.mora_61_90    || 0) > 0 ? '61-90 días'  :
    (cartera.mora_31_60    || 0) > 0 ? '31-60 días'  :
    (cartera.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'

  const urgColor =
    mora_total > 0 && ((cartera.mora_61_90 || 0) + (cartera.mora_91_120 || 0) + (cartera.mora_120_plus || 0)) > 0
      ? '#dc2626'
      : mora_total > 0 && (cartera.mora_31_60 || 0) > 0
        ? '#f59e0b'
        : '#22c55e'

  // ── Conteos para badges de tabs ───────────────────────────────────
  const tabCounts: Partial<Record<Tab, number>> = {
    'Estado de Cuenta': facturas.length,
    Gestiones:          gestiones.length,
    Promesas:           promesas.length,
    Solicitudes:        solicitudes.length,
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100%' }}>

      {/* ═══════════════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 px-5 pt-4 pb-0 sticky top-0 z-10">

        {/* ── SECCIÓN A: Identidad ─────────────────────────────── */}
        <div className="flex items-start gap-3 mb-3">
          <button
            type="button"
            onClick={() => router.push('/clientes')}
            className="mt-1 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
            style={{ width: '30px', height: '30px', color: '#64748b' }}
          >
            <ArrowLeft size={14} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 style={{ fontSize: '18px', fontWeight: 500, color: '#111827' }}>
                {cartera.cliente_nombre}
              </h1>
              {/* Badge urgencia por tramo de mora */}
              {mora_total > 0 && tramo_peor !== 'Al día' && (() => {
                const urg = URGENCIA_CFG[tramo_peor] ?? { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' }
                return (
                  <span className="flex-shrink-0 whitespace-nowrap"
                    style={{
                      backgroundColor: urg.bg, color: urg.text,
                      fontSize: '11px', fontWeight: 500,
                      padding: '4px 8px', borderRadius: '4px',
                    }}>
                    {tramo_peor}
                  </span>
                )
              })()}

              {/* Badge estado — coordinador: clickeable con dropdown; analista: read-only */}
              {(() => {
                const cfg = ESTADO_CFG[estadoLocal] ?? ESTADO_CFG.Normal
                return esCoordinador ? (
                  <div className="relative flex-shrink-0" style={{ zIndex: 20 }}>
                    <button
                      type="button"
                      onClick={() => setEstadoPendiente(estadoLocal === estadoLocal ? '__OPEN__' : null)}
                      className="flex items-center gap-1 whitespace-nowrap transition hover:opacity-80"
                      style={{
                        backgroundColor: cfg.bg, color: cfg.text,
                        fontSize: '11px', fontWeight: 500,
                        padding: '4px 8px', borderRadius: '4px', cursor: 'pointer',
                      }}
                      title="Cambiar estado del cliente"
                    >
                      {estadoLocal}
                      <ChevronDown size={10} />
                    </button>
                    {/* Dropdown de opciones */}
                    {estadoPendiente === '__OPEN__' && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setEstadoPendiente(null)} />
                        <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden min-w-[140px]">
                          {ESTADOS_OPCIONES.filter(e => e !== estadoLocal).map(e => {
                            const c = ESTADO_CFG[e] ?? ESTADO_CFG.Normal
                            return (
                              <button key={e} type="button"
                                onClick={() => setEstadoPendiente(e)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium hover:bg-gray-50 transition text-left"
                              >
                                <span className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: c.text }} />
                                {e}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <span
                    className="flex-shrink-0 whitespace-nowrap"
                    style={{
                      backgroundColor: cfg.bg, color: cfg.text,
                      fontSize: '11px', fontWeight: 500,
                      padding: '4px 8px', borderRadius: '4px',
                      opacity: 0.8, cursor: 'default',
                    }}
                    title="Solo el coordinador puede cambiar el estado"
                  >
                    {estadoLocal}
                  </span>
                )
              })()}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>
              <span className="font-mono font-semibold" style={{ color: '#64748b' }}>{cartera.cliente_cod}</span>
              {maestro?.condicion_pago && (
                <> · Condición: <span className="font-semibold" style={{ color: '#64748b' }}>{maestro.condicion_pago}</span></>
              )}
            </p>
          </div>
        </div>

        {/* ── SECCIÓN B: KPI cards ───────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
          {/* Card 1: Total cartera */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-500 uppercase tracking-wider text-gray-400 mb-1.5">Total cartera</p>
            <p className="text-[18px] font-semibold tabular-nums text-gray-800 leading-tight">{fmtCRC(cartera.total)}</p>
          </div>

          {/* Card 2: En mora */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-500 uppercase tracking-wider text-gray-400 mb-1.5">En mora</p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <p className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: mora_total > 0 ? '#dc2626' : '#22c55e' }}>
                {mora_total > 0 ? fmtCRC(mora_total) : '—'}
              </p>
              {mora_total > 0 && (
                <span className="text-[12px] font-semibold rounded-full px-1.5 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                  {pct_mora}%
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Límite de crédito */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-500 uppercase tracking-wider text-gray-400 mb-1.5">Límite crédito</p>
            {maestro?.limite_credito && maestro.limite_credito > 0 ? (
              <>
                <p className="text-[18px] font-semibold tabular-nums text-gray-800 leading-tight">{fmtCRC(maestro.limite_credito)}</p>
                {(() => {
                  const disp = maestro.limite_credito - cartera.total
                  return disp >= 0
                    ? <p className="text-[12px] font-medium mt-0.5" style={{ color: '#16a34a' }}>{fmtCRC(disp)} disponible</p>
                    : <p className="text-[12px] font-medium mt-0.5" style={{ color: '#dc2626' }}>Límite excedido</p>
                })()}
              </>
            ) : (
              <p className="text-[18px] font-semibold text-gray-300 italic">Sin límite</p>
            )}
          </div>

          {/* Card 4: Score ICP */}
          {(() => {
            // Score ICP: 0-100. Verde ≥70, Amarillo 40-69, Rojo <40
            const icp = maestro && 'score_icp' in maestro ? (maestro as { score_icp?: number | null }).score_icp : null
            const icpColor = icp === null || icp === undefined ? '#94a3b8'
              : icp >= 70 ? '#16a34a'
              : icp >= 40 ? '#ca8a04'
              : '#dc2626'
            const icpLabel = icp === null || icp === undefined ? 'Sin datos'
              : icp >= 70 ? 'Bueno'
              : icp >= 40 ? 'Regular'
              : 'Riesgo'
            return (
              <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
                <p className="text-[10px] font-500 uppercase tracking-wider text-gray-400 mb-1.5">Score ICP</p>
                <p className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: icpColor }}>
                  {icp !== null && icp !== undefined ? icp : '—'}
                </p>
                <p className="text-[12px] font-medium mt-0.5" style={{ color: icpColor }}>{icpLabel}</p>
              </div>
            )
          })()}

          {/* Card 5: Vendedor / Analista */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-500 uppercase tracking-wider text-gray-400 mb-1.5">Vendedor / Analista</p>
            <p className="text-[13px] font-semibold text-gray-700 truncate leading-tight">{cartera.vendedor_nombre || '—'}</p>
            <p className="text-[12px] text-gray-400 truncate mt-0.5">{analistaNombre || '—'}</p>
          </div>
        </div>

        {/* ── SECCIÓN C: Botones de acción ─────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Llamar */}
          <ActionBtn
            icon={<Phone size={12} />}
            label="Llamar"
            disabled={!maestro?.telefono}
            title={maestro?.telefono ? undefined : 'Sin teléfono registrado'}
            onClick={copiarTelefono}
          />

          {/* WhatsApp */}
          <ActionBtn
            icon={<MessageCircle size={12} />}
            label="WhatsApp"
            disabled={!maestro?.telefono}
            onClick={abrirWhatsApp}
            style={{ borderColor: maestro?.telefono ? '#86efac' : undefined, color: maestro?.telefono ? '#16a34a' : undefined }}
          />

          {/* Emails — placeholder junio 2026 */}
          <ActionBtn
            icon={<MailOpen size={12} />}
            label="Emails"
            disabled
            title="Disponible Junio 2026 — Integración Gmail"
          />

          {/* Email de cobro */}
          <ActionBtn
            icon={<Send size={12} />}
            label="Email de cobro"
            onClick={() => setModalEmail(true)}
            style={{ borderColor: '#7dd3fc', color: '#0369a1' }}
          />

          {/* Estado de cuenta */}
          <ActionBtn
            icon={<FileDown size={12} />}
            label="Estado de cuenta"
            onClick={() => setModalEdoCta(true)}
          />

        </div>

        {/* Sección 3: Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map(t => {
            const count = tabCounts[t]
            const active = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap"
                style={active
                  ? { borderColor: '#009ee3', color: '#009ee3' }
                  : { borderColor: 'transparent', color: '#94a3b8' }}
              >
                {t}
                {count !== undefined && count > 0 && (
                  <span
                    className="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                    style={active
                      ? { backgroundColor: '#e0f2fe', color: '#009ee3' }
                      : { backgroundColor: '#f1f5f9', color: '#94a3b8' }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          CONTENIDO DEL TAB
      ═══════════════════════════════════════════════════════════ */}
      <div className="p-5">

        {/* ── TAB: INFORMACIÓN ─────────────────────────────────── */}
        {tab === 'Información' && (
          <TabInformacion
            cartera        = {cartera}
            maestro        = {maestro}
            analistaNombre = {analistaNombre}
            esCoordinador  = {esCoordinador}
            mora_total     = {mora_total}
            pct_mora       = {pct_mora}
            onToast        = {showToast}
          />
        )}

        {/* ── TAB: AGING ───────────────────────────────────────── */}
        {tab === 'Aging' && (
          <div className="space-y-4">

            {/* ── Fila 1: Barras (izq) + Tabla numérica (der) ── */}
            <div className="grid gap-4" style={{ gridTemplateColumns: '55fr 45fr' }}>

              {/* Card 1: Barras visuales */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-[13px] font-bold text-gray-700">Distribución de saldo por antigüedad</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Corte: {fmtFecha(cartera.fecha_corte)}</p>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {AGING_TRAMOS.map(({ key, label, color }) => {
                    const monto = (cartera[key as keyof Cartera] as number) || 0
                    const pct   = cartera.total > 0 ? Math.round((monto / cartera.total) * 100) : 0
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-[12px] text-gray-500 font-semibold" style={{ width: '76px', flexShrink: 0 }}>{label}</span>
                        <div className="flex-1 rounded-full bg-gray-100 h-2 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: color, minWidth: monto > 0 ? '4px' : '0' }} />
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums text-right"
                          style={{ width: '72px', flexShrink: 0, color: monto > 0 ? '#1e293b' : '#cbd5e1' }}>
                          {monto > 0 ? fmtM(monto) : '—'}
                        </span>
                        <span className="text-[11px] text-gray-400 tabular-nums text-right" style={{ width: '30px', flexShrink: 0 }}>
                          {pct > 0 ? `${pct}%` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Card 2: Tabla numérica detallada */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-[12px] font-bold text-gray-600">Detalle por tramo</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Clic en un tramo para ver sus facturas</p>
                </div>
                <table className="w-full" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tramo</th>
                      <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Monto</th>
                      <th className="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AGING_TRAMOS.map(({ key, label, color }) => {
                      const monto = (cartera[key as keyof Cartera] as number) || 0
                      const pct   = cartera.total > 0 ? Math.round((monto / cartera.total) * 100) : 0
                      return (
                        <tr
                          key={key}
                          onClick={() => { setFiltroTramoEdoCta(label); setTab('Estado de Cuenta') }}
                          className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-[13px] font-semibold text-gray-700">{label}</span>
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-[13px] font-semibold"
                            style={{ color: monto > 0 ? '#1e293b' : '#cbd5e1' }}>
                            {monto > 0 ? fmtCRC(monto) : '—'}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-[12px] text-gray-400">
                            {pct > 0 ? `${pct}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td className="px-5 py-2.5 text-[12px] font-bold text-gray-500 uppercase tracking-wider">Total</td>
                      <td className="px-5 py-2.5 text-right text-[14px] font-black text-gray-800 tabular-nums">{fmtCRC(cartera.total)}</td>
                      <td className="px-5 py-2.5 text-right text-[12px] font-bold text-gray-500">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Fila 2: KPIs + botón (full width) ─────────── */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap gap-3">
                <Chip
                  label="DSO"
                  valor={`${cartera.total > 0 ? Math.round((mora_total / cartera.total) * 30) : 0}d`}
                />
                <Chip
                  label="% Mora"
                  valor={`${pct_mora}%`}
                  bg={mora_total > 0 ? '#fee2e2' : '#dcfce7'}
                  color={mora_total > 0 ? '#dc2626' : '#15803d'}
                />
                <Chip label="Mora total" valor={fmtM(mora_total)} />
                <Chip label="Comparativa" valor="Sin historial" bg="#f1f5f9" color="#94a3b8" />
                <Chip
                  label="Comportamiento"
                  valor={mora_total === 0 ? 'Al día' : pct_mora > 25 ? 'En riesgo' : 'En seguimiento'}
                  bg={mora_total === 0 ? '#dcfce7' : pct_mora > 25 ? '#fee2e2' : '#fef9c3'}
                  color={mora_total === 0 ? '#15803d' : pct_mora > 25 ? '#dc2626' : '#a16207'}
                />
              </div>
              <button
                type="button"
                onClick={() => { setFiltroTramoEdoCta('Todos'); setTab('Estado de Cuenta') }}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold transition hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: '#009ee3', color: 'white' }}
              >
                Ver Estado de Cuenta →
              </button>
            </div>
          </div>
        )}

        {/* ── TAB: ESTADO DE CUENTA ─────────────────────────────── */}
        {tab === 'Estado de Cuenta' && (
          <TabEstadoCuenta
            facturas           = {facturas}
            clienteCod         = {cartera.cliente_cod}
            clienteNombre      = {cartera.cliente_nombre}
            filtroTramoEdoCta  = {filtroTramoEdoCta}
            setFiltroTramoEdoCta = {setFiltroTramoEdoCta}
            onRegistrarGestion = {() => setModalGestion(true)}
          />
        )}

        {/* ── TAB: GESTIONES ───────────────────────────────────── */}
        {tab === 'Gestiones' && (
          <TabGestiones
            gestiones      = {gestiones}
            userEmail      = {userEmail}
            esCoordinador  = {esCoordinador}
            onNuevaGestion = {() => setModalGestion(true)}
            onToast        = {showToast}
            onRefresh      = {() => router.refresh()}
          />
        )}

        {/* ── TAB: PROMESAS ─────────────────────────────────────── */}
        {tab === 'Promesas' && (
          <TabPromesas
            promesas       = {promesas}
            clienteCod     = {cartera.cliente_cod}
            contribuyente  = {cartera.contribuyente}
            esCoordinador  = {esCoordinador}
            onNuevaGestion = {() => setModalGestion(true)}
            onToast        = {showToast}
            onRefresh      = {() => router.refresh()}
          />
        )}

        {/* ── TAB: EMAILS ───────────────────────────────────────── */}
        {tab === 'Emails' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={<MailOpen size={32} />}
                texto="Integración de correo próximamente"
                sub="Aquí verás el historial de emails con este cliente y podrás responder directamente desde la app. Fase 2 — Junio 2026."
                comingSoon
              />
            </div>
          </div>
        )}

        {/* ── TAB: NOTAS DE CRÉDITO ─────────────────────────────── */}
        {tab === 'Notas de Crédito' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={<Receipt size={32} />}
                texto="Notas de crédito y saldos a favor"
                sub="Aquí aparecerán las notas de crédito pendientes de aplicar contra facturas de este cliente."
                comingSoon
              />
            </div>
          </div>
        )}

        {/* ── TAB: SOLICITUDES ─────────────────────────────────── */}
        {tab === 'Solicitudes' && (
          <TabSolicitudes
            solicitudes        = {solicitudes}
            clienteCod         = {cartera.cliente_cod}
            clienteNombre      = {cartera.cliente_nombre}
            limiteActual       = {maestro?.limite_credito ?? 0}
            moraTotal          = {mora_total}
            diasAtraso         = {tramo_peor}
            creditoDisponible  = {maestro?.limite_credito ? maestro.limite_credito - cartera.total : null}
            condicionPago      = {maestro?.condicion_pago ? String(maestro.condicion_pago) : '—'}
            facturas           = {facturas}
            esCoordinador      = {esCoordinador}
            userEmail          = {userEmail}
            onToast            = {showToast}
            onRefresh          = {() => router.refresh()}
          />
        )}

      </div>

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl shadow-lg px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ backgroundColor: '#1e293b', maxWidth: '320px', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* ── Modal Registrar Gestión ──────────────────────────────── */}
      {modalGestion && (
        <ModalGestion
          clienteCod    = {cartera.cliente_cod}
          clienteNombre = {cartera.cliente_nombre}
          contribuyente = {cartera.contribuyente}
          analistaEmail = {userEmail}
          onClose       = {() => setModalGestion(false)}
          onSuccess     = {() => { setModalGestion(false); router.refresh() }}
        />
      )}

      {/* ── Modal confirmación cambio de estado ──────────────────── */}
      {estadoPendiente && estadoPendiente !== '__OPEN__' && (
        <ModalOverlay onClose={() => setEstadoPendiente(null)}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-[15px] font-bold text-gray-900">Cambiar estado</h2>
            <CloseBtn onClose={() => setEstadoPendiente(null)} />
          </div>
          <div className="p-5 space-y-4">
            <p className="text-[13px] text-gray-600">
              ¿Confirmar cambio de estado a{' '}
              <span className="font-bold rounded px-2 py-0.5"
                style={{
                  backgroundColor: (ESTADO_CFG[estadoPendiente] ?? ESTADO_CFG.Normal).bg,
                  color:            (ESTADO_CFG[estadoPendiente] ?? ESTADO_CFG.Normal).text,
                }}>
                {estadoPendiente}
              </span>
              ?
            </p>
            <p className="text-[11px] text-gray-400">
              Estado actual: <span className="font-semibold text-gray-500">{estadoLocal}</span>
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEstadoPendiente(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button type="button" onClick={confirmarCambioEstado} disabled={loadingEstado}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
                style={{ backgroundColor: (ESTADO_CFG[estadoPendiente] ?? ESTADO_CFG.Normal).text }}>
                {loadingEstado ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal Email de cobro ─────────────────────────────────── */}
      {modalEmail && (
        <ModalEmailCobro
          clienteNombre = {cartera.cliente_nombre}
          clienteCod    = {cartera.cliente_cod}
          contribuyente = {cartera.contribuyente}
          correo        = {maestro?.correo ?? ''}
          analistaEmail = {userEmail}
          supabase      = {supabase}
          onClose       = {() => setModalEmail(false)}
          onSuccess     = {() => { setModalEmail(false); showToast('Email registrado'); router.refresh() }}
        />
      )}

      {/* ── Modal Estado de cuenta ──────────────────────────────── */}
      {modalEdoCta && (
        <ModalEstadoCuenta
          clienteNombre = {cartera.cliente_nombre}
          clienteCod    = {cartera.cliente_cod}
          contribuyente = {cartera.contribuyente}
          correo        = {maestro?.correo ?? ''}
          analistaEmail = {userEmail}
          supabase      = {supabase}
          onClose       = {() => setModalEdoCta(false)}
          onSuccess     = {() => { setModalEdoCta(false); showToast('Estado de cuenta enviado'); router.refresh() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// TAB INFORMACIÓN
// ══════════════════════════════════════════════════════════════════════
function TabInformacion({ cartera, maestro, analistaNombre, esCoordinador, mora_total, pct_mora, onToast }: {
  cartera:        Cartera
  maestro:        MaestroCliente | null
  analistaNombre: string
  esCoordinador:  boolean
  mora_total:     number
  pct_mora:       number
  onToast:        (msg: string) => void
}) {
  // Estado de edición por campo
  type CampoEditable = 'nombre_cxp' | 'telefono' | 'telefono2' | 'correo'
  const [editando,   setEditando]   = useState<CampoEditable | null>(null)
  const [valNombre,  setValNombre]  = useState(maestro?.nombre_cxp ?? '')
  const [valTel,     setValTel]     = useState(maestro?.telefono  ?? '')
  const [valTel2,    setValTel2]    = useState(maestro?.telefono2 ?? '')
  const [valCorreo,  setValCorreo]  = useState(maestro?.correo    ?? '')
  const [saving,     setSaving]     = useState(false)

  // Formato teléfono CR: XXXX-XXXX (solo 8 dígitos)
  function fmtTel(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8)
    return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d
  }
  function rawTel(v: string) { return v.replace(/\D/g, '').slice(0, 8) }
  function telValido(v: string) { return rawTel(v).length === 8 || rawTel(v).length === 0 }

  async function guardar(campo: CampoEditable) {
    setSaving(true)
    const valorMap: Record<CampoEditable, string> = {
      nombre_cxp: valNombre,
      telefono:   rawTel(valTel),
      telefono2:  rawTel(valTel2),
      correo:     valCorreo,
    }
    const res = await fetch('/api/clientes/contacto', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_cod: cartera.cliente_cod, [campo]: valorMap[campo] }),
    })
    setSaving(false)
    if (res.ok) { setEditando(null); onToast('Guardado correctamente') }
    else         { onToast('Error al guardar') }
  }

  function cancelar(campo: CampoEditable) {
    setEditando(null)
    if (campo === 'nombre_cxp') setValNombre(maestro?.nombre_cxp ?? '')
    if (campo === 'telefono')   setValTel(maestro?.telefono   ?? '')
    if (campo === 'telefono2')  setValTel2(maestro?.telefono2 ?? '')
    if (campo === 'correo')     setValCorreo(maestro?.correo  ?? '')
  }

  function copiar(valor: string, label: string) {
    navigator.clipboard.writeText(valor).then(
      () => onToast(`${label} copiado`),
      () => onToast('No se pudo copiar'),
    )
  }

  const limite    = maestro?.limite_credito ?? 0
  const disponible = limite > 0 ? limite - cartera.total : null

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>

      {/* ── CARD 1: DATOS DE CONTACTO CxP ── */}
      <InfoCard2 titulo="DATOS DE CONTACTO CxP">
        <CampoEdit
          label="Nombre CxP" valor={valNombre} vacio="Sin nombre"
          editando={editando === 'nombre_cxp'} saving={saving}
          onEditar={() => setEditando('nombre_cxp')} onGuardar={() => guardar('nombre_cxp')}
          onCancelar={() => cancelar('nombre_cxp')} onChange={v => setValNombre(v)}
          onCopiar={valNombre ? () => copiar(valNombre, 'Nombre') : undefined}
        />
        <CampoEdit
          label="Teléfono 1" valor={valTel ? fmtTel(valTel) : ''} valorInput={valTel}
          vacio="Sin teléfono" type="tel" maxLength={9} invalido={!telValido(valTel)} hint="8 dígitos"
          editando={editando === 'telefono'} saving={saving}
          onEditar={() => setEditando('telefono')} onGuardar={() => guardar('telefono')}
          onCancelar={() => cancelar('telefono')} onChange={v => setValTel(fmtTel(v))}
          onCopiar={valTel ? () => copiar(fmtTel(valTel), 'Teléfono 1') : undefined}
        />
        <CampoEdit
          label="Teléfono 2" valor={valTel2 ? fmtTel(valTel2) : ''} valorInput={valTel2}
          vacio="Sin teléfono" type="tel" maxLength={9} invalido={!telValido(valTel2)} hint="8 dígitos"
          editando={editando === 'telefono2'} saving={saving}
          onEditar={() => setEditando('telefono2')} onGuardar={() => guardar('telefono2')}
          onCancelar={() => cancelar('telefono2')} onChange={v => setValTel2(fmtTel(v))}
          onCopiar={valTel2 ? () => copiar(fmtTel(valTel2), 'Teléfono 2') : undefined}
        />
        <CampoEdit
          label="Email CxP" valor={valCorreo} vacio="Sin email" type="email"
          editando={editando === 'correo'} saving={saving}
          onEditar={() => setEditando('correo')} onGuardar={() => guardar('correo')}
          onCancelar={() => cancelar('correo')} onChange={v => setValCorreo(v)}
          onCopiar={valCorreo ? () => copiar(valCorreo, 'Email') : undefined}
        />
      </InfoCard2>

      {/* ── CARD 2: INFORMACIÓN FISCAL ── */}
      <InfoCard2 titulo="INFORMACIÓN FISCAL">
        <CampoReadOnly label="Contribuyente"   valor={cartera.contribuyente}
          onCopiar={() => copiar(cartera.contribuyente, 'Contribuyente')} mono />
        <CampoReadOnly label="Razón social"    valor={cartera.cliente_nombre}
          onCopiar={() => copiar(cartera.cliente_nombre, 'Razón social')} />
        <CampoReadOnly label="Tipo de cliente" valor={maestro?.segmento || '—'} />
      </InfoCard2>

      {/* ── CARD 3: CONDICIONES COMERCIALES ── */}
      <InfoCard2 titulo="CONDICIONES COMERCIALES">
        <CampoReadOnly label="Condición de pago" valor={String(maestro?.condicion_pago || '—')}
          onCopiar={maestro?.condicion_pago ? () => copiar(String(maestro!.condicion_pago), 'Condición de pago') : undefined} />
        <CampoReadOnly label="Límite de crédito" valor={limite > 0 ? fmtCRC(limite) : 'Sin límite'}
          onCopiar={limite > 0 ? () => copiar(fmtCRC(limite), 'Límite de crédito') : undefined} />
        <div className="space-y-0.5">
          <span className="block text-[13px] font-semibold text-gray-600">Crédito disponible</span>
          {limite > 0 && disponible !== null ? (
            <span className="text-[13px] font-medium"
              style={{ color: disponible >= 0 ? '#22c55e' : '#dc2626' }}>
              {disponible >= 0
                ? `${fmtCRC(disponible)} disponible`
                : `Límite excedido en ${fmtCRC(Math.abs(disponible))}`}
            </span>
          ) : (
            <span className="text-[13px] text-gray-400">—</span>
          )}
        </div>
      </InfoCard2>

      {/* ── CARD 4: INFORMACIÓN INTERNA ── */}
      <InfoCard2 titulo="INFORMACIÓN INTERNA">
        <CampoReadOnly label="Código cliente"    valor={cartera.cliente_cod}
          onCopiar={() => copiar(cartera.cliente_cod, 'Código')} mono />
        <CampoReadOnly label="Vendedor asignado" valor={cartera.vendedor_nombre || '—'} />
        <CampoReadOnly label="Analista asignado" valor={analistaNombre || '—'} />
      </InfoCard2>

    </div>
  )
}

// ── InfoCard2: card compacta para tab Información ─────────────────────
function InfoCard2({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ borderWidth: '0.5px' }}>
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-100" style={{ borderBottomWidth: '0.5px' }}>
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{titulo}</h3>
      </div>
      <div className="px-3 py-2 space-y-1.5">{children}</div>
    </div>
  )
}

// ── CampoEdit: campo editable compacto (label arriba + valor abajo) ────
function CampoEdit({ label, valor, valorInput, vacio, type = 'text', maxLength,
  editando, saving, invalido, hint, onEditar, onGuardar, onCancelar, onChange, onCopiar }: {
  label:       string
  valor:       string
  valorInput?: string
  vacio:       string
  type?:       string
  maxLength?:  number
  editando:    boolean
  saving:      boolean
  invalido?:   boolean
  hint?:       string
  onEditar:    () => void
  onGuardar:   () => void
  onCancelar:  () => void
  onChange:    (v: string) => void
  onCopiar?:   () => void
}) {
  const inputVal = valorInput !== undefined ? valorInput : valor
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[13px] font-semibold text-gray-600 truncate">{label}</span>
        {!editando && (
          <div className="flex gap-1 flex-shrink-0">
            {onCopiar && (
              <button type="button" onClick={onCopiar}
                className="text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
                style={{ borderWidth: '0.5px' }}>
                Copiar
              </button>
            )}
            <button type="button" onClick={onEditar}
              className="text-[10px] font-medium text-blue-400 hover:text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
              style={{ borderWidth: '0.5px' }}>
              Editar
            </button>
          </div>
        )}
      </div>
      {editando ? (
        <div className="flex items-center gap-1 flex-wrap">
          <input
            autoFocus
            type={type}
            value={inputVal}
            maxLength={maxLength}
            onChange={e => onChange(e.target.value)}
            className={`flex-1 min-w-0 rounded border px-2 py-1 text-[13px] text-gray-800 focus:outline-none focus:ring-1 transition ${
              invalido ? 'border-red-300 focus:ring-red-200' : 'border-blue-300 focus:ring-blue-200'
            }`}
            style={{ backgroundColor: '#fff', borderWidth: '1px' }}
            placeholder={vacio}
          />
          {hint && <span className="text-[10px] text-gray-400 whitespace-nowrap">{hint}</span>}
          <button type="button" disabled={saving || invalido} onClick={onGuardar}
            className="text-[9px] font-bold text-white rounded px-2 py-1 leading-tight disabled:opacity-50 whitespace-nowrap transition"
            style={{ backgroundColor: '#009ee3' }}>
            {saving ? '...' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancelar}
            className="text-[9px] font-medium text-gray-500 border border-gray-200 rounded px-2 py-1 leading-tight hover:bg-gray-50 transition whitespace-nowrap"
            style={{ borderWidth: '0.5px' }}>
            Cancelar
          </button>
        </div>
      ) : (
        <span className="block text-[13px] text-gray-500 break-words">
          {valor || <span className="italic text-gray-300">{vacio}</span>}
        </span>
      )}
    </div>
  )
}

// ── CampoReadOnly: campo solo lectura compacto ────────────────────────
function CampoReadOnly({ label, valor, onCopiar, mono, muted }: {
  label:     string
  valor:     string
  onCopiar?: () => void
  mono?:     boolean
  muted?:    boolean
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span className="text-[13px] font-semibold text-gray-600 truncate">{label}</span>
        {onCopiar && (
          <button type="button" onClick={onCopiar}
            className="flex-shrink-0 text-[10px] font-medium text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 leading-tight transition whitespace-nowrap"
            style={{ borderWidth: '0.5px' }}>
            Copiar
          </button>
        )}
      </div>
      <span className={`block text-[13px] break-words ${muted ? 'text-gray-300 italic' : 'text-gray-500'} ${mono ? 'font-mono' : ''}`}>
        {valor || '—'}
      </span>
    </div>
  )
}

// SUB-COMPONENTES
// ══════════════════════════════════════════════════════════════════════

// ── Botón de acción del header ────────────────────────────────────────
function ActionBtn({ icon, label, onClick, disabled, title, style }: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  title?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold transition"
      style={{
        color: disabled ? '#cbd5e1' : '#64748b',
        borderColor: disabled ? '#f1f5f9' : undefined,
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: 'transparent',
        ...(!disabled ? { ['--tw-hover-bg' as string]: '#f8fafc' } : {}),
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Modal Email de cobro ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ModalEmailCobro({ clienteNombre, clienteCod, contribuyente, correo, analistaEmail, supabase, onClose, onSuccess }: {
  clienteNombre: string; clienteCod: string; contribuyente: string
  correo: string; analistaEmail: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  onClose: () => void; onSuccess: () => void
}) {
  const [para,    setPara]    = useState(correo)
  const [asunto,  setAsunto]  = useState(`Estado de cuenta - ${clienteNombre}`)
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!mensaje.trim()) { setError('Escribí un mensaje.'); return }
    setLoading(true); setError('')
    // Registrar gestión automática
    const hoy  = new Date()
    const fecha = hoy.toISOString().split('T')[0]
    const hora  = `${String(hoy.getHours()).padStart(2,'0')}:${String(hoy.getMinutes()).padStart(2,'0')}:00`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gErr } = await supabase.from('gestiones').insert({
      cliente_cod: clienteCod, contribuyente, analista_email: analistaEmail,
      fecha, hora, tipo: 'CORREO', resultado: 'Email enviado',
      nota: `Email de cobro enviado a ${para}. Asunto: ${asunto}. ${mensaje}`,
    } as any)
    setLoading(false)
    if (gErr) { setError('Error al registrar: ' + gErr.message); return }
    onSuccess()
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Email de cobro</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={handleEnviar} className="p-5 space-y-3">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700 font-semibold">{error}</div>}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Para</label>
          <input type="email" value={para} onChange={e => setPara(e.target.value)} className={inputCls} placeholder="correo@empresa.com" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Asunto</label>
          <input type="text" value={asunto} onChange={e => setAsunto(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Mensaje</label>
          <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4} className={inputCls + ' resize-none'} placeholder="Escribí el mensaje de cobro..." />
        </div>
        <p className="text-[10px] text-gray-400">Se registrará una gestión de tipo EMAIL automáticamente.</p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
          <button type="submit" disabled={loading} className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90" style={{ backgroundColor: '#009ee3' }}>
            {loading ? 'Registrando...' : 'Enviar y registrar'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ── Modal Estado de cuenta ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ModalEstadoCuenta({ clienteNombre, clienteCod, contribuyente, correo, analistaEmail, supabase, onClose, onSuccess }: {
  clienteNombre: string; clienteCod: string; contribuyente: string
  correo: string; analistaEmail: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  onClose: () => void; onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function registrarGestion(accion: string) {
    setLoading(true)
    const hoy   = new Date()
    const fecha = hoy.toISOString().split('T')[0]
    const hora  = `${String(hoy.getHours()).padStart(2,'0')}:${String(hoy.getMinutes()).padStart(2,'0')}:00`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from('gestiones').insert({
      cliente_cod: clienteCod, contribuyente, analista_email: analistaEmail,
      fecha, hora, tipo: 'CORREO', resultado: 'Email enviado',
      nota: `Estado de cuenta: ${accion}`,
    } as any)
    setLoading(false)
    onSuccess()
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Estado de cuenta</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <div className="p-5 space-y-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => registrarGestion('Descarga de PDF solicitada')}
          className="w-full flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition disabled:opacity-60"
        >
          <FileDown size={18} className="text-gray-400" />
          <div className="text-left">
            <p className="text-[13px] font-bold text-gray-800">Descargar PDF</p>
            <p className="text-[11px] text-gray-400">Genera el estado de cuenta en PDF</p>
          </div>
        </button>
        <button
          type="button"
          disabled={loading || !correo}
          onClick={() => registrarGestion(`Enviado por email a ${correo}`)}
          className="w-full flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 transition disabled:opacity-60"
          title={!correo ? 'Sin correo registrado para este cliente' : undefined}
        >
          <Send size={18} style={{ color: '#009ee3' }} />
          <div className="text-left">
            <p className="text-[13px] font-bold text-gray-800">Enviar por email</p>
            <p className="text-[11px] text-gray-400">{correo || 'Sin correo registrado'}</p>
          </div>
        </button>
        <p className="text-[10px] text-gray-400 text-center">Se registrará una gestión automáticamente al confirmar.</p>
      </div>
    </ModalOverlay>
  )
}

// ── Overlay y botón cerrar compartidos ────────────────────────────────
function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full overflow-hidden" style={{ maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose}
      className="flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
      style={{ width: '32px', height: '32px', color: '#94a3b8' }}>
      ✕
    </button>
  )
}

function Divider() {
  return <div className="w-px self-stretch bg-gray-100" />
}

function KpiChip({ label, valor, color, small, italic }: {
  label: string; valor: string; color?: string; small?: boolean; italic?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`tabular-nums ${small ? 'text-[13px] font-semibold' : 'text-[15px] font-bold'} ${italic ? 'italic' : ''}`}
        style={{ color: color ?? '#1e293b' }}
      >
        {valor}
      </p>
    </div>
  )
}

function InfoCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{titulo}</h3>
      </div>
      <div className="px-4 py-2 space-y-1">{children}</div>
    </div>
  )
}

function InfoRow({ icon, label, valor, mono, muted, color, badge }: {
  icon: React.ReactNode
  label: string
  valor: string
  mono?:  boolean
  muted?: boolean
  color?: string
  italic?: boolean
  badge?: { bg: string; text: string }
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className="text-[12px] text-gray-400 w-36 flex-shrink-0">{label}</span>
      {badge ? (
        <span className="text-[12px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: badge.bg, color: badge.text }}>
          {valor}
        </span>
      ) : (
        <span
          className={`text-[13px] font-semibold ${mono ? 'font-mono' : ''} ${muted ? 'text-gray-300 italic' : ''}`}
          style={{ color: muted ? undefined : (color ?? '#374151') }}
        >
          {valor}
        </span>
      )}
    </div>
  )
}

function Chip({ label, valor, bg, color }: { label: string; valor: string; bg?: string; color?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold"
      style={{ backgroundColor: bg ?? '#f0f4f8', color: color ?? '#64748b' }}
    >
      <span>{label}</span>
      <span style={{ color: color ? undefined : '#374151' }}>{valor}</span>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className="px-4 py-3 font-semibold text-gray-500 text-[11px] uppercase tracking-wider"
      style={{ textAlign: right ? 'right' : 'left' }}
    >
      {children}
    </th>
  )
}

function EmptyState({ icon, texto, sub, comingSoon }: {
  icon: React.ReactNode; texto: string; sub?: string; comingSoon?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="mb-3" style={{ color: comingSoon ? '#009ee3' : '#e2e8f0' }}>{icon}</div>
      <p className="text-[13px] font-semibold" style={{ color: comingSoon ? '#0369a1' : '#6b7280' }}>{texto}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1 max-w-xs">{sub}</p>}
      {comingSoon && (
        <span className="mt-3 text-[10px] font-bold rounded-full px-3 py-1" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
          PRÓXIMAMENTE
        </span>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TAB 3 — ESTADO DE CUENTA
// ══════════════════════════════════════════════════════════════════════
const TRAMOS_OPTS = ['Todos', 'Al día', '1-30 días', '31-60 días', '61-90 días', '91-120 días', '+120 días']
const ESTADO_OPTS = ['Todas', 'Vencidas', 'Por vencer', 'Vence hoy', 'Pagadas']
const POR_PAGINA  = 25

interface TabEstadoCuentaProps {
  facturas:            Factura[]
  clienteCod:          string
  clienteNombre:       string
  filtroTramoEdoCta:   string
  setFiltroTramoEdoCta: (v: string) => void
  onRegistrarGestion:  () => void
}

function TabEstadoCuenta({
  facturas, clienteCod, clienteNombre,
  filtroTramoEdoCta, setFiltroTramoEdoCta, onRegistrarGestion,
}: TabEstadoCuentaProps) {
  const hoy = hoyISO()

  const [filtroEstado,      setFiltroEstado]      = useState('Todas')
  const [busquedaDoc,       setBusquedaDoc]       = useState('')
  const [pagina,            setPagina]            = useState(1)
  const [seleccionadas,     setSeleccionadas]     = useState<Set<number>>(new Set())
  const [modalRecordatorio, setModalRecordatorio] = useState<Factura | null>(null)

  const selectCls = 'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white ' +
    'focus:outline-none focus:border-blue-400 transition'

  // ── Filtrado ──────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let data = [...facturas]

    // Filtro por tramo (viene del tab Aging o del select propio)
    if (filtroTramoEdoCta !== 'Todos') {
      data = data.filter(f => facturaEnTramo(f, filtroTramoEdoCta, hoy))
    }

    // Filtro por estado
    if (filtroEstado !== 'Todas') {
      data = data.filter(f => {
        const st = estadoFactura(f, hoy)
        if (filtroEstado === 'Vencidas')    return st.label.startsWith('Vencida')
        if (filtroEstado === 'Por vencer')  return st.label.startsWith('Vence en')
        if (filtroEstado === 'Vence hoy')   return st.label === 'Vence hoy'
        if (filtroEstado === 'Pagadas')     return st.label === 'Pagada'
        return true
      })
    }

    // Búsqueda por documento
    if (busquedaDoc.trim()) {
      const q = busquedaDoc.toLowerCase()
      data = data.filter(f => f.documento.toLowerCase().includes(q))
    }

    return data
  }, [facturas, filtroTramoEdoCta, filtroEstado, busquedaDoc, hoy])

  // ── Paginación ────────────────────────────────────────────────
  const totalPaginas   = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaReal     = Math.min(pagina, totalPaginas)
  const enPagina       = filtradas.slice((paginaReal - 1) * POR_PAGINA, paginaReal * POR_PAGINA)

  // ── Totales ───────────────────────────────────────────────────
  const totalMonto = filtradas.reduce((s, f) => s + (f.monto || 0), 0)
  const totalSaldo = filtradas.reduce((s, f) => s + (f.saldo || 0), 0)
  const saldoSel   = filtradas.filter(f => seleccionadas.has(f.id)).reduce((s, f) => s + (f.saldo || 0), 0)

  // ── Selección ─────────────────────────────────────────────────
  const toggleSel = (id: number) => setSeleccionadas(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleTodas = () => setSeleccionadas(
    seleccionadas.size === enPagina.length && enPagina.length > 0
      ? new Set()
      : new Set(enPagina.map(f => f.id))
  )

  // ── Exportar Excel ────────────────────────────────────────────
  function exportarExcel() {
    import('xlsx').then(XLSX => {
      const rows = filtradas.map(f => ({
        'Documento':      f.documento,
        'F. Emisión':     f.fecha_documento,
        'F. Vencimiento': f.fecha_vencimiento,
        'Monto':          f.monto,
        'Saldo':          f.saldo,
        'Estado':         estadoFactura(f, hoy).label,
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta')
      XLSX.writeFile(wb, `estado-cuenta-${clienteCod}.xlsx`)
    })
  }

  return (
    <div className="space-y-3">

      {/* ── Barra de filtros ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        <select
          value={filtroTramoEdoCta}
          onChange={e => { setFiltroTramoEdoCta(e.target.value); setPagina(1) }}
          className={selectCls}
        >
          {TRAMOS_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={filtroEstado}
          onChange={e => { setFiltroEstado(e.target.value); setPagina(1) }}
          className={selectCls}
        >
          {ESTADO_OPTS.map(t => <option key={t}>{t}</option>)}
        </select>

        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar documento..."
            value={busquedaDoc}
            onChange={e => { setBusquedaDoc(e.target.value); setPagina(1) }}
            className={selectCls + ' pl-8 w-44'}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-gray-400">
            {filtradas.length} facturas · Saldo:{' '}
            <span className="font-semibold text-gray-600">{fmtM(totalSaldo)}</span>
          </span>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            <FileDown size={13} /> Excel
          </button>
        </div>
      </div>

      {/* ── Barra de selección múltiple ──────────────────────── */}
      {seleccionadas.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-semibold flex-wrap"
          style={{ backgroundColor: '#003B5C', color: 'white' }}>
          <span className="text-[12px]">
            {seleccionadas.size} {seleccionadas.size === 1 ? 'factura' : 'facturas'} · Saldo: {fmtM(saldoSel)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              className="rounded-lg px-3 py-1 text-[12px] font-bold bg-white/20 hover:bg-white/30 transition"
            >
              Recordar pago
            </button>
            <button
              onClick={() => { onRegistrarGestion(); setSeleccionadas(new Set()) }}
              className="rounded-lg px-3 py-1 text-[12px] font-bold transition"
              style={{ backgroundColor: '#009ee3' }}
            >
              Agregar gestión
            </button>
            <button
              onClick={() => setSeleccionadas(new Set())}
              className="text-white/60 hover:text-white transition text-[12px] ml-1"
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} texto="No hay facturas con los filtros aplicados." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th className="px-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={seleccionadas.size === enPagina.length && enPagina.length > 0}
                        onChange={toggleTodas}
                        className="rounded"
                      />
                    </th>
                    <Th>Documento</Th>
                    <Th>F. Emisión</Th>
                    <Th>F. Vencimiento</Th>
                    <Th right>Monto</Th>
                    <Th right>Saldo</Th>
                    <Th>Estado</Th>
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {enPagina.map((f, i) => {
                    const est  = estadoFactura(f, hoy)
                    const selec = seleccionadas.has(f.id)
                    return (
                      <tr
                        key={f.id}
                        className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors"
                        style={selec
                          ? { backgroundColor: '#eff6ff' }
                          : i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selec}
                            onChange={() => toggleSel(f.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-gray-700 whitespace-nowrap">
                          {f.documento}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">
                          {fmtFecha(f.fecha_documento)}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">
                          {fmtFecha(f.fecha_vencimiento)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums font-semibold text-gray-700 whitespace-nowrap">
                          {fmtCRC(f.monto)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: f.saldo > 0 ? '#dc2626' : '#94a3b8' }}>
                          {f.saldo > 0 ? fmtCRC(f.saldo) : '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: est.bg, color: est.color }}
                          >
                            {est.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setModalRecordatorio(f)}
                              className="rounded-md px-2 py-0.5 text-[11px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition whitespace-nowrap"
                            >
                              Recordar
                            </button>
                            <button
                              onClick={onRegistrarGestion}
                              className="rounded-md px-2 py-0.5 text-[11px] font-bold border border-blue-100 transition whitespace-nowrap"
                              style={{ color: '#009ee3' }}
                            >
                              Gestión
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={4} className="px-4 py-2.5 text-[12px] font-bold text-gray-500 uppercase tracking-wider">
                      Total ({filtradas.length} facturas)
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-bold text-gray-800 tabular-nums whitespace-nowrap">
                      {fmtCRC(totalMonto)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-bold tabular-nums whitespace-nowrap"
                      style={{ color: '#dc2626' }}>
                      {fmtCRC(totalSaldo)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100"
                style={{ backgroundColor: '#fafbfc' }}>
                <span className="text-[11px] text-gray-400">
                  Página {paginaReal} de {totalPaginas} · {filtradas.length} facturas
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={paginaReal === 1}
                    onClick={() => setPagina(p => p - 1)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold border border-gray-200 disabled:opacity-40 hover:bg-white transition"
                  >
                    ← Ant
                  </button>
                  <button
                    disabled={paginaReal === totalPaginas}
                    onClick={() => setPagina(p => p + 1)}
                    className="rounded-md px-2.5 py-1 text-[12px] font-semibold border border-gray-200 disabled:opacity-40 hover:bg-white transition"
                  >
                    Sig →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Recordatorio */}
      {modalRecordatorio && (
        <ModalRecordatorio
          factura       = {modalRecordatorio}
          clienteNombre = {clienteNombre}
          clienteCod    = {clienteCod}
          onClose       = {() => setModalRecordatorio(null)}
          onSuccess     = {() => setModalRecordatorio(null)}
        />
      )}
    </div>
  )
}

// ── Modal Recordatorio ────────────────────────────────────────────────
function ModalRecordatorio({ factura, clienteNombre, clienteCod, onClose, onSuccess }: {
  factura:       Factura
  clienteNombre: string
  clienteCod:    string
  onClose:       () => void
  onSuccess:     () => void
}) {
  const hoy = hoyISO()
  const est = estadoFactura(factura, hoy)
  const [nota,    setNota]    = useState(
    `Estimado cliente ${clienteNombre}, le recordamos que la factura ` +
    `${factura.documento} por ${fmtCRC(factura.saldo)} se encuentra ${est.label.toLowerCase()}. ` +
    `Por favor regularice su situación a la brevedad.`
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function enviar() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/clientes/recordatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_cod: clienteCod, documento: factura.documento, nota }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error'); return }
      onSuccess()
    } catch { setError('Error de red') } finally { setLoading(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-4" style={{ minWidth: '360px', maxWidth: '460px' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-gray-800">Registrar recordatorio</h3>
            <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-1.5">
              {factura.documento}
              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: est.bg, color: est.color }}>
                {est.label}
              </span>
              <span className="font-semibold text-gray-600">{fmtCRC(factura.saldo)}</span>
            </p>
          </div>
          <CloseBtn onClose={onClose} />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">
            Nota de gestión
          </label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {error && <p className="text-[12px] text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] text-gray-500 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={loading || !nota.trim()}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: '#009ee3' }}
          >
            {loading ? 'Guardando...' : 'Registrar gestión'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SHARED — colores de tipo de gestión
// ══════════════════════════════════════════════════════════════════════
const TIPO_COLORES: Record<string, { bg: string; text: string }> = {
  'Llamada':  { bg: '#e0f2fe', text: '#0369a1' },
  'Email':    { bg: '#f3e8ff', text: '#7c3aed' },
  'WhatsApp': { bg: '#dcfce7', text: '#15803d' },
  'Visita':   { bg: '#fef9c3', text: '#a16207' },
  'CORREO':   { bg: '#f3e8ff', text: '#7c3aed' },
  'Otras':    { bg: '#f1f5f9', text: '#64748b' },
}

const TIPO_ICONOS: Record<string, React.ReactNode> = {
  'Llamada':  <Phone       size={13} />,
  'Email':    <Mail        size={13} />,
  'WhatsApp': <MessageCircle size={13} />,
  'Visita':   <Building2   size={13} />,
  'CORREO':   <Mail        size={13} />,
}

// ── Modal Editar Gestión ──────────────────────────────────────────────
function ModalEditarGestion({ gestion, onClose, onSuccess }: {
  gestion:   Gestion
  onClose:   () => void
  onSuccess: () => void
}) {
  const [tipo,      setTipo]      = useState(gestion.tipo)
  const [resultado, setResultado] = useState(gestion.resultado)
  const [nota,      setNota]      = useState(gestion.nota ?? '')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const TIPOS     = ['Llamada', 'Email', 'WhatsApp', 'Visita', 'Otras']
  const RESULTADOS = ['Promesa OK', 'No contestó', 'No ubicado', 'Pagó', 'Email enviado', 'Pendiente', 'Aceptó convenio', 'Llamar más tarde']

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!nota.trim()) { setError('La nota es obligatoria'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/clientes/gestiones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: gestion.id, tipo, resultado, nota }),
    })
    setLoading(false)
    if (res.ok) onSuccess()
    else { const d = await res.json(); setError(d.error ?? 'Error al guardar') }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-[15px] font-bold text-gray-900">Editar gestión</h2>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={guardar} className="p-5 space-y-3">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Resultado</label>
            <select value={resultado} onChange={e => setResultado(e.target.value)} className={inputCls}>
              {RESULTADOS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nota</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
            className={inputCls + ' resize-none'} placeholder="Descripción de la gestión..." />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}>
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TAB 4 — GESTIONES
// ══════════════════════════════════════════════════════════════════════
function TabGestiones({
  gestiones,
  userEmail,
  esCoordinador,
  onNuevaGestion,
  onToast,
  onRefresh,
}: {
  gestiones:      Gestion[]
  userEmail:      string
  esCoordinador:  boolean
  onNuevaGestion: () => void
  onToast:        (msg: string) => void
  onRefresh:      () => void
}) {
  const hoy = hoyISO()
  const [filtroTipo,      setFiltroTipo]      = useState('Todos')
  const [filtroResultado, setFiltroResultado] = useState('Todos')
  const [filtroPeriodo,   setFiltroPeriodo]   = useState('Todo')
  const [busqueda,        setBusqueda]        = useState('')
  const [visibles,        setVisibles]        = useState(10)
  const [editando,        setEditando]        = useState<Gestion | null>(null)
  const [loadingDel,      setLoadingDel]      = useState<string | null>(null)

  // Filtro de permisos: analista solo ve sus gestiones
  const visiblesBase = useMemo(() =>
    esCoordinador ? gestiones.filter(g => g.activo !== false)
                  : gestiones.filter(g => g.activo !== false && g.analista_email === userEmail),
    [gestiones, esCoordinador, userEmail]
  )

  // Filtro de período
  function enPeriodo(fecha: string): boolean {
    if (filtroPeriodo === 'Todo') return true
    const diff = Math.floor((new Date(hoy).getTime() - new Date(fecha).getTime()) / 86400000)
    if (filtroPeriodo === 'Hoy')         return diff === 0
    if (filtroPeriodo === 'Esta semana') return diff >= 0 && diff <= 6
    if (filtroPeriodo === 'Este mes')    return diff >= 0 && diff <= 30
    return true
  }

  const filtradas = useMemo(() => visiblesBase.filter(g => {
    if (filtroTipo      !== 'Todos' && g.tipo      !== filtroTipo)      return false
    if (filtroResultado !== 'Todos' && g.resultado !== filtroResultado) return false
    if (!enPeriodo(g.fecha))                                            return false
    if (busqueda && !g.nota?.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [visiblesBase, filtroTipo, filtroResultado, filtroPeriodo, busqueda, hoy])

  const mostradas = filtradas.slice(0, visibles)

  // KPIs del total visible (respeta permisos)
  const total         = visiblesBase.length
  const ultima        = visiblesBase[0]
  const resultadoTop  = useMemo(() => {
    const m: Record<string, number> = {}
    visiblesBase.forEach(g => { m[g.resultado] = (m[g.resultado] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
  }, [visiblesBase])

  const tiposUnicos      = useMemo(() => ['Todos', ...Array.from(new Set(visiblesBase.map(g => g.tipo)))], [visiblesBase])
  const resultadosUnicos = useMemo(() => ['Todos', ...Array.from(new Set(visiblesBase.map(g => g.resultado)))], [visiblesBase])

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar esta gestión? Esta acción no se puede deshacer.')) return
    setLoadingDel(id)
    const res = await fetch('/api/clientes/gestiones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setLoadingDel(null)
    if (res.ok) { onToast('Gestión eliminada'); onRefresh() }
    else { const d = await res.json(); onToast(d.error ?? 'Error al eliminar') }
  }

  const hayFiltros = filtroTipo !== 'Todos' || filtroResultado !== 'Todos' || filtroPeriodo !== 'Todo' || !!busqueda

  return (
    <div className="space-y-4">

      {/* ── Fila 1: KPIs + botón ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {esCoordinador ? 'Total gestiones' : 'Mis gestiones'}
            </p>
            <p className="text-[22px] font-black tabular-nums text-gray-800 leading-tight">{total}</p>
          </div>
          <Divider />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Última gestión</p>
            <p className="text-[15px] font-bold text-gray-700 leading-tight">
              {ultima ? fmtFecha(ultima.fecha) : '—'}
            </p>
            {ultima && (
              <p className="text-[11px] text-gray-400">{ultima.tipo} · {ultima.hora?.slice(0, 5)}</p>
            )}
          </div>
          <Divider />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Resultado frecuente</p>
            {resultadoTop !== '—' ? (
              <span className="inline-block text-[12px] font-bold rounded-full px-2.5 py-0.5 mt-0.5"
                style={{
                  backgroundColor: (RESULTADO_COLORS[resultadoTop] ?? { bg: '#f1f5f9' }).bg,
                  color:            (RESULTADO_COLORS[resultadoTop] ?? { text: '#64748b' }).text,
                }}>
                {resultadoTop}
              </span>
            ) : <p className="text-[13px] text-gray-300 italic">—</p>}
          </div>
          <Divider />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Por tipo</p>
            <div className="flex gap-2 mt-0.5 flex-wrap">
              {Object.entries(
                visiblesBase.reduce<Record<string, number>>((acc, g) => { acc[g.tipo] = (acc[g.tipo] ?? 0) + 1; return acc }, {})
              ).map(([t, cnt]) => {
                const sty = TIPO_COLORES[t] ?? { bg: '#f1f5f9', text: '#64748b' }
                return (
                  <span key={t} className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: sty.bg, color: sty.text }}>
                    {TIPO_ICONOS[t]}
                    {cnt}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Fila 2: Filtros ──────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative" style={{ minWidth: '180px', maxWidth: '240px', flex: '1' }}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setVisibles(10) }}
            placeholder="Buscar en notas..."
            className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-2 text-[13px] text-gray-700 focus:outline-none focus:border-blue-300 transition"
          />
        </div>
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setVisibles(10) }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-600 focus:outline-none focus:border-blue-300 transition bg-white">
          {tiposUnicos.map(t => <option key={t} value={t}>{t === 'Todos' ? 'Todos los tipos' : t}</option>)}
        </select>
        <select value={filtroResultado} onChange={e => { setFiltroResultado(e.target.value); setVisibles(10) }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-600 focus:outline-none focus:border-blue-300 transition bg-white">
          {resultadosUnicos.map(r => <option key={r} value={r}>{r === 'Todos' ? 'Todos los resultados' : r}</option>)}
        </select>
        <select value={filtroPeriodo} onChange={e => { setFiltroPeriodo(e.target.value); setVisibles(10) }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-600 focus:outline-none focus:border-blue-300 transition bg-white">
          {['Todo', 'Hoy', 'Esta semana', 'Este mes'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {hayFiltros && (
          <button type="button"
            onClick={() => { setFiltroTipo('Todos'); setFiltroResultado('Todos'); setFiltroPeriodo('Todo'); setBusqueda(''); setVisibles(10) }}
            className="text-[12px] font-semibold text-blue-500 hover:text-blue-700 transition">
            Limpiar
          </button>
        )}
        {filtradas.length !== total && (
          <span className="text-[11px] text-gray-400 ml-auto">{filtradas.length} de {total}</span>
        )}
      </div>

      {/* ── Fila 3: Tabla ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <EmptyState icon={<ClipboardList size={32} />}
            texto={total === 0 ? 'Sin gestiones registradas.' : 'No hay gestiones con esos filtros.'} />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Resultado</Th>
                  <Th>Nota</Th>
                  <Th>Analista</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((g, i) => {
                  const resSty  = RESULTADO_COLORS[g.resultado] ?? { bg: '#f1f5f9', text: '#64748b' }
                  const tipoSty = TIPO_COLORES[g.tipo]          ?? { bg: '#f1f5f9', text: '#64748b' }
                  // Puede editar: propio analista o coordinador
                  const puedeEditar  = esCoordinador || g.analista_email === userEmail
                  const puedeEliminar = esCoordinador
                  return (
                    <tr key={g.id}
                      className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors"
                      style={{ backgroundColor: i % 2 === 0 ? undefined : '#fafbfc' }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[13px] font-semibold text-gray-700">{fmtFecha(g.fecha)}</p>
                        <p className="text-[11px] text-gray-400">{g.hora?.slice(0, 5) || ''}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1"
                          style={{ backgroundColor: tipoSty.bg, color: tipoSty.text }}>
                          {TIPO_ICONOS[g.tipo]}
                          {g.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block text-[11px] font-bold rounded-full px-2.5 py-1"
                          style={{ backgroundColor: resSty.bg, color: resSty.text }}>
                          {g.resultado}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ maxWidth: '300px' }}>
                        <p className="text-[13px] text-gray-600 leading-snug line-clamp-2">
                          {g.nota || <span className="text-gray-300 italic">Sin nota</span>}
                        </p>
                        {g.promesa_fecha && (
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: '#0369a1' }}>
                            Promesa: {fmtFecha(g.promesa_fecha)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[12px] text-gray-500">{g.analista_email?.split('@')[0] ?? '—'}</p>
                      </td>
                      {/* Acciones */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {puedeEditar && (
                            <button type="button" onClick={() => setEditando(g)}
                              className="text-[11px] font-semibold px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition">
                              Editar
                            </button>
                          )}
                          {puedeEliminar && (
                            <button type="button"
                              onClick={() => eliminar(g.id)}
                              disabled={loadingDel === g.id}
                              className="text-[11px] font-semibold px-2 py-1 rounded-md border border-red-100 text-red-400 hover:bg-red-50 transition disabled:opacity-50"
                              title="Solo coordinador puede eliminar">
                              {loadingDel === g.id ? '...' : 'Eliminar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Ver más */}
            {filtradas.length > visibles && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-[12px] text-gray-400">
                  Mostrando {mostradas.length} de {filtradas.length}
                </span>
                <button type="button" onClick={() => setVisibles(v => v + 10)}
                  className="text-[12px] font-bold text-blue-500 hover:text-blue-700 transition">
                  Ver más ↓
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal editar */}
      {editando && (
        <ModalEditarGestion
          gestion    = {editando}
          onClose    = {() => setEditando(null)}
          onSuccess  = {() => { setEditando(null); onToast('Gestión actualizada'); onRefresh() }}
        />
      )}

      {/* ── Botón flotante ────────────────────────────────────── */}
      <button
        type="button"
        onClick={onNuevaGestion}
        title="Registrar una nueva gestión (llamada, email, visita, etc.)"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
        style={{ backgroundColor: '#009ee3' }}
      >
        <Plus size={16} /> Nueva gestión
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TAB 5 — PROMESAS
// ══════════════════════════════════════════════════════════════════════

// ── Modal Cambiar Estado Promesa ──────────────────────────────────────
function ModalCambiarEstado({ promesa, onClose, onSuccess }: {
  promesa:   Promesa
  onClose:   () => void
  onSuccess: () => void
}) {
  const [estado,     setEstado]     = useState(promesa.estado)
  const [montoReal,  setMontoReal]  = useState('')
  const [motivo,     setMotivo]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/clientes/promesas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:     promesa.id,
        estado,
        monto_real:  montoReal ? parseFloat(montoReal.replace(/\D/g, '')) : undefined,
        motivo:      motivo || undefined,
      }),
    })
    setLoading(false)
    if (res.ok) onSuccess()
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Cambiar estado de promesa</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{fmtCRC2(promesa.monto)} · Prometido: {fmtFecha(promesa.fecha_promesa)}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={guardar} className="p-5 space-y-3">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{error}</div>}

        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nuevo estado</label>
          <div className="grid grid-cols-2 gap-2">
            {(['PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA', 'ABONO_PARCIAL'] as const).map(est => {
              const sty = PROMESA_COLORS[est] ?? { bg: '#f1f5f9', text: '#64748b', icon: null }
              const active = estado === est
              return (
                <button key={est} type="button" onClick={() => setEstado(est)}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-bold transition"
                  style={active
                    ? { backgroundColor: sty.bg, color: sty.text, borderColor: sty.text }
                    : { borderColor: '#e2e8f0', color: '#94a3b8' }
                  }>
                  {sty.icon}{est.replace(/_/g, ' ')}
                </button>
              )
            })}
          </div>
        </div>

        {estado === 'CUMPLIDA' && (
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Monto real pagado (₡)</label>
            <input type="text" value={montoReal} onChange={e => setMontoReal(e.target.value)}
              className={inputCls} placeholder="Ej: 50000000" />
          </div>
        )}
        {(estado === 'INCUMPLIDA' || estado === 'ABONO_PARCIAL') && (
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
              {estado === 'ABONO_PARCIAL' ? 'Nota del abono parcial' : 'Motivo (opcional)'}
            </label>
            <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
              className={inputCls} placeholder={estado === 'ABONO_PARCIAL' ? 'Ej: Pagó ₡20.000.000 a cuenta' : 'Ej: No tenía fondos'} />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}>
            {loading ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ── Modal Registrar Promesa ───────────────────────────────────────────
function ModalRegistrarPromesa({ clienteCod, contribuyente, onClose, onSuccess }: {
  clienteCod:    string
  contribuyente: string
  onClose:       () => void
  onSuccess:     () => void
}) {
  const [monto,  setMonto]  = useState('')
  const [fecha,  setFecha]  = useState('')
  const [notas,  setNotas]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseFloat(monto.replace(/\D/g, ''))
    if (!montoNum || montoNum <= 0) { setError('El monto es obligatorio'); return }
    if (!fecha)                      { setError('La fecha es obligatoria');  return }
    setLoading(true); setError('')
    const res = await fetch('/api/clientes/promesas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_cod: clienteCod, contribuyente, monto: montoNum, fecha_promesa: fecha, notas }),
    })
    setLoading(false)
    if (res.ok) onSuccess()
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-[15px] font-bold text-gray-900">Registrar promesa de pago</h2>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={guardar} className="p-5 space-y-3">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Monto prometido (₡)</label>
          <input type="text" value={monto} onChange={e => setMonto(e.target.value)}
            className={inputCls} placeholder="Ej: 50000000" autoFocus />
          {monto && !isNaN(parseFloat(monto.replace(/\D/g, ''))) && (
            <p className="text-[11px] text-blue-500 mt-1">{fmtCRC2(parseFloat(monto.replace(/\D/g, '')))}</p>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Fecha de pago prometida</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nota (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            className={inputCls + ' resize-none'} placeholder="Acuerdo alcanzado, condiciones, etc." />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60 hover:opacity-90"
            style={{ backgroundColor: '#009ee3' }}>
            {loading ? 'Guardando...' : 'Guardar promesa'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function TabPromesas({
  promesas,
  clienteCod,
  contribuyente,
  esCoordinador,
  onNuevaGestion,
  onToast,
  onRefresh,
}: {
  promesas:       Promesa[]
  clienteCod:     string
  contribuyente:  string
  esCoordinador:  boolean
  onNuevaGestion: () => void
  onToast:        (msg: string) => void
  onRefresh:      () => void
}) {
  const hoy = hoyISO()
  const [filtroEstado,    setFiltroEstado]    = useState<string>('Todos')
  const [modalEstado,     setModalEstado]     = useState<Promesa | null>(null)
  const [modalPromesa,    setModalPromesa]    = useState(false)
  const [loadingDel,      setLoadingDel]      = useState<string | null>(null)
  const [autoRotaIds,     setAutoRotaIds]     = useState<Set<string>>(new Set())

  // ── Auto-ROTA client-side: promesas pendientes con fecha < hoy ────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    const vencidas = promesas.filter(
      p => p.activo !== false && p.estado === 'PENDIENTE' && p.fecha_promesa && p.fecha_promesa < hoy
    )
    if (vencidas.length === 0) return
    const ids = new Set(vencidas.map(p => p.id))
    setAutoRotaIds(ids)
    // Marcar como INCUMPLIDA en background (sin bloquear render)
    vencidas.forEach(p => {
      fetch('/api/clientes/promesas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, estado: 'INCUMPLIDA', motivo: 'Vencida automáticamente' }),
      }).catch(() => {/* silencioso */})
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // solo al montar

  // KPIs (usa estado visual: si autoRota → cuenta como incumplida)
  function estadoEfectivo(p: Promesa): string {
    return autoRotaIds.has(p.id) ? 'INCUMPLIDA' : p.estado
  }

  const activas    = promesas.filter(p => p.activo !== false)
  const total      = activas.length
  const pendientes = activas.filter(p => estadoEfectivo(p) === 'PENDIENTE').length
  const cumplidas  = activas.filter(p => estadoEfectivo(p) === 'CUMPLIDA').length
  const incumplidas = activas.filter(p => estadoEfectivo(p) === 'INCUMPLIDA').length
  const pctCumplimiento = total > 0 ? Math.round((cumplidas / total) * 100) : 0
  const montoPendiente  = activas.filter(p => estadoEfectivo(p) === 'PENDIENTE').reduce((s, p) => s + (p.monto || 0), 0)

  const ESTADOS_FILTRO = ['Todos', 'PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA', 'ABONO_PARCIAL']

  const filtradas = activas.filter(p =>
    filtroEstado === 'Todos' || estadoEfectivo(p) === filtroEstado
  )

  // Días restantes o vencidos
  function diasInfo(p: Promesa): { diff: number; label: string; color: string } {
    if (!p.fecha_promesa) return { diff: 0, label: '—', color: '#94a3b8' }
    const diff = Math.floor((new Date(p.fecha_promesa).getTime() - new Date(hoy).getTime()) / 86400000)
    if (diff > 0)  return { diff, label: `en ${diff}d`,        color: diff <= 3 ? '#f59e0b' : '#22c55e' }
    if (diff === 0) return { diff, label: 'hoy',               color: '#f97316' }
    return              { diff, label: `vencida ${-diff}d`,    color: '#dc2626' }
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Eliminar esta promesa?')) return
    setLoadingDel(id)
    const res = await fetch('/api/clientes/promesas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setLoadingDel(null)
    if (res.ok) { onToast('Promesa eliminada'); onRefresh() }
    else { const d = await res.json(); onToast(d.error ?? 'Error al eliminar') }
  }

  return (
    <div className="space-y-4">

      {/* ── Fila 1: KPIs ────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total promesas</p>
          <p className="text-[22px] font-black tabular-nums text-gray-800 leading-tight">{total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Pendientes</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: pendientes > 0 ? '#f59e0b' : '#94a3b8' }}>{pendientes}</p>
          {montoPendiente > 0 && (
            <p className="text-[11px] font-semibold tabular-nums mt-0.5 text-gray-500">{fmtCRC2(montoPendiente)}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Cumplimiento</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: pctCumplimiento >= 70 ? '#16a34a' : pctCumplimiento >= 40 ? '#f59e0b' : '#dc2626' }}>
            {total > 0 ? `${pctCumplimiento}%` : '—'}
          </p>
          {total > 0 && <p className="text-[11px] text-gray-400 mt-0.5">{cumplidas} de {total} cumplidas</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Incumplidas</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: incumplidas > 0 ? '#dc2626' : '#94a3b8' }}>{incumplidas}</p>
        </div>
      </div>

      {/* ── Fila 2: Filtros + botones ────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {ESTADOS_FILTRO.map(est => {
            const sty = est !== 'Todos' ? (PROMESA_COLORS[est] ?? { bg: '#f1f5f9', text: '#64748b', icon: null }) : null
            const active = filtroEstado === est
            return (
              <button key={est} type="button" onClick={() => setFiltroEstado(est)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
                style={active
                  ? { backgroundColor: sty?.bg ?? '#e0f2fe', color: sty?.text ?? '#0369a1', boxShadow: '0 0 0 2px ' + (sty?.text ?? '#0369a1') + '40' }
                  : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
                }>
                {sty?.icon}
                {est === 'Todos' ? 'Todas' : est.replace(/_/g, ' ')}
                {est !== 'Todos' && <span className="text-[10px]">({activas.filter(p => estadoEfectivo(p) === est).length})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Fila 3: Tabla ────────────────────────────────────── */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <EmptyState icon={<Handshake size={32} />}
            texto={total === 0 ? 'Sin promesas de pago registradas.' : 'No hay promesas con ese estado.'} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <Th>Monto</Th>
                <Th>Fecha prometida</Th>
                <Th>Estado</Th>
                <Th>Notas</Th>
                <Th>Registrada</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((p, i) => {
                const estEfect = estadoEfectivo(p)
                const sty    = PROMESA_COLORS[estEfect] ?? { bg: '#f1f5f9', text: '#64748b', icon: <Circle size={12} /> }
                const dias   = diasInfo(p)
                const rowBg  =
                  (estEfect === 'PENDIENTE' && dias.diff === 0)  ? '#fffbeb' :
                  (estEfect === 'PENDIENTE' && dias.diff < 0)    ? '#fff5f5' :
                  (estEfect === 'PENDIENTE' && dias.diff <= 3)   ? '#f0fdf4' :
                  i % 2 === 1 ? '#fafbfc' : undefined
                return (
                  <tr key={p.id}
                    className="border-t border-gray-50 hover:bg-blue-50/30 transition-colors"
                    style={{ backgroundColor: rowBg }}
                  >
                    {/* Monto */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[14px] font-black tabular-nums text-gray-800">{fmtCRC2(p.monto)}</p>
                    </td>
                    {/* Fecha + días */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[13px] font-semibold text-gray-700">{fmtFecha(p.fecha_promesa)}</p>
                      {estEfect === 'PENDIENTE' && (
                        <p className="text-[11px] font-bold" style={{ color: dias.color }}>{dias.label}</p>
                      )}
                    </td>
                    {/* Estado */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1"
                        style={{ backgroundColor: sty.bg, color: sty.text }}>
                        {sty.icon}
                        {estEfect.replace(/_/g, ' ')}
                      </span>
                      {autoRotaIds.has(p.id) && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Auto-marcada</p>
                      )}
                    </td>
                    {/* Notas */}
                    <td className="px-4 py-3" style={{ maxWidth: '220px' }}>
                      <p className="text-[12px] text-gray-500 italic line-clamp-2">
                        {p.notas || <span className="text-gray-300">Sin notas</span>}
                      </p>
                    </td>
                    {/* Registrada */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-[12px] text-gray-400">{fmtFecha(p.fecha_creacion)}</p>
                      <p className="text-[11px] text-gray-400">{p.analista_email?.split('@')[0]}</p>
                    </td>
                    {/* Acciones */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex gap-1.5 flex-wrap">
                        <button type="button" onClick={() => setModalEstado(p)}
                          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
                          title="Cambiar estado de la promesa">
                          Estado
                        </button>
                        <button type="button" onClick={onNuevaGestion}
                          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-blue-100 text-blue-500 hover:bg-blue-50 transition"
                          title="Registrar gestión relacionada con esta promesa">
                          <ClipboardList size={11} className="inline mr-0.5" />Gestión
                        </button>
                        {esCoordinador && (
                          <button type="button" onClick={() => eliminar(p.id)}
                            disabled={loadingDel === p.id}
                            className="text-[11px] font-semibold px-2 py-1 rounded-md border border-red-100 text-red-400 hover:bg-red-50 transition disabled:opacity-50"
                            title="Solo coordinador puede eliminar">
                            {loadingDel === p.id ? '...' : 'Eliminar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      {modalEstado && (
        <ModalCambiarEstado
          promesa   = {modalEstado}
          onClose   = {() => setModalEstado(null)}
          onSuccess = {() => { setModalEstado(null); onToast('Estado actualizado'); onRefresh() }}
        />
      )}
      {modalPromesa && (
        <ModalRegistrarPromesa
          clienteCod    = {clienteCod}
          contribuyente = {contribuyente}
          onClose       = {() => setModalPromesa(false)}
          onSuccess     = {() => { setModalPromesa(false); onToast('Promesa registrada'); onRefresh() }}
        />
      )}

      {/* ── Botón flotante Nueva promesa ─────────────────────── */}
      <button
        type="button"
        onClick={() => setModalPromesa(true)}
        title="Registrar una nueva promesa de pago"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
        style={{ backgroundColor: '#003B5C' }}
      >
        <Plus size={16} /> Nueva promesa
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TAB 8 — SOLICITUDES
// ══════════════════════════════════════════════════════════════════════

const TIPO_SOL_LABELS: Record<string, string> = {
  AUMENTO_LIMITE:   'Aumento de límite',
  EXCEPCION_CREDITO:'Excepción de crédito',
  NOTA_CREDITO:     'Nota de crédito',
  OTRA:             'Otra',
}
const TIPO_SOL_COLORES: Record<string, { bg: string; text: string }> = {
  AUMENTO_LIMITE:    { bg: '#e0f2fe', text: '#0369a1' },
  EXCEPCION_CREDITO: { bg: '#fef9c3', text: '#a16207' },
  NOTA_CREDITO:      { bg: '#f3e8ff', text: '#7c3aed' },
  OTRA:              { bg: '#f1f5f9', text: '#64748b' },
}
const ESTADO_SOL_COLORES: Record<string, { bg: string; text: string }> = {
  PENDIENTE:   { bg: '#fef9c3', text: '#a16207' },
  EN_REVISION: { bg: '#e0f2fe', text: '#0369a1' },
  APROBADA:    { bg: '#dcfce7', text: '#15803d' },
  RECHAZADA:   { bg: '#fee2e2', text: '#dc2626' },
}

function ModalAccionSolicitud({ solicitud, accion, onClose, onSuccess }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitud: any
  accion:    'APROBAR' | 'RECHAZAR' | 'CANCELAR'
  onClose:   () => void
  onSuccess: () => void
}) {
  const [comentario, setComentario] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (accion === 'RECHAZAR' && !comentario.trim()) { setError('El comentario es obligatorio al rechazar'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/solicitudes/${solicitud.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, comentario }),
    })
    setLoading(false)
    if (res.ok) onSuccess()
    else { const d = await res.json(); setError(d.error ?? 'Error') }
  }

  const LABEL = { APROBAR: 'Aprobar', RECHAZAR: 'Rechazar', CANCELAR: 'Cancelar' } as const
  const COLOR = { APROBAR: '#16a34a', RECHAZAR: '#dc2626', CANCELAR: '#64748b' } as const

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="text-[15px] font-bold text-gray-900">{LABEL[accion]} solicitud</h2>
        <CloseBtn onClose={onClose} />
      </div>
      <form onSubmit={confirmar} className="p-5 space-y-3">
        {error && <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        <p className="text-[13px] text-gray-600">
          {TIPO_SOL_LABELS[solicitud.tipo] ?? solicitud.tipo} · {solicitud.justificacion}
        </p>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
            Comentario {accion === 'RECHAZAR' ? '(obligatorio)' : '(opcional)'}
          </label>
          <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={3}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white focus:outline-none focus:border-blue-400 resize-none transition"
            placeholder={accion === 'RECHAZAR' ? 'Motivo del rechazo...' : 'Nota adicional...'} />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition disabled:opacity-60"
            style={{ backgroundColor: COLOR[accion] }}>
            {loading ? '...' : `Confirmar ${LABEL[accion]}`}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function TabSolicitudes({
  solicitudes,
  clienteCod,
  clienteNombre,
  limiteActual,
  moraTotal,
  diasAtraso,
  creditoDisponible,
  condicionPago,
  facturas,
  esCoordinador,
  onToast,
  onRefresh,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes:       any[]
  clienteCod:        string
  clienteNombre:     string
  limiteActual:      number
  moraTotal:         number
  diasAtraso:        string
  creditoDisponible: number | null
  condicionPago:     string
  facturas:          Factura[]
  esCoordinador:     boolean
  userEmail:         string
  onToast:           (msg: string) => void
  onRefresh:         () => void
}) {
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [modalNueva,   setModalNueva]   = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [modalAccion,  setModalAccion]  = useState<{ sol: any; accion: 'APROBAR' | 'RECHAZAR' | 'CANCELAR' } | null>(null)

  const total      = solicitudes.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientes = solicitudes.filter((s: any) => s.estado === 'PENDIENTE').length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aprobadas  = solicitudes.filter((s: any) => s.estado === 'APROBADA').length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rechazadas = solicitudes.filter((s: any) => s.estado === 'RECHAZADA').length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filtradas  = solicitudes.filter((s: any) => filtroEstado === 'Todos' || s.estado === filtroEstado)

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Pendientes</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: pendientes > 0 ? '#f59e0b' : '#94a3b8' }}>{pendientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Aprobadas</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: aprobadas > 0 ? '#16a34a' : '#94a3b8' }}>{aprobadas}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Rechazadas</p>
          <p className="text-[22px] font-black tabular-nums leading-tight"
            style={{ color: rechazadas > 0 ? '#dc2626' : '#94a3b8' }}>{rechazadas}</p>
        </div>
      </div>

      {/* Filtros + botón */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {['Todos', 'PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA'].map(est => {
            const sty    = ESTADO_SOL_COLORES[est] ?? { bg: '#f1f5f9', text: '#64748b' }
            const active = filtroEstado === est
            return (
              <button key={est} type="button" onClick={() => setFiltroEstado(est)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition"
                style={active
                  ? { backgroundColor: sty.bg, color: sty.text, boxShadow: '0 0 0 2px ' + sty.text + '40' }
                  : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
                }>
                {est === 'Todos' ? 'Todas' : est.replace(/_/g, ' ')}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {est !== 'Todos' && <span className="text-[10px]">({solicitudes.filter((s: any) => s.estado === est).length})</span>}
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => setModalNueva(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90 flex-shrink-0"
          style={{ backgroundColor: '#009ee3' }}>
          <Plus size={14} /> Nueva solicitud
        </button>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <EmptyState icon={<AlertTriangle size={32} />}
            texto={total === 0 ? 'No hay solicitudes para este cliente.' : 'No hay solicitudes con ese estado.'}
            sub="Las solicitudes de aumento de crédito, excepciones y notas de crédito aparecerán aquí." />
        </div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filtradas.map((s: any) => {
            const tipoSty   = TIPO_SOL_COLORES[s.tipo]   ?? { bg: '#f1f5f9', text: '#64748b' }
            const estadoSty = ESTADO_SOL_COLORES[s.estado] ?? { bg: '#f1f5f9', text: '#64748b' }
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5"
                        style={{ backgroundColor: tipoSty.bg, color: tipoSty.text }}>
                        {TIPO_SOL_LABELS[s.tipo] ?? s.tipo.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5"
                        style={{ backgroundColor: estadoSty.bg, color: estadoSty.text }}>
                        {s.estado.replace(/_/g, ' ')}
                      </span>
                      {s.destinatario && (
                        <span className="text-[11px] font-medium rounded-full px-2.5 py-0.5"
                          style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
                          {{
                            coordinador: 'Coordinador',
                            comercial:   'Área comercial',
                            logistica:   'Área logística',
                            otro:        'Otro',
                          }[s.destinatario as string] ?? s.destinatario}
                        </span>
                      )}
                    </div>
                    {s.tipo === 'AUMENTO_LIMITE' && s.monto_actual != null && s.monto_solicitado != null && (
                      <p className="text-[13px] font-bold text-gray-700 mb-1">
                        {fmtCRC2(s.monto_actual)}
                        <span className="text-gray-400 font-normal mx-1.5">→</span>
                        {fmtCRC2(s.monto_solicitado)} solicitado
                      </p>
                    )}
                    <p className="text-[13px] text-gray-600 mb-1">{s.justificacion}</p>
                    {(s.estado === 'APROBADA' || s.estado === 'RECHAZADA') && s.comentario_revisor && (
                      <p className="text-[12px] mt-1 italic"
                        style={{ color: s.estado === 'APROBADA' ? '#15803d' : '#dc2626' }}>
                        Nota revisor: {s.comentario_revisor}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1.5">{fmtFechaHora(s.created_at)}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {esCoordinador && s.estado === 'PENDIENTE' && (
                      <>
                        <button type="button" onClick={() => setModalAccion({ sol: s, accion: 'APROBAR' })}
                          className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90"
                          style={{ backgroundColor: '#16a34a' }}>
                          Aprobar
                        </button>
                        <button type="button" onClick={() => setModalAccion({ sol: s, accion: 'RECHAZAR' })}
                          className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90"
                          style={{ backgroundColor: '#dc2626' }}>
                          Rechazar
                        </button>
                      </>
                    )}
                    {!esCoordinador && s.estado === 'PENDIENTE' && (
                      <button type="button" onClick={() => setModalAccion({ sol: s, accion: 'CANCELAR' })}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalNueva && (
        <ModalNuevaSolicitud
          clienteCod        = {clienteCod}
          clienteNombre     = {clienteNombre}
          limiteActual      = {limiteActual}
          moraTotal         = {moraTotal}
          diasAtraso        = {diasAtraso}
          creditoDisponible = {creditoDisponible}
          condicionPago     = {condicionPago}
          facturas          = {facturas}
          onClose           = {() => setModalNueva(false)}
          onSuccess         = {() => { setModalNueva(false); onToast('Solicitud enviada'); onRefresh() }}
        />
      )}
      {modalAccion && (
        <ModalAccionSolicitud
          solicitud = {modalAccion.sol}
          accion    = {modalAccion.accion}
          onClose   = {() => setModalAccion(null)}
          onSuccess = {() => {
            const msg = modalAccion.accion === 'APROBAR' ? 'Solicitud aprobada'
                      : modalAccion.accion === 'RECHAZAR' ? 'Solicitud rechazada'
                      : 'Solicitud cancelada'
            setModalAccion(null); onToast(msg); onRefresh()
          }}
        />
      )}
    </div>
  )
}
