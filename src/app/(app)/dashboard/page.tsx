import { createClient } from '@/lib/supabase/server'
import { fmtKPI, fmtFecha, hoyISO } from '@/lib/utils/formato'
import {
  TrendingDown, ClipboardCheck, Target,
  Activity, Shield, Timer, AlertTriangle, Percent,
} from 'lucide-react'
import MiEquipoCard, { type AnalistaEquipo } from '@/components/coordinador/MiEquipoCard'
import DashboardResumen from '@/components/analista/DashboardResumen'
import SaludoDashboard from '@/components/dashboard/saludo-dashboard'
import PorVendedor    from '@/components/analista/PorVendedor'
import AgendaCompacta from '@/components/analista/AgendaCompacta'
import MiProgreso     from '@/components/analista/MiProgreso'
import NotasRapidas   from '@/components/analista/NotasRapidas'
import TendenciaCarteraChart from '@/components/coordinador/TendenciaCarteraChart'
import type { HistoricoCarteraRow } from '@/components/coordinador/TendenciaCarteraChart'
import type {
  KpisAnalistaDashboard,
  VendedorResumen,
  ColaItem as ColaItemRPC,
  AgendaGestion,
  AgendaPromesa,
  PromesaPendiente,
} from '@/types/dashboard-analista'

// ── Tipos compartidos ─────────────────────────────────────────────────
interface CarteraRow {
  no_vencido: number; mora_1_30: number; mora_31_60: number
  mora_61_90: number; mora_91_120: number; mora_120_plus: number
  total: number; dias_mora: number; fecha_corte: string
}
interface CarteraRowFull extends CarteraRow { cliente_cod: string; cliente_nombre: string }

// Resultado de la función RPC get_kpis_cartera() — agrega en Supabase,
// evita el límite de 1000 filas de PostgREST
interface KpisCartera {
  total_cartera:       number
  total_no_vencido:    number
  total_mora_1_30:     number
  total_mora_31_60:    number
  total_mora_61_90:    number
  total_mora_91_120:   number
  total_mora_120_plus: number
  total_mora:          number
  n_clientes:          number
  n_en_mora:           number
  fecha_corte:         string
}
interface AnalistaRow  { id: string; nombre: string; email: string; iniciales: string; color: string }
type Urgencia = 'ROJO' | 'AMARILLO' | 'VERDE'

function pct(a: number, b: number)  { return b ? Math.round((a / b) * 100) : 0 }
function pct1(a: number, b: number) { return b ? (Math.round((a / b) * 1000) / 10).toFixed(1) : '0.0' }

