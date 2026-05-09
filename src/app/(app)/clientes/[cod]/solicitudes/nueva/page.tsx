import { notFound }       from 'next/navigation'
import { createClient }   from '@/lib/supabase/server'
import PaginaNuevaSolicitud from '@/components/clientes/ficha/pagina-nueva-solicitud'
import type { Cartera, MaestroCliente, Factura } from '@/types/database'

interface PageProps {
  params: Promise<{ cod: string }>
}

export default async function NuevaSolicitudClientePage({ params }: PageProps) {
  const { cod } = await params
  const supabase = await createClient()

  // ── 1. Cartera del cliente ────────────────────────────────────────────
  const { data: carteraRaw } = await supabase
    .from('cartera')
    .select('*')
    .eq('cliente_cod', cod)
    .limit(1)
    .single()

  if (!carteraRaw) notFound()
  const cartera = carteraRaw as Cartera

  // ── 2. Maestro del cliente ────────────────────────────────────────────
  const { data: maestroRaw } = await supabase
    .from('maestro_clientes')
    .select('*')
    .eq('cliente_cod', cod)
    .limit(1)
    .single()
  const maestro = (maestroRaw ?? null) as MaestroCliente | null

  // ── 3. Facturas pendientes — filtrar por contribuyente (igual que ficha) ─
  const { data: facturasRaw } = await supabase
    .from('facturas')
    .select('*')
    .eq('contribuyente', cartera.contribuyente)
    .gt('saldo', 0)
    .order('saldo', { ascending: false })
    .limit(100)
  const facturas = (facturasRaw ?? []) as Factura[]

  // ── 4. Cálculos derivados ─────────────────────────────────────────────
  const moraTotal =
    (cartera.mora_1_30     || 0) + (cartera.mora_31_60  || 0) +
    (cartera.mora_61_90    || 0) + (cartera.mora_91_120 || 0) +
    (cartera.mora_120_plus || 0)

  const tramoPeor =
    (cartera.mora_120_plus || 0) > 0 ? '+120 días'   :
    (cartera.mora_91_120   || 0) > 0 ? '91-120 días' :
    (cartera.mora_61_90    || 0) > 0 ? '61-90 días'  :
    (cartera.mora_31_60    || 0) > 0 ? '31-60 días'  :
    (cartera.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'

  const limite       = maestro?.limite_credito ?? 0
  const creditoDisp  = limite > 0 ? limite - cartera.total : null

  return (
    <PaginaNuevaSolicitud
      clienteCod        = {cod}
      clienteNombre     = {cartera.cliente_nombre}
      limiteActual      = {limite}
      moraTotal         = {moraTotal}
      diasAtraso        = {tramoPeor}
      creditoDisponible = {creditoDisp}
      condicionPago     = {maestro?.condicion_pago ? String(maestro.condicion_pago) : '—'}
      facturas          = {facturas}
    />
  )
}
