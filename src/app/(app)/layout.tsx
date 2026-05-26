import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'
import Topbar from '@/components/topbar'
import ClientWrapper from '@/components/layout/client-wrapper'
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

  // Total de usuarios activos (para el indicador de presencia del chat)
  let totalEquipo = 5 // fallback — 5 miembros del equipo C&C
  try {
    const { count } = await supabase
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)
    if (count) totalEquipo = count
  } catch { /* fallback al valor hardcodeado */ }

  // Avatar URL desde Google OAuth (metadata del user)
  const avatarUrl: string | null = user.user_metadata?.avatar_url ?? null

  // Última sincronización: notificación SYNC más reciente (cualquier usuario)
  // Fallback: updated_at más reciente de cartera (funciona para coordinador)
  let ultimaSync = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: notiSync } = await (supabase as any)
      .from('notificaciones')
      .select('created_at')
      .eq('tipo', 'SYNC')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (notiSync?.created_at) {
      ultimaSync = notiSync.created_at
    } else {
      // Fallback: updated_at más reciente en cartera
      const { data: carteraRow } = await supabase
        .from('cartera')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      const row = carteraRow as { updated_at: string } | null
      if (row?.updated_at) ultimaSync = row.updated_at
    }
  } catch { /* sin datos aún */ }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar
        usuario={perfil}
        notificaciones={notificaciones}
        usuarioId={usuarioId}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          notiCount={notiCount}
          ultimaSync={ultimaSync}
          notificaciones={notificaciones}
          usuarioId={usuarioId}
          nombre={perfil.nombre}
          iniciales={perfil.iniciales}
          color={perfil.color}
          avatarUrl={avatarUrl}
        />
        <main className="flex-1 overflow-y-auto">
          <ClientWrapper
            usuarioId={usuarioId}
            nombre={perfil.nombre}
            iniciales={perfil.iniciales}
            color={perfil.color}
            totalEquipo={totalEquipo}
          >{children}</ClientWrapper>
        </main>
        <footer
          className="text-center shrink-0"
          style={{ fontSize: '11px', fontWeight: 400, color: '#94a3b8', padding: '5px 0' }}
        >
          SIC — Sistema Inteligente de Cobranza · Cofersa © 2026
        </footer>
      </div>
    </div>
  )
}
