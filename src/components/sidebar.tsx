'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Usuario } from '@/types/database'

type NavItem = {
  label: string
  href: string
  icon: React.ReactNode
  roles: Array<'COORDINADOR' | 'ANALISTA'>
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={18} />,
    roles: ['COORDINADOR'],
  },
  {
    label: 'Mi Cartera',
    href: '/mi-cartera',
    icon: <Package size={18} />,
    roles: ['ANALISTA'],
  },
  {
    label: 'Clientes',
    href: '/clientes',
    icon: <Users size={18} />,
    roles: ['COORDINADOR', 'ANALISTA'],
  },
  {
    label: 'Gestiones',
    href: '/gestiones',
    icon: <ClipboardList size={18} />,
    roles: ['COORDINADOR', 'ANALISTA'],
  },
  {
    label: 'Promesas',
    href: '/promesas',
    icon: <Handshake size={18} />,
    roles: ['COORDINADOR', 'ANALISTA'],
  },
  {
    label: 'Mi Equipo',
    href: '/equipo',
    icon: <UserCheck size={18} />,
    roles: ['COORDINADOR'],
  },
  {
    label: 'Reportes',
    href: '/reportes',
    icon: <BarChart3 size={18} />,
    roles: ['COORDINADOR'],
  },
  {
    label: 'Configuración',
    href: '/configuracion',
    icon: <Settings size={18} />,
    roles: ['COORDINADOR'],
  },
]

interface SidebarProps {
  usuario: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'iniciales' | 'color'> | null
}

export default function Sidebar({ usuario }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const rol = usuario?.rol ?? 'ANALISTA'

  const navFiltrado = NAV_ITEMS.filter((item) => item.roles.includes(rol))

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const iniciales = usuario?.iniciales || usuario?.nombre?.slice(0, 2).toUpperCase() || '??'
  const color = usuario?.color || '#009ee3'

  return (
    <aside
      className="flex flex-col w-64 h-screen flex-shrink-0"
      style={{ backgroundColor: '#003B5C' }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="bg-white rounded-xl px-3 py-2 flex items-center justify-center" style={{minHeight:'52px'}}>
          <Image
            src="/logo-cofersa.png"
            alt="Cofersa"
            width={130}
            height={38}
            priority
            style={{ objectFit: 'contain', maxHeight: '38px', width: 'auto' }}
          />
        </div>
        <p className="text-blue-300 text-xs text-center mt-2 font-semibold tracking-wide uppercase">
          Crédito y Cobro
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {navFiltrado.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-white'
                      : 'text-blue-200 hover:text-white hover:bg-white/10'
                  )}
                  style={isActive ? { backgroundColor: '#009ee3' } : {}}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronRight size={14} className="opacity-70" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Usuario + logout */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">
              {usuario?.nombre || 'Usuario'}
            </p>
            <p className="text-blue-300 text-xs truncate">
              {rol === 'COORDINADOR' ? 'Coordinador' : 'Analista'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut size={16} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
