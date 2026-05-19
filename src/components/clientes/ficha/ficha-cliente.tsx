'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Handshake, FileText, AlertTriangle,
  CheckCircle2, XCircle, Clock, Circle, Plus,
  Building2, Phone, Mail, CreditCard, User, Calendar, Tag,
  MessageCircle, ChevronDown, FileDown, Send, Search, Paperclip,
} from 'lucide-react'
import {
  exportarEstadoCuentaPDF, exportarEstadoCuentaExcel,
  generarEstadoCuentaBase64, generarEstadoCuentaExcelBase64,
  calcAging, estadoLabelExport,
  type CuentaBancaria,
} from '@/lib/utils/estado-cuenta-export'
import { fmtM, fmtCRC, fmtCRC2, fmtFecha, hoyISO } from '@/lib/utils/formato'
import { createClient } from '@/lib/supabase/client'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'
import FormNuevaGestion    from './form-nueva-gestion'
import TablaGestionesCompacta, { KpiCard, fechaRelativa } from '@/components/gestiones/tabla-gestiones-base'
import SolicitudCard        from '@/components/solicitudes/SolicitudCard'
import TabReportarPago      from './tab-reportar-pago'

// ── Tabs ───────────────────────────────────────────────────────────────
const TABS = [
  'Información',
  'Estado de Cuenta',
  'Gestiones',
  'Solicitudes',
  'Reportar Pago',
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
  solicitanteMap: Record<string, string>  // solicitante_id → nombre
  analistaNombre:   string
  analistaEmail:    string         // correo del analista ASIGNADO al cliente
  analistaTelefono: string | null
  analistaWhatsapp: string | null
  userEmail:        string
  esCoordinador:    boolean
  backHref?:        string   // destino del botón Volver (default: /clientes)
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
  cartera, maestro, facturas, gestiones, promesas, solicitudes, solicitanteMap,
  analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp,
  userEmail, esCoordinador, backHref,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const searchParams = useSearchParams()

  // FIX 2: abrir el tab indicado por ?tab= (ej: ?tab=solicitudes)
  const tabInicial: Tab = (() => {
    const q = (searchParams.get('tab') ?? '').toLowerCase()
    if (!q) return 'Información'
    const match = TABS.find(t =>
      t.toLowerCase() === q ||
      t.toLowerCase().replace(/\s+/g, '-') === q,
    )
    return (match as Tab) ?? 'Información'
  })()

  const [tab,               setTab]               = useState<Tab>(tabInicial)
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
            onClick={() => router.push(backHref ?? '/clientes')}
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

          {/* Email de cobro */}
          <ActionBtn
            icon={<Send size={12} />}
            label="Email de cobro"
            onClick={() => setModalEmail(true)}
            style={{ borderColor: '#7dd3fc', color: '#0369a1' }}
          />

          {/* Estado de cuenta */}
          <ActionBtn
            icon={<Mail size={12} />}
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
            onVerTramo     = {(label) => { setFiltroTramoEdoCta(label); setTab('Estado de Cuenta') }}
            onVerEdoCta    = {() => { setFiltroTramoEdoCta('Todos'); setTab('Estado de Cuenta') }}
          />
        )}


        {/* ── TAB: ESTADO DE CUENTA ─────────────────────────────── */}
        {tab === 'Estado de Cuenta' && (
          <TabEstadoCuenta
            facturas             = {facturas}
            clienteCod           = {cartera.cliente_cod}
            clienteNombre        = {cartera.cliente_nombre}
            contribuyente        = {cartera.contribuyente}
            condicionPago        = {maestro?.condicion_pago ?? null}
            filtroTramoEdoCta    = {filtroTramoEdoCta}
            setFiltroTramoEdoCta = {setFiltroTramoEdoCta}
            onRegistrarGestion   = {() => setModalGestion(true)}
            analistaNombre       = {analistaNombre}
            analistaEmail        = {analistaEmail}
            analistaTelefono     = {analistaTelefono}
            analistaWhatsapp     = {analistaWhatsapp}
          />
        )}

        {/* ── TAB: GESTIONES ───────────────────────────────────── */}
        {tab === 'Gestiones' && (
          <TabGestiones
            gestiones      = {gestiones}
            promesas       = {promesas}
            solicitudes    = {solicitudes}
            userEmail      = {userEmail}
            esCoordinador  = {esCoordinador}
            onNuevaGestion = {() => setModalGestion(true)}
            onToast        = {showToast}
            onRefresh      = {() => router.refresh()}
          />
        )}

        {/* ── TAB: SOLICITUDES ─────────────────────────────────── */}
        {tab === 'Solicitudes' && (
          <TabSolicitudes
            solicitudes    = {solicitudes}
            solicitanteMap = {solicitanteMap}
            clienteCod     = {cartera.cliente_cod}
          />
        )}

        {/* ── TAB: REPORTAR PAGO ───────────────────────────────── */}
        {tab === 'Reportar Pago' && (
          <TabReportarPago
            clienteCod    = {cartera.cliente_cod}
            contribuyente = {cartera.contribuyente}
            facturas      = {facturas}
            onSuccess     = {() => { router.refresh() }}
            onToast       = {showToast}
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

      {/* ── Modal Registrar Gestión (Sprint v2) ─────────────────── */}
      {modalGestion && (
        <FormNuevaGestion
          clienteCod    = {cartera.cliente_cod}
          clienteNombre = {cartera.cliente_nombre}
          contribuyente = {cartera.contribuyente}
          facturas      = {facturas}
          onClose       = {() => setModalGestion(false)}
          onSuccess     = {() => { setModalGestion(false); router.refresh() }}
          onIrAReportarPago = {() => { setModalGestion(false); setTab('Reportar Pago') }}
          onCrearSolicitud  = {({ gestion_id, area, tipo }) => {
            setModalGestion(false)
            const qs = new URLSearchParams({
              cliente_cod: cartera.cliente_cod,
              gestion_id,
              area,
              tipo,
            }).toString()
            // Flujo NUEVO de solicitudes (no el wizard legacy de la ficha)
            router.push(`/solicitudes/nueva?${qs}`)
          }}
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
          clienteNombre  = {cartera.cliente_nombre}
          clienteCod     = {cartera.cliente_cod}
          contribuyente  = {cartera.contribuyente}
          correo         = {maestro?.correo ?? ''}
          condicionPago  = {maestro?.condicion_pago ?? null}
          analistaEmail    = {analistaEmail}
          analistaNombre   = {analistaNombre}
          analistaTelefono = {analistaTelefono}
          analistaWhatsapp = {analistaWhatsapp}
          facturas       = {facturas}
          supabase       = {supabase}
          onClose        = {() => setModalEdoCta(false)}
          onSuccess      = {() => { setModalEdoCta(false); showToast('Estado de cuenta enviado'); router.refresh() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// TAB INFORMACIÓN
// ══════════════════════════════════════════════════════════════════════
function TabInformacion({ cartera, maestro, analistaNombre, esCoordinador, mora_total, pct_mora, onToast, onVerTramo, onVerEdoCta }: {
  cartera:        Cartera
  maestro:        MaestroCliente | null
  analistaNombre: string
  esCoordinador:  boolean
  mora_total:     number
  pct_mora:       number
  onToast:        (msg: string) => void
  onVerTramo:     (label: string) => void
  onVerEdoCta:    () => void
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

  return (
    <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: '0.4fr 0.6fr' }}>

      {/* ── COLUMNA IZQUIERDA (40%) ── */}
      <div className="flex flex-col gap-4">

        {/* Card 1: DATOS DE CONTACTO CxP */}
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

        {/* Card 2: INFORMACIÓN FISCAL */}
        <InfoCard2 titulo="INFORMACIÓN FISCAL">
          <CampoReadOnly label="Contribuyente" valor={cartera.contribuyente}
            onCopiar={() => copiar(cartera.contribuyente, 'Contribuyente')} mono />
          <CampoReadOnly label="Agrupación"    valor={maestro?.agrupacion || '—'} />
          <CampoReadOnly label="Dimensión"     valor={maestro?.dimension  || '—'} />
        </InfoCard2>

      </div>

      {/* ── COLUMNA DERECHA (60%): se estira a la altura de la columna izquierda ── */}
      <div className="flex flex-col">
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col flex-1"
          style={{ borderColor: '#e2e8f0', borderWidth: '0.5px' }}>

          {/* ── Header ── */}
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Distribución de Saldos por Antigüedad</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Corte: {fmtFecha(cartera.fecha_corte)} · Clic en un tramo para ver sus facturas</p>
          </div>

          {/* ── Encabezados de columna ── */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-100" style={{ backgroundColor: '#f8fafc' }}>
            {/* Spacer círculo */}
            <div style={{ width: '8px', flexShrink: 0 }} />
            {/* TRAMO */}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
              style={{ width: '82px', flexShrink: 0 }}>Tramo</span>
            {/* Spacer barra */}
            <div className="flex-1" />
            {/* MONTO */}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right"
              style={{ width: '116px', flexShrink: 0 }}>Monto</span>
            {/* % TOTAL */}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right"
              style={{ width: '44px', flexShrink: 0 }}>% Total</span>
          </div>

          {/* ── Filas de datos ── */}
          <div className="divide-y divide-gray-50 flex-1">
            {AGING_TRAMOS.map(({ key, label, color }) => {
              const monto = (cartera[key as keyof Cartera] as number) || 0
              const pct   = cartera.total > 0 ? Math.round((monto / cartera.total) * 100) : 0
              return (
                <div
                  key={key}
                  onClick={() => onVerTramo(label)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/40 cursor-pointer transition-colors group"
                >
                  {/* Círculo de color */}
                  <div className="rounded-full flex-shrink-0"
                    style={{ width: '8px', height: '8px', backgroundColor: color }} />
                  {/* Nombre del tramo */}
                  <span className="text-[12px] font-semibold text-gray-700 group-hover:text-gray-900 transition-colors whitespace-nowrap"
                    style={{ width: '82px', flexShrink: 0 }}>
                    {label}
                  </span>
                  {/* Barra de progreso */}
                  <div className="flex-1 rounded-full bg-gray-100 overflow-hidden" style={{ height: '5px' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color, minWidth: monto > 0 ? '3px' : '0' }} />
                  </div>
                  {/* Monto completo — fmtCRC sin abreviaciones */}
                  <span className="text-[12px] font-semibold tabular-nums text-right"
                    style={{ width: '116px', flexShrink: 0, color: monto > 0 ? '#1e293b' : '#d1d5db' }}>
                    {monto > 0 ? fmtCRC(monto) : '—'}
                  </span>
                  {/* Porcentaje */}
                  <span className="text-[11px] tabular-nums text-right text-gray-400"
                    style={{ width: '44px', flexShrink: 0 }}>
                    {pct > 0 ? `${pct}%` : ''}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Fila TOTAL ── */}
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '2px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <div style={{ width: '8px', flexShrink: 0 }} />
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider"
              style={{ width: '82px', flexShrink: 0 }}>Total</span>
            <div className="flex-1" />
            <span className="text-[13px] font-black tabular-nums text-right text-gray-800"
              style={{ width: '116px', flexShrink: 0 }}>
              {fmtCRC(cartera.total)}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-right text-gray-500"
              style={{ width: '44px', flexShrink: 0 }}>100%</span>
          </div>

          {/* ── Footer: chips KPI + botón ── */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap gap-2">
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
              <Chip label="Mora total" valor={fmtCRC(mora_total)} />
            </div>
            <button
              type="button"
              onClick={onVerEdoCta}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold transition hover:opacity-90 flex-shrink-0"
              style={{ backgroundColor: '#009ee3', color: 'white' }}
            >
              Ver Estado de Cuenta →
            </button>
          </div>

        </div>
      </div>

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
  const ASUNTOS_COBRO = [
    'Gestión de cobro',
    'Recordatorio de pago',
    'Aviso de mora',
    'Seguimiento de cuenta',
    'Confirmación de acuerdo de pago',
  ] as const

  const [para,    setPara]    = useState(correo)
  const [asunto,  setAsunto]  = useState<string>('Gestión de cobro')
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!para.trim())    { setError('Ingresá un correo destinatario.'); return }
    if (!mensaje.trim()) { setError('Escribí un mensaje.'); return }
    setLoading(true); setError('')

    // ── 1. Obtener provider_token (Gmail) ─────────────────────────────
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token ?? null

    // ── 2. Enviar email vía Gmail API ──────────────────────────────────
    const emailRes = await fetch('/api/clientes/email-cobro', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:            para.trim(),
        asunto:        asunto.trim(),
        mensaje:       mensaje.trim(),
        providerToken,
        clienteNombre: clienteNombre,
        clienteCod:    clienteCod,
      }),
    })
    if (!emailRes.ok) {
      const j = await emailRes.json().catch(() => ({}))
      setError((j as { error?: string }).error ?? 'Error al enviar el correo')
      setLoading(false)
      return
    }

    // ── 3. Registrar gestión automática ───────────────────────────────
    const hoyCR  = new Date(Date.now() - 6 * 3600 * 1000)
    const fecha  = hoyCR.toISOString().split('T')[0]
    const hora   = hoyCR.toISOString().split('T')[1].slice(0, 8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: gErr } = await supabase.from('gestiones').insert({
      cliente_cod: clienteCod, contribuyente, analista_email: analistaEmail,
      fecha, hora, tipo: 'CORREO', resultado: 'Email enviado',
      nota: `[${asunto}] Email enviado a ${para}. ${mensaje}`,
    } as any)
    setLoading(false)
    if (gErr) { setError('Error al registrar gestión: ' + gErr.message); return }
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
          <select value={asunto} onChange={e => setAsunto(e.target.value)} className={inputCls}>
            {ASUNTOS_COBRO.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
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
function ModalEstadoCuenta({ clienteNombre, clienteCod, contribuyente, correo,
  condicionPago, analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp,
  facturas, supabase, onClose, onSuccess }: {
  clienteNombre:    string
  clienteCod:       string
  contribuyente:    string
  correo:           string
  condicionPago?:   string | null
  analistaEmail:    string         // correo del analista ASIGNADO al cliente
  analistaNombre:   string
  analistaTelefono: string | null
  analistaWhatsapp: string | null
  facturas:       Factura[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  onClose:  () => void
  onSuccess: () => void
}) {
  type TipoAdjunto = 'Ninguno' | 'PDF' | 'Excel'

  const [para,          setPara]          = useState(correo)
  const [observaciones, setObservaciones] = useState('')
  const [adjunto,       setAdjunto]       = useState<TipoAdjunto>('Ninguno')
  const [loading,       setLoading]       = useState(false)
  const [loadingMsg,    setLoadingMsg]    = useState('Enviando...')
  const [enviado,       setEnviado]       = useState(false)
  const [error,         setError]         = useState('')

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-800 ' +
    'focus:outline-none focus:border-[#009ee3] transition'

  async function enviarEmail() {
    if (!para.trim()) { setError('Ingresá un correo destinatario'); return }
    setLoading(true); setError('')

    // ── 1. Provider token ─────────────────────────────────────────
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken = session?.provider_token ?? null

    // ── 2. Generar adjunto si corresponde ─────────────────────────
    let adjuntoData: { base64: string; mimeType: string; filename: string } | null = null
    if (adjunto !== 'Ninguno' && facturas.length > 0) {
      try {
        const fechaCorte = new Date(Date.now() - 6 * 3600_000)
          .toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric' })
        const exportParams = {
          facturas: facturas.filter(f => (f.saldo ?? 0) > 0),
          clienteNombre, contribuyente, clienteCod,
          condicionPago: condicionPago ?? null,
          observaciones: observaciones.trim() || undefined,
          cuentas: [] as CuentaBancaria[],   // el email HTML ya lleva las cuentas desde DB
          fechaCorte,
          analistaNombre,
          analistaEmail,
          analistaTelefono,
          analistaWhatsapp,
        }

        if (adjunto === 'PDF') {
          setLoadingMsg('Generando PDF...')
          const base64 = await generarEstadoCuentaBase64(exportParams)
          adjuntoData = {
            base64,
            mimeType: 'application/pdf',
            filename: `estado-cuenta-${clienteCod}.pdf`,
          }
        } else {
          setLoadingMsg('Generando Excel...')
          const base64 = await generarEstadoCuentaExcelBase64(exportParams)
          adjuntoData = {
            base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `estado-cuenta-${clienteCod}.xlsx`,
          }
        }
      } catch {
        setError('Error al generar el adjunto. Intentá sin adjunto.')
        setLoading(false); setLoadingMsg('Enviando...')
        return
      }
    }

    // ── 3. Enviar vía API ─────────────────────────────────────────
    setLoadingMsg('Enviando...')
    const res = await fetch('/api/clientes/estado-cuenta', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_cod:    clienteCod,
        cliente_nombre: clienteNombre,
        contribuyente,
        to_email:       para.trim(),
        observaciones:  observaciones.trim() || undefined,
        providerToken,
        adjunto:        adjuntoData,
      }),
    })

    setLoading(false)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
    if (data.email_sent) {
      setEnviado(true)
      setTimeout(() => onSuccess(), 1400)
    } else {
      setError(data.email_error ?? 'Error al enviar el correo')
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Enviar Estado de Cuenta</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      {enviado ? (
        <div className="p-10 flex flex-col items-center text-center">
          <CheckCircle2 size={42} style={{ color: '#22c55e' }} className="mb-3" />
          <p className="text-[14px] font-bold text-gray-800">Estado de cuenta enviado</p>
          <p className="text-[12px] text-gray-400 mt-1">Gestión registrada automáticamente.</p>
        </div>
      ) : (
        <div className="p-5 space-y-4">

          {/* Destinatario */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Destinatario
            </label>
            <input
              type="email"
              value={para}
              onChange={e => { setPara(e.target.value); setError('') }}
              placeholder="correo@empresa.com"
              className={inputCls}
            />
            {!correo && (
              <p className="text-[10px] text-amber-500 mt-1">
                Sin correo registrado — ingresá uno manualmente.
              </p>
            )}
          </div>

          {/* Observaciones (opcional) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Observaciones{' '}
              <span className="text-gray-300 font-normal normal-case tracking-normal">(opcional)</span>
            </label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Ej: Por favor gestionar el pago a la brevedad posible..."
              rows={3}
              className={inputCls + ' resize-none'}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">
              Si está vacío, la sección no aparece en el email.
            </p>
          </div>

          {/* Adjuntar como */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              <Paperclip size={10} className="inline mr-1" />
              Adjuntar como
            </label>
            <select
              value={adjunto}
              onChange={e => setAdjunto(e.target.value as TipoAdjunto)}
              className={inputCls}
            >
              <option value="Ninguno">Ninguno (solo HTML)</option>
              <option value="PDF">PDF</option>
              <option value="Excel">Excel (.xlsx)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="button" disabled={loading || !para.trim()} onClick={enviarEmail}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60 transition"
              style={{ backgroundColor: '#009ee3' }}>
              {loading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {loadingMsg}
                </>
              ) : (
                <>
                  <Send size={13} />
                  Enviar estado de cuenta
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-gray-400 text-center">
            Se registrará una gestión automáticamente al enviar.
          </p>
        </div>
      )}
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
  contribuyente:       string
  condicionPago?:      string | null
  filtroTramoEdoCta:   string
  setFiltroTramoEdoCta: (v: string) => void
  onRegistrarGestion:  () => void
  analistaNombre:      string
  analistaEmail:       string
  analistaTelefono:    string | null
  analistaWhatsapp:    string | null
}

function TabEstadoCuenta({
  facturas, clienteCod, clienteNombre, contribuyente, condicionPago,
  filtroTramoEdoCta, setFiltroTramoEdoCta, onRegistrarGestion,
  analistaNombre, analistaEmail, analistaTelefono, analistaWhatsapp,
}: TabEstadoCuentaProps) {
  const hoy = hoyISO()

  const [filtroEstado,  setFiltroEstado]  = useState('Todas')
  const [busquedaDoc,   setBusquedaDoc]   = useState('')
  const [pagina,        setPagina]        = useState(1)
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())

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

  // ── Exportar PDF y Excel ──────────────────────────────────────
  const buildExportParams = () => ({
    facturas:      filtradas,
    clienteNombre,
    contribuyente,
    clienteCod,
    condicionPago: condicionPago ?? null,
    cuentas:       [] as CuentaBancaria[],   // sin cuentas bancarias en descarga directa
    fechaCorte:    new Date(Date.now() - 6 * 3600_000)
                     .toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric' }),
    analistaNombre,
    analistaEmail,
    analistaTelefono,
    analistaWhatsapp,
  })

  function handleExportarPDF() {
    exportarEstadoCuentaPDF(buildExportParams()).catch(() => alert('Error generando PDF'))
  }

  function handleExportarExcel() {
    exportarEstadoCuentaExcel(buildExportParams())
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
          <button
            onClick={handleExportarPDF}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            title="Descargar Estado de Cuenta en PDF"
          >
            <FileText size={13} /> PDF
          </button>
          <button
            onClick={handleExportarExcel}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            title="Descargar Estado de Cuenta en Excel"
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
                    <td />
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
  promesas,
  solicitudes,
  userEmail,
  esCoordinador,
  onNuevaGestion,
  onToast,
  onRefresh,
}: {
  gestiones:      Gestion[]
  promesas:       Promesa[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes:    any[]
  userEmail:      string
  esCoordinador:  boolean
  onNuevaGestion: () => void
  onToast:        (msg: string) => void
  onRefresh:      () => void
}) {
  const hoy = hoyISO()
  const [busqueda,   setBusqueda]   = useState('')
  const [fTipo,      setFTipo]      = useState('Todos')
  const [fResultado, setFResultado] = useState('Todos')
  const [fPeriodo,   setFPeriodo]   = useState('90')
  const [fAnalista,  setFAnalista]  = useState('Todos')
  const [editando,   setEditando]   = useState<Gestion | null>(null)

  const base = useMemo(() => gestiones.filter(g => g.activo !== false), [gestiones])

  const promesaMap = useMemo(
    () => new Map(promesas.map(p => [p.id, p])),
    [promesas],
  )

  const solPorGestion = useMemo(() => {
    const s = new Set<string>()
    for (const x of solicitudes) if (x?.gestion_id) s.add(x.gestion_id as string)
    return s
  }, [solicitudes])

  const CERRADOS = ['Resuelta', 'Cerrada', 'Rechazada', 'APROBADA', 'RECHAZADA']
  const solAbiertas = useMemo(
    () => solicitudes.filter(x => !CERRADOS.includes(x?.estado)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [solicitudes],
  )

  function diasDesde(fecha: string): number {
    return Math.floor((new Date(hoy).getTime() - new Date(fecha).getTime()) / 86400000)
  }
  function enPeriodo(fecha: string): boolean {
    if (fPeriodo === 'todo') return true
    const d = diasDesde(fecha)
    if (fPeriodo === 'hoy')    return d === 0
    if (fPeriodo === 'semana') return d >= 0 && d <= 6
    if (fPeriodo === 'mes')    return d >= 0 && d <= 30
    if (fPeriodo === '90')     return d >= 0 && d <= 90
    return true
  }

  const filtradas = useMemo(() => base.filter(g => {
    if (fTipo      !== 'Todos' && g.tipo      !== fTipo)      return false
    if (fResultado !== 'Todos' && g.resultado !== fResultado) return false
    if (fAnalista  !== 'Todos' && g.analista_email !== fAnalista) return false
    if (!enPeriodo(g.fecha)) return false
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(g.nota ?? '').toLowerCase().includes(q) &&
          !(g.resultado ?? '').toLowerCase().includes(q)) return false
    }
    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, fTipo, fResultado, fAnalista, fPeriodo, busqueda, hoy])

  const ult90 = useMemo(
    () => base.filter(g => { const d = diasDesde(g.fecha); return d >= 0 && d <= 90 }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, hoy],
  )

  const conPromesa = useMemo(() => base.filter(g => g.promesa_id), [base])
  const promCumpl  = conPromesa.filter(g => promesaMap.get(g.promesa_id!)?.estado === 'CUMPLIDA').length
  const promActiv  = conPromesa.filter(g => {
    const e = promesaMap.get(g.promesa_id!)?.estado
    return e === 'PENDIENTE' || e === 'ABONO_PARCIAL'
  }).length

  const ordenadas = useMemo(
    () => [...base].sort((a, b) =>
      `${b.fecha}T${b.hora ?? '00:00'}`.localeCompare(`${a.fecha}T${a.hora ?? '00:00'}`)),
    [base],
  )
  const ultima = ordenadas[0]

  const analistasUnicos = useMemo(
    () => Array.from(new Set(base.map(g => g.analista_email))).filter(Boolean),
    [base],
  )
  const tiposUnicos      = useMemo(() => ['Todos', ...Array.from(new Set(base.map(g => g.tipo)))], [base])
  const resultadosUnicos = useMemo(() => ['Todos', ...Array.from(new Set(base.map(g => g.resultado)))], [base])

  const filtradasOrden = useMemo(
    () => [...filtradas].sort((a, b) =>
      `${b.fecha}T${b.hora ?? '00:00'}`.localeCompare(`${a.fecha}T${a.hora ?? '00:00'}`)),
    [filtradas],
  )

  const selCls = 'rounded-lg text-[12px] text-gray-700 bg-white focus:outline-none transition'

  return (
    <div className="space-y-3">

      {/* KPIs (4) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total gestiones" valor={ult90} sub="últimos 90 días" />
        <KpiCard label="Con promesa" valor={conPromesa.length}
          sub={`${promCumpl} cumplidas · ${promActiv} activas`} valorColor="#854f0b" />
        <KpiCard label="Solicitudes" valor={solicitudes.length}
          sub={`${solAbiertas} abierta${solAbiertas !== 1 ? 's' : ''}`} valorColor="#534ab7" />
        <KpiCard label="Última gestión"
          valor={ultima ? fechaRelativa(ultima.fecha) : '—'}
          sub={ultima ? `${fmtFecha(ultima.fecha)} · ${ultima.tipo}` : ''}
          esTexto />
      </div>

      {/* Barra de filtros (1 fila) */}
      <div className="flex items-center gap-2 flex-wrap"
        style={{ backgroundColor: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 10, padding: '8px 10px' }}>
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar en nota o resultado…"
            className="w-full text-[12px] text-gray-700 focus:outline-none"
            style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 10px 5px 28px' }} />
        </div>
        <span style={{ width: 1, height: 22, backgroundColor: '#e2e8f0' }} />
        <select value={fTipo} onChange={e => setFTipo(e.target.value)} className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}>
          {tiposUnicos.map(t => <option key={t} value={t}>{t === 'Todos' ? 'Todos los tipos' : t}</option>)}
        </select>
        <select value={fResultado} onChange={e => setFResultado(e.target.value)} className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}>
          {resultadosUnicos.map(r => <option key={r} value={r}>{r === 'Todos' ? 'Todos los resultados' : r}</option>)}
        </select>
        <select value={fPeriodo} onChange={e => setFPeriodo(e.target.value)} className={selCls}
          style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}>
          <option value="hoy">Hoy</option>
          <option value="semana">Esta semana</option>
          <option value="mes">Este mes</option>
          <option value="90">Últimos 90 días</option>
          <option value="todo">Todo</option>
        </select>
        {esCoordinador && (
          <select value={fAnalista} onChange={e => setFAnalista(e.target.value)} className={selCls}
            style={{ border: '0.5px solid #e2e8f0', borderRadius: 7, padding: '5px 8px' }}>
            <option value="Todos">Todos los analistas</option>
            {analistasUnicos.map(a => <option key={a} value={a}>{a.split('@')[0]}</option>)}
          </select>
        )}
        <span className="text-[11px] text-gray-400 ml-auto">{filtradasOrden.length} de {base.length}</span>
      </div>

      {/* Tabla compacta */}
      <TablaGestionesCompacta
        gestiones={filtradasOrden}
        promesaMap={promesaMap}
        solicitudesPorGestion={solPorGestion}
        mostrarCliente={false}
        canEdit={g => esCoordinador || g.analista_email === userEmail}
        onEdit={setEditando}
      />

      {/* Modal editar */}
      {editando && (
        <ModalEditarGestion
          gestion   = {editando}
          onClose   = {() => setEditando(null)}
          onSuccess = {() => { setEditando(null); onToast('Gestión actualizada'); onRefresh() }}
        />
      )}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={onNuevaGestion}
        title="Registrar una nueva gestión (llamada, email, visita, etc.)"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
        style={{ backgroundColor: '#009ee3', padding: '11px 18px', borderRadius: 22 }}
      >
        <Plus size={16} /> Nueva gestión
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// TAB 8 — SOLICITUDES
// ══════════════════════════════════════════════════════════════════════

function TabSolicitudes({
  solicitudes,
  solicitanteMap,
  clienteCod,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes:    any[]
  solicitanteMap: Record<string, string>
  clienteCod:     string
}) {
  const router = useRouter()

  // Solo catálogo nuevo: area != null (excluye solicitudes legacy)
  const nuevas = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => solicitudes.filter((s: any) => s.area != null),
    [solicitudes],
  )

  const PEND = ['Pendiente', 'En revisión', 'Pendiente cliente', 'Pendiente tercero']
  const RES  = ['Resuelta', 'Cerrada']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientes = nuevas.filter((s: any) => PEND.includes(s.estado)).length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enProceso  = nuevas.filter((s: any) => s.estado === 'En revisión').length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resueltas  = nuevas.filter((s: any) => RES.includes(s.estado)).length

  return (
    <div className="space-y-4">

      {/* KPIs (3) — mismos estilos que el tab Gestiones */}
      <div className="grid gap-[10px]" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <KpiCard label="Pendientes" valor={pendientes} valorColor="#854f0b" />
        <KpiCard label="En proceso" valor={enProceso}  valorColor="#534ab7" />
        <KpiCard label="Resueltas"  valor={resueltas}  valorColor="#0f6e56" />
      </div>

      {/* Botón flotante — mismo estilo que "+ Nueva gestión" (FIX 4) */}
      <button type="button"
        onClick={() => router.push(
          `/solicitudes/nueva?cliente_cod=${encodeURIComponent(clienteCod)}&origen=ficha`,
        )}
        title="Crear una nueva solicitud para este cliente"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 text-[13px] font-bold text-white shadow-lg transition hover:opacity-90 active:scale-95"
        style={{ backgroundColor: '#009ee3', padding: '11px 18px', borderRadius: 22 }}>
        <Plus size={16} /> Nueva solicitud
      </button>

      {/* Lista de solicitudes del cliente (card compartido) */}
      {nuevas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <FileText size={32} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">
            No hay solicitudes registradas para este cliente.
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Las solicitudes se generan desde el tab Gestiones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {nuevas.map((s: any) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              solicitanteNombre={s.solicitante_id ? (solicitanteMap[s.solicitante_id] ?? '—') : '—'}
              onClick={() => router.push(`/solicitudes/${s.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
