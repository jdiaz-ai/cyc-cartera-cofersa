import { createClient } from '@/lib/supabase/server'
import { fmtM, fmtFecha, hoyISO } from '@/lib/utils/formato'
import {
  AlertTriangle, TrendingDown, Users, ClipboardCheck,
  Handshake, Activity, Shield, Timer, Bell, CheckCircle2,
} from 'lucide-react'
import DashboardResumen from '@/components/analista/DashboardResumen'
import SaludoDashboard from '@/components/dashboard/saludo-dashboard'
import PorVendedor    from '@/components/analista/PorVendedor'
import AgendaCompacta from '@/components/analista/AgendaCompacta'
import MiProgreso     from '@/components/analista/MiProgreso'
import NotasRapidas   from '@/components/analista/NotasRapidas'
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
interface PromesaRow   { id: string; cliente_cod: string; monto: number; fecha_promesa: string; estado?: string }
interface GestionRow   { id: string; cliente_cod: string; tipo: string; resultado: string; hora: string; analista_email: string; nota?: string }
interface AnalistaRow  { id: string; nombre: string; email: string; iniciales: string; color: string }
type NivelAlerta = 'ROJO' | 'AMARILLO' | 'CYAN'
interface Alerta { nivel: NivelAlerta; texto: string }
type Urgencia = 'ROJO' | 'AMARILLO' | 'VERDE'

