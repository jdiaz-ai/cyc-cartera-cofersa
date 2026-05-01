'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Handshake,
  UserCheck,
  BarChart3,
  Settings,
  Package,
  LogOut,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Usuario, Notificacion } from '@/types/database'
import PanelNotificaciones from '@/components/notificaciones/panel-notificaciones'

// ── Tipos ─────────────────────────────────────────────────────────

type Rol = 'COORDINADOR' | 'ANALISTA'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: Rol[]
}

interface NavSection {
  label: string | null   // null = sin encabezado de sección
  items: NavItem[]
}

// ── Navegación agrupada por sección ──────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Mi Cartera',
        href: '/mi-cartera',
        icon: <Package size={16} />,
        roles: ['ANALISTA'],
      },
    ],
  },
  {
    label: 'Gestión',
    items: [
      {
        label: 'Clientes',
        href: '/clientes',
        icon: <Users size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Gestiones',
        href: '/gestiones',
        icon: <ClipboardList size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Promesas',
        href: '/promesas',
        icon: <Handshake size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
      {
        label: 'Solicitudes',
        href: '/solicitudes',
        icon: <ClipboardList size={16} />,
        roles: ['COORDINADOR', 'ANALISTA'],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Mi Equipo',
        href: '/equipo',
        icon: <UserCheck size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Reportes',
        href: '/reportes',
        icon: <BarChart3 size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Configuración',
        href: '/configuracion',
        icon: <Settings size={16} />,
        roles: ['COORDINADOR'],
      },
    ],
  },
]

// ── Props ─────────────────────────────────────────────────────────

interface SidebarProps {
  usuario: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'iniciales' | 'color'> | null
  notiCount: number
  notificaciones: Notificacion[]
  usuarioId: string
}

// ── Componente ────────────────────────────────────────────────────

export default function Sidebar({ usuario, notiCount, notificaciones, usuarioId }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const rol: Rol = (usuario?.rol as Rol) ?? 'ANALISTA'
  const [panelOpen, setPanelOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciales = usuario?.iniciales || usuario?.nombre?.slice(0, 2).toUpperCase() || '??'
  const color = usuario?.color || '#009ee3'

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-screen"
      style={{ width: '210px', backgroundColor: '#003B5C' }}
    >
      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {/* background-image en lugar de <img> para recortar el whitespace del PNG */}
        <div
          className="rounded-xl"
          role="img"
          aria-label="Cofersa"
          style={{
            width: '100%',
            height: '68px',
            backgroundImage: "url('/logo-cofersa.png')",
            backgroundSize: '125% auto',
            backgroundPosition: '50% center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'white',
          }}
        />
        <p
          className="text-center mt-2 font-bold uppercase tracking-widest"
          style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '0.12em' }}
        >
          Crédito y Cobro
        </p>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_SECTIONS.map((section, si) => {
          // Filtrar items por rol
          const itemsFiltrados = section.items.filter((item) =>
            item.roles.includes(rol)
          )
          if (itemsFiltrados.length === 0) return null

          return (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {/* Encabezado de sección */}
              {section.label && (
                <p
                  className="px-3 mb-1 font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', letterSpacing: '0.1em' }}
                >
                  {section.label}
                </p>
              )}

              {/* Items */}
              <ul className="space-y-0.5">
                {itemsFiltrados.map((item) => {
                  const isActive =
                    item.href === '/dashboard' || item.href === '/mi-cartera'
                      ? pathname === item.href
                      : pathname.startsWith(item.href)

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                          isActive
                            ? 'text-white'
                            : 'text-blue-200 hover:text-white hover:bg-white/10'
                        )}
                        style={
                          isActive
                            ? { backgroundColor: '#009ee3', fontSize: '13px' }
                            : { fontSize: '13px' }
                        }
                      >
                        <span className="flex-shrink-0">{item.icon}</span>
                        <span className="flex-1 leading-none">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* ── Footer: notificaciones + usuario + logout ─────────── */}
      <div
        className="px-2 pb-3 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Notificaciones */}
        <button
          onClick={() => setPanelOpen(true)}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 mb-1 transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}
        >
          <div className="relative flex-shrink-0">
            <Bell size={16} />
            {notiCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-white font-bold"
                style={{
                  background: '#dc2626',
                  fontSize: '9px',
                  minWidth: '14px',
                  height: '14px',
                  padding: '0 3px',
                  lineHeight: 1,
                }}
              >
                {notiCount > 99 ? '99+' : notiCount}
              </span>
            )}
          </div>
          <span className="flex-1 text-left font-semibold">Notificaciones</span>
          {notiCount === 0 && (
            <span
              className="text-xs rounded-full px-1.5 py-0.5 font-medium"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontSize: '10px' }}
            >
              0
            </span>
          )}
        </button>

        {/* Usuario */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1">
          <div
            className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
            style={{
              backgroundColor: color,
              width: '28px',
              height: '28px',
              fontSize: '11px',
            }}
          >
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-bold truncate leading-tight"
              style={{ color: 'white', fontSize: '12px' }}
            >
              {usuario?.nombre || 'Usuario'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px' }}>
              {rol === 'COORDINADOR' ? 'Coordinador' : 'Analista'}
            </p>
          </div>
        </div>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}
        >
          <LogOut size={15} className="flex-shrink-0" />
          <span className="font-semibold">Cerrar sesión</span>
        </button>
      </div>

      {/* Panel de notificaciones */}
      {panelOpen && (
        <PanelNotificaciones
          notificaciones={notificaciones}
          usuarioId={usuarioId}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </aside>
  )
}
