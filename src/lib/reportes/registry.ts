// src/lib/reportes/registry.ts
// Catálogo central de reportes (single source of truth del Hub).
// Agregar un reporte nuevo = agregar una entrada acá + su vista.

import type { CategoriaReporte, ReporteDef } from '@/types/reportes'

// ── Metadata de cada categoría (orden + presentación en el Hub) ──────────

export const CATEGORIAS: Record<CategoriaReporte, {
  label:       string
  descripcion: string
  icono:       string
  orden:       number
}> = {
  GERENCIA: { label: 'Gerencia',     descripcion: 'Reportes ejecutivos para dirección',        icono: 'Briefcase',  orden: 1 },
  VENTAS:   { label: 'Ventas',       descripcion: 'Comportamiento comercial por vendedor',      icono: 'TrendingUp', orden: 2 },
  COBRANZA: { label: 'Cobranza',     descripcion: 'Operación de cartera y recuperación',        icono: 'Wallet',     orden: 3 },
  CONTROL:  { label: 'Control',      descripcion: 'Bloqueos y condiciones especiales',          icono: 'ShieldAlert',orden: 4 },
  ANALISTA: { label: 'Mis reportes', descripcion: 'Reportes de tu cartera asignada',            icono: 'UserCog',    orden: 5 },
}

// ── Catálogo de reportes ──────────────────────────────────────────────────

export const REPORTES: ReporteDef[] = [

  // ═══ GERENCIA ═══════════════════════════════════════════════════════════
  {
    id:          'resumen-ejecutivo',
    titulo:      'Resumen Ejecutivo de Cartera',
    descripcion: 'Cartera total, % mora, DSO, tendencia, top deudores y concentración HHI en una página.',
    categoria:   'GERENCIA',
    icono:       'LayoutDashboard',
    roles:       ['COORDINADOR'],
    href:        '/reportes/resumen-ejecutivo',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  true,
  },

  // ═══ VENTAS ═════════════════════════════════════════════════════════════
  {
    id:          'mora-vendedor',
    titulo:      'Mora por Vendedor',
    descripcion: 'Resumen de mora por tramos o detalle de clientes bloqueados, por vendedor. Envío individual a cada vendedor con copia a su supervisor.',
    categoria:   'VENTAS',
    icono:       'Users',
    roles:       ['COORDINADOR'],
    href:        '/reportes/mora-vendedor',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  true,
  },
  {
    id:          'icp-vendedor',
    titulo:      'Comportamiento de Pago por Vendedor',
    descripcion: 'ICP promedio, % pago puntual, días de atraso y clientes críticos por vendedor.',
    categoria:   'VENTAS',
    icono:       'Gauge',
    roles:       ['COORDINADOR'],
    href:        '/reportes/icp-vendedor',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  true,
  },

  // ═══ COBRANZA ═══════════════════════════════════════════════════════════
  {
    id:          'aging-consolidado',
    titulo:      'Aging Consolidado',
    descripcion: 'Antigüedad de la cartera por tramos, consolidado y por analista.',
    categoria:   'COBRANZA',
    icono:       'BarChart3',
    roles:       ['COORDINADOR'],
    href:        '/reportes/aging-consolidado',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  false,
  },
  {
    id:          'recuperacion-diaria',
    titulo:      'Recuperación del Período',
    descripcion: 'Pagos aplicados del día/semana contra mora y metas de recaudo.',
    categoria:   'COBRANZA',
    icono:       'TrendingDown',
    roles:       ['COORDINADOR'],
    href:        '/reportes/recuperacion-diaria',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  false,
  },
  {
    id:          'estados-cuenta',
    titulo:      'Estados de Cuenta',
    descripcion: 'Marcá varios clientes y enviales el estado de cuenta por correo, o descargá un archivo por cada cliente.',
    categoria:   'COBRANZA',
    icono:       'Send',
    roles:       ['COORDINADOR', 'ANALISTA'],
    href:        '/reportes/estados-cuenta',
    formatos:    ['pantalla', 'pdf'],
    programable: false,
    disponible:  true,
  },

  // ═══ CONTROL / GAS (en sección Ventas — se envían a vendedores) ══════════
  {
    id:          'facturas-plazo-especial',
    titulo:      'Facturas con Plazo Especial',
    descripcion: 'Facturas con condición de pago especial y su estado de vencimiento. Envío al vendedor con copia al supervisor.',
    categoria:   'VENTAS',
    icono:       'CalendarClock',
    roles:       ['COORDINADOR'],
    href:        '/reportes/facturas-plazo-especial',
    formatos:    ['pantalla', 'pdf', 'excel'],
    programable: true,
    disponible:  false,
  },

  // ═══ ANALISTA (reportes simples — ya existían) ════════════════════════════
  {
    id:          'cartera-vencida',
    titulo:      'Cartera Vencida',
    descripcion: 'Clientes de tu cartera con mora activa y días sin gestión.',
    categoria:   'ANALISTA',
    icono:       'AlertTriangle',
    roles:       ['ANALISTA'],
    href:        '/reportes/cartera-vencida',
    formatos:    ['pantalla', 'excel'],
    programable: false,
    disponible:  true,
  },
  {
    id:          'gestiones-periodo',
    titulo:      'Gestiones del Período',
    descripcion: 'Tu actividad de cobro por rango de fechas, con tasa de éxito.',
    categoria:   'ANALISTA',
    icono:       'CalendarRange',
    roles:       ['ANALISTA'],
    href:        '/reportes/gestiones-periodo',
    formatos:    ['pantalla', 'pdf'],
    programable: false,
    disponible:  true,
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────

/** Reportes visibles para un rol dado */
export function reportesPorRol(rol: 'COORDINADOR' | 'ANALISTA'): ReporteDef[] {
  return REPORTES.filter(r => r.roles.includes(rol))
}

/** Reporte por id */
export function reportePorId(id: string): ReporteDef | undefined {
  return REPORTES.find(r => r.id === id)
}
