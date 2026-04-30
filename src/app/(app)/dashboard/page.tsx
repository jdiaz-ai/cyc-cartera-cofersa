import { createClient } from '@/lib/supabase/server'
import { fmtM, fmtFecha, hoyISO } from '@/lib/utils/formato'
import {
  AlertTriangle, TrendingDown, Users, ClipboardCheck,
  Handshake, Activity, Shield, Timer, Bell, CheckCircle2,
  Package, AlertCircle,
} from 'lucide-react'
import GestionRapida from '@/components/dashboard/gestion-rapida'
import type { ClienteOpt } from '@/components/dashboard/gestion-rapida'

// ── Tipos compartidos ─────────────────────────────────────────────────
interface CarteraRow {
  no_vencido: number; mora_1_30: number; mora_31_60: number
  mora_61_90: number; mora_91_120: number; mora_120_plus: number
  total: number; dias_mora: number; fecha_corte: string
}
interface CarteraRowFull extends CarteraRow { cliente_cod: string; cliente_nombre: string }
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

  // Rol del usuario actual
  let rolUsuario: 'COORDINADOR' | 'ANALISTA' = 'ANALISTA'
  try {
    const { data } = await supabase.from('usuarios').select('rol').eq('email', userEmail).single()
    rolUsuario = ((data as { rol: string } | null)?.rol ?? 'ANALISTA') as 'COORDINADOR' | 'ANALISTA'
  } catch {}

  if (rolUsuario === 'COORDINADOR') {
    return <DashboardCoordinador supabase={supabase} hoyStr={hoyStr} />
  }
  return <DashboardAnalista supabase={supabase} hoyStr={hoyStr} userEmail={userEmail} />
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD COORDINADOR
// ══════════════════════════════════════════════════════════════════════
async function DashboardCoordinador({ supabase, hoyStr }: {
  supabase: Awaited<ReturnType<typeof createClient>>
  hoyStr: string
}) {
  // ── Cartera ──────────────────────────────────────────────────────────
  let rows: CarteraRow[] = [], fechaCorte = '', totalClientes = 0
  try {
    const { count } = await supabase.from('cartera').select('*', { count: 'exact', head: true })
    totalClientes = count ?? 0
    const { data } = await supabase.from('cartera')
      .select('no_vencido,mora_1_30,mora_31_60,mora_61_90,mora_91_120,mora_120_plus,total,dias_mora,fecha_corte')
      .range(0, 4999)
    rows = (data ?? []) as CarteraRow[]
    if (rows[0]) fechaCorte = fmtFecha(rows[0].fecha_corte ?? '')
  } catch {}

  const nv    = rows.reduce((s, r) => s + (r.no_vencido    || 0), 0)
  const m130  = rows.reduce((s, r) => s + (r.mora_1_30     || 0), 0)
  const m31   = rows.reduce((s, r) => s + (r.mora_31_60    || 0), 0)
  const m61   = rows.reduce((s, r) => s + (r.mora_61_90    || 0), 0)
  const m91   = rows.reduce((s, r) => s + (r.mora_91_120   || 0), 0)
  const m120  = rows.reduce((s, r) => s + (r.mora_120_plus || 0), 0)
  const cartera   = rows.reduce((s, r) => s + (r.total || 0), 0)
  const mora      = m130 + m31 + m61 + m91 + m120
  const nClientes = totalClientes || rows.length
  const nMora     = rows.filter(r => (r.dias_mora || 0) > 0).length
  const pMora     = pct(mora, cartera)
  const dso       = cartera ? Math.round((mora / cartera) * 30) : 0

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
async function DashboardAnalista({ supabase, hoyStr, userEmail }: {
  supabase: Awaited<ReturnType<typeof createClient>>
  hoyStr: string
  userEmail: string
}) {
  // ── Clientes asignados al analista ────────────────────────────────────
  let clientesOpts: ClienteOpt[] = []
  let clientesCods: string[] = []
  try {
    const { data } = await supabase.from('maestro_clientes')
      .select('cliente_cod,cliente_nombre,contribuyente')
      .eq('analista_email', userEmail)
      .order('cliente_nombre', { ascending: true })
    clientesOpts = ((data ?? []) as { cliente_cod: string; cliente_nombre: string; contribuyente: string }[])
      .map(c => ({ cod: c.cliente_cod, nombre: c.cliente_nombre, contribuyente: c.contribuyente }))
    clientesCods = clientesOpts.map(c => c.cod)
  } catch {}

  // ── Mi cartera ────────────────────────────────────────────────────────
  let misRows: CarteraRowFull[] = []
  let miCartera = 0, miMora = 0
  try {
    if (clientesCods.length > 0) {
      const { data } = await supabase.from('cartera')
        .select('cliente_cod,cliente_nombre,no_vencido,mora_1_30,mora_31_60,mora_61_90,mora_91_120,mora_120_plus,total,dias_mora,fecha_corte')
        .in('cliente_cod', clientesCods.slice(0, 500))
      misRows = (data ?? []) as CarteraRowFull[]
      miCartera = misRows.reduce((s, r) => s + (r.total || 0), 0)
      miMora    = misRows.reduce((s, r) => s + (r.mora_1_30 || 0) + (r.mora_31_60 || 0) + (r.mora_61_90 || 0) + (r.mora_91_120 || 0) + (r.mora_120_plus || 0), 0)
    }
  } catch {}

  const pMiMora = pct(miMora, miCartera)

  // ── Mis gestiones de hoy ──────────────────────────────────────────────
  let misGestiones: GestionRow[] = [], gHoyCount = 0
  try {
    const { data, count } = await supabase.from('gestiones')
      .select('id,cliente_cod,tipo,resultado,hora,analista_email,nota', { count: 'exact' })
      .eq('analista_email', userEmail).eq('fecha', hoyStr)
      .order('hora', { ascending: false })
    misGestiones = (data ?? []) as GestionRow[]
    gHoyCount = count ?? 0
  } catch {}

  // ── Mis promesas pendientes ───────────────────────────────────────────
  let misPromesas: PromesaRow[] = [], promCount = 0
  try {
    const { data, count } = await supabase.from('promesas')
      .select('id,cliente_cod,monto,fecha_promesa,estado', { count: 'exact' })
      .eq('analista_email', userEmail).eq('estado', 'PENDIENTE')
      .order('fecha_promesa', { ascending: true }).limit(8)
    misPromesas = (data ?? []) as PromesaRow[]
    promCount = count ?? 0
  } catch {}

  // ── Cola del día — ordenada por urgencia ─────────────────────────────
  const clientesGestionadosHoy = new Set(misGestiones.map(g => g.cliente_cod))
  const promesasHoySet = new Set(
    misPromesas.filter(p => p.fecha_promesa === hoyStr).map(p => p.cliente_cod)
  )

  const cola = misRows.map(r => {
    let urgencia: Urgencia = 'VERDE'
    if ((r.mora_61_90 || 0) + (r.mora_91_120 || 0) + (r.mora_120_plus || 0) > 0
        || promesasHoySet.has(r.cliente_cod)) {
      urgencia = 'ROJO'
    } else if ((r.mora_31_60 || 0) > 0) {
      urgencia = 'AMARILLO'
    }
    return { ...r, urgencia, gestionadoHoy: clientesGestionadosHoy.has(r.cliente_cod) }
  })
    .sort((a, b) => {
      const ord: Record<Urgencia, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 }
      if (ord[a.urgencia] !== ord[b.urgencia]) return ord[a.urgencia] - ord[b.urgencia]
      return (b.mora_61_90 + b.mora_91_120 + b.mora_120_plus) - (a.mora_61_90 + a.mora_91_120 + a.mora_120_plus)
    })
    .slice(0, 15)

  const urgCfg: Record<Urgencia, { dot: string; bg: string }> = {
    ROJO:     { dot: '#dc2626', bg: '#FEF2F2' },
    AMARILLO: { dot: '#f59e0b', bg: '#FFFBEB' },
    VERDE:    { dot: '#16a34a', bg: '#F0FDF4' },
  }
  const tipoIcon: Record<string, string> = { LLAMADA: '📞', CORREO: '📧', VISITA: '🏢', WHATSAPP: '💬' }

  return (
    <div className="min-h-full" style={{ background: '#EEF2F7' }}>
      <div className="px-6 pt-5 pb-6 space-y-5">

        {/* ── KPIs analista (4 tarjetas) ─────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KPICard label="Mi Cartera"         valor={fmtM(miCartera)} sub={`${misRows.length} clientes asignados`}                               gradient="linear-gradient(135deg,#003B5C,#005a8e)"   badge={null}                icon={<Package size={16}/>}      />
          <KPICard label="En Mora"            valor={fmtM(miMora)}    sub={`${pMiMora}% de mi cartera`}                                          gradient={pMiMora>25?"linear-gradient(135deg,#991b1b,#dc2626)":"linear-gradient(135deg,#065f46,#059669)"} badge={`${pMiMora}%`} badgeGood={pMiMora<=25} icon={<TrendingDown size={16}/>} />
          <KPICard label="Gestiones Hoy"      valor={String(gHoyCount)} sub={`de ${misRows.length} clientes`}                                     gradient="linear-gradient(135deg,#0369a1,#009ee3)"   badge={gHoyCount>0?'activo':null} badgeGood icon={<ClipboardCheck size={16}/>} />
          <KPICard label="Promesas Activas"   valor={String(promCount)} sub={misPromesas.some(p=>p.fecha_promesa===hoyStr)?'⚠ vencen hoy':'al día'} gradient={misPromesas.some(p=>p.fecha_promesa===hoyStr)?"linear-gradient(135deg,#7c2d12,#ea580c)":"linear-gradient(135deg,#1e3a5f,#003B5C)"} badge={misPromesas.some(p=>p.fecha_promesa===hoyStr)?'urgente':null} badgeGood={false} icon={<Handshake size={16}/>} />
        </div>

        {/* ── Cola del día + Promesas ────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Cola */}
          <div className="xl:col-span-2" style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(220,38,38,0.08)'}}><AlertCircle size={15} style={{color:'#dc2626'}}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Cola del Día</h2><p className="text-xs text-gray-400">Prioridad: rojo → amarillo → verde</p></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:'rgba(220,38,38,0.1)',color:'#dc2626'}}>{cola.filter(c=>c.urgencia==='ROJO').length} 🔴</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:'rgba(245,158,11,0.1)',color:'#d97706'}}>{cola.filter(c=>c.urgencia==='AMARILLO').length} 🟡</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:'rgba(22,163,74,0.1)',color:'#16a34a'}}>{cola.filter(c=>c.urgencia==='VERDE').length} 🟢</span>
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
                  const cfg = urgCfg[c.urgencia]
                  const moraCrit = (c.mora_61_90 || 0) + (c.mora_91_120 || 0) + (c.mora_120_plus || 0)
                  return (
                    <div key={c.cliente_cod} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:cfg.dot}}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{c.cliente_nombre || c.cliente_cod}</p>
                        <p className="text-xs text-gray-400">{c.cliente_cod}</p>
                      </div>
                      {moraCrit > 0 && (
                        <span className="text-xs font-black text-red-600 flex-shrink-0">{fmtM(moraCrit)}</span>
                      )}
                      {c.gestionadoHoy && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{background:'rgba(22,163,74,0.1)',color:'#16a34a'}}>✓ hoy</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Promesas pendientes */}
          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-5 py-4" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(0,158,227,0.1)'}}><Handshake size={15} style={{color:'#009ee3'}}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Mis Promesas</h2><p className="text-xs text-gray-400">{promCount} pendientes</p></div>
              </div>
            </div>
            {misPromesas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 size={28} className="text-green-300 mb-3"/>
                <p className="text-sm font-semibold text-gray-400">Sin promesas pendientes</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {misPromesas.map(p => {
                  const venceHoy = p.fecha_promesa === hoyStr
                  const vencida  = p.fecha_promesa && p.fecha_promesa < hoyStr
                  return (
                    <div key={p.id} className="rounded-xl px-3.5 py-2.5" style={{background: vencida||venceHoy?'#FEF2F2':'#F8FAFC', border:`1px solid ${vencida||venceHoy?'#FECACA':'#F1F5F9'}`}}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-800 truncate flex-1">{p.cliente_cod}</p>
                        <p className="text-xs font-black text-gray-700 flex-shrink-0 ml-2">{fmtM(p.monto)}</p>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-400">{p.fecha_promesa}</p>
                        {(vencida || venceHoy) && <span className="text-xs font-bold text-red-500">{venceHoy ? 'vence hoy' : 'vencida'}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Mis gestiones de hoy + Gestión rápida ─────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          {/* Mis gestiones hoy */}
          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-6 py-4 flex items-center justify-between" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(0,158,227,0.1)'}}><Activity size={15} style={{color:'#009ee3'}}/></div>
                <div><h2 className="text-sm font-bold text-gray-900">Mis Gestiones de Hoy</h2><p className="text-xs text-gray-400">{gHoyCount} registradas</p></div>
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
                  <div key={g.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{background:'#F8FAFC'}}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm" style={{background:'rgba(0,59,92,0.07)'}}>{tipoIcon[g.tipo]??'📋'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{g.cliente_cod}</p>
                      <p className="text-xs text-gray-500 truncate">{g.resultado}{g.nota ? ` · ${g.nota}` : ''}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-400 flex-shrink-0">{g.hora?.slice(0,5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Gestión rápida */}
          <div style={{background:'white',borderRadius:'16px',border:'1px solid #E2E8F0',boxShadow:'0 1px 8px rgba(0,0,0,0.06)',overflow:'hidden'}}>
            <div className="px-6 py-4 flex items-center gap-3" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(0,158,227,0.1)'}}><ClipboardCheck size={15} style={{color:'#009ee3'}}/></div>
              <div><h2 className="text-sm font-bold text-gray-900">Gestión Rápida</h2><p className="text-xs text-gray-400">Registrá una gestión en segundos</p></div>
            </div>
            <GestionRapida clientes={clientesOpts} analistaEmail={userEmail} hoyStr={hoyStr} />
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