function pct(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0 }

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

  const pMora = pct(mora, cartera)
  const dso   = cartera ? Math.round((mora / cartera) * 30) : 0

  // ── Gestiones ────────────────────────────────────────────────────────
  let gHoy = 0, gestiones: GestionRow[] = []
  try {
    const { count } = await supabase.from('gestiones').select('*', { count: 'exact', head: true }).eq('fecha', hoyStr)
    gHoy = count ?? 0
    const { data } = await supabase.from('gestiones')
      .select('id,cliente_cod,tipo,resultado,hora,analista_email')
      .order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(8)
    gestiones = (data ?? []) as GestionRow[]
  } catch {}

  // ── Promesas ─────────────────────────────────────────────────────────
  let nPromesas = 0, promVencidas: PromesaRow[] = []
  try {
    const { count } = await supabase.from('promesas').select('*', { count: 'exact', head: true }).eq('estado', 'PENDIENTE')
    nPromesas = count ?? 0
    const { data } = await supabase.from('promesas')
      .select('id,cliente_cod,monto,fecha_promesa')
      .eq('estado', 'PENDIENTE').lte('fecha_promesa', hoyStr)
      .order('fecha_promesa', { ascending: true }).limit(5)
    promVencidas = (data ?? []) as PromesaRow[]
  } catch {}

  let promSemana = 0
  try {
    const fin = new Date(Date.now() - 6 * 3600000); fin.setDate(fin.getDate() + 7)
    const { count } = await supabase.from('promesas').select('*', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE').gt('fecha_promesa', hoyStr).lte('fecha_promesa', fin.toISOString().split('T')[0])
    promSemana = count ?? 0
  } catch {}

  // ── Solicitudes ───────────────────────────────────────────────────────
  let solicPendientes = 0
  try {
    const { count } = await supabase.from('solicitudes').select('*', { count: 'exact', head: true }).eq('estado', 'PENDIENTE')
    solicPendientes = count ?? 0
  } catch {}

  // ── Mi Equipo ─────────────────────────────────────────────────────────
  let analistas: AnalistaRow[] = []
  let equipoStats: { id: string; nombre: string; iniciales: string; color: string; gHoy: number }[] = []
  try {
    const { data } = await supabase.from('usuarios').select('id,nombre,email,iniciales,color').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (data ?? []) as AnalistaRow[]
    const { data: gData } = await supabase.from('gestiones').select('analista_email').eq('fecha', hoyStr)
    const conteo: Record<string, number> = {}
    for (const g of (gData ?? []) as { analista_email: string }[]) conteo[g.analista_email] = (conteo[g.analista_email] || 0) + 1
    equipoStats = analistas.map(a => ({ id: a.id, nombre: a.nombre, iniciales: a.iniciales, color: a.color, gHoy: conteo[a.email] ?? 0 }))
  } catch {}

  const avgEquipo = equipoStats.length ? Math.round(equipoStats.reduce((s, a) => s + a.gHoy, 0) / equipoStats.length) : 0
  const maxEquipo = Math.max(...equipoStats.map(a => a.gHoy), 1)
  const emailNombre: Record<string, string> = {}
  for (const a of analistas) emailNombre[a.email] = a.nombre.split(' ')[0]

  // ── Meta ──────────────────────────────────────────────────────────────
  let meta = 0
  try {
    const { data } = await supabase.from('config_sistema').select('valor').eq('clave', 'META_MENSUAL').single()
    meta = Number((data as { valor: string } | null)?.valor || 0)
  } catch {}

  // ── Alertas ───────────────────────────────────────────────────────────
  const alertas: Alerta[] = []
  if (solicPendientes > 0) alertas.push({ nivel: 'ROJO',     texto: `${solicPendientes} solicitud${solicPendientes > 1 ? 'es' : ''} pendiente${solicPendientes > 1 ? 's' : ''} de revisión` })
  if (promVencidas.length > 0) alertas.push({ nivel: 'ROJO', texto: `${promVencidas.length} promesa${promVencidas.length > 1 ? 's' : ''} vencieron hoy sin confirmar` })
  if (promSemana > 0) alertas.push({ nivel: 'AMARILLO',      texto: `${promSemana} promesa${promSemana > 1 ? 's' : ''} vencen esta semana` })
  if (gHoy === 0) alertas.push({ nivel: 'AMARILLO',          texto: 'Sin gestiones registradas hoy' })
  if (alertas.length === 0) alertas.push({ nivel: 'CYAN',    texto: 'Todo al día — sin alertas críticas' })

  // ── Aging ─────────────────────────────────────────────────────────────
  const aging = [
    { label: 'Al día',      v: nv,   color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   border: 'rgba(22,163,74,0.2)'  },
    { label: '1-30 días',   v: m130, color: '#d97706', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.2)'  },
    { label: '31-60 días',  v: m31,  color: '#ea580c', bg: 'rgba(234,88,12,0.08)',   border: 'rgba(234,88,12,0.2)'  },
    { label: '61-90 días',  v: m61,  color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.2)'  },
    { label: '91-120 días', v: m91,  color: '#b91c1c', bg: 'rgba(185,28,28,0.08)',   border: 'rgba(185,28,28,0.2)'  },
    { label: '+120 días',   v: m120, color: '#7f1d1d', bg: 'rgba(127,29,29,0.10)',   border: 'rgba(127,29,29,0.25)' },
  ]

  const tipoIcon: Record<string, string> = { LLAMADA: '📞', CORREO: '📧', VISITA: '🏢', WHATSAPP: '💬' }
  const alertaCfg: Record<NivelAlerta, { dot: string; bg: string; text: string }> = {
    ROJO:     { dot: '#dc2626', bg: '#FEF2F2', text: '#991b1b' },
    AMARILLO: { dot: '#f59e0b', bg: '#FFFBEB', text: '#92400e' },
    CYAN:     { dot: '#009ee3', bg: '#EFF6FF', text: '#1e40af' },
  }

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-6 pt-5 pb-6 space-y-5">

        {/* Saludo dinámico */}
        <SaludoDashboard nombre={nombre} />

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          <KPICard label="Cartera Total"       valor={fmtM(cartera)}   sub={`${String(nClientes).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} clientes`}    gradient="linear-gradient(135deg,#003B5C,#005a8e)"   badge={null}              icon={<Shield size={16}/>}       />
          <KPICard label="Total en Mora"        valor={fmtM(mora)}      sub={`${nMora} clientes`}                                                       gradient={pMora>20?"linear-gradient(135deg,#991b1b,#dc2626)":"linear-gradient(135deg,#065f46,#059669)"} badge={`${pMora}%`} badgeGood={pMora<=20} icon={<TrendingDown size={16}/>} />
          <KPICard label="Gestiones Hoy"        valor={String(gHoy)}    sub="registradas hoy"                                                           gradient="linear-gradient(135deg,#0369a1,#009ee3)"   badge={gHoy>0?'activo':null} badgeGood icon={<ClipboardCheck size={16}/>} />
          <KPICard label="Promesas Pendientes"  valor={String(nPromesas)} sub={promVencidas.length>0?`⚠ ${promVencidas.length} vencen hoy`:'al día'}    gradient={promVencidas.length>0?"linear-gradient(135deg,#7c2d12,#ea580c)":"linear-gradient(135deg,#1e3a5f,#003B5C)"} badge={promVencidas.length>0?'urgente':null} badgeGood={false} icon={<Handshake size={16}/>} />
          <KPICard label="Clientes Activos"     valor={String(nClientes).replace(/\B(?=(\d{3})+(?!\d))/g,'.')} sub={`${nMora} con mora`}                gradient="linear-gradient(135deg,#1d4ed8,#3b82f6)"   badge={null}              icon={<Users size={16}/>}        />
          <KPICard label="DSO"                  valor={`${dso}d`}       sub="benchmark < 40 días"                                                       gradient={dso>40?"linear-gradient(135deg,#991b1b,#ef4444)":"linear-gradient(135deg,#065f46,#059669)"} badge={dso>40?'↑ alto':'✓ ok'} badgeGood={dso<=40} icon={<Timer size={16}/>} />
        </div>

        {/* Aging + Alertas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2" style={{ background:'white', borderRadius:'16px', border:'1px solid #E2E8F0', boxShadow:'0 1px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom:'1px solid #F1F5F9' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:'rgba(0,59,92,0.08)' }}><Activity size={15} style={{ color:'#003B5C' }}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Distribución de Cartera · Aging</h2><p className="text-xs text-gray-400">6 tramos · {fechaCorte}</p></div>
              </div>
              <p className="text-sm font-black text-gray-900 hidden sm:block">{fmtM(cartera)}</p>
            </div>
            <div className="px-6 pt-4 pb-1">
              <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5 mb-3">
                {aging.map(t => { const p=pct(t.v,cartera); return p>0?<div key={t.label} style={{width:`${p}%`,background:t.color,borderRadius:'3px'}} title={`${t.label}: ${p}%`}/>:null })}
              </div>
              <div className="flex gap-4 flex-wrap mb-4">
                {aging.map(t => pct(t.v,cartera)>0&&<div key={t.label} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm" style={{background:t.color}}/><span className="text-xs text-gray-500">{t.label}</span></div>)}
              </div>
            </div>
            <div className="px-4 pb-4 space-y-1.5">
              {aging.map(t => {
                const p=pct(t.v,cartera), maxV=Math.max(...aging.map(a=>a.v)), barW=maxV>0?Math.round((t.v/maxV)*100):0
                return (
                  <div key={t.label} className="rounded-xl px-4 py-2.5 flex items-center gap-4" style={{background:t.bg,border:`1px solid ${t.border}`}}>
                    <div className="w-24 flex-shrink-0"><p className="text-xs font-bold" style={{color:t.color}}>{t.label}</p></div>
                    <div className="flex-1 h-1.5 rounded-full" style={{background:'rgba(255,255,255,0.6)'}}><div className="h-full rounded-full" style={{width:`${Math.max(barW,2)}%`,background:t.color}}/></div>
                    <p className="w-28 text-right text-sm font-black text-gray-900 flex-shrink-0">{fmtM(t.v)}</p>
                    <span className="w-12 text-right text-xs font-bold flex-shrink-0" style={{color:t.color}}>{p}%</span>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-3 flex flex-wrap items-center gap-6" style={{background:'#F8FAFC',borderTop:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">DSO</span><span className={`text-sm font-black ${dso>40?'text-red-600':'text-green-600'}`}>{dso} días</span></div>
              <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">% Mora</span><span className={`text-sm font-black ${pMora>20?'text-red-600':'text-green-600'}`}>{pMora}%</span></div>
              <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mora +90d</span><span className="text-sm font-black text-gray-800">{fmtM(m91+m120)}</span></div>
            </div>
          </div>

          {/* Alertas */}
          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-5 py-4 flex items-center gap-3" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(220,38,38,0.08)'}}><Bell size={15} style={{color:'#dc2626'}}/></div>
              <div><h2 className="text-sm font-bold text-gray-900">Alertas</h2><p className="text-xs text-gray-400">{alertas.filter(a=>a.nivel==='ROJO').length} críticas · {alertas.filter(a=>a.nivel==='AMARILLO').length} de atención</p></div>
            </div>
            <div className="p-4 space-y-2.5">
              {alertas.map((a,i) => { const cfg=alertaCfg[a.nivel]; return (
                <div key={i} className="rounded-xl px-3.5 py-3 flex items-start gap-3" style={{background:cfg.bg}}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{background:cfg.dot}}/>
                  <p className="text-xs font-semibold leading-relaxed" style={{color:cfg.text}}>{a.texto}</p>
                </div>
              )})}
            </div>
            {promVencidas.length > 0 && (
              <div className="px-4 pb-4 space-y-1.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">Detalle vencidas</p>
                {promVencidas.map(p => (
                  <div key={p.id} className="rounded-lg px-3 py-2 flex items-center justify-between" style={{background:'#FEF2F2'}}>
                    <div><p className="text-xs font-bold text-gray-800">{p.cliente_cod}</p><p className="text-xs text-red-400">{p.fecha_promesa}</p></div>
                    <p className="text-xs font-black text-red-700">{fmtM(p.monto)}</p>
                  </div>
                ))}
              </div>
            )}
            {meta > 0 && (
              <div className="mx-4 mb-4 rounded-xl p-4" style={{background:'linear-gradient(135deg,#003B5C,#005a8e)'}}>
                <div className="flex items-center justify-between mb-1"><p className="text-xs font-bold uppercase tracking-widest text-blue-300">Meta Mensual</p><CheckCircle2 size={13} className="text-blue-400"/></div>
                <p className="text-white text-lg font-black">{fmtM(meta)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mi Equipo + Gestiones Recientes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(0,59,92,0.08)'}}><Users size={15} style={{color:'#003B5C'}}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Mi Equipo</h2><p className="text-xs text-gray-400">Actividad de hoy · promedio {avgEquipo} gestiones</p></div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:'rgba(0,59,92,0.08)',color:'#003B5C'}}>{equipoStats.length} analistas</span>
            </div>
            <div className="p-4 space-y-3">
              {equipoStats.sort((a,b)=>b.gHoy-a.gHoy).map(a => {
                const barW=maxEquipo>0?Math.round((a.gHoy/maxEquipo)*100):0, sobreAvg=avgEquipo>0&&a.gHoy>=avgEquipo
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-xs" style={{backgroundColor:a.color}}>{a.iniciales}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{a.nombre.split(' ').slice(0,2).join(' ')}</p>
                        <span className={`text-xs font-black ml-2 flex-shrink-0 ${sobreAvg?'text-green-600':a.gHoy===0?'text-gray-300':'text-amber-600'}`}>{a.gHoy}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:'#F1F5F9'}}>
                        <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.max(barW,a.gHoy>0?4:0)}%`,background:sobreAvg?'#16a34a':a.gHoy===0?'#E2E8F0':'#f59e0b'}}/>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-3 flex items-center justify-between" style={{background:'#F8FAFC',borderTop:'1px solid #F1F5F9'}}>
              <span className="text-xs text-gray-400">Total gestiones hoy</span>
              <span className="text-sm font-black text-gray-900">{equipoStats.reduce((s,a)=>s+a.gHoy,0)}</span>
            </div>
          </div>

          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-6 py-4 flex items-center gap-3" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(0,158,227,0.1)'}}><Activity size={15} style={{color:'#009ee3'}}/></div>
              <div><h2 className="text-sm font-bold text-gray-900">Actividad Reciente</h2><p className="text-xs text-gray-400">Últimas gestiones del equipo</p></div>
            </div>
            {gestiones.length > 0 ? (
              <div className="p-3 space-y-1.5">
                {gestiones.map(g => (
                  <div key={g.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{background:'#F8FAFC'}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm" style={{background:'rgba(0,59,92,0.07)'}}>{tipoIcon[g.tipo]??'📋'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-gray-800 truncate">{g.cliente_cod}</p>
                        {emailNombre[g.analista_email] && <span className="text-xs text-gray-400 flex-shrink-0">· {emailNombre[g.analista_email]}</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{g.resultado}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-400 flex-shrink-0">{g.hora?.slice(0,5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="text-3xl mb-3">📋</div>
                <p className="text-sm font-semibold text-gray-400">Sin actividad hoy</p>
              </div>
            )}
          </div>
        </div>
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
  const kpisRaw = kpisRes.status === 'fulfilled' && !(kpisRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((kpisRes.value as any).data as KpisAnalistaDashboard[] | null)?.[0] ?? null
    : null

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

  const agendaPromesas: AgendaPromesa[] = agendaPromesasRes.status === 'fulfilled' && !(agendaPromesasRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((agendaPromesasRes.value as any).data as AgendaPromesa[] | null) ?? []
    : []

  const promesas: PromesaPendiente[] = promesasRes.status === 'fulfilled' && !(promesasRes.value as any).error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((promesasRes.value as any).data as PromesaPendiente[] | null) ?? []
    : []

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-4 sm:px-6 pt-5 pb-6">

        {/* Header: saludo + strip de métricas */}
        <div className="mb-5">
          <SaludoDashboard nombre={nombre} kpis={kpis} />
        </div>

        {/* Layout 2 columnas */}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">

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

// ── KPI Card (compartida) ─────────────────────────────────────────────
function KPICard({ label, valor, sub, gradient, badge, badgeGood, icon }: {
  label: string; valor: string; sub: string; gradient: string
  badge: string | null; badgeGood?: boolean; icon: React.ReactNode
}) {
  return (
    <div style={{background:gradient,borderRadius:'16px',boxShadow:'0 4px 24px rgba(0,0,0,0.14)',overflow:'hidden'}} className="p-5 relative">
      <div style={{position:'absolute',top:'-20px',right:'-20px',width:'90px',height:'90px',background:'rgba(255,255,255,0.06)',borderRadius:'50%'}}/>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p style={{color:'rgba(255,255,255,0.7)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</p>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'rgba(255,255,255,0.15)'}}><span style={{color:'rgba(255,255,255,0.9)'}}>{icon}</span></div>
        </div>
        <p style={{color:'white',fontSize:valor.length>8?'1.4rem':'1.9rem',fontWeight:900,lineHeight:1.1,letterSpacing:'-0.02em'}}>{valor}</p>
        <div className="flex items-center justify-between mt-2">
          <p style={{color:'rgba(255,255,255,0.6)',fontSize:'11px'}}>{sub}</p>
          {badge && <span style={{background:badgeGood?'rgba(74,222,128,0.25)':'rgba(255,100,100,0.25)',color:badgeGood?'#86efac':'#fca5a5',fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px',textTransform:'uppercase'}}>{badge}</span>}
        </div>
      </div>
    </div>
  )
}

// Supress unused import warnings
const _unused = { AlertTriangle }
