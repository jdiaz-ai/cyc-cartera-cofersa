import { createClient } from '@/lib/supabase/server'
import TablaPromesas   from '@/components/promesas/tabla-promesas'
import type { Promesa } from '@/types/database'

export default async function PromesasPage() {
  const supabase = await createClient()

  // Rol del usuario logueado
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).limit(1)
  const rol = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // Fetch promesas — ANALISTA solo las propias, COORDINADOR todas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('promesas')
    .select('*')
    .order('fecha_promesa', { ascending: true })
    .limit(500)
  if (rol === 'ANALISTA') query = query.eq('analista_email', userEmail)

  const { data: promesasRaw } = await query
  const promesas = (promesasRaw ?? []) as Promesa[]

  // Analistas para filtro (solo COORDINADOR)
  let analistas: { email: string; nombre: string }[] = []
  if (rol === 'COORDINADOR') {
    const { data: aRows } = await supabase
      .from('usuarios').select('email, nombre').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (aRows ?? []) as { email: string; nombre: string }[]
  }

  return (
    <TablaPromesas
      promesas  = {promesas}
      rol       = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail = {userEmail}
      analistas = {analistas}
    />
  )
}
