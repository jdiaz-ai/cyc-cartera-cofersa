import { createClient } from '@/lib/supabase/server'
import { hoyISO }       from '@/lib/utils/formato'
import TablaClientes    from '@/components/clientes/tabla-clientes'
import type { Cartera, MaestroCliente } from '@/types/database'
import { aplicarFiltros, aplicarOrden } from '@/lib/clientes/filtros'

// ── Interfaces exportadas ─────────────────────────────────────────────
export interface ClienteRow {
  cliente_cod:          string
  cliente_nombre:       string
  contribuyente:        string
  vendedor_nombre:      string
  analista_email:       string
  analista_nombre:      string
  condicion_pago:       string   // de maestro_clientes
  dimension:            string   // de maestro_clientes
  no_vencido:           number
  mora_1_30:            number
  mora_31_60:           number
  mora_61_90:           number
  mora_91_120:          number
  mora_120_plus:        number
  mora_total:           number
  total:                number
  dias_mora:            number   // de cartera.dias_mora
  ultima_gestion_fecha: string | null
  dias_sin_gestion:     number
}

export interface KPIsClientes {
  carteraFiltrada: number
  moraFiltrada:    number
  pctMorosidad:    number | null
  totalClientes:   number
}

export interface AnalistaOpt { email: string; nombre: string }
export interface VendedorOpt { nombre: string }

export interface FiltrosClientes {
  q:        string
  analista: string
  vendedor: string
  etiqueta: string          // '' | 'criticos' | 'olvidados'
  sort:     string          // 'mora_total' | 'total' | 'dias_sin_gestion' | 'cliente_nombre'
  dir:      'asc' | 'desc'
  page:     number
}

const PAGE_SIZE = 25

// ── Página (Server Component) ─────────────────────────────────────────
interface PageProps {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}

