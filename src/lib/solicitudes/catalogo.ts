/**
 * CATÁLOGO OFICIAL DE SOLICITUDES — SIC Cofersa
 *
 * Fuente única de verdad. Reemplaza el catálogo anterior basado en
 * "destinatario". Las solicitudes legacy quedan intactas (control de
 * valores en la app; sin CHECK constraint de tipo/estado en la BD).
 *
 * 4 áreas · ~24 tipos · prioridad + SLA por tipo.
 * Responsable fijo en credito_cobro y actualizacion_datos (Jeffrey Díaz).
 */

// ── Tipos base ─────────────────────────────────────────────────────────
export type AreaKey =
  | 'credito_cobro'
  | 'comercial'
  | 'logistica'
  | 'actualizacion_datos'

export type Prioridad = 'Alta' | 'Media' | 'Baja'

export type EstadoSolicitudOficial =
  | 'Pendiente'
  | 'En revisión'
  | 'Pendiente cliente'
  | 'Pendiente tercero'
  | 'Resuelta'
  | 'Cerrada'
  | 'Rechazada'

export const ESTADOS_OFICIALES: EstadoSolicitudOficial[] = [
  'Pendiente',
  'En revisión',
  'Pendiente cliente',
  'Pendiente tercero',
  'Resuelta',
  'Cerrada',
  'Rechazada',
]

// Colores por estado (badge bg/text)
export const ESTADO_CFG: Record<EstadoSolicitudOficial, { bg: string; text: string }> = {
  'Pendiente':         { bg: '#fef9c3', text: '#a16207' },
  'En revisión':       { bg: '#e0f2fe', text: '#0369a1' },
  'Pendiente cliente': { bg: '#ffedd5', text: '#c2410c' },
  'Pendiente tercero': { bg: '#ede9fe', text: '#6d28d9' },
  'Resuelta':          { bg: '#dcfce7', text: '#15803d' },
  'Cerrada':           { bg: '#f1f5f9', text: '#475569' },
  'Rechazada':         { bg: '#fee2e2', text: '#dc2626' },
}

// Colores por prioridad
export const PRIORIDAD_CFG: Record<Prioridad, { bg: string; text: string }> = {
  Alta:  { bg: '#fee2e2', text: '#dc2626' },
  Media: { bg: '#fef9c3', text: '#a16207' },
  Baja:  { bg: '#dcfce7', text: '#15803d' },
}

// ── Definición de áreas ────────────────────────────────────────────────
export interface AreaDef {
  key:            AreaKey
  label:          string
  descripcion:    string
  /** Si existe, el responsable es fijo y no editable libremente */
  responsableFijo?: { nombre: string; email: string }
  color:          string   // acento del área
  bg:             string   // fondo suave del badge
}

const JEFFREY = { nombre: 'Jeffrey Díaz', email: 'jdiaz@cofersa.cr' }

export const AREAS: AreaDef[] = [
  {
    key: 'credito_cobro',
    label: 'Crédito y Cobro',
    descripcion: 'Pagos, desbloqueos, límites, convenios, escalamientos',
    responsableFijo: JEFFREY,
    color: '#009ee3',
    bg: 'rgba(0,158,227,0.12)',
  },
  {
    key: 'comercial',
    label: 'Comercial / Gerentes de Marca',
    descripcion: 'Descuentos, precios, notas de crédito, refacturación',
    color: '#16a34a',
    bg: 'rgba(34,197,94,0.12)',
  },
  {
    key: 'logistica',
    label: 'Logística / Servicio al Cliente',
    descripcion: 'Entregas, devoluciones, garantías, recolecciones',
    color: '#d97706',
    bg: 'rgba(245,158,11,0.12)',
  },
  {
    key: 'actualizacion_datos',
    label: 'Actualización de Datos',
    descripcion: 'Contactos, datos fiscales, corrección en sistema',
    responsableFijo: JEFFREY,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.12)',
  },
]

export const AREA_MAP: Record<AreaKey, AreaDef> =
  Object.fromEntries(AREAS.map(a => [a.key, a])) as Record<AreaKey, AreaDef>

// ── Tipos del catálogo (con prioridad + SLA) ───────────────────────────
export interface TipoSolicitudDef {
  area:      AreaKey
  tipo:      string       // etiqueta legible — también es el valor almacenado
  prioridad: Prioridad
  sla_horas: number
}

