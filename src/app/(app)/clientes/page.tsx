import { createClient } from '@/lib/supabase/server'
import { hoyISO } from '@/lib/utils/formato'
import TablaClientes from '@/components/clientes/tabla-clientes'
import type { Cartera, MaestroCliente } from '@/types/database'

// ── Tipos exportados (usados por TablaClientes) ───────────────────────
export interface ClienteRow {
  cliente_cod: string
  cliente_nombre: string
  contribuyente: string
  vendedor_nombre: string
  analista_email: string
  analista_nombre?: string
  no_vencido: number
  mora_1_30: number
  mora_31_60: number
  mora_61_90: number
  mora_91_120: number
  mora_120_plus: number
  mora_total: number
  total: number
  ultima_gestion_fecha: string | null
  dias_sin_gestion: number
}

export interface AnalistaOpt {
  email: string
  nombre: string
}

export interface VendedorOpt {
  nombre: string
}

// ── Página ────────────────────────────────────────────────────────────
export default async function ClientesPage() {
  const supabase    = await createClient()
  const hoy         = hoyISO()

  // Detectar rol
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).single()
  const rolUsuario = ((usuarioRow as { rol: string } | null)?.rol ?? 'ANALISTA') as 'COORDINADOR' | 'ANALISTA'
  const esCoordinador = rolUsuario === 'COORDINADOR'

  // ── 1. Determinar qué códigos de cliente mostrar ───────────────────
  let codigosFiltro: string[] | null = null   // null = todos (coordinador)

  if (!esCoordinador) {
    const { data: misClientes } = await supabase
      .from('maestro_clientes')
      .select('cliente_cod')
      .eq('analista_email', userEmail)
    const codigos = ((misClientes ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
      .map(c => c.cliente_cod)
    if (codigos.length === 0) {
      return <TablaClientes rows={[]} esCoordinador={false} analistas={[]} vendedores={[]} userEmail={userEmail} />
    }
    codigosFiltro = codigos
  }

  // ── 2. Sync más reciente ────────────────────────────────────────────
  // El GAS solo sincroniza los clientes presentes en el reporte de Softland.
  // Cuando un cliente paga y desaparece del reporte, su registro viejo persiste
  // en Supabase. Filtrando por el sync_id más reciente garantizamos mostrar
  // únicamente el estado actual de la cartera.
  const { data: syncRefData } = await supabase
    .from('cartera')
    .select('sync_id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestSyncId = ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // ── 3. Fetch cartera — solo del sync más reciente ──────────────────
  let carteraQuery = supabase.from('cartera').select('*')
  if (latestSyncId) carteraQuery = carteraQuery.eq('sync_id', latestSyncId)
  if (codigosFiltro) carteraQuery = carteraQuery.in('cliente_cod', codigosFiltro)
  const { data: carteraRaw } = await carteraQuery

  // Deduplicar por cliente_cod: en caso de registros múltiples, tomar el más reciente
  const carteraMapDedup: Record<string, Cartera> = {}
  ;((carteraRaw ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMapDedup[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMapDedup[c.cliente_cod] = c
    }
  })
  const cartera = Object.values(carteraMapDedup)

  // ── 4. Mapa analista_email por cliente (desde maestro_clientes) ────
  const codsEnCartera = cartera.map(c => c.cliente_cod)
  const analistaMap: Record<string, string> = {}

  if (codsEnCartera.length > 0) {
    const { data: maestro } = await supabase
      .from('maestro_clientes')
      .select('cliente_cod, analista_email')
      .in('cliente_cod', codsEnCartera)
    ;((maestro ?? []) as Pick<MaestroCliente, 'cliente_cod' | 'analista_email'>[])
      .forEach(m => { analistaMap[m.cliente_cod] = m.analista_email ?? '' })
  }

  // ── 5. Última gestión por cliente ──────────────────────────────────
  //    Fetch ordenado desc → primera aparición de cada cod = la más reciente
  const ultimaGestionMap: Record<string, string> = {}
  {
    let gQuery = supabase
      .from('gestiones')
      .select('cliente_cod, fecha')
      .order('fecha', { ascending: false })
    if (codigosFiltro) gQuery = gQuery.in('cliente_cod', codigosFiltro)
    const { data: gData } = await gQuery
    ;((gData ?? []) as { cliente_cod: string; fecha: string }[])
      .forEach(g => {
        if (!ultimaGestionMap[g.cliente_cod]) ultimaGestionMap[g.cliente_cod] = g.fecha
      })
  }

  // ── 6. Lista de analistas (para filtro del coordinador) ────────────
  let analistas: AnalistaOpt[] = []
  if (esCoordinador) {
    const { data: analistasData } = await supabase
      .from('usuarios')
      .select('email, nombre')
      .eq('rol', 'ANALISTA')
      .eq('activo', true)
      .order('nombre')
    analistas = (analistasData ?? []) as AnalistaOpt[]
  }

  // ── 7. Armar rows finales ──────────────────────────────────────────
  const hoyMs = new Date(hoy).getTime()

  // Mapa email → nombre para analistas (usar en rows)
  const analistaNombreMap = Object.fromEntries(analistas.map(a => [a.email, a.nombre]))

  const rows: ClienteRow[] = cartera.map(c => {
    const mora_total =
      (c.mora_1_30 || 0) + (c.mora_31_60 || 0) + (c.mora_61_90 || 0) +
      (c.mora_91_120 || 0) + (c.mora_120_plus || 0)

    const ultima = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    const analEmail = analistaMap[c.cliente_cod] ?? ''

    return {
      cliente_cod:          c.cliente_cod,
      cliente_nombre:       c.cliente_nombre,
      contribuyente:        c.contribuyente,
      vendedor_nombre:      c.vendedor_nombre,
      analista_email:       analEmail,
      analista_nombre:      analistaNombreMap[analEmail] ?? analEmail.split('@')[0] ?? '—',
      no_vencido:           c.no_vencido     || 0,
      mora_1_30:            c.mora_1_30      || 0,
      mora_31_60:           c.mora_31_60     || 0,
      mora_61_90:           c.mora_61_90     || 0,
      mora_91_120:          c.mora_91_120    || 0,
      mora_120_plus:        c.mora_120_plus  || 0,
      mora_total,
      total:                c.total          || 0,
      ultima_gestion_fecha: ultima,
      dias_sin_gestion,
    }
  })

  // Ordenar por mora_total desc como default
  rows.sort((a, b) => b.mora_total - a.mora_total)

  // ── 8. Lista de vendedores únicos (para dropdown) ──────────────────
  // Analista: vendedores de sus propios clientes (ya filtrados por RLS)
  // Coordinador: todos los vendedores de todos los clientes
  const vendedores: VendedorOpt[] = Array.from(
    new Set(rows.map(r => r.vendedor_nombre).filter(Boolean))
  )
    .sort()
    .map(nombre => ({ nombre }))

  return (
    <TablaClientes
      rows={rows}
      esCoordinador={esCoordinador}
      analistas={analistas}
      vendedores={vendedores}
      userEmail={userEmail}
    />
  )
}
