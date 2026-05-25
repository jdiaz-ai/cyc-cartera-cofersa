// src/components/analista/DashboardResumen.tsx
// Columna izquierda del Dashboard Analista: KPIs + Cola del Día + Mis Promesas.
// Panel Por Vendedor vive en PorVendedor.tsx (full-width debajo).

import Link from 'next/link'
import { fmtCRC } from '@/lib/utils/formato'
import type {
  KpisAnalistaDashboard,
  ColaItem,
  PrioridadCola,
  PromesaPendiente,
} from '@/types/dashboard-analista'

export interface DashboardResumenProps {
  kpis:     KpisAnalistaDashboard
  cola:     ColaItem[]
  promesas: PromesaPendiente[]
  hoyStr:   string
}

// ── Helpers de color ──────────────────────────────────────────────────
const prioCfg: Record<PrioridadCola, { dot: string }> = {
  ROJO:  { dot: '#dc2626' },
  AMBAR: { dot: '#f59e0b' },
  VERDE: { dot: '#16a34a' },
}

function accionSugerida(item: ColaItem): string {
  if (item.prioridad === 'ROJO' && item.promesa_vencida) return 'Seguimiento urgente'
  if (item.prioridad === 'ROJO')                         return 'Llamar hoy'
  if (item.prioridad === 'AMBAR' && item.tiene_promesa_hoy) return 'Confirmar pago'
  if (item.prioridad === 'AMBAR')                        return 'Contactar'
  return 'Recordatorio'
}

// ── Componente principal ──────────────────────────────────────────────
export default function DashboardResumen({
  kpis, cola, promesas, hoyStr,
}: DashboardResumenProps) {
  const colaVisible   = cola.slice(0, 5)
  const colaRestantes = cola.length
  const promVisible   = promesas.slice(0, 4)
  const promRestantes = Math.max(0, promesas.length - 4)

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI Cards (4 tarjetas, fondo blanco) ──────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Card 1: Mi Cartera */}
        <KpiCard
          label="Mi Cartera"
          valor={fmtCRC(kpis.cartera_total)}
          badge={`${kpis.total_clientes} clientes`}
          badgeClass="bg-slate-100 text-slate-600"
          borderColor="#009EE3"
        />

        {/* Card 2: En Mora */}
        <KpiCard
          label="En Mora"
          valor={fmtCRC(kpis.mora_total)}
          valorClass="text-red-700"
          badge={`${kpis.pct_mora}% de mi cartera`}
          badgeClass="bg-red-50 text-red-700 border border-red-200"
          borderColor="#ef4444"
        />

        {/* Card 3: Gestiones Hoy — con barra de progreso */}
        <div
          className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4"
          style={{ borderTop: '3px solid #009EE3' }}
        >
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Gestiones Hoy
          </p>
          <p className="text-3xl font-bold tabular-nums text-slate-900 mb-1 leading-tight">
            {kpis.gestiones_hoy}
            <span className="text-xl font-normal text-slate-400">/15</span>
          </p>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#009EE3] rounded-full transition-all"
              style={{ width: `${Math.min((kpis.gestiones_hoy / 15) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 4: Promesas Activas */}
        <KpiCard
          label="Promesas Activas"
          valor={String(kpis.promesas_activas)}
          badge={
            kpis.promesas_vencen_hoy > 0
              ? `${kpis.promesas_vencen_hoy} vence${kpis.promesas_vencen_hoy > 1 ? 'n' : ''} hoy`
              : 'Al día'
          }
          badgeClass={
            kpis.promesas_vencen_hoy > 0
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700'
          }
          borderColor="#f59e0b"
        />
      </div>

      {/* ── Cola del Día + Mis Promesas en grid ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">

        {/* Cola del Día */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" style={{ borderTop: '3px solid #dc2626' }}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Cola del Día
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700">
                {cola.filter(c => c.prioridad === 'ROJO').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                {cola.filter(c => c.prioridad === 'AMBAR').length}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {cola.filter(c => c.prioridad === 'VERDE').length}
              </span>
            </div>
          </div>

          {colaVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500">
                Sin clientes con mora pendiente en tu cartera.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-50">
                {colaVisible.map(item => {
                  const cfg = prioCfg[item.prioridad]
                  const moraCrit = Math.max(0, item.mora_61_90 || 0)
                    + Math.max(0, item.mora_91_120 || 0)
                    + (item.mora_120_plus || 0)
                  const diasLabel =
                    item.dias_sin_gestion === 999
                      ? 'Sin gestiones registradas'
                      : item.dias_sin_gestion >= 7
                      ? `Sin contacto ${item.dias_sin_gestion} días`
                      : null

                  return (
                    <div
                      key={item.cliente_cod}
                      className="px-4 py-2.5 flex items-start gap-3"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: cfg.dot }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {item.cliente_nombre || item.cliente_cod}
                          </p>
                          {moraCrit > 0 && (
                            <p className="text-xs font-bold text-red-700 flex-shrink-0 tabular-nums">
                              {fmtCRC(moraCrit)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">{item.cliente_cod}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-500">
                            {accionSugerida(item)}
                          </span>
                          {diasLabel && (
                            <>
                              <span className="text-[10px] text-slate-300">·</span>
                              <span className={`text-[10px] font-semibold ${
                                item.dias_sin_gestion >= 7 && item.dias_sin_gestion !== 999
                                  ? 'text-red-500'
                                  : 'text-slate-400'
                              }`}>
                                {diasLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {colaRestantes > 5 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/mi-cartera"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver los {colaRestantes} clientes →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mis Promesas */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className="w-[3px] h-4 bg-amber-400 rounded-full flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Mis Promesas
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{kpis.promesas_activas} pendientes</p>
            </div>
          </div>

          {promVisible.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-slate-500">
                No hay compromisos de pago pendientes.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 space-y-2">
                {promVisible.map(p => {
                  const venceHoy = p.fecha_promesa === hoyStr
                  const vencida  = p.fecha_promesa < hoyStr && p.estado === 'PENDIENTE'
                  const bgClass  = vencida || venceHoy ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'
                  const badge    = vencida ? 'VENCIDA' : venceHoy ? 'HOY' : null
                  const badgeCls = vencida
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'

                  return (
                    <div
                      key={p.id}
                      className={`rounded-lg px-3 py-2 border ${bgClass}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold text-slate-800 truncate flex-1">
                          {p.cliente_nombre || p.cliente_cod}
                        </p>
                        {badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badgeCls}`}>
                            {badge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-slate-400">{p.fecha_promesa}</p>
                        <p className="text-xs font-bold text-slate-700 tabular-nums">
                          {fmtCRC(p.monto)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {promRestantes > 0 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <Link
                    href="/promesas"
                    className="text-[10px] text-[#009EE3] font-semibold hover:underline"
                  >
                    Ver todas →
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── KPI Card (fondo blanco) ───────────────────────────────────────────
function KpiCard({
  label, valor, valorClass = 'text-slate-900', badge, badgeClass, borderColor = '#009EE3',
}: {
  label:        string
  valor:        string
  valorClass?:  string
  badge:        string
  badgeClass:   string
  borderColor?: string
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4"
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mb-2 leading-tight ${valorClass}`}>
        {valor}
      </p>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
        {badge}
      </span>
    </div>
  )
}
