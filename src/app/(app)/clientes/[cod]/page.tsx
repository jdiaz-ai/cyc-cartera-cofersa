import { createClient }   from '@/lib/supabase/server'
import { notFound }        from 'next/navigation'
import FichaCliente        from '@/components/clientes/ficha/ficha-cliente'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'

// Next.js 15+ requiere que params sea awaited
interface PageProps { params: Promise<{ cod: string }> }

export default async function FichaClientePage({ params }: PageProps) {
  const supabase     = await createClient()
  const { cod: raw } = await params
  const cod          = decodeURIComponent(raw ?? '')

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

  // ── Solicitudes (tabla puede no existir aún) ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudes: any[] = []
  try {
    const { data: solRaw } = await supabase
      .from('solicitudes')
      .select('*')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('cliente_cod' as any, cod)
      .order('created_at', { ascending: false })
    solicitudes = solRaw ?? []
  } catch { /* tabla aún no creada */ }

  // ── Nombre del analista ─────────────────────────────────────────────
  let analistaNombre = ''
  if (maestro?.analista_email) {
    const { data: anaRow } = await supabase
      .from('usuarios')
      .select('nombre')
      .eq('email', maestro.analista_email)
      .limit(1)
    analistaNombre = ((anaRow ?? [])[0] as { nombre: string } | undefined)?.nombre ?? ''
  }

  return (
    <FichaCliente
      cartera        = {cartera}
      maestro        = {maestro}
      facturas       = {facturas}
      gestiones      = {gestiones}
      promesas       = {promesas}
      solicitudes    = {solicitudes}
      analistaNombre = {analistaNombre}
      userEmail      = {userEmail}
    />
  )
}
