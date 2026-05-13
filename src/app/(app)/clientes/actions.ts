'use server'

import { createClient }                from '@/lib/supabase/server'
import { hoyISO }                      from '@/lib/utils/formato'
import { aplicarFiltros, aplicarOrden } from '@/lib/clientes/filtros'
import type { ClienteRow, FiltrosClientes } from './page'
import type { Cartera, MaestroCliente }     from '@/types/database'

/**
 * Server Action — devuelve TODOS los clientes que coinciden con los filtros,
 * sin paginación. Usado por el botón "Descargar Excel" del cliente.
 * Re-verifica auth y scope internamente (no confiar en parámetros del cliente).
 */
export async function fetchTodosLosClientes(
  filtros: FiltrosClientes,
): Promise<ClienteRow[]> {
  const supabase = await createClient()
  const hoy      = hoyISO()
  const hoyMs    = new Date(hoy).getTime()

  // ── Re-verificar autenticación ────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).single()
  const esCoordinador =
    ((usuarioRow as { rol: string } | null)?.rol ?? 'ANALISTA') === 'COORDINADOR'

  // ── Scope ─────────────────────────────────────────────────────────
  let codigosFiltro: string[] | null = null
  if (!esCoordinador) {
    const { data: misClientes } = await supabase
      .from('maestro_clientes').select('cliente_cod').eq('analista_email', userEmail)
    const codigos = ((misClientes ?? []) as Pick<MaestroCliente, 'cliente_cod'>[])
      .map(c => c.cliente_cod)
    if (codigos.length === 0) return []
    codigosFiltro = codigos
  }

  // ── Sync más reciente ─────────────────────────────────────────────
  const { data: syncRefData } = await supabase
    .from('cartera').select('sync_id').order('updated_at', { ascending: false }).limit(1)
  const latestSyncId =
    ((syncRefData ?? [])[0] as { sync_id: string } | undefined)?.sync_id ?? ''

  // ── Cartera completa ──────────────────────────────────────────────
  let carteraQuery = supabase.from('cartera').select('*').limit(2000)
  if (latestSyncId)  carteraQuery = carteraQuery.eq('sync_id', latestSyncId)
  if (codigosFiltro) carteraQuery = carteraQuery.in('cliente_cod', codigosFiltro)
  const { data: carteraRaw } = await carteraQuery

  const carteraMapDedup: Record<string, Cartera> = {}
  ;((carteraRaw ?? []) as Cartera[]).forEach(c => {
    const prev = carteraMapDedup[c.cliente_cod]
    if (!prev || (c.fecha_corte ?? '') > (prev.fecha_corte ?? '')) {
      carteraMapDedup[c.cliente_cod] = c
    }
  })
  const cartera       = Object.values(carteraMapDedup)
  const codsEnCartera = cartera.map(c => c.cliente_cod)

  // ── Maestro clientes ──────────────────────────────────────────────
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

  // ── Nombres de analistas ──────────────────────────────────────────
  const analistaEmailsUnicos = Array.from(
    new Set(Object.values(maestroMap).map(m => m.analista_email).filter(Boolean))
  )
  const analistaNombreMap: Record<string, string> = {}
  if (analistaEmailsUnicos.length > 0) {
    const { data: usRows } = await supabase
      .from('usuarios').select('email, nombre').in('email', analistaEmailsUnicos)
    ;((usRows ?? []) as { email: string; nombre: string }[]).forEach(u => {
      analistaNombreMap[u.email] = u.nombre
    })
  }

  // ── Última gestión por cliente ────────────────────────────────────
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

  // ── Construir rows ────────────────────────────────────────────────
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

  // Aplicar mismos filtros y orden que el Server Component
  const filtered = aplicarFiltros(todosLosRows, filtros)
  return aplicarOrden(filtered, filtros.sort, filtros.dir)
}
