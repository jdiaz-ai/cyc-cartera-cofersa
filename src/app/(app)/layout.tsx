import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'
import type { BadgeCounts } from '@/components/sidebar'
import Topbar from '@/components/topbar'
import type { Usuario, Notificacion } from '@/types/database'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Perfil del usuario
  let perfil: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'iniciales' | 'color'> | null = null
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('nombre, email, rol, iniciales, color')
      .eq('email', user.email!)
      .single()
    perfil = data
  } catch { /* continuar sin perfil */ }

  if (!perfil) {
    const nombre = user.user_metadata?.full_name || user.email || 'Usuario'
    perfil = {
      nombre,
      email: user.email!,
      rol: 'COORDINADOR' as const,
      iniciales: nombre.slice(0, 2).toUpperCase(),
      color: '#009ee3',
    }
  }

  // Usuario id + notificaciones completas
  let usuarioId = ''
  let notificaciones: Notificacion[] = []
  try {
    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', user.email!)
      .single()
    const uid = (usuarioRow as { id: string } | null)?.id
    if (uid) {
      usuarioId = uid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: notiRows } = await (supabase as any)
        .from('notificaciones')
        .select('*')
        .eq('usuario_id', uid)
        .order('created_at', { ascending: false })
        .limit(50)
      notificaciones = (notiRows ?? []) as Notificacion[]
    }
  } catch { /* tabla puede no existir aún */ }

  const notiCount = notificaciones.filter(n => !n.leida).length

  // Badges de navegación para el ANALISTA
  const badgeCounts: BadgeCounts = {}
  if (perfil.rol === 'ANALISTA' && user.email) {
    try {
      const hoy = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      // Gestiones registradas HOY por este analista
      const { count: gHoy } = await supabase
        .from('gestiones')
        .select('*', { count: 'exact', head: true })
        .eq('analista_email', user.email)
        .eq('fecha', hoy)
      badgeCounts.gestionesHoy = gHoy ?? 0

      // Promesas vencidas o que vencen hoy (pendientes)
      const { count: pVencidas } = await supabase
        .from('promesas')
        .select('*', { count: 'exact', head: true })
        .eq('analista_email', user.email)
        .eq('estado', 'PENDIENTE')
        .lte('fecha_promesa', hoy)
      badgeCounts.promesasVencidas = pVencidas ?? 0

      // Solicitudes propias en estado PENDIENTE
      if (usuarioId) {
        const { count: sPend } = await supabase
          .from('solicitudes')
          .select('*', { count: 'exact', head: true })
          .eq('solicitante_id', usuarioId)
          .eq('estado', 'PENDIENTE')
        badgeCounts.solicitudesPendientes = sPend ?? 0
      }
    } catch { /* badges no críticos */ }
  }

  // Fecha del último corte Softland (para el topbar)
  let fechaCorte = ''
  try {
    const { data } = await supabase
      .from('cartera')
      .select('fecha_corte')
      .limit(1)
      .single()
    const carteraRow = data as { fecha_corte: string } | null
    if (carteraRow?.fecha_corte) {
      const d = new Date(carteraRow.fecha_corte)
      if (!isNaN(d.getTime())) {
        fechaCorte = `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`
      }
    }
  } catch { /* sin datos aún */ }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar
        usuario={perfil}
        notiCount={notiCount}
        notificaciones={notificaciones}
        usuarioId={usuarioId}
        badgeCounts={badgeCounts}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar notiCount={notiCount} fechaCorte={fechaCorte} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