export default async function ClientesPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const hoy      = hoyISO()
  const sp       = await searchParams

  const str = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? ''

  // ── Parsear filtros desde URL ─────────────────────────────────────
  const filtros: FiltrosClientes = {
    q:        str(sp.q),
    analista: str(sp.analista),
    vendedor: str(sp.vendedor),
    etiqueta: str(sp.etiqueta),
    sort:     str(sp.sort) || 'mora_total',
    dir:      str(sp.dir) === 'asc' ? 'asc' : 'desc',
    page:     Math.max(1, parseInt(str(sp.page) || '1', 10)),
  }

  // ── Autenticación y rol ───────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).single()
  const esCoordinador =
    ((usuarioRow as { rol: string } | null)?.rol ?? 'ANALISTA') === 'COORDINADOR'

  // ── Scope: analista solo ve su cartera ────────────────────────────
  let codigosFiltro: string[] | null = null
  if (!esCoordinador) {
    const { data: misClientes } = await supabase
      .from('maestro_clientes')
      .select('cliente_cod')
      .eq('analista_email', userEmail)
    const codigos = ((misClientes ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
      .map(c => c.cliente_cod)
    if (codigos.length === 0) {
      return (
        <TablaClientes
          rows={[]}
          kpis={{ carteraFiltrada: 0, moraFiltrada: 0, pctMorosidad: null, totalClientes: 0 }}
          totalRows={0} page={1} totalPages={1}
          filtros={filtros} esCoordinador={false}
          analistas={[]} vendedores={[]} userEmail={userEmail}
        />
      )
    }
    codigosFiltro = codigos
  }

  // ── Sync más reciente ─────────────────────────────────────────────
  const { data: syncRefData } = await supabase
    .from('cartera')
    .select('sync_id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const latestSyncId =
    ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // ── Cartera completa (FIX CRÍTICO: limit 2000, antes se cortaba a 1000)
  let carteraQuery = supabase.from('cartera').select('*').limit(2000)
  if (latestSyncId)  carteraQuery = carteraQuery.eq('sync_id', latestSyncId)
  if (codigosFiltro) carteraQuery = carteraQuery.in('cliente_cod', codigosFiltro)
  const { data: carteraRaw } = await carteraQuery

  // Deduplicar por cliente_cod (seguridad ante registros múltiples)
  const carteraMapDedup: Record<string, Cartera> = {}
  ;((carteraRaw ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMapDedup[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMapDedup[c.cliente_cod] = c
    }
  })
  const cartera       = Object.values(carteraMapDedup)
  const codsEnCartera = cartera.map(c => c.cliente_cod)

  // ── Maestro clientes (condicion_pago, dimension, analista_email) ──
  const maestroMap: Record<string, {
    analista_email: string
    condicion_pago: string
    dimension:      string
  }> = {}
  if (codsEnCartera.length > 0) {
    const { data: maestro } = await supabase
      .from('maestro_clientes')
      .select('cliente_cod, analista_email, condicion_pago, dimension')
      .in('cliente_cod', codsEnCartera)
    ;((maestro ?? []) as Pick<MaestroCliente, 'cliente_cod' | 'analista_email' | 'condicion_pago' | 'dimension'>[])
      .forEach(m => {
        maestroMap[m.cliente_cod] = {
          analista_email: m.analista_email ?? '',
          condicion_pago: m.condicion_pago ?? '',
          dimension:      m.dimension      ?? '',
        }
      })
  }

  // ── Nombres de analistas (fuente de verdad: tabla usuarios) ───────
  const analistaEmailsUnicos = Array.from(
    new Set(Object.values(maestroMap).map(m => m.analista_email).filter(Boolean))
  )
  const analistaNombreMap: Record<string, string> = {}
  if (analistaEmailsUnicos.length > 0) {
    const { data: usRows } = await supabase
      .from('usuarios')
      .select('email, nombre')
      .in('email', analistaEmailsUnicos)
    ;((usRows ?? []) as { email: string; nombre: string }[]).forEach(u => {
      analistaNombreMap[u.email] = u.nombre
    })
  }

  // ── Última gestión por cliente ────────────────────────────────────
  // FIX: limit 50000 para no cortar gestiones con el default 1000
  const ultimaGestionMap: Record<string, string> = {}
  {
    let gQuery = supabase
      .from('gestiones')
      .select('cliente_cod, fecha')
      .order('fecha', { ascending: false })
      .limit(50000)
    if (codsEnCartera.length > 0) gQuery = gQuery.in('cliente_cod', codsEnCartera)
    const { data: gData } = await gQuery
    ;((gData ?? []) as { cliente_cod: string; fecha: string }[]).forEach(g => {
      if (!ultimaGestionMap[g.cliente_cod]) ultimaGestionMap[g.cliente_cod] = g.fecha
    })
  }

  // ── Lista de analistas para el filtro del coordinador ────────────
  let analistas: AnalistaOpt[] = []
  if (esCoordinador) {
    const { data } = await supabase
      .from('usuarios')
      .select('email, nombre')
      .eq('rol', 'ANALISTA')
      .eq('activo', true)
      .order('nombre')
    analistas = (data ?? []) as AnalistaOpt[]
  }

  // ── Construir todos los rows ──────────────────────────────────────
  const hoyMs = new Date(hoy).getTime()

  const todosLosRows: ClienteRow[] = cartera.map(c => {
    const mora_total =
      (c.mora_1_30    || 0) + (c.mora_31_60  || 0) +
      (c.mora_61_90   || 0) + (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0)

    const ultima           = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    const mae        = maestroMap[c.cliente_cod]
    const analEmail  = mae?.analista_email ?? ''
    const analNombre = analistaNombreMap[analEmail] ?? analEmail.split('@')[0] ?? '—'

    return {
      cliente_cod:          c.cliente_cod,
      cliente_nombre:       c.cliente_nombre,
      contribuyente:        c.contribuyente,
      vendedor_nombre:      c.vendedor_nombre || '—',
      analista_email:       analEmail,
      analista_nombre:      analNombre,
      condicion_pago:       mae?.condicion_pago ?? '',
      dimension:            mae?.dimension      ?? '',
      no_vencido:           c.no_vencido     || 0,
      mora_1_30:            c.mora_1_30      || 0,
      mora_31_60:           c.mora_31_60     || 0,
      mora_61_90:           c.mora_61_90     || 0,
      mora_91_120:          c.mora_91_120    || 0,
      mora_120_plus:        c.mora_120_plus  || 0,
      mora_total,
      total:                c.total          || 0,
      dias_mora:            c.dias_mora      || 0,
      ultima_gestion_fecha: ultima,
      dias_sin_gestion,
    }
  })

  // ── Filtrar server-side ───────────────────────────────────────────
  const filtered = aplicarFiltros(todosLosRows, filtros)

  // ── KPIs sobre el conjunto filtrado completo ──────────────────────
  const carteraFiltrada = filtered.reduce((s, r) => s + r.total,      0)
  const moraFiltrada    = filtered.reduce((s, r) => s + r.mora_total, 0)
  const kpis: KPIsClientes = {
    carteraFiltrada,
    moraFiltrada,
    pctMorosidad:  carteraFiltrada > 0 ? (moraFiltrada / carteraFiltrada) * 100 : null,
    totalClientes: filtered.length,
  }

  // ── Ordenar y paginar ─────────────────────────────────────────────
  const sorted     = aplicarOrden(filtered, filtros.sort, filtros.dir)
  const totalRows  = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const pagina     = Math.min(filtros.page, totalPages)
  const rows       = sorted.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  // ── Vendedores únicos para el dropdown ──────────────────────────────
  // Si hay un analista seleccionado, mostrar solo los vendedores asignados a él
  const rowsParaVendedores = filtros.analista
    ? todosLosRows.filter(r => r.analista_email === filtros.analista)
    : todosLosRows
  const vendedores: VendedorOpt[] = Array.from(
    new Set(rowsParaVendedores.map(r => r.vendedor_nombre).filter(v => v && v !== '—'))
  ).sort().map(nombre => ({ nombre }))

  return (
    <TablaClientes
      rows          = {rows}
      kpis          = {kpis}
      totalRows     = {totalRows}
      page          = {pagina}
      totalPages    = {totalPages}
      filtros       = {filtros}
      esCoordinador = {esCoordinador}
      analistas     = {analistas}
      vendedores    = {vendedores}
      userEmail     = {userEmail}
    />
  )
}
