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
      return <TablaClientes rows={[]} esCoordinador={false} analistas={[]} />
    }
    codigosFiltro = codigos
  }

  // ── 2. Fetch cartera ───────────────────────────────────────────────
  let carteraQuery = supabase.from('cartera').select('*')
  if (codigosFiltro) {
    carteraQuery = carteraQuery.in('cliente_cod', codigosFiltro)
  }
  const { data: carteraData } = await carteraQuery
  const cartera = (carteraData ?? []) as Cartera[]

  // ── 3. Mapa analista_email por cliente (desde maestro_clientes) ────
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

  // ── 4. Última gestión por cliente ──────────────────────────────────
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

  // ── 5. Lista de analistas (para filtro del coordinador) ────────────
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

  // ── 6. Armar rows finales ──────────────────────────────────────────
  const hoyMs = new Date(hoy).getTime()

  const rows: ClienteRow[] = cartera.map(c => {
    const mora_total =
      (c.mora_1_30 || 0) + (c.mora_31_60 || 0) + (c.mora_61_90 || 0) +
      (c.mora_91_120 || 0) + (c.mora_120_plus || 0)

    const ultima = ultimaGestionMap[c.cliente_cod] ?? null
    const dias_sin_gestion = ultima
      ? Math.max(0, Math.floor((hoyMs - new Date(ultima).getTime()) / 86_400_000))
      : 999

    return {
      cliente_cod:          c.cliente_cod,
      cliente_nombre:       c.cliente_nombre,
      contribuyente:        c.contribuyente,
      vendedor_nombre:      c.vendedor_nombre,
      analista_email:       analistaMap[c.cliente_cod] ?? '',
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

  return (
    <TablaClientes
      rows={rows}
      esCoordinador={esCoordinador}
      analistas={analistas}
    />
  )
}
