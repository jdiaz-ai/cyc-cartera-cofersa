'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import {
  Bell, CheckCheck, ClipboardList, Handshake,
  AlertTriangle, RefreshCwIcon, Info, ChevronDown, User, LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Notificacion, TipoNotif } from '@/types/database'

// ── Etiquetas de página ────────────────────────────────────────────
const PAGE_LABELS: Record<string, { title: string; sub: string }> = {
  '/dashboard':                        { title: 'Dashboard',              sub: 'Resumen ejecutivo de cartera' },
  '/mi-cartera':                       { title: 'Mi Cartera',             sub: 'Tu cartera asignada' },
  '/clientes':                         { title: 'Clientes',               sub: 'Gestión de clientes' },
  '/gestiones':                        { title: 'Gestiones',              sub: 'Registro de cobros' },
  '/promesas':                         { title: 'Promesas',               sub: 'Seguimiento de compromisos de pago' },
  '/solicitudes':                      { title: 'Solicitudes',            sub: 'Flujo de aprobaciones internas' },
  '/equipo':                           { title: 'Mi Equipo',              sub: 'Rendimiento del equipo de cobro' },
  '/reportes/presupuesto':             { title: 'Presupuesto de Cobro',   sub: 'Metas de recaudo asignadas' },
  '/reportes/cartera-vencida':         { title: 'Cartera Vencida',        sub: 'Clientes con mora activa' },
  '/reportes/gestiones-periodo':       { title: 'Gestiones del Período',  sub: 'Actividad de cobro por rango de fechas' },
  '/reportes/resumen-ejecutivo':       { title: 'Resumen Ejecutivo',      sub: 'Cartera, mora, DSO y concentración' },
  '/reportes/mora-vendedor':           { title: 'Mora por Vendedor',      sub: 'Antigüedad de saldos por vendedor' },
  '/reportes/estados-cuenta':          { title: 'Estados de Cuenta',      sub: 'Enviar o descargar estados de cuenta por cliente' },
  '/reportes/icp-vendedor':            { title: 'Comportamiento por Vendedor', sub: 'ICP y puntualidad de pago por vendedor' },
  '/reportes':                         { title: 'Hub de Reportes',        sub: 'Reportes operativos, comerciales y ejecutivos' },
  '/configuracion':                    { title: 'Configuración',          sub: 'Parámetros del sistema' },
  '/gestion-pagos/pagos-aplicados':    { title: 'Pagos Aplicados',        sub: 'Historial de pagos confirmados' },
  '/gestion-pagos/pagos-pendientes':   { title: 'Pagos Pendientes',       sub: 'Compromisos aún no confirmados' },
  '/gestion-pagos/analisis':           { title: 'Análisis de Pagos',      sub: 'Tendencias y comportamiento de pago' },
}

// ── Config visual por tipo de notificación ────────────────────────
const TIPO_CFG: Record<TipoNotif, { icon: React.ReactNode; color: string; bg: string }> = {
  SOLICITUD: { icon: <ClipboardList  size={13} />, color: '#009ee3', bg: '#e0f2fe' },
  PROMESA:   { icon: <Handshake      size={13} />, color: '#f59e0b', bg: '#fef9c3' },
  ALERTA:    { icon: <AlertTriangle  size={13} />, color: '#dc2626', bg: '#fee2e2' },
  SYNC:      { icon: <RefreshCwIcon  size={13} />, color: '#22c55e', bg: '#dcfce7' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `hace ${hrs}h`
  return `hace ${Math.floor(hrs / 24)}d`
}

// ── Trunca nombre a "Nombre Apellido" (máx 2 palabras) ────────────
function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  return partes.slice(0, 2).join(' ')
}

