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

// ── fn_reporte_bloqueados ────────────────────────────────────────────────

export interface BloqueadoCliente {
  cliente_cod:   string
  cliente_nombre:string
  no_vencido:    number
  m1_30:         number
  m31_60:        number
  m61_90:        number
  m91_120:       number
  m120:          number
  total:         number
  saldo_vencido: number
  semanas:       number
  es_nuevo:      boolean
}

export interface BloqueadosVendedor {
  vendedor_cod:    string
  vendedor_nombre: string
  supervisor_cod:  string | null
  vendedor_email:  string | null
  supervisor_email:string | null
  analistas_email: string[]
  n_clientes:      number
  saldo_vencido:   number
  criticos_120:    number
  clientes:        BloqueadoCliente[]
}

export interface BloqueadosGerencial {
  vendedor_nombre: string
  n_clientes:      number
  saldo_vencido:   number
  criticos_120:    number
}

export interface BloqueadosEscalacion {
  cliente_cod:    string
  cliente_nombre: string
  vendedor_nombre:string
  semanas:        number
  saldo_vencido:  number
}

export interface BloqueadosResult {
  kpis: {
    total_bloqueados:    number
    saldo_vencido_total: number
    criticos_120:        number
    total_vendedores:    number
    fecha_semana:        string
  }
  vendedores: BloqueadosVendedor[]
  gerencial:  BloqueadosGerencial[]
  escalacion: BloqueadosEscalacion[]
}

// ── fn_reporte_plazo_especial ────────────────────────────────────────────

export interface PlazoEspecialFactura {
  documento:         string
  cliente_nombre:    string
  contribuyente:     string
  fecha_emision:     string
  fecha_vencimiento: string
  plazo_factura:     number
  plazo_cliente:     number
  monto:             number
  saldo:             number
  dias_a_vencer:     number
  vencida:           boolean
}

export interface PlazoEspecialVendedor {
  vendedor_cod:    string
  vendedor_nombre: string
  supervisor_cod:  string | null
  vendedor_email:  string | null
  supervisor_email:string | null
  analistas_email: string[]
  n_facturas:      number
  vencidas:        number
  saldo_total:     number
  facturas:        PlazoEspecialFactura[]
}

export interface PlazoEspecialResult {
  kpis: {
    total_facturas:   number
    saldo_total:      number
    vencidas:         number
    total_vendedores: number
  }
  vendedores: PlazoEspecialVendedor[]
}
