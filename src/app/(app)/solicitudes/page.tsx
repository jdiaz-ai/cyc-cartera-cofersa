import { createClient }   from '@/lib/supabase/server'
import ListaSolicitudes   from '@/components/solicitudes/lista-solicitudes'
import type { Solicitud } from '@/types/database'

export default async function SolicitudesPage() {
  const supabase = await createClient()

  // Rol del usuario logueado
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol, nombre, id').eq('email', userEmail).limit(1)
  const rol      = ((usuRow ?? [])[0] as { rol: string }    | undefined)?.rol    ?? 'ANALISTA'
  const userName = ((usuRow ?? [])[0] as { nombre: string } | undefined)?.nombre ?? ''
  const userId   = ((usuRow ?? [])[0] as { id: string }     | undefined)?.id     ?? ''

  // Fetch solicitudes (ANALISTA: solo las propias; COORDINADOR: todas)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = (supabase as any)
    .from('solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
  if (rol === 'ANALISTA') query = query.eq('solicitante_id', userId)

  const { data: solRaw, error } = await query
  const solicitudes = error ? [] : ((solRaw ?? []) as Solicitud[])

  // Construir mapa solicitante_id → nombre para mostrar "Creada por"
  const idsUnicos = Array.from(
    new Set(solicitudes.map(s => s.solicitante_id).filter(Boolean))
  ) as string[]

  let solicitanteMap: Record<string, string> = {}
  if (idsUnicos.length > 0) {
    const { data: usRows } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .in('id', idsUnicos)
    ;((usRows ?? []) as { id: string; nombre: string }[])
      .forEach(u => { solicitanteMap[u.id] = u.nombre })
  }

  const coordId = rol === 'COORDINADOR' ? userId : ''

  return (
    <ListaSolicitudes
      solicitudes    = {solicitudes}
      rol            = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail      = {userEmail}
      userName       = {userName}
      coordId        = {coordId}
      solicitanteMap = {solicitanteMap}
    />
  )
}
