import { createClient } from '@/lib/supabase/server'
import { formatCRC } from '@/lib/utils'
import {
  TrendingDown, Users, ClipboardCheck, Handshake,
  AlertTriangle, CheckCircle2, ArrowUp, ArrowDown,
  Minus, RefreshCw,
} from 'lucide-react'

// ── tipos ────────────────────────────────────────────────────────
interface CarteraRow {
  no_vencido: number; mora_1_30: number; mora_31_60: number
  mora_61_90: number; mora_91_120: number; mora_120_plus: number
  total: number; dias_mora: number; fecha_corte: string
}
interface PromesaRow { id: string; cliente_cod: string; monto: number; fecha_promesa: string }
interface GestionRow  { id: string; cliente_cod: string; tipo: string; resultado: string; hora: string }

// ── helpers ──────────────────────────────────────────────────────
function pct(parte: number, total: number) {
  return total ? Math.round((parte / total) * 100) : 0
}
function parseFechaCorte(raw: string): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (!isNaN(d.getTime())) {
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${d.getUTCFullYear()}`
  }
  return raw
}
function formatMillones(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K'
  return String(Math.round(n))
}

// ── página ───────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()

  const ahora = new Date()
  const hoyStr = new Date(ahora.getTime() - 6 * 3600 * 1000).toISOString().split('T')[0]

  // Cartera — hasta 5000 registros
  let carteraRows: CarteraRow[] = []
  let fechaCorte = ''
  try {
    const { data } = await supabase.from('cartera')
      .select('no_vencido,mora_1_30,mora_31_60,mora_61_90,mora_91_120,mora_120_plus,total,dias_mora,fecha_corte')
      .range(0, 4999)
    carteraRows = (data ?? []) as CarteraRow[]
    if (carteraRows.length) fechaCorte = parseFechaCorte(carteraRows[0].fecha_corte ?? '')
  } catch { /* tabla vacía */ }

  const noVencido  = carteraRows.reduce((s, r) => s + (r.no_vencido  || 0), 0)
  const mora1_30   = carteraRows.reduce((s, r) => s + (r.mora_1_30   || 0), 0)
  const mora31_60  = carteraRows.reduce((s, r) => s + (r.mora_31_60  || 0), 0)
  const mora61_90  = carteraRows.reduce((s, r) => s + (r.mora_61_90  || 0), 0)
  const mora91_120 = carteraRows.reduce((s, r) => s + (r.mora_91_120 || 0), 0)
  const mora120p   = carteraRows.reduce((s, r) => s + (r.mora_120_plus|| 0), 0)
  const totalCartera  = carteraRows.reduce((s, r) => s + (r.total    || 0), 0)
  const totalMora     = mora1_30 + mora31_60 + mora61_90 + mora91_120 + mora120p
  const clientesTotal = carteraRows.length
  const clientesMora  = carteraRows.filter(r => (r.dias_mora || 0) > 0).length
  const pctMora       = pct(totalMora, totalCartera)
  const dsoDias       = totalCartera ? Math.round((totalMora / totalCartera) * 30) : 0

  // Gestiones
  let gestionesHoy = 0
  let ultimasGestiones: GestionRow[] = []
  try {
    const { count } = await supabase.from('gestiones')
      .select('*', { count: 'exact', head: true }).eq('fecha', hoyStr)
    gestionesHoy = count ?? 0
    const { data } = await supabase.from('gestiones')
      .select('id,cliente_cod,tipo,resultado,hora')
      .order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(5)
    ultimasGestiones = (data ?? []) as GestionRow[]
  } catch { /* ok */ }

  // Promesas
  let promesasPendientes = 0
  let promesasVencidas: PromesaRow[] = []
  try {
    const { count } = await supabase.from('promesas')
      .select('*', { count: 'exact', head: true }).eq('estado', 'PENDIENTE')
    promesasPendientes = count ?? 0
    const { data } = await supabase.from('promesas')
      .select('id,cliente_cod,monto,fecha_promesa')
      .eq('estado', 'PENDIENTE').lte('fecha_promesa', hoyStr)
      .order('fecha_promesa', { ascending: true }).limit(6)
    promesasVencidas = (data ?? []) as PromesaRow[]
  } catch { /* ok */ }

  // Meta mensual
  let metaMensual = 0
  try {
    const { data } = await supabase.from('config_sistema')
      .select('valor').eq('clave', 'META_MENSUAL').single()
    metaMensual = Number((data as {valor:string}|null)?.valor || 0)
  } catch { /* ok */ }

  const sinData = totalCartera === 0

  // Aging tramos
  const aging = [
    { label: 'Al día',     valor: noVencido,  color: '#22c55e', bg: '#f0fdf4' },
    { label: '1-30 días',  valor: mora1_30,   color: '#eab308', bg: '#fefce8' },
    { label: '31-60 días', valor: mora31_60,  color: '#f97316', bg: '#fff7ed' },
    { label: '61-90 días', valor: mora61_90,  color: '#ef4444', bg: '#fef2f2' },
    { label: '91-120 días',valor: mora91_120, color: '#dc2626', bg: '#fef2f2' },
    { label: '+120 días',  valor: mora120p,   color: '#7f1d1d', bg: '#fef2f2' },
  ]

  return (
    <div className="p-6 space-y-5 bg-gray-50 min-h-full">

      {/* ── Encabezado ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            <RefreshCw size={13} className="text-gray-400" />
            {fechaCorte
              ? <>Último corte Softland: <span className="font-semibold text-gray-700">{fechaCorte}</span></>
              : 'Sin datos — ejecute el sync de Softland'
            }
          </p>
        </div>
        {sinData && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle size={14} /> Sin datos
          </div>
        )}
      </div>

      {/* ── KPI principales — fila 1 ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiPrincipal
          label="Cartera Total"
          valor={'CRC ' + formatMillones(totalCartera)}
          detalle={`${clientesTotal.toLocaleString()} clientes activos`}
          estado="neutral"
          icon={<TrendingDown size={18} />}
          acent="#003B5C"
        />
        <KpiPrincipal
          label="Total en Mora"
          valor={'CRC ' + formatMillones(totalMora)}
          detalle={`${clientesMora.toLocaleString()} clientes con deuda vencida`}
          estado={pctMora > 20 ? 'malo' : 'bueno'}
          icon={<AlertTriangle size={18} />}
          acent={pctMora > 20 ? '#ef4444' : '#22c55e'}
        />
        <KpiPrincipal
          label="% en Mora"
          valor={`${pctMora}%`}
          detalle={pctMora > 20 ? 'Benchmark: < 20%' : 'Dentro del benchmark'}
          estado={pctMora > 20 ? 'malo' : 'bueno'}
          icon={pctMora > 20 ? <ArrowUp size={18}/> : <ArrowDown size={18}/>}
          acent={pctMora > 20 ? '#ef4444' : '#22c55e'}
        />
        <KpiPrincipal
          label="DSO"
          valor={`${dsoDias} días`}
          detalle={dsoDias > 40 ? 'Benchmark: < 40 días' : 'Dentro del benchmark'}
          estado={dsoDias > 40 ? 'malo' : 'bueno'}
          icon={<Minus size={18}/>}
          acent={dsoDias > 40 ? '#ef4444' : '#009ee3'}
        />
      </div>

      {/* ── KPI operativos — fila 2 ── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiOperativo
          label="Gestiones Hoy"
          valor={gestionesHoy}
          icon={<ClipboardCheck size={20}/>}
          color="#009ee3"
          sub="registradas"
        />
        <KpiOperativo
          label="Promesas Pendientes"
          valor={promesasPendientes}
          icon={<Handshake size={20}/>}
          color={promesasVencidas.length > 0 ? '#ef4444' : '#22c55e'}
          sub={promesasVencidas.length > 0 ? `${promesasVencidas.length} vencidas hoy` : 'al día'}
          alerta={promesasVencidas.length > 0}
        />
        <KpiOperativo
          label="Clientes en Mora"
          valor={clientesMora}
          icon={<Users size={20}/>}
          color="#003B5C"
          sub={`de ${clientesTotal} total`}
        />
      </div>

      {/* ── Fila inferior ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Aging — 3/5 */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">
                Distribución de Cartera
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Aging por tramo de mora</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-sm font-bold text-gray-800">CRC {formatMillones(totalCartera)}</p>
            </div>
          </div>

          <div className="space-y-3">
            {aging.map(t => {
              const p = pct(t.valor, totalCartera)
              return (
                <div key={t.label} className="flex items-center gap-3">
                  <div className="w-20 flex-shrink-0 text-right">
                    <span className="text-xs font-medium text-gray-500">{t.label}</span>
                  </div>
                  <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                      style={{ width: `${Math.max(p, 2)}%`, backgroundColor: t.color }}
                    >
                      {p >= 5 && (
                        <span className="text-white text-xs font-bold">{p}%</span>
                      )}
                    </div>
                    {p < 5 && p > 0 && (
                      <span className="absolute left-[calc(2%+8px)] top-1/2 -translate-y-1/2 text-xs font-bold text-gray-600">{p}%</span>
                    )}
                  </div>
                  <div className="w-24 flex-shrink-0 text-right">
                    <span className="text-xs font-semibold text-gray-700">
                      CRC {formatMillones(t.valor)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Barra stacked visual */}
          <div className="mt-5 h-3 rounded-full overflow-hidden flex">
            {aging.map(t => {
              const p = pct(t.valor, totalCartera)
              return p > 0 ? (
                <div
                  key={t.label}
                  style={{ width: `${p}%`, backgroundColor: t.color }}
                  title={`${t.label}: ${p}%`}
                />
              ) : null
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {aging.filter(t => t.valor > 0).map(t => (
              <div key={t.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }}/>
                <span className="text-xs text-gray-500">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho — 2/5 */}
        <div className="xl:col-span-2 flex flex-col gap-4">

          {/* Promesas vencidas o gestiones */}
          {promesasVencidas.length > 0 ? (
            <div className="flex-1 bg-white rounded-2xl border border-red-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-red-600"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Promesas Vencidas</h3>
                  <p className="text-xs text-gray-400">{promesasVencidas.length} sin actualizar</p>
                </div>
              </div>
              <div className="space-y-2">
                {promesasVencidas.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-gray-800">{p.cliente_cod}</p>
                      <p className="text-xs text-red-500 font-medium">{p.fecha_promesa}</p>
                    </div>
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded-lg">
                      {formatCRC(p.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : ultimasGestiones.length > 0 ? (
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={14} className="text-green-600"/>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Últimas Gestiones</h3>
                  <p className="text-xs text-gray-400">Actividad reciente del equipo</p>
                </div>
              </div>
              <div className="space-y-2">
                {ultimasGestiones.map(g => (
                  <div key={g.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-gray-800">{g.cliente_cod}</p>
                      <p className="text-xs text-gray-500">{g.tipo} · {g.resultado}</p>
                    </div>
                    <span className="text-xs text-gray-400">{g.hora?.slice(0,5)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col items-center justify-center text-center">
              <ClipboardCheck size={36} className="text-gray-200 mb-2"/>
              <p className="text-sm font-medium text-gray-500">Sin gestiones hoy</p>
              <p className="text-xs text-gray-400 mt-1">El equipo aún no ha registrado actividad</p>
            </div>
          )}

          {/* Meta mensual */}
          {metaMensual > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-800">Meta Mensual</h3>
                <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: '#e0f5fc', color: '#009ee3' }}>
                  CRC {formatMillones(metaMensual)}
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full w-0" style={{ backgroundColor: '#009ee3' }}/>
              </div>
              <p className="text-xs text-gray-400 mt-2">Cobros pendientes de sincronizar</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Componentes ──────────────────────────────────────────────────

function KpiPrincipal({ label, valor, detalle, estado, icon, acent }: {
  label: string; valor: string; detalle: string
  estado: 'bueno' | 'malo' | 'neutral'; icon: React.ReactNode; acent: string
}) {
  const estadoStyles = {
    bueno:   { chip: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
    malo:    { chip: 'bg-red-50 text-red-700',     dot: 'bg-red-500' },
    neutral: { chip: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
  }
  const s = estadoStyles[estado]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden">
      {/* Acento lateral */}
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full" style={{ backgroundColor: acent }}/>
      <div className="pl-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: acent }}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-black text-gray-900 leading-none tracking-tight">{valor}</p>
        <div className="flex items-center gap-2 mt-2">
          <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>
          <p className="text-xs text-gray-500">{detalle}</p>
        </div>
      </div>
    </div>
  )
}

function KpiOperativo({ label, valor, icon, color, sub, alerta }: {
  label: string; valor: number; icon: React.ReactNode
  color: string; sub: string; alerta?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${alerta ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
          style={{ backgroundColor: color }}>
          {icon}
        </div>
      </div>
      <p className="text-4xl font-black text-gray-900 leading-none">{valor.toLocaleString()}</p>
      <p className={`text-xs mt-2 font-medium ${alerta ? 'text-red-500' : 'text-gray-400'}`}>{sub}</p>
    </div>
  )
}
