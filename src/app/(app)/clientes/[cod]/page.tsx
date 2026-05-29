import { createClient }   from '@/lib/supabase/server'
import { notFound }        from 'next/navigation'
import FichaCliente        from '@/components/clientes/ficha/ficha-cliente'
import type { ICPData }    from '@/components/clientes/ficha/ficha-cliente'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'

// Next.js 15+ requiere que params sea awaited
interface PageProps {
  params:       Promise<{ cod: string }>
  searchParams: Promise<{ from?: string }>
}

export default async function FichaClientePage({ params, searchParams }: PageProps) {
  const supabase     = await createClient()
  const { cod: raw } = await params
  const cod          = decodeURIComponent(raw ?? '')

  // ── Back navigation ─────────────────────────────────────────────────────
  const { from } = await searchParams
  const backHref = from === 'mi-cartera' ? '/mi-cartera' : '/clientes'

  // Email del usuario logueado (quien registra la gestión)
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  // ── Cartera (aging) ───────────────────────────────────────────────────
  // Sin .single() ni .order() para evitar fallos si la columna no existe.
  // La tabla puede tener múltiples rows por sync; tomamos el [0].
  const { data: carteraRows, error: carteraErr } = await supabase
    .from('cartera')
    .select('*')
    .eq('cliente_cod', cod)

  if (carteraErr || !carteraRows || carteraRows.length === 0) return notFound()

  // Si hay múltiples syncs, preferir el de fecha_corte más reciente
  const rows = carteraRows as Cartera[]
  const sorted = [...rows].sort((a, b) =>
    (b.fecha_corte ?? '').localeCompare(a.fecha_corte ?? '')
  )
  const cartera = sorted[0]

  // ── Maestro clientes (info comercial) ──────────────────────────────
  const { data: maestroRows } = await supabase
    .from('maestro_clientes')
    .select('*')
    .eq('cliente_cod', cod)
  const maestro = ((maestroRows ?? [])[0] ?? null) as MaestroCliente | null

  // ── Facturas (por contribuyente) ────────────────────────────────────
  const { data: facturasRaw } = await supabase
    .from('facturas')
    .select('*')
    .eq('contribuyente', cartera.contribuyente)
    .order('fecha_vencimiento', { ascending: true })
  const facturas = (facturasRaw ?? []) as Factura[]

  // ── Gestiones (por cliente_cod) ─────────────────────────────────────
  const { data: gestionesRaw } = await supabase
    .from('gestiones')
    .select('*')
    .eq('cliente_cod', cod)
    .order('fecha', { ascending: false })
    .limit(60)
  const gestiones = (gestionesRaw ?? []) as Gestion[]

  // ── Promesas ────────────────────────────────────────────────────────
  const { data: promesasRaw } = await supabase
    .from('promesas')
    .select('*')
    .eq('cliente_cod', cod)
    .order('fecha_promesa', { ascending: false })
  const promesas = (promesasRaw ?? []) as Promesa[]

  // ── ICP (Índice de Comportamiento de Pago) ──────────────────────────
  let icp: ICPData | null = null
  try {
    const { data: icpRaw } = await supabase
      .from('icp_por_cliente')
      .select('icp_score, dias_prom_ponderado, clasificacion, n_pagos, n_facturas, pct_pagos_tarde, primer_pago, ultimo_pago')
      .eq('cliente_cod', cod)
      .maybeSingle()
    icp = icpRaw as ICPData | null
  } catch { /* vista puede no existir */ }

  // ── Solicitudes (tabla puede no existir aún) ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudes: any[] = []
  let solicitanteMap: Record<string, string> = {}
  try {
    const { data: solRaw } = await supabase
      .from('solicitudes')
      .select('*')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('cliente_cod' as any, cod)
      .order('created_at', { ascending: false })
    solicitudes = solRaw ?? []

    // Mapa solicitante_id → nombre para "Creada por" en el card
    const idsUnicos = Array.from(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set(solicitudes.map((s: any) => s.solicitante_id).filter(Boolean))
    ) as string[]
    if (idsUnicos.length > 0) {
      const { data: usRows } = await supabase
        .from('usuarios').select('id, nombre').in('id', idsUnicos)
      ;((usRows ?? []) as { id: string; nombre: string }[])
        .forEach(u => { solicitanteMap[u.id] = u.nombre })
    }
  } catch { /* tabla aún no creada */ }

  // ── Datos del analista ASIGNADO al cliente + rol del usuario logueado ──
  // El "Ejecutivo de cuenta" del estado de cuenta debe ser SIEMPRE el analista
  // dueño de la cartera (no quien genera/envía el documento).
  let analistaNombre   = ''
  const analistaEmail  = maestro?.analista_email ?? ''
  let analistaTelefono : string | null = null
  let analistaWhatsapp : string | null = null
  let esCoordinador    = false
  if (maestro?.analista_email) {
    const { data: anaRow } = await supabase
      .from('usuarios')
      .select('nombre, telefono, whatsapp')
      .eq('email', maestro.analista_email)
      .limit(1)
    const ana = ((anaRow ?? [])[0] as { nombre: string; telefono?: string | null; whatsapp?: string | null } | undefined)
    analistaNombre   = ana?.nombre   ?? ''
    analistaTelefono = ana?.telefono ?? null
    analistaWhatsapp = ana?.whatsapp ?? null
  }
  if (userEmail) {
    const { data: rolRow } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('email', userEmail)
      .limit(1)
    esCoordinador = ((rolRow ?? [])[0] as { rol: string } | undefined)?.rol === 'COORDINADOR'
  }

  return (
    <FichaCliente
      cartera         = {cartera}
      maestro         = {maestro}
      facturas        = {facturas}
      gestiones       = {gestiones}
      promesas        = {promesas}
      solicitudes     = {solicitudes}
      solicitanteMap  = {solicitanteMap}
      analistaNombre   = {analistaNombre}
      analistaEmail    = {analistaEmail}
      analistaTelefono = {analistaTelefono}
      analistaWhatsapp = {analistaWhatsapp}
      userEmail        = {userEmail}
      esCoordinador    = {esCoordinador}
      backHref         = {backHref}
      icp              = {icp}
    />
  )
}
