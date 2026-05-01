import { createClient }   from '@/lib/supabase/server'
import ListaSolicitudes   from '@/components/solicitudes/lista-solicitudes'
import type { Solicitud } from '@/types/database'

export default async function SolicitudesPage() {
  const supabase = await createClient()

  // Rol del usuario
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol, nombre, id').eq('email', userEmail).limit(1)
  const rol        = ((usuRow ?? [])[0] as { rol: string }    | undefined)?.rol    ?? 'ANALISTA'
  const userName   = ((usuRow ?? [])[0] as { nombre: string } | undefined)?.nombre ?? ''
  const userId     = ((usuRow ?? [])[0] as { id: string }     | undefined)?.id     ?? ''

  // Fetch solicitudes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
  if (rol === 'ANALISTA') query = query.eq('solicitante_id', userId)

  const { data: solRaw, error } = await query
  const solicitudes = error ? [] : ((solRaw ?? []) as Solicitud[])

  // Coordinador: también necesita su id para aprobar
  let coordId = ''
  if (rol === 'COORDINADOR') coordId = userId

  return (
    <ListaSolicitudes
      solicitudes = {solicitudes}
      rol         = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail   = {userEmail}
      userName    = {userName}
      coordId     = {coordId}
    />
  )
}
