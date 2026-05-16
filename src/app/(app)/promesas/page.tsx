import { createClient } from '@/lib/supabase/server'
import TablaPromesas   from '@/components/promesas/tabla-promesas'
import type { Promesa } from '@/types/database'

// Datos de la gestión origen que enriquecen cada card
export interface GestionOrigen {
  id:        string
  resultado: string
  nota:      string
  tipo:      string
  fecha:     string
}

export default async function PromesasPage() {
  const supabase = await createClient()

  // ── Rol del usuario logueado ──────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''
  const { data: usuRow } = await supabase
    .from('usuarios').select('rol').eq('email', userEmail).limit(1)
  const rol = ((usuRow ?? [])[0] as { rol: string } | undefined)?.rol ?? 'ANALISTA'

  // ── Fetch promesas activas ────────────────────────────────────────
  //    ANALISTA → solo las propias  ·  COORDINADOR → todas
  //    Ordenadas por fecha_promesa (las más próximas primero)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('promesas')
    .select('*')
    .neq('activo', false)
    .order('fecha_promesa', { ascending: true })
    .limit(800)
  if (rol === 'ANALISTA') query = query.eq('analista_email', userEmail)

  const { data: promesasRaw } = await query
  const promesas = (promesasRaw ?? []) as Promesa[]

  // ── Join liviano: gestión origen de cada promesa ──────────────────
  const gestionIds = Array.from(
    new Set(promesas.map(p => p.gestion_id).filter((g): g is string => !!g)),
  )

  const gestionesMap: Record<string, GestionOrigen> = {}
  if (gestionIds.length > 0) {
    const { data: gRows } = await supabase
      .from('gestiones')
      .select('id, resultado, nota, tipo, fecha')
      .in('id', gestionIds)
    for (const g of (gRows ?? []) as GestionOrigen[]) {
      gestionesMap[g.id] = g
    }
  }

  // ── Analistas para filtro (solo COORDINADOR) ──────────────────────
  let analistas: { email: string; nombre: string }[] = []
  if (rol === 'COORDINADOR') {
    const { data: aRows } = await supabase
      .from('usuarios').select('email, nombre').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (aRows ?? []) as { email: string; nombre: string }[]
  }

  return (
    <TablaPromesas
      promesas     = {promesas}
      gestionesMap = {gestionesMap}
      rol          = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail    = {userEmail}
      analistas    = {analistas}
    />
  )
}
