export type Rol = 'COORDINADOR' | 'ANALISTA'
export type EstadoPromesa = 'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA' | 'ABONO_PARCIAL'
export type NivelScore = 'ROJO' | 'AMARILLO' | 'VERDE'

export interface Usuario {
  id: string
  email: string
  nombre: string
  rol: Rol
  iniciales: string
  color: string
  activo: boolean
  meta_individual: number
  created_at: string
}

export interface Cartera {
  id: number
  contribuyente: string
  cliente_cod: string
  cliente_nombre: string
  vendedor_nombre: string
  no_vencido: number
  mora_1_30: number
  mora_31_60: number
  mora_61_90: number
  mora_91_120: number
  mora_120_plus: number
  total: number
  dias_mora: number
  estado: string
  sync_id: string
  fecha_corte: string
  updated_at: string
}

export interface Factura {
  id: number
  contribuyente: string
  cliente_nombre: string
  documento: string
  fecha_documento: string
  fecha_vencimiento: string
  monto: number
  saldo: number
  sync_id: string
}

export interface MaestroCliente {
  id: number
  contribuyente: string
  cliente_cod: string
  cliente_nombre: string
  vendedor_nombre: string
  analista_email: string
  telefono: string
  correo: string
  segmento: string
  limite_credito: number
  condicion_pago: string
  promedio_dias_pago: number
  desviacion_pago: number
  responde_recordatorio: boolean
  mejor_mes_pago: string
  promesas_cumplidas_pct: number
  ultima_vez_pagado: string
  monto_promedio_pago: number
  score_riesgo: number
  estado_manual: string
  notas_internas: string
  agrupacion: string
  zona: string
  latitud: number
  longitud: number
  updated_at: string
}

export interface Gestion {
  id: string
  cliente_cod: string
  contribuyente: string
  analista_email: string
  fecha: string
  hora: string
  tipo: string
  resultado: string
  nota: string
  promesa_fecha: string
  promesa_monto: number
  created_at: string
}

export interface Promesa {
  id: string
  cliente_cod: string
  contribuyente: string
  analista_email: string
  fecha_creacion: string
  monto: number
  fecha_promesa: string
  estado: EstadoPromesa
  notas: string
  updated_at: string
}

export interface ConfigSistema {
  clave: string
  valor: string
  descripcion: string
}

// Tipo para la base de datos completa (para el cliente Supabase tipado)
export type Database = {
  public: {
    Tables: {
      usuarios: { Row: Usuario; Insert: Partial<Usuario>; Update: Partial<Usuario> }
      cartera: { Row: Cartera; Insert: Partial<Cartera>; Update: Partial<Cartera> }
      facturas: { Row: Factura; Insert: Partial<Factura>; Update: Partial<Factura> }
      maestro_clientes: { Row: MaestroCliente; Insert: Partial<MaestroCliente>; Update: Partial<MaestroCliente> }
      gestiones: { Row: Gestion; Insert: Partial<Gestion>; Update: Partial<Gestion> }
      promesas: { Row: Promesa; Insert: Partial<Promesa>; Update: Partial<Promesa> }
      config_sistema: { Row: ConfigSistema; Insert: Partial<ConfigSistema>; Update: Partial<ConfigSistema> }
    }
  }
}
