'use client'

import Link from 'next/link'
import { usePathname }  from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Handshake,
  UserCheck,
  BarChart3,
  Settings,
  Package,
  FileText,
  PieChart,
  Target,
  AlertTriangle,
  CalendarRange,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Usuario, Notificacion } from '@/types/database'
import TipoCambio from '@/components/tipo-cambio'

// ── Tipos ─────────────────────────────────────────────────────────

type Rol = 'COORDINADOR' | 'ANALISTA'

export interface BadgeCounts {
  gestionesHoy?: number
  promesasVencidas?: number
  solicitudesPendientes?: number
}

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: Rol[]
  badgeKey?: keyof BadgeCounts
  exactMatch?: boolean
}

interface NavSection {
  label: string | null
  roles: Rol[]
  items: NavItem[]
}

// ── Navegación ────────────────────────────────────────────────────

const NAV_SECTIONS: NavSection[] = [
  // ── Raíz COORDINADOR ─────────────────────────────────────────
  {
    label: null,
    roles: ['COORDINADOR'],
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard size={16} />,
        roles: ['COORDINADOR'],
        exactMatch: true,
      },
    ],
  },

  // ── Raíz ANALISTA — Dashboard + Mi Cartera ───────────────────
  {
    label: null,
    roles: ['ANALISTA'],
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard size={16} />,
        roles: ['ANALISTA'],
        exactMatch: true,
      },
      {
        label: 'Mi Cartera',
        href: '/mi-cartera',
        icon: <Package size={16} />,
        roles: ['ANALISTA'],
        exactMatch: true,
      },
    ],
  },

  // ── GESTIÓN (coordinador) ─────────────────────────────────────
  {
    label: 'Gestión',
    roles: ['COORDINADOR'],
    items: [
      {
        label: 'Clientes',
        href: '/clientes',
        icon: <Users size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Gestiones',
        href: '/gestiones',
        icon: <ClipboardList size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Promesas',
        href: '/promesas',
        icon: <Handshake size={16} />,
        roles: ['COORDINADOR'],
      },
      {
        label: 'Solicitudes',
        href: '/solicitudes',
        icon: <FileText size={16} />,
        roles: ['COORDINADOR'],
      },
    ],
  },

  // ── GESTIÓN DE CARTERA (analista) ────────────────────────────
  {
    label: 'Gestión de Cartera',
    roles: ['ANALISTA'],
    items: [
      {
        label: 'Clientes',
        href: '/clientes',
        icon: <Users size={16} />,
        roles: ['ANALISTA'],
      },
      {
        label: 'Gestiones',
        href: '/gestiones',
        icon: <ClipboardList size={16} />,
        roles: ['ANALISTA'],
        badgeKey: 'gestionesHoy',
      },
      {
        label: 'Promesas',
        href: '/promesas',
        icon: <Handshake size={16} />,
        roles: ['ANALISTA'],
        badgeKey: 'promesasVencidas',
      },
      {
        label: 'Solicitudes',
        href: '/solicitudes',
        icon: <FileText size={16} />,
        roles: ['ANALISTA'],
        badgeKey: 'solicitudesPendientes',
      },
    ],
  },

  // ── INTELIGENCIA (analista) — renombrado desde Reportes, + Análisis de Pagos ──
  {
    label: 'Inteligencia',
    roles: ['ANALISTA'],
    items: [
      {
        label: 'Presupuesto de Cobro',
        href: '/reportes/presupuesto',
        icon: <Target size={16} />,
        roles: ['ANALISTA'],
      },
      {
        label: 'Cartera Vencida',
        href: '/reportes/cartera-vencida',
        icon: <AlertTriangle size={16} />,
        roles: ['ANALISTA'],
      },
      {
        label: 'Gestiones del Período',
        href: '/reportes/gestiones-periodo',
        icon: <CalendarRange size={16} />,
        roles: ['ANALISTA'],
      },
      {
        label: 'Análisis de Pagos',
        href: '/gestion-pagos/analisis',
        icon: <PieChart size={16} />,
        roles: ['ANALISTA'],
      },
    ],
  },

  // ── ADMINISTRACIÓN (coordinador) ─────────────────────────────
  {
    label: 'Administración',
    roles: ['COORDINADOR'],
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
        exactMatch: true,
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

// ── Badge inline ──────────────────────────────────────────────────

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="flex items-center justify-center rounded-full text-white font-bold ml-auto flex-shrink-0"
      style={{
        background: '#dc2626',
        fontSize: '9px',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        lineHeight: 1,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ── Props ─────────────────────────────────────────────────────────

interface SidebarProps {
  usuario: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'iniciales' | 'color'> | null
  notificaciones: Notificacion[]
  usuarioId: string
  badgeCounts?: BadgeCounts
}

// ── Componente ────────────────────────────────────────────────────

export default function Sidebar({
  usuario,
  badgeCounts = {},
}: SidebarProps) {
  const pathname = usePathname()
  const rol: Rol = (usuario?.rol as Rol) ?? 'ANALISTA'

  const seccionesFiltradas = NAV_SECTIONS.filter(s => s.roles.includes(rol))

  return (
    <aside
      className="flex flex-col flex-shrink-0 h-screen"
      style={{ width: '210px', backgroundColor: '#003B5C' }}
    >
      {/* ── Header: logo + identidad SIC ──────────────────────── */}
      <div className="px-3 pt-4 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {/* FILA 1 — Logo Cofersa rectangular */}
        <div className="flex justify-center">
          <div
            role="img"
            aria-label="Cofersa"
            style={{
              width: '130px',
              height: '40px',
              borderRadius: '10px',
              backgroundImage: "url('/logo-cofersa.png')",
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundColor: 'white',
              padding: '4px 10px',
            }}
          />
        </div>

        {/* FILA 2 — SIC | Powered by Cofersa */}
        <div className="flex items-center justify-center mt-3" style={{ gap: '6px' }}>
          <span style={{ color: '#009ee3', fontWeight: 700, fontSize: '15px', lineHeight: 1 }}>
            SIC
          </span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400, fontSize: '13px', lineHeight: 1 }}>
            |
          </span>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400, fontSize: '10px', letterSpacing: '0.06em' }}>
            Powered by Cofersa
          </span>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {seccionesFiltradas.map((section, si) => {
          const itemsFiltrados = section.items.filter(item => item.roles.includes(rol))
          if (itemsFiltrados.length === 0) return null

          return (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.label && (
                <p
                  className="px-3 mb-1 font-bold uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', letterSpacing: '0.1em' }}
                >
                  {section.label}
                </p>
              )}

              <ul className="space-y-0.5">
                {itemsFiltrados.map(item => {
                  const isActive = item.exactMatch
                    ? pathname === item.href
                    : pathname.startsWith(item.href)

                  const badgeCount = item.badgeKey ? (badgeCounts[item.badgeKey] ?? 0) : 0

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
                        <NavBadge count={badgeCount} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* ── Widget Tipo de Cambio BCCR — pegado al fondo ────── */}
      <div style={{ marginTop: 'auto' }}>
        <TipoCambio />
      </div>

    </aside>
  )
}
