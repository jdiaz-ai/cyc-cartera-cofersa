import { createClient } from '@/lib/supabase/server'
import { fmtCRC, fmtM, fmtFecha, hoyISO } from '@/lib/utils/formato'
import { AlertTriangle, TrendingDown, Users, ClipboardCheck, Handshake, RefreshCw, Activity, Shield } from 'lucide-react'

interface CarteraRow {
  no_vencido: number; mora_1_30: number; mora_31_60: number
  mora_61_90: number; mora_91_120: number; mora_120_plus: number
  total: number; dias_mora: number; fecha_corte: string
}
interface PromesaRow { id: string; cliente_cod: string; monto: number; fecha_promesa: string }
interface GestionRow  { id: string; cliente_cod: string; tipo: string; resultado: string; hora: string }

function pct(a: number, b: number) { return b ? Math.round((a/b)*100) : 0 }

export default async function DashboardPage() {
  const supabase = await createClient()
  const hoyStr = hoyISO()

  let rows: CarteraRow[] = [], fechaCorte = '', totalClientes = 0
  try {
    // Count real sin límite
    const { count } = await supabase.from('cartera').select('*', { count: 'exact', head: true })
    totalClientes = count ?? 0
    // Datos financieros (range amplio para no perder montos)
    const { data } = await supabase.from('cartera')
      .select('no_vencido,mora_1_30,mora_31_60,mora_61_90,mora_91_120,mora_120_plus,total,dias_mora,fecha_corte')
      .range(0, 4999)
    rows = (data ?? []) as CarteraRow[]
    if (rows[0]) fechaCorte = fmtFecha(rows[0].fecha_corte ?? '')
  } catch {}

  const nv   = rows.reduce((s,r) => s+(r.no_vencido||0), 0)
  const m130 = rows.reduce((s,r) => s+(r.mora_1_30||0), 0)
  const m31  = rows.reduce((s,r) => s+(r.mora_31_60||0), 0)
  const m61  = rows.reduce((s,r) => s+(r.mora_61_90||0), 0)
  const m91  = rows.reduce((s,r) => s+(r.mora_91_120||0), 0)
  const m120 = rows.reduce((s,r) => s+(r.mora_120_plus||0), 0)
  const cartera = rows.reduce((s,r) => s+(r.total||0), 0)
  const mora    = m130+m31+m61+m91+m120
  const nClientes = totalClientes || rows.length
  const nMora     = rows.filter(r=>(r.dias_mora||0)>0).length
  const pMora     = pct(mora,cartera)
  const dso       = cartera ? Math.round((mora/cartera)*30) : 0

  let gHoy=0, gestiones: GestionRow[]=[]
  try {
    const {count} = await supabase.from('gestiones').select('*',{count:'exact',head:true}).eq('fecha',hoyStr)
    gHoy = count??0
    const {data} = await supabase.from('gestiones').select('id,cliente_cod,tipo,resultado,hora').order('fecha',{ascending:false}).order('hora',{ascending:false}).limit(6)
    gestiones = (data??[]) as GestionRow[]
  } catch {}

  let nPromesas=0, promVencidas: PromesaRow[]=[]
  try {
    const {count} = await supabase.from('promesas').select('*',{count:'exact',head:true}).eq('estado','PENDIENTE')
    nPromesas = count??0
    const {data} = await supabase.from('promesas').select('id,cliente_cod,monto,fecha_promesa').eq('estado','PENDIENTE').lte('fecha_promesa',hoyStr).order('fecha_promesa',{ascending:true}).limit(6)
    promVencidas = (data??[]) as PromesaRow[]
  } catch {}

  let meta=0
  try {
    const {data} = await supabase.from('config_sistema').select('valor').eq('clave','META_MENSUAL').single()
    meta = Number((data as {valor:string}|null)?.valor||0)
  } catch {}

  const aging = [
    { label:'Al día',      tramo:'0 días',      v:nv,   color:'#16a34a', bg:'rgba(22,163,74,0.1)',  border:'rgba(22,163,74,0.25)' },
    { label:'1-30 días',   tramo:'1–30 días',   v:m130, color:'#d97706', bg:'rgba(217,119,6,0.1)',  border:'rgba(217,119,6,0.25)' },
    { label:'31-60 días',  tramo:'31–60 días',  v:m31,  color:'#ea580c', bg:'rgba(234,88,12,0.1)',  border:'rgba(234,88,12,0.25)' },
    { label:'61-90 días',  tramo:'61–90 días',  v:m61,  color:'#dc2626', bg:'rgba(220,38,38,0.1)',  border:'rgba(220,38,38,0.25)' },
    { label:'91-120 días', tramo:'91–120 días', v:m91,  color:'#b91c1c', bg:'rgba(185,28,28,0.1)',  border:'rgba(185,28,28,0.25)' },
    { label:'+120 días',   tramo:'+120 días',   v:m120, color:'#7f1d1d', bg:'rgba(127,29,29,0.12)', border:'rgba(127,29,29,0.3)'  },
  ]

  const tipoIcon: Record<string, string> = {
    LLAMADA:'📞', CORREO:'📧', VISITA:'🏢', WHATSAPP:'💬'
  }

  return (
    <div className="min-h-full" style={{background:'#EEF2F7'}}>

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div style={{background:'#002d47', borderBottom:'1px solid rgba(255,255,255,0.07)'}} className="px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-300 text-xs">
          <RefreshCw size={11}/>
          <span>Último corte Softland: <strong className="text-white font-bold">{fechaCorte || '—'}</strong></span>
          <span className="text-white/20 mx-1">·</span>
          <span className="text-blue-300">Sincronización automática 3× al día</span>
        </div>
        <div className="hidden lg:flex items-center gap-8">
          <Stat label="Cartera Total" valor={{fmtM(cartera)}} />
          <Stat label="Clientes Activos" valor={nClientes.toLocaleString()} />
          <Stat label="DSO" valor={`${dso} días`} warn={dso>40} />
        </div>
      </div>

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="px-8 pt-7 pb-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Dashboard de Cartera</h1>
        <p className="text-sm text-gray-500 mt-0.5">Resumen ejecutivo · Cofersa · Corte {fechaCorte || 'pendiente'}</p>
      </div>

      <div className="px-8 pb-8 space-y-6">

        {/* ── KPI row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Cartera total — protagonista navy */}
          <KPICard
            label="Cartera Total"
            valor={{fmtM(cartera)}}
            sub={`${nClientes.toLocaleString()} clientes activos`}
            gradient="linear-gradient(135deg, #003B5C 0%, #005a8e 100%)"
            textColor="white"
            badge={null}
            icon={<Shield size={16}/>}
          />

          {/* Mora total — amber/red */}
          <KPICard
            label="Total en Mora"
            valor={{fmtM(mora)}}
            sub={`${nMora.toLocaleString()} clientes`}
            gradient={pMora>20
              ? "linear-gradient(135deg, #991b1b 0%, #dc2626 100%)"
              : "linear-gradient(135deg, #065f46 0%, #059669 100%)"}
            textColor="white"
            badge={`${pMora}%`}
            badgeGood={pMora<=20}
            icon={<TrendingDown size={16}/>}
          />

          {/* Gestiones hoy */}
          <KPICard
            label="Gestiones Hoy"
            valor={gHoy.toString()}
            sub="registradas hoy"
            gradient="linear-gradient(135deg, #0369a1 0%, #009ee3 100%)"
            textColor="white"
            badge={gHoy>0?'activo':null}
            badgeGood={gHoy>0}
            icon={<ClipboardCheck size={16}/>}
          />

          {/* Promesas pendientes */}
          <KPICard
            label="Promesas Pendientes"
            valor={nPromesas.toString()}
            sub={promVencidas.length>0 ? `⚠ ${promVencidas.length} vencen hoy` : 'al día'}
            gradient={promVencidas.length>0
              ? "linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)"
              : "linear-gradient(135deg, #1e3a5f 0%, #003B5C 100%)"}
            textColor="white"
            badge={promVencidas.length>0?'urgente':null}
            badgeGood={false}
            icon={<Handshake size={16}/>}
          />
        </div>

        {/* ── Main grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Aging — 2/3 */}
          <div className="xl:col-span-2" style={{
            background:'white',
            borderRadius:'16px',
            border:'1px solid #E2E8F0',
            boxShadow:'0 1px 8px rgba(0,0,0,0.06)',
            overflow:'hidden'
          }}>
            {/* Card header */}
            <div className="px-6 py-5 flex items-center justify-between" style={{borderBottom:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:'rgba(0,59,92,0.08)'}}>
                  <Activity size={16} style={{color:'#003B5C'}}/>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Distribución de Cartera · Aging</h2>
                  <p className="text-xs text-gray-400 mt-0.5">6 tramos de antigüedad · {fechaCorte}</p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400">Total analizado</p>
                <p className="text-sm font-black text-gray-900">{fmtM(cartera)}</p>
              </div>
            </div>

            {/* Stacked bar */}
            <div className="px-6 pt-5 pb-1">
              <div className="h-3 rounded-full overflow-hidden flex gap-0.5 mb-1">
                {aging.map(t => {
                  const p = pct(t.v, cartera)
                  return p > 0 ? (
                    <div key={t.label}
                      style={{width:`${p}%`, background:t.color, borderRadius:'3px'}}
                      title={`${t.label}: ${p}%`}
                    />
                  ) : null
                })}
              </div>
              <div className="flex gap-3 mb-5 mt-2 flex-wrap">
                {aging.map(t => {
                  const p = pct(t.v, cartera)
                  return p > 0 ? (
                    <div key={t.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:t.color}}/>
                      <span className="text-xs text-gray-500">{t.label}</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>

            {/* Aging rows */}
            <div className="px-4 pb-5 space-y-2">
              {aging.map(t => {
                const p = pct(t.v, cartera)
                const maxV = Math.max(...aging.map(a=>a.v))
                const barW = maxV>0 ? Math.round((t.v/maxV)*100) : 0
                return (
                  <div key={t.label} className="rounded-xl px-4 py-3 flex items-center gap-4"
                    style={{background:t.bg, border:`1px solid ${t.border}`}}>
                    {/* Tramo label */}
                    <div className="w-28 flex-shrink-0">
                      <p className="text-xs font-bold" style={{color:t.color}}>{t.label}</p>
                    </div>
                    {/* Bar */}
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.5)'}}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{width:`${Math.max(barW,2)}%`, background:t.color}}/>
                    </div>
                    {/* Amount */}
                    <div className="w-32 flex-shrink-0 text-right">
                      <p className="text-sm font-black text-gray-900">{fmtM(t.v)}</p>
                    </div>
                    {/* Pct badge */}
                    <div className="w-14 flex-shrink-0 text-right">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{background:'rgba(255,255,255,0.7)', color:t.color}}>
                        {p}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* DSO footer */}
            <div className="px-6 py-4 flex items-center gap-6" style={{background:'#F8FAFC', borderTop:'1px solid #F1F5F9'}}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">DSO</span>
                <span className={`text-sm font-black ${dso>40?'text-red-600':'text-green-600'}`}>{dso} días</span>
                <span className="text-xs text-gray-400">/ benchmark &lt;40d</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">% Mora</span>
                <span className={`text-sm font-black ${pMora>20?'text-red-600':'text-green-600'}`}>{pMora}%</span>
                <span className="text-xs text-gray-400">/ benchmark &lt;20%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mora &gt;90d</span>
                <span className="text-sm font-black text-gray-800">{fmtM(m91+m120)}</span>
              </div>
            </div>
          </div>

          {/* Right panel — 1/3 */}
          <div className="flex flex-col gap-4">

            {/* Promesas vencidas */}
            {promVencidas.length > 0 && (
              <div style={{
                background:'white', borderRadius:'16px',
                border:'1px solid #FECACA',
                boxShadow:'0 1px 8px rgba(220,38,38,0.08)',
                overflow:'hidden'
              }}>
                <div className="px-5 py-4 flex items-center gap-3" style={{background:'linear-gradient(135deg,#7f1d1d,#dc2626)', borderBottom:'1px solid rgba(255,255,255,0.1)'}}>
                  <AlertTriangle size={15} className="text-white flex-shrink-0"/>
                  <div>
                    <p className="text-sm font-bold text-white">Promesas Vencidas</p>
                    <p className="text-xs text-red-200">{promVencidas.length} requieren atención inmediata</p>
                  </div>
                </div>
                <div className="p-3 space-y-1.5">
                  {promVencidas.map(p=>(
                    <div key={p.id} className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                      style={{background:'#FEF2F2'}}>
                      <div>
                        <p className="text-xs font-bold text-gray-800">{p.cliente_cod}</p>
                        <p className="text-xs text-red-500 font-medium">{p.fecha_promesa}</p>
                      </div>
                      <p className="text-xs font-black text-red-700">{fmtM(p.monto)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actividad reciente */}
            <div style={{
              background:'white', borderRadius:'16px',
              border:'1px solid #E2E8F0',
              boxShadow:'0 1px 8px rgba(0,0,0,0.06)',
              overflow:'hidden',
              flex: 1
            }}>
              <div className="px-5 py-4" style={{borderBottom:'1px solid #F1F5F9'}}>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'rgba(0,158,227,0.1)'}}>
                    <Activity size={13} style={{color:'#009ee3'}}/>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Actividad Reciente</p>
                    <p className="text-xs text-gray-400">Últimas gestiones del equipo</p>
                  </div>
                </div>
              </div>
              {gestiones.length > 0 ? (
                <div className="p-3 space-y-1.5">
                  {gestiones.map(g => (
                    <div key={g.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{background:'#F8FAFC'}}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                        style={{background:'rgba(0,59,92,0.08)'}}>
                        {tipoIcon[g.tipo] ?? '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{g.cliente_cod}</p>
                        <p className="text-xs text-gray-500 truncate">{g.resultado}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-400 flex-shrink-0">{g.hora?.slice(0,5)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-3xl mb-3">📋</div>
                  <p className="text-sm font-semibold text-gray-400">Sin actividad hoy</p>
                  <p className="text-xs text-gray-300 mt-1">El equipo aún no registra gestiones</p>
                </div>
              )}
            </div>

            {/* Meta mensual */}
            {meta > 0 && (
              <div style={{
                background:'linear-gradient(135deg, #003B5C 0%, #005a8e 100%)',
                borderRadius:'16px',
                overflow:'hidden',
                boxShadow:'0 4px 20px rgba(0,59,92,0.25)'
              }} className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">Meta Mensual</p>
                  <Users size={14} className="text-blue-300"/>
                </div>
                <p className="text-white text-xl font-black mb-4">{fmtM(meta)}</p>
                <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.15)'}}>
                  <div className="h-full rounded-full" style={{width:'0%', background:'#009ee3'}}/>
                </div>
                <p className="text-blue-300 text-xs mt-2">Módulo de pagos pendiente de activar</p>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}

// ── Top bar stat ─────────────────────────────────────────────────────

function Stat({ label, valor, warn }: { label: string; valor: string; warn?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-blue-400 text-xs font-medium">{label}</p>
      <p className={`text-sm font-black ${warn ? 'text-red-400' : 'text-white'}`}>{valor}</p>
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────

function KPICard({label, valor, sub, gradient, textColor, badge, badgeGood, icon}: {
  label: string
  valor: string
  sub: string
  gradient: string
  textColor: string
  badge: string | null
  badgeGood?: boolean
  icon: React.ReactNode
}) {
  return (
    <div style={{
      background: gradient,
      borderRadius: '16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
      overflow: 'hidden',
    }} className="p-5 relative">
      {/* Decorative circle */}
      <div style={{
        position:'absolute', top:'-20px', right:'-20px',
        width:'100px', height:'100px',
        background:'rgba(255,255,255,0.06)',
        borderRadius:'50%'
      }}/>
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p style={{color:'rgba(255,255,255,0.7)', fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em'}}>
            {label}
          </p>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'rgba(255,255,255,0.15)'}}>
            <span style={{color:'rgba(255,255,255,0.9)'}}>{icon}</span>
          </div>
        </div>
        <p style={{
          color: textColor,
          fontSize: valor.length > 10 ? '1.5rem' : '1.9rem',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-0.02em'
        }}>
          {valor}
        </p>
        <div className="flex items-center justify-between mt-2">
          <p style={{color:'rgba(255,255,255,0.6)', fontSize:'11px', fontWeight:500}}>{sub}</p>
          {badge && (
            <span style={{
              background: badgeGood ? 'rgba(74,222,128,0.25)' : 'rgba(255,100,100,0.25)',
              color: badgeGood ? '#86efac' : '#fca5a5',
              fontSize:'10px', fontWeight:700,
              padding:'2px 8px', borderRadius:'20px',
              textTransform:'uppercase', letterSpacing:'0.04em'
            }}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