// ── Página principal (detecta rol) ────────────────────────────────────
export default async function DashboardPage() {
  const supabase  = await createClient()
  const hoyStr    = hoyISO()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  // Rol y nombre del usuario actual
  let rolUsuario: 'COORDINADOR' | 'ANALISTA' = 'ANALISTA'
  let nombreUsuario = user?.user_metadata?.full_name ?? ''
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('rol, nombre')
      .eq('email', userEmail)
      .single()
    const row = data as { rol: string; nombre: string } | null
    rolUsuario    = (row?.rol    ?? 'ANALISTA') as 'COORDINADOR' | 'ANALISTA'
    nombreUsuario = row?.nombre ?? nombreUsuario
  } catch {}

  if (rolUsuario === 'COORDINADOR') {
    return <DashboardCoordinador supabase={supabase} hoyStr={hoyStr} nombre={nombreUsuario} />
  }
  return <DashboardAnalista supabase={supabase} hoyStr={hoyStr} userEmail={userEmail} nombre={nombreUsuario} />
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD COORDINADOR
// ══════════════════════════════════════════════════════════════════════
async function DashboardCoordinador({ supabase, hoyStr, nombre }: {
  supabase: Awaited<ReturnType<typeof createClient>>
  hoyStr: string
  nombre: string
}) {
  // ── Cartera — agregación server-side via RPC ──────────────────────────
  // IMPORTANTE: NO usar .range(0, N) + suma en JS porque Supabase PostgREST
  // limita a 1000 filas por defecto. La función get_kpis_cartera() hace
  // SUM() directamente en PostgreSQL y devuelve un único registro con totales.
  let nv=0, m130=0, m31=0, m61=0, m91=0, m120=0
  let cartera=0, mora=0, nClientes=0, nMora=0, fechaCorte=''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_kpis_cartera')
    if (!error && data && (data as KpisCartera[]).length > 0) {
      const k = (data as KpisCartera[])[0]
      nv        = Number(k.total_no_vencido)    || 0
      m130      = Number(k.total_mora_1_30)      || 0
      m31       = Number(k.total_mora_31_60)     || 0
      m61       = Number(k.total_mora_61_90)     || 0
      m91       = Number(k.total_mora_91_120)    || 0
      m120      = Number(k.total_mora_120_plus)  || 0
      cartera   = Number(k.total_cartera)        || 0
      mora      = Number(k.total_mora)           || 0
      nClientes = Number(k.n_clientes)           || 0
      nMora     = Number(k.n_en_mora)            || 0
      fechaCorte = fmtFecha(k.fecha_corte || '')
    }
  } catch {}

  const pMora    = pct(mora, cartera)       // entero — para lógica de color
  const pMora1   = pct1(mora, cartera)      // "27.3" — para mostrar en card
  const dso      = cartera ? Math.round((mora / cartera) * 30) : 0
  // Monto vencido >30 días (31-60 + 61-90 + 91-120 + 120+) y su % sobre cartera total
  const venc30   = Math.max(0, m31) + Math.max(0, m61) + Math.max(0, m91) + Math.max(0, m120)
  const pVenc30  = pct(venc30, cartera)     // entero — para lógica de color
  const pVenc301 = pct1(venc30, cartera)    // "9.4"  — para mostrar en card

  // ── Fechas de período (CR = UTC-6) ───────────────────────────────────
  const nowCR      = new Date(Date.now() - 6 * 3600000)
  const yyyyMM     = nowCR.toISOString().slice(0, 7)
  const inicioMes  = `${yyyyMM}-01`
  const dowCR      = nowCR.getUTCDay()
  const lunesCR    = new Date(nowCR)
  lunesCR.setUTCDate(lunesCR.getUTCDate() + (dowCR === 0 ? -6 : 1 - dowCR))
  const inicioSemana = lunesCR.toISOString().slice(0, 10)

  // ── Gestiones hoy ────────────────────────────────────────────────────
  let gHoy = 0
  try {
    const { count } = await supabase.from('gestiones').select('*', { count: 'exact', head: true }).eq('fecha', hoyStr)
    gHoy = count ?? 0
  } catch {}

  // ── Mi Equipo (hoy + semana + mes) ───────────────────────────────────
  let analistas: AnalistaRow[] = []
  let equipoData: AnalistaEquipo[] = []
  try {
    const { data } = await supabase.from('usuarios').select('id,nombre,email,iniciales,color').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (data ?? []) as AnalistaRow[]
    const cnt = (rows: { analista_email: string }[]) => {
      const c: Record<string, number> = {}
      for (const g of rows) c[g.analista_email] = (c[g.analista_email] || 0) + 1
      return c
    }
    const [gHoyRes, gSemRes, gMesRes] = await Promise.all([
      supabase.from('gestiones').select('analista_email').eq('fecha', hoyStr),
      supabase.from('gestiones').select('analista_email').gte('fecha', inicioSemana),
      supabase.from('gestiones').select('analista_email').gte('fecha', inicioMes),
    ])
    const cHoy = cnt((gHoyRes.data ?? []) as { analista_email: string }[])
    const cSem = cnt((gSemRes.data ?? []) as { analista_email: string }[])
    const cMes = cnt((gMesRes.data ?? []) as { analista_email: string }[])
    equipoData = analistas.map(a => ({
      id: a.id, nombre: a.nombre, iniciales: a.iniciales, color: a.color,
      gHoy:    cHoy[a.email] ?? 0,
      gSemana: cSem[a.email] ?? 0,
      gMes:    cMes[a.email] ?? 0,
    }))
  } catch {}

  // ── Meta ──────────────────────────────────────────────────────────────
  let meta = 0
  try {
    const { data } = await supabase.from('config_sistema').select('valor').eq('clave', 'meta_mensual').single()
    meta = Number((data as { valor: string } | null)?.valor || 0)
  } catch {}

  // ── Cobrado este mes (promesas cumplidas) ─────────────────────────────
  let cobradoMes = 0
  try {
    const { data: promData } = await supabase.from('promesas')
      .select('monto').eq('estado', 'CUMPLIDA').gte('updated_at', inicioMes)
    cobradoMes = ((promData ?? []) as { monto: number }[]).reduce((s, p) => s + Number(p.monto), 0)
  } catch {}

  // ── Meta Mensual — stats ──────────────────────────────────────────────
  const diasEnMes     = new Date(Date.UTC(nowCR.getUTCFullYear(), nowCR.getUTCMonth() + 1, 0)).getUTCDate()
  const diaActual     = nowCR.getUTCDate()
  const diasRestantes = diasEnMes - diaActual
  const pctMeta       = meta > 0 ? Math.min(Math.round((cobradoMes / meta) * 100), 999) : 0
  const proyeccion    = diaActual > 0 ? Math.round((cobradoMes / diaActual) * diasEnMes) : 0
  const enCamino      = meta > 0 && proyeccion >= meta * 0.90

  // ── Histórico de mora (para gráfica de tendencia) ────────────────────
  let historico: HistoricoCarteraRow[] = []
  try {
    const { data: histData } = await supabase
      .from('historico_cartera')
      .select('fecha, cartera_total, mora_total, mora_31_plus, pct_mora, pct_mora_31, n_en_mora')
      .order('fecha', { ascending: true })
      .limit(90)
    historico = (histData ?? []) as HistoricoCarteraRow[]
  } catch { /* tabla puede no existir aún */ }

  // ── Aging ─────────────────────────────────────────────────────────────
  const aging = [
    { label: 'Al día',      v: nv,   color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)'  },
    { label: '1-30 días',   v: m130, color: '#d97706', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.2)'  },
    { label: '31-60 días',  v: m31,  color: '#ea580c', bg: 'rgba(234,88,12,0.08)',   border: 'rgba(234,88,12,0.2)'  },
    { label: '61-90 días',  v: m61,  color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.2)'  },
    { label: '91-120 días', v: m91,  color: '#b91c1c', bg: 'rgba(185,28,28,0.08)',   border: 'rgba(185,28,28,0.2)'  },
    { label: '+120 días',   v: m120, color: '#7f1d1d', bg: 'rgba(127,29,29,0.10)',   border: 'rgba(127,29,29,0.25)' },
  ]

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-6 pt-5 pb-6 space-y-5">

        {/* Saludo dinámico */}
        <SaludoDashboard nombre={nombre} />

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {/* 1. Cartera Total */}
          <KPICard
            label="Cartera Total"
            valor={fmtKPI(cartera)}
            sub={`${String(nClientes).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} clientes activos`}
            accentColor="#003B5C"
            badge={null}
            icon={<Shield size={16} />}
          />
          {/* 2. Mora Total */}
          <KPICard
            label="Mora Total"
            valor={fmtKPI(mora)}
            sub={`${String(nMora).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} clientes en mora`}
            accentColor="#ef4444"
            badge={null}
            icon={<TrendingDown size={16} />}
          />
          {/* 3. Venc >30D / Cartera */}
          <KPICard
            label="Venc >30D / Cartera"
            valor={`${pVenc301}%`}
            sub={`${fmtKPI(venc30)} vencido`}
            accentColor={pVenc30 > 10 ? '#ea580c' : '#16a34a'}
            badge={null}
            icon={<AlertTriangle size={16} />}
          />
          {/* 4. % Mora / Cartera */}
          <KPICard
            label="% Mora / Cartera"
            valor={`${pMora1}%`}
            sub="Benchmark <15%"
            accentColor={pMora > 15 ? '#ef4444' : '#16a34a'}
            badge={null}
            icon={<Percent size={16} />}
          />
          {/* 5. DSO */}
          <KPICard
            label="DSO Actual"
            valor={`${dso}d`}
            sub="días promedio de cobro"
            accentColor={dso > 40 ? '#ef4444' : '#16a34a'}
            badge={null}
            icon={<Timer size={16} />}
          />
          {/* 6. Gestiones Hoy */}
          <KPICard
            label="Gestiones Hoy"
            valor={String(gHoy)}
            sub={`${analistas.length} analistas activos`}
            accentColor="#009ee3"
            badge={null}
            icon={<ClipboardCheck size={16} />}
          />
        </div>

        {/* Aging + Mi Equipo + Meta */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="flex flex-col" style={{ background:'white', borderRadius:'16px', border:'1px solid #E2E8F0', boxShadow:'0 1px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid #F1F5F9' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:'rgba(0,59,92,0.08)' }}><Activity size={15} style={{ color:'#003B5C' }}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Distribución de Cartera · Aging</h2><p className="text-xs text-gray-400">6 tramos · {fechaCorte}</p></div>
              </div>
              <p className="text-sm font-black text-gray-900 hidden sm:block">{fmtKPI(cartera)}</p>
            </div>

            {/* Barra apilada + leyenda completa (6 tramos siempre) */}
            <div className="px-6 pt-4 pb-3">
              <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5 mb-3">
                {aging.map(t => { const p=pct(Math.max(0,t.v),cartera); return p>0?<div key={t.label} style={{width:`${p}%`,background:t.color,borderRadius:'3px'}} title={`${t.label}: ${pct1(Math.max(0,t.v),cartera)}%`}/>:null })}
              </div>
              <div className="flex gap-4 flex-wrap">
                {aging.map(t => (
                  <div key={t.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:t.color}}/>
                    <span className="text-[11px] text-gray-500">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla reporte con barra proporcional */}
            <div className="px-4 pb-4">
              {/* Encabezados */}
              <div className="flex items-center px-3 pb-1.5 border-b border-slate-100 gap-3">
                <span className="w-28 flex-shrink-0 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tramo</span>
                <span className="flex-1"/>
                <span className="w-36 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Monto</span>
                <span className="w-16 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">% Cart.</span>
              </div>
              {/* Filas */}
              {(() => {
                const maxV = Math.max(...aging.map(a => Math.max(0, a.v)))
                return aging.map((t, i) => {
                  const barW = maxV > 0 ? (Math.max(0, t.v) / maxV) * 100 : 0
                  return (
                    <div key={t.label} className="flex items-center px-3 py-1.5 rounded-lg gap-3" style={{background: i%2===1 ? '#f8fafc' : 'transparent'}}>
                      <div className="flex items-center gap-2 w-28 flex-shrink-0">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:t.color}}/>
                        <span className="text-[13px] font-semibold text-gray-700">{t.label}</span>
                      </div>
                      {/* Barra proporcional sutil */}
                      <div className="flex-1 h-[5px] rounded-full" style={{background:'#f1f5f9'}}>
                        <div className="h-full rounded-full transition-all duration-500" style={{width:`${Math.max(barW,barW>0?1:0)}%`,background:t.color,opacity:0.45}}/>
                      </div>
                      <span className="w-36 text-right text-[13px] font-bold tabular-nums text-gray-900">{fmtKPI(Math.max(0,t.v))}</span>
                      <span className="w-16 text-right text-[13px] font-bold tabular-nums" style={{color:t.color}}>{pct1(Math.max(0,t.v),cartera)}%</span>
                    </div>
                  )
                })
              })()}
              {/* Subtotal: Mora Total (≥1 día vencido) */}
              <div className="flex items-center px-3 py-2 mt-2 rounded-lg" style={{background:'#fef2f2',border:'1px solid #fecaca'}}>
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:'#ef4444'}}/>
                  <span className="text-[13px] font-black text-red-700 uppercase tracking-wide">Mora Total</span>
                </div>
                <span className="w-36 text-right text-[13px] font-black tabular-nums text-red-700">{fmtKPI(mora)}</span>
                <span className="w-16 text-right text-[13px] font-black tabular-nums text-red-700">{pMora1}%</span>
              </div>
            </div>

            {/* ── Concentración de riesgo — anchored to bottom ─────────── */}
            <div className="flex-1 flex flex-col justify-end px-4 pb-5">
              <div className="pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Concentración de riesgo</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl px-3 py-2.5" style={{ background: '#fef2f2' }}>
                    <p className="text-sm font-black tabular-nums text-red-700">{fmtKPI(Math.max(0,m61)+Math.max(0,m91)+Math.max(0,m120))}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Mora crítica &gt;60d</p>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: '#fef2f2' }}>
                    <p className="text-sm font-black tabular-nums text-red-700">{String(nMora).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} clientes</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">En mora actualmente</p>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: '#fff7ed' }}>
                    <p className="text-sm font-black tabular-nums" style={{ color: '#ea580c' }}>{fmtKPI(venc30)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">Vencido &gt;30 días</p>
                  </div>
                  <div className="rounded-xl px-3 py-2.5" style={{ background: pMora > 15 ? '#fef2f2' : '#f0fdf4' }}>
                    <p className="text-sm font-black tabular-nums" style={{ color: pMora > 15 ? '#dc2626' : '#16a34a' }}>{pMora1}%</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">% mora sobre cartera</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha: Mi Equipo + Meta Mensual */}
          <div className="flex flex-col gap-5">
            <MiEquipoCard analistas={equipoData} />
            {meta > 0 && (
              <MetaMensualCard
                cobrado={cobradoMes}
                meta={meta}
                diaActual={diaActual}
                diasRestantes={diasRestantes}
                pctMeta={pctMeta}
                proyeccion={proyeccion}
                enCamino={enCamino}
              />
            )}
          </div>
        </div>

        {/* Tendencia de Mora */}
        <TendenciaCarteraChart data={historico} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD ANALISTA
// ══════════════════════════════════════════════════════════════════════
async function DashboardAnalista({ supabase, hoyStr, userEmail, nombre }: {
  supabase: Awaited<ReturnType<typeof createClient>>
  hoyStr: string
  userEmail: string
  nombre: string
}) {
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // ── Llamadas en paralelo ──────────────────────────────────────────────
  const [
    kpisRes,
    vendedoresRes,
    colaRes,
    agendaGestionesRes,
    agendaPromesasRes,
    promesasRes,
  ] = await Promise.allSettled([
    // 1. KPIs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('fn_dashboard_analista_kpis', { p_email: userEmail }),

    // 2. Resumen por vendedor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('fn_dashboard_vendedores_analista', { p_email: userEmail }),

    // 3. Cola del día (traer 20, mostrar 5 en dashboard)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('fn_cola_del_dia', { p_email: userEmail, p_limit: 20 }),

    // 4. Agenda: gestiones con próxima acción hoy o mañana
    supabase.from('gestiones')
      .select('id, cliente_cod, proxima_accion, proxima_accion_fecha')
      .eq('analista_email', userEmail)
      .in('proxima_accion_fecha', [hoyStr, manana])
      .eq('activo', true)
      .order('proxima_accion_fecha', { ascending: true })
      .limit(5),

    // 5. Agenda: promesas pendientes hoy o mañana
    supabase.from('promesas')
      .select('id, cliente_nombre, cliente_cod, fecha_promesa, monto')
      .eq('analista_email', userEmail)
      .eq('estado', 'PENDIENTE')
      .in('fecha_promesa', [hoyStr, manana])
      .order('fecha_promesa', { ascending: true })
      .limit(5),

    // 6. Mis promesas pendientes (panel lateral, máx 5)
    supabase.from('promesas')
      .select('id, cliente_nombre, cliente_cod, monto, fecha_promesa, estado, monto_abono_parcial')
      .eq('analista_email', userEmail)
      .eq('estado', 'PENDIENTE')
      .eq('activo', true)
      .order('fecha_promesa', { ascending: true })
      .limit(5),
  ])

  // ── Extraer datos con fallback seguro ─────────────────────────────────
  // El RPC puede devolver un objeto único o un array — manejamos ambos casos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpisData = kpisRes.status === 'fulfilled' && !(kpisRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (kpisRes.value as any).data
    : null

  const kpisRaw: KpisAnalistaDashboard | null = Array.isArray(kpisData)
    ? (kpisData[0] ?? null)
    : (kpisData ?? null)

  const kpis: KpisAnalistaDashboard = kpisRaw ?? {
    total_clientes: 0, cartera_total: 0, mora_total: 0, no_vencido: 0,
    mora_1_30: 0, mora_31_60: 0, mora_61_90: 0, mora_91_120: 0, mora_120_plus: 0,
    pct_mora: 0, gestiones_hoy: 0, promesas_activas: 0, promesas_vencen_hoy: 0,
    clientes_urgentes: 0, meta_individual: 0, cobrado_mes_estimado: 0, meta_pct: 0,
  }

  const vendedores: VendedorResumen[] = vendedoresRes.status === 'fulfilled' && !(vendedoresRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((vendedoresRes.value as any).data as VendedorResumen[] | null) ?? []
    : []

  // Deduplicar cola por cliente_cod — puede haber duplicados por contribuyente
  const colaRaw: ColaItemRPC[] = colaRes.status === 'fulfilled' && !(colaRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((colaRes.value as any).data as ColaItemRPC[] | null) ?? []
    : []

  const colaDeduplicada: ColaItemRPC[] = colaRaw.reduce((acc: ColaItemRPC[], item) => {
    const existing = acc.find(x => x.cliente_cod === item.cliente_cod)
    if (!existing || item.mora_total > existing.mora_total) {
      return [...acc.filter(x => x.cliente_cod !== item.cliente_cod), item]
    }
    return acc
  }, []).sort((a, b) => {
    const prioOrder: Record<string, number> = { 'ROJO': 0, 'AMBAR': 1, 'VERDE': 2 }
    const pa = prioOrder[a.prioridad] ?? 2
    const pb = prioOrder[b.prioridad] ?? 2
    return pa !== pb ? pa - pb : b.mora_total - a.mora_total
  })

  const agendaGestiones: AgendaGestion[] = agendaGestionesRes.status === 'fulfilled' && !(agendaGestionesRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((agendaGestionesRes.value as any).data as AgendaGestion[] | null) ?? []
    : []

  // ── Enriquecer agenda gestiones: nombres de clientes + labels de acción ──
  const PROXIMA_ACCION_LABELS: Record<string, string> = {
    esperar_pago:    'Esperar confirmación de pago',
    sin_seguimiento: 'Sin seguimiento requerido',
    recontactar:     'Recontactar cliente',
    escalar:         'Escalar al coordinador',
    crear_solicitud: 'Crear solicitud al coordinador',
  }

  if (agendaGestiones.length > 0) {
    const codigosUnicos = [...new Set(agendaGestiones.map(g => g.cliente_cod))]
    try {
      const { data: clienteRows } = await supabase
        .from('maestro_clientes')
        .select('codigo, nombre')
        .in('codigo', codigosUnicos)
      const nombreMap: Record<string, string> = {}
      for (const c of (clienteRows ?? []) as { codigo: string; nombre: string }[]) {
        nombreMap[c.codigo] = c.nombre
      }
      for (const g of agendaGestiones) {
        g.cliente_nombre = nombreMap[g.cliente_cod] ?? g.cliente_cod
        g.accion_label   = PROXIMA_ACCION_LABELS[g.proxima_accion] ?? g.proxima_accion
      }
    } catch {
      // si falla, los nombres quedan como cliente_cod (ya es el fallback)
    }
  }

  const agendaPromesas: AgendaPromesa[] = agendaPromesasRes.status === 'fulfilled' && !(agendaPromesasRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((agendaPromesasRes.value as any).data as AgendaPromesa[] | null) ?? []
    : []

  const promesas: PromesaPendiente[] = promesasRes.status === 'fulfilled' && !(promesasRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((promesasRes.value as any).data as PromesaPendiente[] | null) ?? []
    : []

  return (
    <div className="min-h-full bg-slate-50">
      <div className="px-4 sm:px-6 pt-5 pb-6">

        {/* Header: saludo + strip de métricas */}
        <div className="mb-5">
          <SaludoDashboard nombre={nombre} kpis={kpis} />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">

          {/* Columna principal */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <DashboardResumen
              kpis={kpis}
              cola={colaDeduplicada}
              promesas={promesas}
              hoyStr={hoyStr}
            />
            <PorVendedor vendedores={vendedores} />
          </div>

          {/* Columna derecha ~260px */}
          <div className="w-full lg:w-64 xl:w-72 flex-shrink-0 flex flex-col gap-4">
            <AgendaCompacta
              gestiones={agendaGestiones}
              promesas={agendaPromesas}
              hoyStr={hoyStr}
            />
            <MiProgreso kpis={kpis} />
            <NotasRapidas hoyStr={hoyStr} />
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Meta Mensual Card ─────────────────────────────────────────────────
function MetaMensualCard({ cobrado, meta, diaActual, diasRestantes, pctMeta, proyeccion, enCamino }: {
  cobrado: number; meta: number; diaActual: number; diasRestantes: number
  pctMeta: number; proyeccion: number; enCamino: boolean
}) {
  const barW = Math.min(pctMeta, 100)
  return (
    <div style={{
      background: 'white', borderRadius: '16px',
      border: '1px solid #E2E8F0',
      borderTop: '3px solid #009ee3',
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: 'rgba(0,158,227,0.08)' }}>
            <Target size={15} style={{ color: '#009ee3' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Meta Mensual</h2>
            <p className="text-xs text-gray-400">Día {diaActual} · {diasRestantes} días restantes</p>
          </div>
        </div>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: enCamino ? '#f0fdf4' : '#fffbeb',
            color:      enCamino ? '#15803d' : '#92400e',
          }}
        >
          {enCamino ? '↑ En camino' : '↓ Revisar ritmo'}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4">
        {/* Monto cobrado */}
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cobrado este mes</p>
        <p className="font-black tabular-nums leading-none mb-1" style={{ fontSize: '2rem', color: '#003B5C' }}>
          {fmtKPI(cobrado)}
        </p>
        <p className="text-xs text-gray-400 mb-4">
          de <span className="font-bold text-gray-700">{fmtKPI(meta)}</span> meta
        </p>

        {/* Barra de progreso */}
        <div className="h-2.5 rounded-full mb-1.5" style={{ background: '#F1F5F9' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.max(barW, cobrado > 0 ? 2 : 0)}%`,
              background: 'linear-gradient(90deg, #009ee3, #38bdf8)',
            }}
          />
        </div>
        <div className="flex justify-between mb-4">
          <span className="text-[11px] text-gray-400">{pctMeta}% completado</span>
          <span className="text-[11px] text-gray-400">{diasRestantes}d restantes</span>
        </div>

        {/* Stats — Avance y Proyección */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl px-3 py-2.5 text-center"
               style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
            <p className="text-base font-black tabular-nums text-gray-900">{pctMeta}%</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avance</p>
          </div>
          <div className="flex-1 rounded-xl px-3 py-2.5 text-center"
               style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
            <p className="text-base font-black tabular-nums text-gray-900">{fmtKPI(proyeccion)}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Proyección</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KPI Card (compartida) ─────────────────────────────────────────────
function KPICard({ label, valor, sub, accentColor, badge, badgeGood, icon }: {
  label: string; valor: string; sub: string; accentColor: string
  badge: string | null; badgeGood?: boolean; icon: React.ReactNode
}) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
        style={{ background: `${accentColor}1a` }}
      >
        <span style={{ color: accentColor }}>{icon}</span>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 leading-none">
        {label}
      </p>
      <p
        className="font-black tabular-nums text-slate-900 leading-tight"
        style={{ fontSize: '1.75rem' }}
      >
        {valor}
      </p>
      <p className="text-[11px] text-slate-400 mt-1 leading-snug">{sub}</p>
      {badge && (
        <span
          className="mt-2 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide"
          style={{
            background: badgeGood ? '#f0fdf4' : '#fef2f2',
            color:      badgeGood ? '#15803d' : '#dc2626',
          }}
        >
          {badge}
        </span>
      )}
    </div>
  )
}

