import { createClient }      from '@/lib/supabase/server'
import FormNuevaSolicitud    from '@/components/solicitudes/form-nueva-solicitud'
import type { MaestroCliente } from '@/types/database'

export default async function NuevaSolicitudPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  // Id del usuario
  const { data: usuRow } = await supabase
    .from('usuarios').select('id, rol').eq('email', userEmail).limit(1)
  const userId = ((usuRow ?? [])[0] as { id: string }  | undefined)?.id  ?? ''
  const rol    = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // Clientes disponibles para seleccionar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clienteQuery: any = supabase
    .from('maestro_clientes')
    .select('cliente_cod, cliente_nombre, limite_credito, estado_manual')
    .order('cliente_nombre', { ascending: true })
  if (rol === 'ANALISTA') clienteQuery = clienteQuery.eq('analista_email', userEmail)

  const { data: clientesRaw } = await clienteQuery
  const clientes = (clientesRaw ?? []) as Pick<MaestroCliente, 'cliente_cod' | 'cliente_nombre' | 'limite_credito' | 'estado_manual'>[]

  return (
    <FormNuevaSolicitud
      userId    = {userId}
      userEmail = {userEmail}
      clientes  = {clientes}
    />
  )
}
