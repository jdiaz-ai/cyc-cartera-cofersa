'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ClipboardList, Handshake, FileText, AlertTriangle,
  CheckCircle2, XCircle, Clock, Circle, Plus,
  Building2, Phone, Mail, CreditCard, User, Calendar, Tag,
  MailOpen, Receipt, MessageCircle, ChevronDown, FileDown, Send, Search,
} from 'lucide-react'
import { fmtM, fmtCRC, fmtFecha, fmtFechaHora, hoyISO } from '@/lib/utils/formato'
import { createClient } from '@/lib/supabase/client'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'
import ModalGestion from './modal-gestion'

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

// ── Colores de estado del cliente ──────────────────────────────────────
const ESTADO_CFG: Record<string, { bg: string; text: string }> = {
  Normal:     { bg: '#f1f5f9', text: '#64748b' },
  Bloqueado:  { bg: '#fee2e2', text: '#dc2626' },
  Convenio:   { bg: '#fef9c3', text: '#a16207' },
  Suspendido: { bg: '#ffedd5', text: '#c2410c' },
}
const ESTADOS_OPCIONES = ['Normal', 'Bloqueado', 'Convenio', 'Suspendido']

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

  async function cambiarEstado(nuevoEstado: string) {
    if (!window.confirm(`¿Cambiar estado del cliente a "${nuevoEstado}"?`)) return
    const res = await fetch('/api/clientes/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_cod: cartera.cliente_cod, estado: nuevoEstado }),
    })
    if (res.ok) {
      setEstadoLocal(nuevoEstado)
      showToast(`Estado actualizado a ${nuevoEstado}`)
    } else {
      showToast('Error al actualizar estado')
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
              {/* Badge tramo de mora */}
              {mora_total > 0 && (
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ backgroundColor: urgColor + '20', color: urgColor }}>
                  {tramo_peor}
                </span>
              )}
              {/* Badge estado del cliente */}
              {(() => {
                const cfg = ESTADO_CFG[estadoLocal] ?? ESTADO_CFG.Normal
                return (
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0"
                    style={{ backgroundColor: cfg.bg, color: cfg.text }}>
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

        {/* ── SECCIÓN B: 4 KPI cards ───────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {/* Card 1: Total cartera */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50"
            title={fmtCRC(cartera.total)}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total cartera</p>
            <p className="text-[15px] font-bold tabular-nums text-gray-800">{fmtM(cartera.total)}</p>
          </div>

          {/* Card 2: En mora */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">En mora</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-[15px] font-bold tabular-nums" style={{ color: mora_total > 0 ? '#dc2626' : '#22c55e' }}>
                {mora_total > 0 ? fmtM(mora_total) : '—'}
              </p>
              {mora_total > 0 && (
                <span className="text-[11px] font-bold rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                  {pct_mora}%
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Límite de crédito */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Límite crédito</p>
            {maestro?.limite_credito && maestro.limite_credito > 0 ? (
              <>
                <p className="text-[15px] font-bold tabular-nums text-gray-800">{fmtM(maestro.limite_credito)}</p>
                {(() => {
                  const disp = maestro.limite_credito - cartera.total
                  return disp >= 0
                    ? <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#16a34a' }}>{fmtM(disp)} disponible</p>
                    : <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#dc2626' }}>Límite excedido</p>
                })()}
              </>
            ) : (
              <p className="text-[13px] font-semibold text-gray-300 italic">Sin límite</p>
            )}
          </div>

          {/* Card 4: Vendedor / Analista */}
          <div className="rounded-xl border border-gray-100 px-3 py-2.5 bg-gray-50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Vendedor / Analista</p>
            <p className="text-[12px] font-semibold text-gray-700 truncate">{cartera.vendedor_nombre || '—'}</p>
            <p className="text-[11px] text-gray-400 truncate">{analistaNombre || '—'}</p>
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

          {/* Estado: solo coordinador editable */}
          {esCoordinador ? (
            <div className="relative">
              <select
                value={estadoLocal}
                onChange={e => cambiarEstado(e.target.value)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 pl-2.5 pr-6 py-1.5 text-[12px] font-semibold transition hover:bg-gray-50 appearance-none cursor-pointer"
                style={{ color: ESTADO_CFG[estadoLocal]?.text ?? '#64748b' }}
              >
                {ESTADOS_OPCIONES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>
          ) : (
            <span className="flex items-center gap-1.5 rounded-lg border border-gray-100 px-3 py-1.5 text-[12px] font-semibold"
              style={{ backgroundColor: ESTADO_CFG[estadoLocal]?.bg ?? '#f1f5f9', color: ESTADO_CFG[estadoLocal]?.text ?? '#64748b' }}>
              {estadoLocal}
            </span>
          )}

          {/* Registrar gestión — siempre último */}
          <button
            type="button"
            onClick={() => setModalGestion(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90 ml-auto"
            style={{ backgroundColor: '#009ee3' }}
          >
            <Plus size={12} />
            Registrar gestión
          </button>
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
          <div className="space-y-2 max-w-3xl">
            {gestiones.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <EmptyState icon={<ClipboardList size={32} />} texto="Sin gestiones registradas para este cliente." />
              </div>
            ) : gestiones.map(g => {
              const resSty = RESULTADO_COLORS[g.resultado] ?? { bg: '#f1f5f9', text: '#64748b' }
              return (
                <div key={g.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[12px] font-bold text-gray-700">{fmtFecha(g.fecha)}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400">{g.hora?.slice(0, 5) || ''}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{g.tipo}</span>
                        <span className="text-[11px] text-gray-400">{g.analista_email?.split('@')[0]}</span>
                      </div>
                      {g.nota && (
                        <p className="text-[13px] text-gray-600 leading-snug">{g.nota}</p>
                      )}
                    </div>
                    <span
                      className="flex-shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1"
                      style={{ backgroundColor: resSty.bg, color: resSty.text }}
                    >
                      {g.resultado}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── TAB: PROMESAS ─────────────────────────────────────── */}
        {tab === 'Promesas' && (
          <div className="space-y-2 max-w-2xl">
            {promesas.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <EmptyState icon={<Handshake size={32} />} texto="Sin promesas de pago registradas." />
              </div>
            ) : promesas.map(p => {
              const sty = PROMESA_COLORS[p.estado] ?? { bg: '#f1f5f9', text: '#64748b', icon: <Circle size={12} /> }
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[15px] font-bold text-gray-800 tabular-nums">{fmtCRC(p.monto)}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[12px] text-gray-500">
                          Vence: <span className="font-semibold">{fmtFecha(p.fecha_promesa)}</span>
                        </span>
                      </div>
                      {p.notas && (
                        <p className="text-[12px] text-gray-500 italic">{p.notas}</p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-1">Registrada: {fmtFecha(p.fecha_creacion)}</p>
                    </div>
                    <span
                      className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1"
                      style={{ backgroundColor: sty.bg, color: sty.text }}
                    >
                      {sty.icon}
                      {p.estado}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── TAB: EMAILS ───────────────────────────────────────── */}
        {tab === 'Emails' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <EmptyState
                icon={<MailOpen size={32} />}
                texto="Historial de emails próximamente"
                sub="Aquí aparecerán los estados de cuenta y correos enviados a este cliente."
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
                texto="Notas de crédito próximamente"
                sub="Las solicitudes de notas de crédito aprobadas para este cliente aparecerán aquí."
                comingSoon
              />
            </div>
          </div>
        )}

        {/* ── TAB: SOLICITUDES ─────────────────────────────────── */}
        {tab === 'Solicitudes' && (
          <div className="max-w-2xl">
            {solicitudes.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <EmptyState
                  icon={<AlertTriangle size={32} />}
                  texto="No hay solicitudes registradas para este cliente."
                  sub="Las solicitudes de aumento de crédito, excepciones y notas de crédito aparecerán aquí."
                />
              </div>
            ) : (
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {solicitudes.map((s: any) => (
                  <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-gray-700">{s.tipo?.replace(/_/g, ' ')}</p>
                        <p className="text-[12px] text-gray-500 mt-0.5">{s.justificacion}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{fmtFechaHora(s.created_at)}</p>
                      </div>
                      <span
                        className="flex-shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1"
                        style={
                          s.estado === 'APROBADA'    ? { backgroundColor: '#dcfce7', color: '#15803d' } :
                          s.estado === 'RECHAZADA'   ? { backgroundColor: '#fee2e2', color: '#dc2626' } :
                          s.estado === 'EN_REVISION' ? { backgroundColor: '#e0f2fe', color: '#0369a1' } :
                          { backgroundColor: '#fef9c3', color: '#a16207' }
                        }
                      >
                        {s.estado}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '1fr 1fr' }}>

      {/* ── Columna izquierda: Contacto + Condiciones ─────────── */}
      <div className="space-y-4">

      {/* ── SECCIÓN 1: Datos de contacto (editables) ──────────── */}
      <InfoCard titulo="Datos de contacto CxP">

        {/* Nombre CxP */}
        <CampoEditable
          icon={<User size={14} />}
          label="Nombre CxP"
          valor={valNombre}
          placeholder="Nombre del contacto"
          editando={editando === 'nombre_cxp'}
          saving={saving}
          onEditar={() => setEditando('nombre_cxp')}
          onGuardar={() => guardar('nombre_cxp')}
          onCancelar={() => cancelar('nombre_cxp')}
          onChange={v => setValNombre(v)}
          onCopiar={valNombre ? () => copiar(valNombre, 'Nombre') : undefined}
          vacio="Sin nombre"
        />

        {/* Teléfono 1 */}
        <CampoEditable
          icon={<Phone size={14} />}
          label="Teléfono 1"
          valor={valTel ? fmtTel(valTel) : ''}
          valorInput={valTel}
          placeholder="12345678"
          type="tel"
          maxLength={9}
          editando={editando === 'telefono'}
          saving={saving}
          invalido={!telValido(valTel)}
          onEditar={() => setEditando('telefono')}
          onGuardar={() => guardar('telefono')}
          onCancelar={() => cancelar('telefono')}
          onChange={v => setValTel(fmtTel(v))}
          onCopiar={valTel ? () => copiar(fmtTel(valTel), 'Teléfono 1') : undefined}
          vacio="Sin teléfono"
          hint="8 dígitos"
        />

        {/* Teléfono 2 */}
        <CampoEditable
          icon={<Phone size={14} />}
          label="Teléfono 2"
          valor={valTel2 ? fmtTel(valTel2) : ''}
          valorInput={valTel2}
          placeholder="12345678"
          type="tel"
          maxLength={9}
          editando={editando === 'telefono2'}
          saving={saving}
          invalido={!telValido(valTel2)}
          onEditar={() => setEditando('telefono2')}
          onGuardar={() => guardar('telefono2')}
          onCancelar={() => cancelar('telefono2')}
          onChange={v => setValTel2(fmtTel(v))}
          onCopiar={valTel2 ? () => copiar(fmtTel(valTel2), 'Teléfono 2') : undefined}
          vacio="Sin teléfono"
          hint="8 dígitos"
        />

        {/* Email CxP */}
        <CampoEditable
          icon={<Mail size={14} />}
          label="Email CxP"
          valor={valCorreo}
          placeholder="correo@empresa.com"
          type="email"
          editando={editando === 'correo'}
          saving={saving}
          onEditar={() => setEditando('correo')}
          onGuardar={() => guardar('correo')}
          onCancelar={() => cancelar('correo')}
          onChange={v => setValCorreo(v)}
          onCopiar={valCorreo ? () => copiar(valCorreo, 'Email') : undefined}
          vacio="Sin email"
        />

        <p className="text-[10px] text-gray-300 mt-1 pl-7">
          {esCoordinador ? 'Coordinador puede editar todos los clientes.' : 'Podés editar los datos de contacto de tus clientes asignados.'}
        </p>
      </InfoCard>

      {/* ── SECCIÓN 3: Condiciones comerciales ────────────────── */}
      <InfoCard titulo="Condiciones comerciales">
        <InfoRow icon={<Calendar   size={14} />} label="Condición de pago" valor={maestro?.condicion_pago || '—'} />
        <InfoRow icon={<CreditCard size={14} />} label="Límite de crédito"
          valor={limite > 0 ? fmtCRC(limite) : 'Sin límite'} />
        {limite > 0 && disponible !== null && (
          <div className="flex items-center gap-3 py-1">
            <span className="text-gray-300 flex-shrink-0"><CreditCard size={14} /></span>
            <span className="text-[12px] text-gray-400 flex-shrink-0" style={{ width: '120px' }}>Crédito disponible</span>
            <span className="text-[13px] font-semibold" style={{ color: disponible >= 0 ? '#16a34a' : '#dc2626' }}>
              {disponible >= 0
                ? fmtCRC(disponible)
                : `−${fmtCRC(Math.abs(disponible))}`}
            </span>
          </div>
        )}
        {/* Estado */}
        <div className="flex items-center gap-3 py-1">
          <span className="text-gray-300 flex-shrink-0"><Tag size={14} /></span>
          <span className="text-[12px] text-gray-400 flex-shrink-0" style={{ width: '120px' }}>Estado</span>
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
            style={{
              backgroundColor: (ESTADO_CFG[maestro?.estado_manual ?? 'Normal'] ?? ESTADO_CFG.Normal).bg,
              color:            (ESTADO_CFG[maestro?.estado_manual ?? 'Normal'] ?? ESTADO_CFG.Normal).text,
            }}>
            {maestro?.estado_manual || 'Normal'}
          </span>
          {!esCoordinador && (
            <span className="text-[10px] text-gray-300 italic">Solo el coordinador puede cambiarlo</span>
          )}
        </div>
      </InfoCard>

      </div>

      {/* ── Columna derecha: Fiscal + Interna ─────────────────── */}
      <div className="space-y-4">

      {/* ── SECCIÓN 2: Información fiscal (read-only) ──────────── */}
      <InfoCard titulo="Información fiscal">
        <InfoRowCopy label="Contribuyente" valor={cartera.contribuyente} onCopy={() => copiar(cartera.contribuyente, 'Contribuyente')} mono />
        <InfoRow icon={<Building2 size={14} />} label="Razón social"   valor={cartera.cliente_nombre} />
        {maestro?.segmento && (
          <InfoRow icon={<Tag size={14} />} label="Segmento" valor={maestro.segmento} />
        )}
        {maestro?.zona && (
          <InfoRow icon={<Tag size={14} />} label="Zona" valor={maestro.zona} />
        )}
      </InfoCard>

      {/* ── SECCIÓN 4: Información interna (read-only) ─────────── */}
      <InfoCard titulo="Información interna">
        <InfoRowCopy label="Código cliente" valor={cartera.cliente_cod} onCopy={() => copiar(cartera.cliente_cod, 'Código')} mono />
        <InfoRow icon={<User     size={14} />} label="Vendedor asignado"  valor={cartera.vendedor_nombre || '—'} />
        <InfoRow icon={<User     size={14} />} label="Analista asignado"  valor={analistaNombre || '—'} />
        <InfoRow icon={<Calendar size={14} />} label="Corte Softland"     valor={fmtFecha(cartera.fecha_corte)} />
        {maestro?.updated_at && (
          <InfoRow icon={<Calendar size={14} />} label="Última actualización" valor={fmtFecha(maestro.updated_at)} />
        )}
        {/* Score ICP */}
        <div className="flex items-center gap-3 py-1">
          <span className="text-gray-300 flex-shrink-0">
            <span className="inline-flex w-3.5 h-3.5 items-center justify-center rounded-full text-[8px] font-black" style={{ backgroundColor: '#e2e8f0', color: '#94a3b8' }}>ICP</span>
          </span>
          <span className="text-[12px] text-gray-400 flex-shrink-0" style={{ width: '120px' }}>Score ICP</span>
          <span className="text-[13px] font-semibold text-gray-300 italic">Sin datos suficientes</span>
        </div>
        {(maestro?.promedio_dias_pago ?? 0) > 0 && (
          <InfoRow icon={<Calendar size={14} />} label="Promedio días pago" valor={`${Math.round(maestro!.promedio_dias_pago)} días`} />
        )}
        {(maestro?.promesas_cumplidas_pct ?? 0) > 0 && (
          <InfoRow icon={<Tag size={14} />} label="Promesas cumplidas"
            valor={`${Math.round(maestro!.promesas_cumplidas_pct)}%`}
            color={maestro!.promesas_cumplidas_pct >= 70 ? '#16a34a' : maestro!.promesas_cumplidas_pct >= 40 ? '#f59e0b' : '#dc2626'} />
        )}
      </InfoCard>

      </div>

    </div>
  )
}

// ── CampoEditable: fila editable reutilizable ─────────────────────────
function CampoEditable({ icon, label, valor, valorInput, placeholder, type = 'text', maxLength,
  editando, saving, invalido, onEditar, onGuardar, onCancelar, onChange, onCopiar, vacio, hint }: {
  icon:        React.ReactNode
  label:       string
  valor:       string
  valorInput?: string
  placeholder: string
  type?:       string
  maxLength?:  number
  editando:    boolean
  saving:      boolean
  invalido?:   boolean
  onEditar:    () => void
  onGuardar:   () => void
  onCancelar:  () => void
  onChange:    (v: string) => void
  onCopiar?:   () => void
  vacio:       string
  hint?:       string
}) {
  const inputVal = valorInput !== undefined ? valorInput : valor
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-gray-300 flex-shrink-0">{icon}</span>
      <span className="text-[12px] text-gray-400 flex-shrink-0" style={{ width: '100px' }}>{label}</span>
      {editando ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            autoFocus
            type={type}
            value={inputVal}
            maxLength={maxLength}
            onChange={e => onChange(e.target.value)}
            className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1 text-[13px] text-gray-800 focus:outline-none focus:ring-2 transition ${
              invalido ? 'border-red-300 focus:ring-red-100' : 'border-blue-300 focus:ring-blue-100'
            }`}
            placeholder={placeholder}
          />
          {hint && <span className="text-[10px] text-gray-400 flex-shrink-0">{hint}</span>}
          <button type="button" disabled={saving || invalido}
            onClick={onGuardar}
            className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50 transition"
            style={{ backgroundColor: '#009ee3' }}>
            {saving ? '...' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancelar}
            className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-500 border border-gray-200 hover:bg-gray-50 transition">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[13px] font-semibold text-gray-700 flex-1 truncate">
            {valor || <span className="text-gray-300 italic">{vacio}</span>}
          </span>
          {onCopiar && (
            <button type="button" onClick={onCopiar}
              className="flex-shrink-0 text-[10px] font-bold text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 transition">
              Copiar
            </button>
          )}
          <button type="button" onClick={onEditar}
            className="flex-shrink-0 text-[10px] font-bold text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 transition">
            Editar
          </button>
        </div>
      )}
    </div>
  )
}

// ── InfoRowCopy: fila con botón copiar integrado ───────────────────────
function InfoRowCopy({ label, valor, onCopy, mono }: {
  label: string; valor: string; onCopy: () => void; mono?: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-gray-300 flex-shrink-0"><Tag size={14} /></span>
      <span className="text-[12px] text-gray-400 flex-shrink-0" style={{ width: '120px' }}>{label}</span>
      <span className={`text-[13px] font-semibold text-gray-700 flex-1 truncate ${mono ? 'font-mono' : ''}`}>{valor || '—'}</span>
      {valor && (
        <button type="button" onClick={onCopy}
          className="flex-shrink-0 text-[10px] font-bold text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 transition">
          Copiar
        </button>
      )}
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
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">{titulo}</h3>
      </div>
      <div className="px-5 py-3 space-y-2.5">{children}</div>
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

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
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
