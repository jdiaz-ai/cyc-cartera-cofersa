import { createClient } from '@/lib/supabase/server'
import TablaGestiones  from '@/components/gestiones/tabla-gestiones'
import type { Gestion } from '@/types/database'

export interface SolicitudGestionRef { gestion_id: string | null; estado: string }

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
    .limit(1000)
  if (rol === 'ANALISTA') query = query.eq('analista_email', userEmail)

  const { data: gestionesRaw } = await query
  const gestiones = (gestionesRaw ?? []) as Gestion[]

  // Solicitudes vinculadas a gestiones (para flags + KPI "con solicitud")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: solRaw } = await (supabase as any)
    .from('solicitudes')
    .select('gestion_id, estado')
    .not('gestion_id', 'is', null)
  const solicitudes = (solRaw ?? []) as SolicitudGestionRef[]

  // Estados de promesas vinculadas (para KPI "Con promesa · X activas")
  const promesaIds = Array.from(
    new Set(gestiones.map(g => g.promesa_id).filter(Boolean)),
  ) as string[]
  const promesaEstadoMap: Record<string, string> = {}
  if (promesaIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pRows } = await (supabase as any)
      .from('promesas')
      .select('id, estado')
      .in('id', promesaIds)
    ;((pRows ?? []) as { id: string; estado: string }[])
      .forEach(p => { promesaEstadoMap[p.id] = p.estado })
  }

  // Mapa cliente_cod → nombre comercial (columna Cliente)
  const codsUnicos = Array.from(new Set(gestiones.map(g => g.cliente_cod).filter(Boolean)))
  const nombreClienteMap: Record<string, string> = {}
  if (codsUnicos.length > 0) {
    const { data: carRows } = await supabase
      .from('cartera')
      .select('cliente_cod, cliente_nombre')
      .in('cliente_cod', codsUnicos)
    ;((carRows ?? []) as { cliente_cod: string; cliente_nombre: string }[])
      .forEach(c => { nombreClienteMap[c.cliente_cod] = c.cliente_nombre })
  }

  // Analistas para filtro (solo COORDINADOR)
  let analistas: { email: string; nombre: string }[] = []
  if (rol === 'COORDINADOR') {
    const { data: aRows } = await supabase
      .from('usuarios').select('email, nombre').eq('rol', 'ANALISTA').eq('activo', true)
    analistas = (aRows ?? []) as { email: string; nombre: string }[]
  }

  return (
    <TablaGestiones
      gestiones        = {gestiones}
      solicitudes      = {solicitudes}
      promesaEstadoMap = {promesaEstadoMap}
      nombreClienteMap = {nombreClienteMap}
      rol              = {rol as 'COORDINADOR' | 'ANALISTA'}
      userEmail        = {userEmail}
      userName         = {nombre}
      analistas        = {analistas}
    />
  )
}
