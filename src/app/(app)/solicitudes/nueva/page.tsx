import { createClient }   from '@/lib/supabase/server'
import FormNuevaSolicitud from '@/components/solicitudes/form-nueva-solicitud'
import type { Cartera, MaestroCliente } from '@/types/database'

// ── Tipo enriquecido que recibe el formulario ─────────────────────────────
export interface ClienteConDatos {
  cliente_cod:     string
  cliente_nombre:  string   // nombre comercial — fuente: cartera (más confiable)
  contribuyente:   string   // cédula jurídica — para query de facturas
  vendedor_nombre: string
  analista_email:  string
  analista_nombre: string
  limite_credito:  number
  estado_manual:   string
  mora_total:      number
  tramo_peor:      string
}

export default async function NuevaSolicitudPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  // ── Rol y userId ──────────────────────────────────────────────────────
  const { data: usuRow } = await supabase
    .from('usuarios').select('id, rol').eq('email', userEmail).limit(1)
  const userId = ((usuRow ?? [])[0] as { id: string }  | undefined)?.id  ?? ''
  const rol    = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // ── 1. Cartera (nombre comercial + mora + vendedor + contribuyente) ────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let carteraQuery: any = supabase
    .from('cartera')
    .select('cliente_cod, cliente_nombre, contribuyente, vendedor_nombre, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus')
    .order('cliente_nombre', { ascending: true })

  // ── 2. Maestro clientes (límite, estado, analista) ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let maestroQuery: any = supabase
    .from('maestro_clientes')
    .select('cliente_cod, analista_email, limite_credito, estado_manual')

  // ANALISTA: solo ve sus propios clientes
  if (rol === 'ANALISTA') {
    maestroQuery  = maestroQuery.eq('analista_email', userEmail)
  }

  const [{ data: carteraRaw }, { data: maestroRaw }] = await Promise.all([
    carteraQuery,
    maestroQuery,
  ])

  const carteraList = (carteraRaw ?? []) as Pick<
    Cartera,
    'cliente_cod' | 'cliente_nombre' | 'contribuyente' | 'vendedor_nombre' |
    'mora_1_30' | 'mora_31_60' | 'mora_61_90' | 'mora_91_120' | 'mora_120_plus'
  >[]

  const maestroList = (maestroRaw ?? []) as Pick<
    MaestroCliente, 'cliente_cod' | 'analista_email' | 'limite_credito' | 'estado_manual'
  >[]

  // ── 3. Map maestro por cliente_cod ────────────────────────────────────
  const maestroMap: Record<string, typeof maestroList[number]> = {}
  maestroList.forEach(m => { maestroMap[m.cliente_cod] = m })

  // ── 4. Filtrar cartera a solo los clientes del analista (si aplica) ───
  const codsPermitidos = rol === 'ANALISTA'
    ? new Set(maestroList.map(m => m.cliente_cod))
    : null

  const carteraFiltrada = codsPermitidos
    ? carteraList.filter(c => codsPermitidos.has(c.cliente_cod))
    : carteraList

  // ── 5. Nombres de analistas (email → nombre) ──────────────────────────
  const emailsUnicos = Array.from(new Set(maestroList.map(m => m.analista_email).filter(Boolean)))
  let analistaNombreMap: Record<string, string> = {}
  if (emailsUnicos.length > 0) {
    const { data: anaRows } = await supabase
      .from('usuarios')
      .select('email, nombre')
      .in('email', emailsUnicos)
    ;((anaRows ?? []) as { email: string; nombre: string }[])
      .forEach(a => { analistaNombreMap[a.email] = a.nombre })
  }

  // ── 6. Construir ClienteConDatos ──────────────────────────────────────
  const clientes: ClienteConDatos[] = carteraFiltrada.map(c => {
    const m = maestroMap[c.cliente_cod]
    const mora_total =
      (c.mora_1_30     || 0) + (c.mora_31_60  || 0) +
      (c.mora_61_90    || 0) + (c.mora_91_120 || 0) +
      (c.mora_120_plus || 0)

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
      limite_credito:  m?.limite_credito  ?? 0,
      estado_manual:   m?.estado_manual   ?? 'Normal',
      mora_total,
      tramo_peor,
    }
  })

  // Ordenar por mora_total desc (más urgentes arriba)
  clientes.sort((a, b) => b.mora_total - a.mora_total)

  return (
    <FormNuevaSolicitud
      userId    = {userId}
      userEmail = {userEmail}
      clientes  = {clientes}
    />
  )
}
