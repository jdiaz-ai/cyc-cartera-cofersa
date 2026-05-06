// Columna izquierda del Dashboard Analista.
// Recibe todos los datos ya cargados desde el Server Component padre (dashboard/page.tsx).
import {
  Package, TrendingDown, ClipboardCheck, Handshake,
  AlertCircle, Activity, CheckCircle2,
} from 'lucide-react'
import { fmtM } from '@/lib/utils/formato'
import GestionRapida from '@/components/dashboard/gestion-rapida'
import type { ClienteOpt } from '@/components/dashboard/gestion-rapida'

// ── Tipos locales ─────────────────────────────────────────────────────
interface CarteraRowFull {
  cliente_cod: string; cliente_nombre: string
  no_vencido: number; mora_1_30: number; mora_31_60: number
  mora_61_90: number; mora_91_120: number; mora_120_plus: number
  total: number; dias_mora: number; fecha_corte: string
}
interface GestionRow {
  id: string; cliente_cod: string; tipo: string
  resultado: string; hora: string; analista_email: string; nota?: string
}
interface PromesaRow {
  id: string; cliente_cod: string; monto: number
  fecha_promesa: string; estado?: string
}
type Urgencia = 'ROJO' | 'AMARILLO' | 'VERDE'
interface ColaItem extends CarteraRowFull {
  urgencia: Urgencia
  gestionadoHoy: boolean
}

export interface DashboardResumenProps {
  misRows:       CarteraRowFull[]
  misGestiones:  GestionRow[]
  misPromesas:   PromesaRow[]
  cola:          ColaItem[]
  gHoyCount:     number
  promCount:     number
  miCartera:     number
  miMora:        number
  pMiMora:       number
  hoyStr:        string
  clientesOpts:  ClienteOpt[]
  userEmail:     string
}

const urgCfg: Record<Urgencia, { dot: string }> = {
  ROJO:     { dot: '#dc2626' },
  AMARILLO: { dot: '#f59e0b' },
  VERDE:    { dot: '#16a34a' },
}
const tipoIcon: Record<string, string> = {
  LLAMADA: '📞', CORREO: '📧', VISITA: '🏢', WHATSAPP: '💬',
}

