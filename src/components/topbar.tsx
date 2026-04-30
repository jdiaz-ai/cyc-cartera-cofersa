'use client'

import { usePathname } from 'next/navigation'
import { Bell, RefreshCw } from 'lucide-react'

const PAGE_LABELS: Record<string, { title: string; sub: string }> = {
  '/dashboard':     { title: 'Dashboard',      sub: 'Resumen ejecutivo de cartera' },
  '/mi-cartera':    { title: 'Mi Cartera',      sub: 'Tu cartera asignada' },
  '/clientes':      { title: 'Clientes',        sub: 'Gestión de clientes' },
  '/gestiones':     { title: 'Gestiones',       sub: 'Registro de cobros' },
  '/promesas':      { title: 'Promesas',        sub: 'Seguimiento de compromisos de pago' },
  '/solicitudes':   { title: 'Solicitudes',     sub: 'Flujo de aprobaciones internas' },
  '/equipo':        { title: 'Mi Equipo',       sub: 'Rendimiento del equipo de cobro' },
  '/reportes':      { title: 'Reportes',        sub: 'Exportaciones y reportes gerenciales' },
  '/configuracion': { title: 'Configuración',   sub: 'Parámetros del sistema' },
}

interface TopbarProps {
  notiCount: number
  fechaCorte?: string
}

export default function Topbar({ notiCount, fechaCorte }: TopbarProps) {
  const pathname = usePathname()
  const match = Object.entries(PAGE_LABELS).find(([key]) => pathname.startsWith(key))
  const page = match?.[1] ?? { title: 'CYC Cofersa', sub: 'Gestión de Cartera' }

  return (
    <header
      className="flex items-center justify-between px-6 flex-shrink-0"
      style={{ height: '52px', background: 'white', borderBottom: '1px solid #E2E8F0' }}
    >
      {/* Título */}
      <div>
        <h1 className="font-bold text-gray-900 leading-tight" style={{ fontSize: '15px' }}>
          {page.title}
        </h1>
        <p className="text-gray-400 leading-tight" style={{ fontSize: '11px' }}>
          {page.sub}
        </p>
      </div>

      {/* Derecha: sync chip + campana */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-gray-400" style={{ fontSize: '11px' }}>
            {fechaCorte ? `Corte: ${fechaCorte}` : 'Sincronización 3× al día'}
          </span>
          <RefreshCw size={10} className="text-gray-300 ml-0.5" />
        </div>
        <div className="hidden sm:block w-px h-5 bg-gray-100" />
        <button
          className="relative flex items-center justify-center rounded-lg hover:bg-gray-50 transition-colors"
          style={{ width: '34px', height: '34px', color: '#64748b' }}
          title={notiCount > 0 ? `${notiCount} notificaciones sin leer` : 'Sin notificaciones'}
        >
          <Bell size={18} />
          {notiCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-black"
              style={{ background: '#dc2626', fontSize: '9px', minWidth: '15px', height: '15px', padding: '0 3px', lineHeight: 1 }}
            >
              {notiCount > 99 ? '99+' : notiCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
