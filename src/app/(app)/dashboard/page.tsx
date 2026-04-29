import { createClient } from '@/lib/supabase/server'
import { formatCRC, formatCRCCorto } from '@/lib/utils'
import {
  TrendingDown,
  Users,
  ClipboardCheck,
  Handshake,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// ── tipos internos ──────────────────────────────────────────────
interface AgingRow {
  no_vencido: number
  mora_1_30: number
  mora_31_60: number
  mora_61_90: number
  mora_91_120: number
  mora_120_plus: number
  total: number
  dias_mora: number
}

interface PromesaRow {
  id: string
  cliente_cod: string
  monto: number
  fecha_promesa: string
  estado: string
}

interface GestionRow {
  id: string
  cliente_cod: string
  tipo: string
  resultado: string
  hora: string
  analista_email: string
}

// ── helpers ─────────────────────────────────────────────────────
function pct(parte: number, total: number) {
  if (!total) return 0
  return Math.round((parte / total) * 100)
}

function dso(mora: number, cartera: number) {
  if (!cartera) return 0
  return Math.round((mora / cartera) * 30)
}

// ── page ────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()

  // Fecha de hoy en Costa Rica (UTC-6)
  const ahora = new Date()
  const hoyStr = new Date(ahora.getTime() - 6 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  // ── Cartera ──
  let carteraRows: AgingRow[] = []
  let fechaCorte = ''
  try {
    const { data } = await supabase
      .from('cartera')
      .select(
        'no_vencido, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus, total, dias_mora, fecha_corte'
      )
    carteraRows = (data as (AgingRow & { fecha_corte: string })[]) ?? []
    if (carteraRows.length > 0) {
      fechaCorte = (carteraRows[0] as AgingRow & { fecha_corte: string }).fecha_corte ?? ''
    }
  } catch { /* tabla aún no existe */ }

  const totalCartera = carteraRows.reduce((s, r) => s + (r.total || 0), 0)
  const mora1_30 = carteraRows.reduce((s, r) => s + (r.mora_1_30 || 0), 0)
  const mora31_60 = carteraRows.reduce((s, r) => s + (r.mora_31_60 || 0), 0)
  const mora61_90 = carteraRows.reduce((s, r) => s + (r.mora_61_90 || 0), 0)
  const mora91_120 = carteraRows.reduce((s, r) => s + (r.mora_91_120 || 0), 0)
  const mora120plus = carteraRows.reduce((s, r) => s + (r.mora_120_plus || 0), 0)
  const noVencido = carteraRows.reduce((s, r) => s + (r.no_vencido || 0), 0)
  const totalMora = mora1_30 + mora31_60 + mora61_90 + mora91_120 + mora120plus
  const clientesEnMora = carteraRows.filter((r) => (r.dias_mora || 0) > 0).length
  const totalClientes = carteraRows.length

  const pctMora = pct(totalMora, totalCartera)
  const dsoDias = dso(totalMora, totalCartera)

  // ── Meta mensual ──
  let metaMensual = 0
  try {
    const { data } = await supabase
      .from('config_sistema')
      .select('valor')
      .eq('clave', 'META_MENSUAL')
      .single()
    metaMensual = Number((data as { valor: string } | null)?.valor || 0)
  } catch { /* ok */ }

  // ── Gestiones hoy ──
  let gestionesHoy = 0
  let ultimasGestiones: GestionRow[] = []
  try {
    const { count } = await supabase
      .from('gestiones')
      .select('*', { count: 'exact', head: true })
      .eq('fecha', hoyStr)
    gestionesHoy = count ?? 0

    const { data } = await supabase
      .from('gestiones')
      .select('id, cliente_cod, tipo, resultado, hora, analista_email')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(5)
    ultimasGestiones = (data as GestionRow[]) ?? []
  } catch { /* ok */ }

  // ── Promesas pendientes ──
  let promesasPendientes = 0
  let promesasVencenHoy: PromesaRow[] = []
  try {
    const { count } = await supabase
      .from('promesas')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE')
    promesasPendientes = count ?? 0

    const { data } = await supabase
      .from('promesas')
      .select('id, cliente_cod, monto, fecha_promesa, estado')
      .eq('estado', 'PENDIENTE')
      .lte('fecha_promesa', hoyStr)
      .order('fecha_promesa', { ascending: true })
      .limit(5)
    promesasVencenHoy = (data as PromesaRow[]) ?? []
  } catch { /* ok */ }

  const sinData = totalCartera === 0

  // ── Aging data para barras ──
  const agingTramos = [
    { label: 'Al día', valor: noVencido, color: '#22c55e' },
    { label: '1-30 días', valor: mora1_30, color: '#eab308' },
    { label: '31-60 días', valor: mora31_60, color: '#f97316' },
    { label: '61-90 días', valor: mora61_90, color: '#ef4444' },
    { label: '91-120 días', valor: mora91_120, color: '#dc2626' },
    { label: '+120 días', valor: mora120plus, color: '#991b1b' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Título */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          {fechaCorte && (
            <p className="text-sm text-gray-500 mt-0.5">
              Último corte Softland:{' '}
              <span className="font-medium">{fechaCorte}</span>
            </p>
          )}
        </div>
        {sinData && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle size={14} />
            Sin datos — ejecute el sync de Softland
          </div>
        )}
      </div>

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Cartera Total"
          valor={formatCRCCorto(totalCartera)}
          sub={`${totalClientes} clientes`}
          icon={<TrendingDown size={20} />}
          color="#003B5C"
        />
        <KpiCard
          label="Total en Mora"
          valor={formatCRCCorto(totalMora)}
          sub={`${clientesEnMora} clientes`}
          icon={<AlertTriangle size={20} />}
          color={pctMora > 20 ? '#ef4444' : '#f97316'}
        />
        <KpiCard
          label="% en Mora"
          valor={`${pctMora}%`}
          sub={pctMora > 20 ? 'Por encima del benchmark' : 'Dentro del benchmark'}
          icon={<TrendingDown size={20} />}
          color={pctMora > 20 ? '#ef4444' : '#22c55e'}
        />
        <KpiCard
          label="DSO"
          valor={`${dsoDias} días`}
          sub={dsoDias > 40 ? 'Por encima del benchmark' : 'Dentro del benchmark'}
          icon={<Clock size={20} />}
          color={dsoDias > 40 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Gestiones Hoy"
          valor={String(gestionesHoy)}
          sub="registradas hoy"
          icon={<ClipboardCheck size={20} />}
          color="#009ee3"
        />
        <KpiCard
          label="Promesas Pendientes"
          valor={String(promesasPendientes)}
          sub={promesasVencenHoy.length > 0 ? `${promesasVencenHoy.length} vencidas` : 'al día'}
          icon={<Handshake size={20} />}
          color={promesasVencenHoy.length > 0 ? '#ef4444' : '#22c55e'}
        />
        <KpiCard
          label="Clientes en Mora"
          valor={String(clientesEnMora)}
          sub={`de ${totalClientes} total`}
          icon={<Users size={20} />}
          color="#003B5C"
        />
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Distribución de Cartera (Aging)
          </h2>
          <div className="space-y-3">
            {agingTramos.map((t) => {
              const p = pct(t.valor, totalCartera)
              return (
                <div key={t.label}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{t.label}</span>
                    <span className="font-medium">
                      {formatCRCCorto(t.valor)}{' '}
                      <span className="text-gray-400">({p}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${p}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Promesas vencidas o últimas gestiones */}
        {promesasVencenHoy.length > 0 ? (
          <div className="bg-white rounded-xl border border-red-200 p-5">
            <h2 className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-2">
              <AlertTriangle size={14} />
              Promesas Vencidas
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {promesasVencenHoy.length} promesa(s) con fecha ya cumplida sin actualizar
            </p>
            <div className="space-y-2">
              {promesasVencenHoy.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-gray-800">
                      {p.cliente_cod}
                    </p>
                    <p className="text-xs text-gray-500">
                      Vence: {p.fecha_promesa}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-red-700">
                    {formatCRC(p.monto)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : ultimasGestiones.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-500" />
              Últimas Gestiones
            </h2>
            <div className="space-y-2">
              {ultimasGestiones.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-gray-800">
                      {g.cliente_cod}
                    </p>
                    <p className="text-xs text-gray-500">
                      {g.tipo} — {g.resultado}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{g.hora?.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col items-center justify-center text-center">
            <ClipboardCheck size={32} className="text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Sin gestiones registradas hoy</p>
            <p className="text-xs text-gray-400 mt-1">
              Vaya a Gestiones para registrar actividad
            </p>
          </div>
        )}
      </div>

      {/* Meta mensual si está configurada */}
      {metaMensual > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Meta Mensual de Cobro
            </h2>
            <span className="text-sm font-bold" style={{ color: '#009ee3' }}>
              {formatCRCCorto(metaMensual)}
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: '0%', backgroundColor: '#009ee3' }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Los cobros del mes aparecerán aquí una vez sincronizado el módulo de pagos.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Componente KPI Card ─────────────────────────────────────────
function KpiCard({
  label,
  valor,
  sub,
  icon,
  color,
}: {
  label: string
  valor: string
  sub: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{valor}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  )
}
