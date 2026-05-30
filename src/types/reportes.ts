// src/types/reportes.ts
// Tipos para el módulo Hub de Reportes

export type RolReporte       = 'COORDINADOR' | 'ANALISTA'
export type FormatoReporte   = 'pantalla' | 'pdf' | 'excel'
export type CategoriaReporte = 'GERENCIA' | 'VENTAS' | 'COBRANZA' | 'CONTROL' | 'ANALISTA'

/** Definición de un reporte en el catálogo central */
export interface ReporteDef {
  id:          string
  titulo:      string
  descripcion: string
  categoria:   CategoriaReporte
  icono:       string              // clave de icono lucide (mapeada en HubGrid)
  roles:       RolReporte[]
  href:        string
  formatos:    FormatoReporte[]
  programable: boolean             // si puede entregarse en envío programado (Fase 2)
  disponible:  boolean             // false → tarjeta "Próximamente", no navega
}

// ── RPC fn_reporte_mora_vendedor ────────────────────────────────────────

export interface MoraVendedorRow {
  vendedor_cod:    string
  vendedor_nombre: string
  supervisor_cod:  string
  total_clientes:  number
  cartera_total:   number
  no_vencido:      number
  mora_1_30:       number
  mora_31_60:      number
  mora_61_90:      number
  mora_91_120:     number
  mora_120_plus:   number
  mora_total:      number
  pct_mora:        number
}

export interface MoraVendedorKPIs {
  cartera_total:    number
  mora_total:       number
  pct_mora:         number
  total_vendedores: number
}

export interface MoraVendedorResult {
  kpis: MoraVendedorKPIs
  rows: MoraVendedorRow[]
}
