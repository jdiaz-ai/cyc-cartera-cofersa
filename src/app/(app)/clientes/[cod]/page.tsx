import { createClient }   from '@/lib/supabase/server'
import { notFound }        from 'next/navigation'
import FichaCliente        from '@/components/clientes/ficha/ficha-cliente'
import type { Cartera, MaestroCliente, Factura, Gestion, Promesa } from '@/types/database'

interface PageProps { params: { cod: string } }

export default async function FichaClientePage({ params }: PageProps) {
  const supabase = await createClient()
  const cod      = decodeURIComponent(params.cod)

  // ── Cartera (aging) — usa el registro más reciente del cliente ────────
  // .single() falla si hay múltiples rows por distintos syncs, por eso limit(1)
  const { data: carteraRows } = await supabase
    .from('cartera').select('*')
    .eq('cliente_cod', cod)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (!carteraRows || carteraRows.length === 0) return notFound()
  const cartera = carteraRows[0] as Cartera

  // ── Maestro clientes (info comercial) ──────────────────────────────
  const { data: maestroRows } = await supabase
    .from('maestro_clientes').select('*')
    .eq('cliente_cod', cod)
    .order('updated_at', { ascending: false })
    .limit(1)
  const maestro = ((maestroRows ?? [])[0] ?? null) as MaestroCliente | null

  // ── Facturas (por contribuyente) ────────────────────────────────────
  const { data: facturasRaw } = await supabase
    .from('facturas').select('*')
    .eq('contribuyente', cartera.contribuyente)
    .order('fecha_vencimiento', { ascending: true })
  const facturas = (facturasRaw ?? []) as Factura[]

  // ── Gestiones (por cliente_cod) ─────────────────────────────────────
  const { data: gestionesRaw } = await supabase
    .from('gestiones').select('*')
    .eq('cliente_cod', cod)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(60)
  const gestiones = (gestionesRaw ?? []) as Gestion[]

  // ── Promesas ────────────────────────────────────────────────────────
  const { data: promesasRaw } = await supabase
    .from('promesas').select('*')
    .eq('cliente_cod', cod)
    .order('fecha_promesa', { ascending: false })
  const promesas = (promesasRaw ?? []) as Promesa[]

  // ── Solicitudes ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let solicitudes: any[] = []
  try {
    const { data: solRaw } = await supabase
      .from('solicitudes').select('*')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('cliente_cod' as any, cod)
      .order('created_at', { ascending: false })
    solicitudes = solRaw ?? []
  } catch { /* tabla puede no existir aún */ }

  // ── Nombre del analista ─────────────────────────────────────────────
  let analistaNombre = ''
  if (maestro?.analista_email) {
    const { data: anaRow } = await supabase
      .from('usuarios').select('nombre')
      .eq('email', maestro.analista_email).single()
    analistaNombre = (anaRow as { nombre: string } | null)?.nombre ?? ''
  }

  return (
    <FichaCliente
      cartera      = {cartera}
      maestro      = {maestro}
      facturas     = {facturas}
      gestiones    = {gestiones}
      promesas     = {promesas}
      solicitudes  = {solicitudes}
      analistaNombre = {analistaNombre}
    />
  )
}