// ── Formatea ISO UTC → "DD/MM/YYYY · H:MM AM/PM" en hora CR (UTC-6) ──
function fmtSync(iso: string): string {
  const d  = new Date(new Date(iso).getTime() - 6 * 60 * 60 * 1000)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = d.getUTCFullYear()
  const h  = d.getUTCHours()
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} · ${h % 12 || 12}:${mi} ${h >= 12 ? 'PM' : 'AM'}`
}

// ── Props ─────────────────────────────────────────────────────────
interface TopbarProps {
  notiCount:      number
  ultimaSync?:    string   // ISO UTC — updated_at más reciente de cartera
  notificaciones: Notificacion[]
  usuarioId:      string
  // Chip de usuario
  nombre:         string
  iniciales:      string
  color:          string
  avatarUrl?:     string | null
}

// ── Componente ────────────────────────────────────────────────────
export default function Topbar({
  // notiCount ya no se usa: el conteo se recalcula desde `notis` localmente
  ultimaSync,
  notificaciones: init,
  usuarioId,
  nombre,
  iniciales,
  color,
  avatarUrl,
}: TopbarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  // Título de página — busca la ruta más específica primero
  const match = Object.entries(PAGE_LABELS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => pathname.startsWith(key))
  const page = match?.[1] ?? { title: 'SIC', sub: 'Sistema Inteligente de Cobranza' }

  // ── Estado: dropdown notificaciones ──────────────────────────
  const [notiOpen, setNotiOpen] = useState(false)
  const [notis, setNotis]       = useState<Notificacion[]>(init)
  const notiRef                 = useRef<HTMLDivElement>(null)
  const noLeidas                = notis.filter(n => !n.leida).length

  // Tab activo para filtrar notificaciones
  type TabNotif = 'todas' | TipoNotif
  const [tabNotif, setTabNotif] = useState<TabNotif>('todas')

  // Notificaciones filtradas según tab activo
  const notisFiltradas = tabNotif === 'todas'
    ? notis
    : notis.filter(n => n.tipo === tabNotif)

  // ── Estado: dropdown usuario ──────────────────────────────────
  const [userOpen, setUserOpen] = useState(false)
  const userRef                 = useRef<HTMLDivElement>(null)

  // ── Estado: error de avatar ───────────────────────────────────
  const [avatarErr, setAvatarErr] = useState(false)

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notiRef.current && !notiRef.current.contains(e.target as Node)) setNotiOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Suscripción Realtime: nuevas notificaciones llegan en vivo ────
  useEffect(() => {
    if (!usuarioId) return

    const supabase = createClient()
    const channel  = supabase
      .channel(`notificaciones:${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notificaciones',
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          setNotis(prev => [payload.new as Notificacion, ...prev])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuarioId])

  // ── Marcar una notificación como leída ────────────────────────
  async function marcarLeida(id: string) {
    setNotis(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notificaciones').update({ leida: true }).eq('id', id)
  }

  // ── Marcar todas como leídas ──────────────────────────────────
  async function marcarTodas() {
    setNotis(prev => prev.map(n => ({ ...n, leida: true })))
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('notificaciones')
      .update({ leida: true })
      .eq('usuario_id', usuarioId)
      .eq('leida', false)
  }

  // ── Click en notificación ─────────────────────────────────────
  async function handleNotiClick(n: Notificacion) {
    if (!n.leida) await marcarLeida(n.id)
    if (n.link) { setNotiOpen(false); router.push(n.link) }
  }

  // ── Cerrar sesión ─────────────────────────────────────────────
  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Determinar si mostrar foto o iniciales
  const showAvatar = Boolean(avatarUrl) && !avatarErr

  return (
    <header
      className="flex items-center justify-between px-6 flex-shrink-0"
      style={{ height: '52px', background: 'white', borderBottom: '1px solid #E2E8F0' }}
    >
      {/* ── Título de página ─────────────────────────────────── */}
      <div>
        <h1 className="font-bold text-gray-900 leading-tight" style={{ fontSize: '18px' }}>
          {page.title}
        </h1>
        <p className="text-gray-400 leading-tight" style={{ fontSize: '12px' }}>
          {page.sub}
        </p>
      </div>

      {/* ── Derecha ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3">

        {/* Chip de sincronización */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-lg px-2.5 py-1"
          style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
          title="Última sincronización con Softland"
        >
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#16a34a' }} />
          <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
            {ultimaSync ? fmtSync(ultimaSync) : 'Sin datos aún'}
          </span>
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-100" />

        {/* ── Campana de notificaciones ────────────────────── */}
        <div className="relative" ref={notiRef}>
          <button
            onClick={() => { setNotiOpen(v => !v); setUserOpen(false) }}
            className="relative flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors"
            style={{ width: '34px', height: '34px', color: notiOpen ? '#009ee3' : '#64748b' }}
            title={noLeidas > 0 ? `${noLeidas} notificaciones sin leer` : 'Notificaciones'}
          >
            <Bell size={18} />
            {noLeidas > 0 && (
              <span
                className="absolute top-0 right-0 flex items-center justify-center rounded-full text-white font-black"
                style={{
                  background: '#dc2626',
                  fontSize:   '9px',
                  minWidth:   '15px',
                  height:     '15px',
                  padding:    '0 3px',
                  lineHeight: 1,
                }}
              >
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </button>

          {/* Dropdown notificaciones */}
          {notiOpen && (
            <div
              className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{
                width:     '340px',
                maxHeight: '480px',
                border:    '1px solid #e2e8f0',
                zIndex:    100,
                top:       '100%',
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{ borderBottom: '1px solid #f1f5f9' }}
              >
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-gray-500" />
                  <span className="text-sm font-bold text-gray-800">Notificaciones</span>
                  {noLeidas > 0 && (
                    <span
                      className="text-[10px] font-black rounded-full px-1.5 py-0.5"
                      style={{ backgroundColor: '#dc2626', color: 'white' }}
                    >
                      {noLeidas}
                    </span>
                  )}
                </div>
                {noLeidas > 0 && (
                  <button
                    onClick={marcarTodas}
                    className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition"
                  >
                    <CheckCheck size={12} />
                    Marcar todo
                  </button>
                )}
              </div>

              {/* Tabs de filtro */}
              <div className="flex gap-1 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #f1f5f9' }}>
                {(
                  [
                    { key: 'todas',     label: 'Todas'       },
                    { key: 'PROMESA',   label: 'Promesas'    },
                    { key: 'ALERTA',    label: 'Alertas'     },
                    { key: 'SOLICITUD', label: 'Solicitudes' },
                  ] as { key: TabNotif; label: string }[]
                ).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTabNotif(t.key)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                    style={{
                      background: tabNotif === t.key ? 'rgba(0,158,227,0.12)' : 'transparent',
                      color:      tabNotif === t.key ? '#009ee3'              : '#94a3b8',
                    }}
                  >
                    {t.label}
                    {t.key !== 'todas' && (
                      <span className="ml-1" style={{ opacity: 0.7 }}>
                        {notis.filter(n => n.tipo === t.key && !n.leida).length || ''}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1">
                {notisFiltradas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
                      style={{ backgroundColor: '#f1f5f9' }}
                    >
                      <Bell size={18} className="text-gray-300" />
                    </div>
                    <p className="text-[13px] font-semibold text-gray-500">Sin notificaciones nuevas</p>
                    <p className="text-[11px] text-gray-400 mt-1">Todo al día por ahora.</p>
                  </div>
                ) : (
                  notisFiltradas.map((n, i) => {
                    const cfg = TIPO_CFG[n.tipo] ?? {
                      icon: <Info size={13} />, color: '#64748b', bg: '#f1f5f9',
                    }
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotiClick(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                        style={{
                          borderBottom:    i < notisFiltradas.length - 1 ? '1px solid #f8fafc' : 'none',
                          backgroundColor: n.leida ? 'transparent' : '#f8fbff',
                        }}
                      >
                        <div
                          className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                          style={{ width: '28px', height: '28px', backgroundColor: cfg.bg, color: cfg.color }}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[12px] leading-snug"
                            style={{ fontWeight: n.leida ? 500 : 700, color: n.leida ? '#64748b' : '#1e293b' }}
                          >
                            {n.titulo}
                          </p>
                          {n.mensaje && (
                            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
                              {n.mensaje}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-300 mt-1 font-medium">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        {!n.leida && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#009ee3' }} />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="w-px h-5 bg-gray-100" />

        {/* ── Chip de usuario ──────────────────────────────── */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => { setUserOpen(v => !v); setNotiOpen(false) }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-gray-50"
            style={{ border: '1px solid #E2E8F0' }}
          >
            {/* Avatar */}
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl!}
                alt={nombre}
                onError={() => setAvatarErr(true)}
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                style={{ width: '28px', height: '28px', backgroundColor: color, fontSize: '11px' }}
              >
                {iniciales}
              </div>
            )}

            {/* Nombre */}
            <span
              className="hidden sm:block font-semibold text-gray-700 leading-none"
              style={{ fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {nombreCorto(nombre)}
            </span>

            {/* Chevron */}
            <ChevronDown
              size={13}
              className="text-gray-400 flex-shrink-0 transition-transform"
              style={{ transform: userOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown usuario */}
          {userOpen && (
            <div
              className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl overflow-hidden"
              style={{
                width:   '180px',
                border:  '1px solid #e2e8f0',
                zIndex:  100,
                top:     '100%',
              }}
            >
              {/* Cabecera del dropdown */}
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <p className="text-[12px] font-bold text-gray-800 truncate">{nombre}</p>
              </div>

              {/* Mi perfil (sin funcionalidad por ahora) */}
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                style={{ color: '#374151', fontSize: '13px' }}
                onClick={() => setUserOpen(false)}
              >
                <User size={14} className="text-gray-400 flex-shrink-0" />
                <span className="font-medium">Mi perfil</span>
              </button>

              <div style={{ height: '1px', background: '#f1f5f9' }} />

              {/* Cerrar sesión */}
              <button
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-red-50"
                style={{ color: '#dc2626', fontSize: '13px' }}
                onClick={handleLogout}
              >
                <LogOut size={14} className="flex-shrink-0" />
                <span className="font-medium">Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}