export const TIPOS_SOLICITUD: TipoSolicitudDef[] = [
  // ── ÁREA 1: Crédito y Cobro ──────────────────────────────────────────
  { area: 'credito_cobro', tipo: 'Aplicación / Validación de pago',   prioridad: 'Alta',  sla_horas: 4  },
  { area: 'credito_cobro', tipo: 'Desbloqueo temporal de cuenta',     prioridad: 'Alta',  sla_horas: 2  },
  { area: 'credito_cobro', tipo: 'Revisión de límite de crédito',     prioridad: 'Alta',  sla_horas: 24 },
  { area: 'credito_cobro', tipo: 'Convenio de pago',                  prioridad: 'Alta',  sla_horas: 24 },
  { area: 'credito_cobro', tipo: 'Corrección de aplicación de pago',  prioridad: 'Media', sla_horas: 24 },
  { area: 'credito_cobro', tipo: 'Revisión de saldo en disputa',      prioridad: 'Media', sla_horas: 24 },
  { area: 'credito_cobro', tipo: 'Escalamiento caso especial',        prioridad: 'Alta',  sla_horas: 8  },
  { area: 'credito_cobro', tipo: 'Escalamiento a cobro judicial',     prioridad: 'Alta',  sla_horas: 24 },

  // ── ÁREA 2: Comercial ────────────────────────────────────────────────
  { area: 'comercial', tipo: 'Autorización de descuento',            prioridad: 'Alta',  sla_horas: 8  },
  { area: 'comercial', tipo: 'Diferencia de precio en factura',      prioridad: 'Media', sla_horas: 24 },
  { area: 'comercial', tipo: 'Error de facturación',                 prioridad: 'Alta',  sla_horas: 8  },
  { area: 'comercial', tipo: 'Aprobación nota de crédito',           prioridad: 'Alta',  sla_horas: 24 },
  { area: 'comercial', tipo: 'Reclamo por promoción no aplicada',    prioridad: 'Media', sla_horas: 48 },
  { area: 'comercial', tipo: 'Validación de acuerdo comercial',      prioridad: 'Media', sla_horas: 24 },
  { area: 'comercial', tipo: 'Solicitud de refacturación',           prioridad: 'Media', sla_horas: 24 },

  // ── ÁREA 3: Logística ────────────────────────────────────────────────
  { area: 'logistica', tipo: 'Incidencia de entrega',     prioridad: 'Alta',  sla_horas: 24 },
  { area: 'logistica', tipo: 'Mercadería dañada',         prioridad: 'Alta',  sla_horas: 24 },
  { area: 'logistica', tipo: 'Devolución de mercadería',  prioridad: 'Alta',  sla_horas: 48 },
  { area: 'logistica', tipo: 'Garantía de mercadería',    prioridad: 'Media', sla_horas: 72 },
  { area: 'logistica', tipo: 'Reprogramación de entrega', prioridad: 'Media', sla_horas: 24 },
  { area: 'logistica', tipo: 'Recolección de mercadería', prioridad: 'Media', sla_horas: 48 },

  // ── ÁREA 4: Actualización de Datos ───────────────────────────────────
  { area: 'actualizacion_datos', tipo: 'Actualización de contacto',           prioridad: 'Baja',  sla_horas: 24 },
  { area: 'actualizacion_datos', tipo: 'Actualización de datos fiscales',     prioridad: 'Media', sla_horas: 48 },
  { area: 'actualizacion_datos', tipo: 'Corrección de información en sistema', prioridad: 'Media', sla_horas: 24 },
]

// ── Helpers ────────────────────────────────────────────────────────────
export function getTiposPorArea(area: AreaKey | string): TipoSolicitudDef[] {
  return TIPOS_SOLICITUD.filter(t => t.area === area)
}

export function getCatalogoItem(
  area: AreaKey | string,
  tipo: string,
): TipoSolicitudDef | undefined {
  return TIPOS_SOLICITUD.find(t => t.area === area && t.tipo === tipo)
}

export function getResponsableFijo(area: AreaKey | string): { nombre: string; email: string } | null {
  const a = AREA_MAP[area as AreaKey]
  return a?.responsableFijo ?? null
}

export function esAreaValida(area: string): area is AreaKey {
  return area === 'credito_cobro' || area === 'comercial' ||
         area === 'logistica'     || area === 'actualizacion_datos'
}

/** Número legible de solicitud: SIC-XXXXX a partir del UUID */
export function numeroSolicitud(id: string): string {
  // Usa los primeros 5 hex del UUID → entero base 16 acotado a 5 dígitos
  const hex = id.replace(/-/g, '').slice(0, 6)
  const n   = parseInt(hex, 16) % 100000
  return `SIC-${String(n).padStart(5, '0')}`
}

/**
 * Estado del SLA según porcentaje de tiempo restante.
 * verde >50% · amarillo 25-50% · rojo <25% o vencido.
 */
export function slaEstado(
  createdAt: string | null,
  slaVencimiento: string | null,
): { pct: number; nivel: 'verde' | 'amarillo' | 'rojo'; vencido: boolean; restanteMs: number } {
  if (!createdAt || !slaVencimiento) {
    return { pct: 100, nivel: 'verde', vencido: false, restanteMs: 0 }
  }
  const ini = new Date(createdAt).getTime()
  const fin = new Date(slaVencimiento).getTime()
  const now = Date.now()
  const total = Math.max(1, fin - ini)
  const restante = fin - now
  const pct = Math.max(0, Math.min(100, (restante / total) * 100))
  const vencido = now > fin
  const nivel: 'verde' | 'amarillo' | 'rojo' =
    vencido || pct < 25 ? 'rojo' : pct < 50 ? 'amarillo' : 'verde'
  return { pct, nivel, vencido, restanteMs: restante }
}
