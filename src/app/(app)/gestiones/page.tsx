import { createClient } from '@/lib/supabase/server'
import TablaGestiones  from '@/components/gestiones/tabla-gestiones'
import type { Gestion } from '@/types/database'

export default async function GestionesPage() {
  const supabase = await createClient()

  // Rol del usuario logueado
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol, nombre').eq('email', userEmail).limit(1)
  const rol    = ((usuRow ?? [])[0] as { rol: string }  | undefined)?.rol    ?? 'ANALISTA'
  const nombre = ((usuRow ?? [])[0] as { nombre: string } | undefined)?.nombre ?? ''

  // Fetch gestiones — ANALISTA solo las propias, COORDINADOR todas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('gestiones')
    .select('*')
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false })
    .limit(500)
  if (rol === 'ANALISTA') query = query.eq('analista_email', userEmail)

  const { data: gestionesRaw } = await query
  const gestiones = (gestionesRaw ?? []) as Gestion[]

  // Analistas para filtro (solo COORDINADOR)
  let analistas: { email: string; nombre: string }[] = []
  if (rol === 'COORDINADOR') {
    const { data: aRows } = await supabase
      .from('usuarios').select('email, nombre').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (aRows ?? []) as { email: string; nombre: string }[]
  }

  return (
    <TablaGestiones
      gestiones = {gestiones}
      rol       = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail = {userEmail}
      userName  = {nombre}
      analistas = {analistas}
    />
  )
}
