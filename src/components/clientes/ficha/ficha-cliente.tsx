'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, User, Phone, Mail, CreditCard,
  ClipboardList, Handshake, FileText, AlertTriangle, Plus,
  Send, CheckCircle2, XCircle, Clock, Circle,
} from 'lucide-react'
import { fmtM, fmtCRC, fmtFecha, fmtFechaHora } from '@/lib/utils/formato'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'
import ModalGestion from './modal-gestion'

// ── Constantes ─────────────────────────────────────────────────────────
const TABS = ['Aging', 'Facturas', 'Gestiones', 'Promesas', 'Solicitudes'] as const
type Tab = typeof TABS[number]

const AGING_TRAMOS = [
  { key: 'no_vencido',   label: 'Al día',       color: '#009ee3' },
  { key: 'mora_1_30',    label: '1-30 días',    color: '#f59e0b' },
  { key: 'mora_31_60',   label: '31-60 días',   color: '#f97316' },
  { key: 'mora_61_90',   label: '61-90 días',   color: '#ef4444' },
  { key: 'mora_91_120',  label: '91-120 días',  color: '#dc2626' },
  { key: 'mora_120_plus',label: '+120 días',    color: '#991b1b' },
] as const

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

const PROMESA_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDIENTE:      { bg: '#fef9c3', text: '#a16207', icon: <Clock    size={12} /> },
  CUMPLIDA:       { bg: '#dcfce7', text: '#15803d', icon: <CheckCircle2 size={12} /> },
  INCUMPLIDA:     { bg: '#fee2e2', text: '#dc2626', icon: <XCircle  size={12} /> },
  ABONO_PARCIAL:  { bg: '#e0f2fe', text: '#0369a1', icon: <Circle   size={12} /> },
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  cartera:       Cartera
  maestro:       MaestroCliente | null
  facturas:      Factura[]
  gestiones:     Gestion[]
  promesas:      Promesa[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  solicitudes:   any[]
  analistaNombre:string
  userEmail:     string
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════
export default function FichaCliente({
  cartera, maestro, facturas, gestiones, promesas, solicitudes, analistaNombre, userEmail,
}: Props) {
  const router   = useRouter()
  const [tab, setTab]           = useState<Tab>('Aging')
  const [modalGestion, setModalGestion] = useState(false)

  const mora_total =
    (cartera.mora_1_30    || 0) + (cartera.mora_31_60 || 0) +
    (cartera.mora_61_90   || 0) + (cartera.mora_91_120|| 0) +
    (cartera.mora_120_plus|| 0)
  const pct_mora = cartera.total > 0 ? Math.round((mora_total / cartera.total) * 100) : 0
  const tramo_peor =
    (cartera.mora_120_plus|| 0) > 0 ? '+120 días'  :
    (cartera.mora_91_120  || 0) > 0 ? '91-120 días':
    (cartera.mora_61_90   || 0) > 0 ? '61-90 días' :
    (cartera.mora_31_60   || 0) > 0 ? '31-60 días' :
    (cartera.mora_1_30    || 0) > 0 ? '1-30 días'  : 'Al día'

  const urgColor =
    mora_total > 0 && (cartera.mora_61_90||0)+(cartera.mora_91_120||0)+(cartera.mora_120_plus||0) > 0
      ? '#dc2626'
      : mora_total > 0 && (cartera.mora_31_60||0) > 0
        ? '#f59e0b'
        : '#22c55e'

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#f0f4f8' }}>

      {/* ════════════════════════════════════════════════════════════
          HEADER
      ════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 px-5 pt-4 pb-0">

        {/* Fila 1: back + nombre + estado + acciones */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-start gap-3">
            {/* Botón volver */}
            <button
              onClick={() => router.push('/clientes')}
              className="mt-0.5 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
              style={{ width: '32px', height: '32px', color: '#64748b' }}
            >
              <ArrowLeft size={15} />
            </button>

            {/* Nombre + código */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-gray-900" style={{ fontSize: '18px' }}>
                  {cartera.cliente_nombre}
                </h1>
                {/* Semáforo */}
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: urgColor }} />
                {/* Tramo badge */}
                {mora_total > 0 && (
                  <span
                    className="text-[11px] font-bold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: urgColor + '20', color: urgColor }}
                  >
                    {tramo_peor}
                  </span>
                )}
                {/* Estatus manual */}
                {maestro?.estado_manual && maestro.estado_manual !== 'Normal' && (
                  <span
                    className="text-[11px] font-bold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                  >
                    {maestro.estado_manual}
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-[12px] mt-0.5">
                Código: <span className="font-mono font-semibold text-gray-600">{cartera.cliente_cod}</span>
                {maestro?.condicion_pago && (
                  <> · Condición: <span className="font-semibold text-gray-600">{maestro.condicion_pago}</span></>
                )}
              </p>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              <Send size={12} />
              Estado de cuenta
            </button>
            <button
              onClick={() => setModalGestion(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: '#009ee3' }}
            >
              <Plus size={12} />
              Registrar gestión
            </button>
          </div>
        </div>

        {/* Fila 2: KPI chips */}
        <div className="flex flex-wrap gap-4 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total cartera</p>
            <p className="text-[15px] font-bold text-gray-800 tabular-nums">{fmtM(cartera.total)}</p>
          </div>
          <div className="w-px self-stretch bg-gray-100" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">En mora</p>
            <p className="text-[15px] font-bold tabular-nums" style={{ color: mora_total > 0 ? '#dc2626' : '#22c55e' }}>
              {mora_total > 0 ? fmtM(mora_total) : '—'}
              {mora_total > 0 && <span className="text-[11px] ml-1">({pct_mora}%)</span>}
            </p>
          </div>
          {maestro?.limite_credito && maestro.limite_credito > 0 && (
            <>
              <div className="w-px self-stretch bg-gray-100" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Límite de crédito</p>
                <p className="text-[15px] font-bold text-gray-800 tabular-nums">{fmtM(maestro.limite_credito)}</p>
              </div>
            </>
          )}
          {cartera.dias_mora > 0 && (
            <>
              <div className="w-px self-stretch bg-gray-100" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Días mora mayor</p>
                <p className="text-[15px] font-bold tabular-nums" style={{ color: '#dc2626' }}>
                  {cartera.dias_mora}d
                </p>
              </div>
            </>
          )}
          <div className="w-px self-stretch bg-gray-100" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Vendedor</p>
            <p className="text-[13px] font-semibold text-gray-700">{cartera.vendedor_nombre || '—'}</p>
          </div>
          {analistaNombre && (
            <>
              <div className="w-px self-stretch bg-gray-100" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Analista</p>
                <p className="text-[13px] font-semibold text-gray-700">{analistaNombre}</p>
              </div>
            </>
          )}
          {maestro?.telefono && (
            <>
              <div className="w-px self-stretch bg-gray-100" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Teléfono</p>
                <p className="text-[13px] font-semibold text-gray-700">{maestro.telefono}</p>
              </div>
            </>
          )}
          <div className="w-px self-stretch bg-gray-100" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Score ICP</p>
            <p className="text-[13px] font-semibold text-gray-400 italic">Sin datos</p>
          </div>
        </div>

        {/* Fila 3: Tabs */}
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => {
            const counts: Partial<Record<Tab, number>> = {
              Gestiones:   gestiones.length,
              Promesas:    promesas.length,
              Facturas:    facturas.length,
              Solicitudes: solicitudes.length,
            }
            const count = counts[t]
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap"
                style={
                  tab === t
                    ? { borderColor: '#009ee3', color: '#009ee3' }
                    : { borderColor: 'transparent', color: '#94a3b8' }
                }
              >
                {t}
                {count !== undefined && count > 0 && (
                  <span
                    className="text-[10px] rounded-full px-1.5 py-0.5 font-bold"
                    style={
                      tab === t
                        ? { backgroundColor: '#e0f2fe', color: '#009ee3' }
                        : { backgroundColor: '#f1f5f9', color: '#94a3b8' }
                    }
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          CONTENIDO DEL TAB
      ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* ── TAB: AGING ─────────────────────────────────────────── */}
        {tab === 'Aging' && (
          <div className="space-y-4 max-w-2xl">
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
                      {/* Label */}
                      <span className="text-[12px] text-gray-500 font-semibold" style={{ width: '80px', flexShrink: 0 }}>
                        {label}
                      </span>
                      {/* Barra */}
                      <div className="flex-1 rounded-full bg-gray-100 h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color, minWidth: monto > 0 ? '4px' : '0' }}
                        />
                      </div>
                      {/* Monto */}
                      <span className="text-[12px] font-semibold tabular-nums text-right" style={{ width: '80px', flexShrink: 0, color: monto > 0 ? '#1e293b' : '#cbd5e1' }}>
                        {monto > 0 ? fmtM(monto) : '—'}
                      </span>
                      {/* Porcentaje */}
                      <span className="text-[11px] text-gray-400 tabular-nums text-right" style={{ width: '34px', flexShrink: 0 }}>
                        {pct > 0 ? `${pct}%` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Totales + chips */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Total</span>
                  <span className="text-[15px] font-bold text-gray-800 tabular-nums">{fmtCRC(cartera.total)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: '#f0f4f8', color: '#64748b' }}>
                    <span>DSO</span>
                    <span className="text-gray-700">{cartera.total > 0 ? Math.round((mora_total / cartera.total) * 30) : 0}d</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: mora_total > 0 ? '#fee2e2' : '#dcfce7', color: mora_total > 0 ? '#dc2626' : '#15803d' }}>
                    <span>% Mora</span>
                    <span>{pct_mora}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold" style={{ backgroundColor: '#f0f4f8', color: '#64748b' }}>
                    <span>Mora total</span>
                    <span className="text-gray-700">{fmtM(mora_total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: FACTURAS ──────────────────────────────────────── */}
        {tab === 'Facturas' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {facturas.length === 0 ? (
              <EmptyState icon={<FileText size={32} />} texto="No hay facturas pendientes para este cliente." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <Th>Documento</Th>
                      <Th>F. Documento</Th>
                      <Th>F. Vencimiento</Th>
                      <Th right>Monto</Th>
                      <Th right>Saldo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((f, i) => (
                      <tr
                        key={f.id}
                        className="border-t border-gray-50"
                        style={i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                      >
                        <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-gray-700">{f.documento}</td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{fmtFecha(f.fecha_documento)}</td>
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{fmtFecha(f.fecha_vencimiento)}</td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums font-semibold text-gray-700">{fmtCRC(f.monto)}</td>
                        <td className="px-4 py-2.5 text-right text-[12px] tabular-nums font-semibold" style={{ color: f.saldo > 0 ? '#dc2626' : '#94a3b8' }}>
                          {f.saldo > 0 ? fmtCRC(f.saldo) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={3} className="px-4 py-2.5 text-[12px] font-bold text-gray-500 uppercase tracking-wider">Total</td>
                      <td className="px-4 py-2.5 text-right text-[13px] font-bold text-gray-800 tabular-nums">
                        {fmtCRC(facturas.reduce((s, f) => s + (f.monto || 0), 0))}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[13px] font-bold tabular-nums" style={{ color: '#dc2626' }}>
                        {fmtCRC(facturas.reduce((s, f) => s + (f.saldo || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: GESTIONES ─────────────────────────────────────── */}
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
                        {/* Fecha */}
                        <span className="text-[12px] font-bold text-gray-700">{fmtFecha(g.fecha)}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400">{g.hora?.slice(0, 5) || ''}</span>
                        <span className="text-gray-300">·</span>
                        {/* Tipo */}
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{g.tipo}</span>
                        {/* Analista */}
                        <span className="text-[11px] text-gray-400">{g.analista_email?.split('@')[0]}</span>
                      </div>
                      {/* Nota */}
                      {g.nota && (
                        <p className="text-[13px] text-gray-600 leading-snug">{g.nota}</p>
                      )}
                    </div>
                    {/* Resultado */}
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

        {/* ── TAB: PROMESAS ──────────────────────────────────────── */}
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

        {/* ── TAB: SOLICITUDES ───────────────────────────────────── */}
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
                          s.estado === 'APROBADA'  ? { backgroundColor: '#dcfce7', color: '#15803d' } :
                          s.estado === 'RECHAZADA' ? { backgroundColor: '#fee2e2', color: '#dc2626' } :
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
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ══════════════════════════════════════════════════════════════════════
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

function EmptyState({ icon, texto, sub }: { icon: React.ReactNode; texto: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
      <div className="text-gray-200 mb-3">{icon}</div>
      <p className="text-[13px] font-semibold text-gray-500">{texto}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1 max-w-xs">{sub}</p>}
    </div>
  )
}