export default function DashboardResumen({
  misRows, misGestiones, misPromesas, cola,
  gHoyCount, promCount, miCartera, miMora, pMiMora,
  hoyStr, clientesOpts, userEmail,
}: DashboardResumenProps) {
  return (
    <div className="space-y-5">

      {/* ── KPIs (4 tarjetas) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KPICard
          label="Mi Cartera"
          valor={fmtM(miCartera)}
          sub={`${misRows.length} clientes asignados`}
          gradient="linear-gradient(135deg,#003B5C,#005a8e)"
          badge={null}
          icon={<Package size={16} />}
        />
        <KPICard
          label="En Mora"
          valor={fmtM(miMora)}
          sub={`${pMiMora}% de mi cartera`}
          gradient={pMiMora > 25
            ? 'linear-gradient(135deg,#991b1b,#dc2626)'
            : 'linear-gradient(135deg,#065f46,#059669)'}
          badge={`${pMiMora}%`}
          badgeGood={pMiMora <= 25}
          icon={<TrendingDown size={16} />}
        />
        <KPICard
          label="Gestiones Hoy"
          valor={String(gHoyCount)}
          sub={`de ${misRows.length} clientes`}
          gradient="linear-gradient(135deg,#0369a1,#009ee3)"
          badge={gHoyCount > 0 ? 'activo' : null}
          badgeGood
          icon={<ClipboardCheck size={16} />}
        />
        <KPICard
          label="Promesas Activas"
          valor={String(promCount)}
          sub={misPromesas.some(p => p.fecha_promesa === hoyStr) ? '⚠ vencen hoy' : 'al día'}
          gradient={misPromesas.some(p => p.fecha_promesa === hoyStr)
            ? 'linear-gradient(135deg,#7c2d12,#ea580c)'
            : 'linear-gradient(135deg,#1e3a5f,#003B5C)'}
          badge={misPromesas.some(p => p.fecha_promesa === hoyStr) ? 'urgente' : null}
          badgeGood={false}
          icon={<Handshake size={16} />}
        />
      </div>

      {/* ── Cola del día + Promesas ───────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Cola */}
        <div className="xl:col-span-2" style={{ background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(220,38,38,0.08)' }}>
                <AlertCircle size={15} style={{ color: '#dc2626' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Cola del Día</h2>
                <p className="text-xs text-gray-400">Prioridad: rojo → amarillo → verde</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{cola.filter(c => c.urgencia === 'ROJO').length} 🔴</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}>{cola.filter(c => c.urgencia === 'AMARILLO').length} 🟡</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>{cola.filter(c => c.urgencia === 'VERDE').length} 🟢</span>
            </div>
          </div>
          {cola.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-sm font-bold text-gray-500">Sin clientes asignados aún</p>
              <p className="text-xs text-gray-300 mt-1">Pedile al coordinador que asigne tu cartera</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cola.map(c => {
                const cfg      = urgCfg[c.urgencia]
                const moraCrit = (c.mora_61_90 || 0) + (c.mora_91_120 || 0) + (c.mora_120_plus || 0)
                return (
                  <div key={c.cliente_cod} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{c.cliente_nombre || c.cliente_cod}</p>
                      <p className="text-xs text-gray-400">{c.cliente_cod}</p>
                    </div>
                    {moraCrit > 0 && (
                      <span className="text-xs font-black text-red-600 flex-shrink-0">{fmtM(moraCrit)}</span>
                    )}
                    {c.gestionadoHoy && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>✓ hoy</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Promesas pendientes */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,158,227,0.1)' }}>
                <Handshake size={15} style={{ color: '#009ee3' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Mis Promesas</h2>
                <p className="text-xs text-gray-400">{promCount} pendientes</p>
              </div>
            </div>
          </div>
          {misPromesas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 size={28} className="text-green-300 mb-3" />
              <p className="text-sm font-semibold text-gray-400">Sin promesas pendientes</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {misPromesas.map(p => {
                const venceHoy = p.fecha_promesa === hoyStr
                const vencida  = p.fecha_promesa && p.fecha_promesa < hoyStr
                return (
                  <div key={p.id} className="rounded-xl px-3.5 py-2.5" style={{
                    background: vencida || venceHoy ? '#FEF2F2' : '#F8FAFC',
                    border: `1px solid ${vencida || venceHoy ? '#FECACA' : '#F1F5F9'}`,
                  }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-800 truncate flex-1">{p.cliente_cod}</p>
                      <p className="text-xs font-black text-gray-700 flex-shrink-0 ml-2">{fmtM(p.monto)}</p>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-400">{p.fecha_promesa}</p>
                      {(vencida || venceHoy) && (
                        <span className="text-xs font-bold text-red-500">{venceHoy ? 'vence hoy' : 'vencida'}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Mis gestiones de hoy + Gestión rápida ────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Mis gestiones hoy */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,158,227,0.1)' }}>
                <Activity size={15} style={{ color: '#009ee3' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Mis Gestiones de Hoy</h2>
                <p className="text-xs text-gray-400">{gHoyCount} registradas</p>
              </div>
            </div>
          </div>
          {misGestiones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-3xl mb-3">📋</div>
              <p className="text-sm font-semibold text-gray-400">Sin gestiones hoy</p>
              <p className="text-xs text-gray-300 mt-1">Usá el formulario de la derecha para registrar</p>
            </div>
          ) : (
            <div className="p-3 space-y-1.5">
              {misGestiones.map(g => (
                <div key={g.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: '#F8FAFC' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm" style={{ background: 'rgba(0,59,92,0.07)' }}>
                    {tipoIcon[g.tipo] ?? '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{g.cliente_cod}</p>
                    <p className="text-xs text-gray-500 truncate">{g.resultado}{g.nota ? ` · ${g.nota}` : ''}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-400 flex-shrink-0">{g.hora?.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gestión rápida */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,158,227,0.1)' }}>
              <ClipboardCheck size={15} style={{ color: '#009ee3' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Gestión Rápida</h2>
              <p className="text-xs text-gray-400">Registrá una gestión en segundos</p>
            </div>
          </div>
          <GestionRapida clientes={clientesOpts} analistaEmail={userEmail} hoyStr={hoyStr} />
        </div>

      </div>
    </div>
  )
}

// ── KPI Card local (igual a la del coordinador) ───────────────────────
function KPICard({ label, valor, sub, gradient, badge, badgeGood, icon }: {
  label: string; valor: string; sub: string; gradient: string
  badge: string | null; badgeGood?: boolean; icon: React.ReactNode
}) {
  return (
    <div style={{ background: gradient, borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.14)', overflow: 'hidden' }} className="p-5 relative">
      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '90px', height: '90px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>{icon}</span>
          </div>
        </div>
        <p style={{ color: 'white', fontSize: valor.length > 8 ? '1.4rem' : '1.9rem', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{valor}</p>
        <div className="flex items-center justify-between mt-2">
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{sub}</p>
          {badge && (
            <span style={{
              background: badgeGood ? 'rgba(74,222,128,0.25)' : 'rgba(255,100,100,0.25)',
              color: badgeGood ? '#86efac' : '#fca5a5',
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase',
            }}>{badge}</span>
          )}
        </div>
      </div>
    </div>
  )
}
