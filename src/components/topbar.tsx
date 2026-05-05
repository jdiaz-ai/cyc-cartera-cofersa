'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { Bell, RefreshCw, CheckCheck, ClipboardList, Handshake, AlertTriangle, RefreshCwIcon, Info } from 'lucide-react'
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
  '/reportes':                         { title: 'Reportes',               sub: 'Exportaciones y reportes gerenciales' },
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

// ── Props ─────────────────────────────────────────────────────────

interface TopbarProps {
  notiCount:      number
  fechaCorte?:    string
  notificaciones: Notificacion[]
  usuarioId:      string
}

// ── Componente ────────────────────────────────────────────────────

export default function Topbar({ notiCount, fechaCorte, notificaciones: init, usuarioId }: TopbarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  // Título de página — busca la ruta más específica primero
  const match = Object.entries(PAGE_LABELS)
    .sort((a, b) => b[0].length - a[0].length)   // más específico primero
    .find(([key]) => pathname.startsWith(key))
  const page = match?.[1] ?? { title: 'CYC Cofersa', sub: 'Gestión de Cartera' }

  // ── Estado del dropdown de notificaciones ─────────────────────
  const [open, setOpen]     = useState(false)
  const [notis, setNotis]   = useState<Notificacion[]>(init)
  const panelRef            = useRef<HTMLDivElement>(null)
  const noLeidas            = notis.filter(n => !n.leida).length

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // ── Marcar una como leída ─────────────────────────────────────
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
    if (n.link) { setOpen(false); router.push(n.link) }
  }

  return (
    <header
      className="flex items-center justify-between px-6 flex-shrink-0"
      style={{ height: '52px', background: 'white', borderBottom: '1px solid #E2E8F0' }}
    >
      {/* Título de página */}
      <div>
        <h1 className="font-bold text-gray-900 leading-tight" style={{ fontSize: '15px' }}>
          {page.title}
        </h1>
        <p className="text-gray-400 leading-tight" style={{ fontSize: '11px' }}>
          {page.sub}
        </p>
      </div>

      {/* Derecha: chip de sync + campana */}
      <div className="flex items-center gap-3">
        {/* Chip de sincronización */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-gray-400" style={{ fontSize: '11px' }}>
            {fechaCorte ? `Corte: ${fechaCorte}` : 'Sincronización 3× al día'}
          </span>
          <RefreshCw size={10} className="text-gray-300 ml-0.5" />
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-100" />

        {/* ── Campana con dropdown ───────────────────────────── */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen(v => !v)}
            className="relative flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors"
            style={{ width: '34px', height: '34px', color: open ? '#009ee3' : '#64748b' }}
            title={noLeidas > 0 ? `${noLeidas} notificaciones sin leer` : 'Notificaciones'}
          >
            <Bell size={18} />
            {noLeidas > 0 && (
              <span
                className="absolute top-0 right-0 flex items-center justify-center rounded-full text-white font-black"
                style={{
                  background: '#dc2626',
                  fontSize: '9px',
                  minWidth: '15px',
                  height: '15px',
                  padding: '0 3px',
                  lineHeight: 1,
                }}
              >
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </button>

          {/* Dropdown panel */}
          {open && (
            <div
              className="absolute right-0 mt-2 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{
                width: '340px',
                maxHeight: '480px',
                border: '1px solid #e2e8f0',
                zIndex: 100,
                top: '100%',
              }}
            >
              {/* Header del dropdown */}
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

              {/* Lista */}
              <div className="overflow-y-auto flex-1">
                {notis.length === 0 ? (
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
                  notis.map((n, i) => {
                    const cfg = TIPO_CFG[n.tipo] ?? {
                      icon: <Info size={13} />,
                      color: '#64748b',
                      bg: '#f1f5f9',
                    }
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotiClick(n)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                        style={{
                          borderBottom: i < notis.length - 1 ? '1px solid #f8fafc' : 'none',
                          backgroundColor: n.leida ? 'transparent' : '#f8fbff',
                        }}
                      >
                        {/* Ícono tipo */}
                        <div
                          className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: cfg.bg,
                            color: cfg.color,
                          }}
                        >
                          {cfg.icon}
                        </div>

                        {/* Contenido */}
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[12px] leading-snug"
                            style={{
                              fontWeight: n.leida ? 500 : 700,
                              color: n.leida ? '#64748b' : '#1e293b',
                            }}
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

                        {/* Punto no leído */}
                        {!n.leida && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                            style={{ backgroundColor: '#009ee3' }}
                          />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
