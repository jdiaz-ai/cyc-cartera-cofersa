import { createClient }     from '@/lib/supabase/server'
import FormSolicitudNueva  from '@/components/solicitudes/form-solicitud-nueva'
import type { Cartera, MaestroCliente } from '@/types/database'

// ── Tipo enriquecido que recibe el formulario ─────────────────────────────
export interface ClienteConDatos {
  cliente_cod:     string
  cliente_nombre:  string
  contribuyente:   string
  vendedor_nombre: string
  analista_email:  string
  analista_nombre: string
  limite_credito:  number
  estado_manual:   string
  mora_total:      number
  tramo_peor:      string
}

export interface GestionOrigenPreload {
  id:        string
  resultado: string
  nota:      string
  tipo:      string
  fecha:     string
}

export default async function NuevaSolicitudPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente_cod?: string; gestion_id?: string; area?: string; tipo?: string; origen?: string }>
}) {
  const sp       = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  const { data: usuRow } = await supabase
    .from('usuarios').select('id, rol').eq('email', userEmail).limit(1)
  const userId = ((usuRow ?? [])[0] as { id: string }  | undefined)?.id  ?? ''
  const rol    = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // ── Cartera + maestro (para selección manual de cliente) ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const carteraQuery: any = supabase
    .from('cartera')
    .select('cliente_cod, cliente_nombre, contribuyente, vendedor_nombre, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus')
    .order('cliente_nombre', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let maestroQuery: any = supabase
    .from('maestro_clientes')
    .select('cliente_cod, analista_email, limite_credito, estado_manual')
  if (rol === 'ANALISTA') maestroQuery = maestroQuery.eq('analista_email', userEmail)

  const [{ data: carteraRaw }, { data: maestroRaw }] = await Promise.all([
    carteraQuery, maestroQuery,
  ])

  const carteraList = (carteraRaw ?? []) as Pick<
    Cartera,
    'cliente_cod' | 'cliente_nombre' | 'contribuyente' | 'vendedor_nombre' |
    'mora_1_30' | 'mora_31_60' | 'mora_61_90' | 'mora_91_120' | 'mora_120_plus'
  >[]
  const maestroList = (maestroRaw ?? []) as Pick<
    MaestroCliente, 'cliente_cod' | 'analista_email' | 'limite_credito' | 'estado_manual'
  >[]

  const maestroMap: Record<string, typeof maestroList[number]> = {}
  maestroList.forEach(m => { maestroMap[m.cliente_cod] = m })

  const codsPermitidos = rol === 'ANALISTA'
    ? new Set(maestroList.map(m => m.cliente_cod))
    : null
  const carteraFiltrada = codsPermitidos
    ? carteraList.filter(c => codsPermitidos.has(c.cliente_cod))
    : carteraList

  const emailsUnicos = Array.from(new Set(maestroList.map(m => m.analista_email).filter(Boolean)))
  const analistaNombreMap: Record<string, string> = {}
  if (emailsUnicos.length > 0) {
    const { data: anaRows } = await supabase
      .from('usuarios').select('email, nombre').in('email', emailsUnicos)
    ;((anaRows ?? []) as { email: string; nombre: string }[])
      .forEach(a => { analistaNombreMap[a.email] = a.nombre })
  }

  const clientes: ClienteConDatos[] = carteraFiltrada.map(c => {
    const m = maestroMap[c.cliente_cod]
    const mora_total =
      (c.mora_1_30 || 0) + (c.mora_31_60 || 0) + (c.mora_61_90 || 0) +
      (c.mora_91_120 || 0) + (c.mora_120_plus || 0)
    const tramo_peor =
      (c.mora_120_plus || 0) > 0 ? '+120 días'   :
      (c.mora_91_120   || 0) > 0 ? '91-120 días' :
      (c.mora_61_90    || 0) > 0 ? '61-90 días'  :
      (c.mora_31_60    || 0) > 0 ? '31-60 días'  :
      (c.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'
    const analista_email = m?.analista_email ?? ''
    return {
      cliente_cod:     c.cliente_cod,
      cliente_nombre:  c.cliente_nombre,
      contribuyente:   c.contribuyente,
      vendedor_nombre: c.vendedor_nombre,
      analista_email,
      analista_nombre: analistaNombreMap[analista_email] ?? analista_email.split('@')[0] ?? '—',
      limite_credito:  m?.limite_credito ?? 0,
      estado_manual:   m?.estado_manual  ?? 'Normal',
      mora_total,
      tramo_peor,
    }
  })
  clientes.sort((a, b) => b.mora_total - a.mora_total)

  // ── Pre-carga desde URL (originada desde una gestión) ─────────────────
  const preCliente = sp.cliente_cod
    ? clientes.find(c => c.cliente_cod === sp.cliente_cod) ?? null
    : null

  let gestionOrigen: GestionOrigenPreload | null = null
  if (sp.gestion_id) {
    const { data: gRow } = await supabase
      .from('gestiones')
      .select('id, resultado, nota, tipo, fecha')
      .eq('id', sp.gestion_id)
      .limit(1)
      .maybeSingle()
    if (gRow) gestionOrigen = gRow as GestionOrigenPreload
  }

  return (
    <FormSolicitudNueva
      userId        = {userId}
      userEmail     = {userEmail}
      clientes      = {clientes}
      preCliente    = {preCliente}
      preArea       = {sp.area ?? null}
      preTipo       = {sp.tipo ?? null}
      gestionOrigen = {gestionOrigen}
      origenFicha   = {sp.origen === 'ficha'}
    />
  )
}
