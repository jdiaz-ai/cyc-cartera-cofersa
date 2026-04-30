import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'
import type { Usuario } from '@/types/database'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Buscar perfil en tabla usuarios
  let perfil: Pick<Usuario, 'nombre' | 'email' | 'rol' | 'iniciales' | 'color'> | null = null
  try {
    const { data } = await supabase
      .from('usuarios')
      .select('nombre, email, rol, iniciales, color')
      .eq('email', user.email!)
      .single()
    perfil = data
  } catch {
    // La tabla puede no existir aún — continuar con datos del auth
  }

  // Si no existe en la tabla, usar datos del auth con rol por defecto
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

  // Contar notificaciones no leídas del usuario actual
  let notiCount = 0
  try {
    const { data: usuarioRow } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', user.email!)
      .single()
    const uid = (usuarioRow as { id: string } | null)?.id
    if (uid) {
      const { count } = await supabase
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', uid)
        .eq('leida', false)
      notiCount = count ?? 0
    }
  } catch { /* tabla puede no existir aún */ }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#EEF2F7' }}>
      <Sidebar usuario={perfil} notiCount={notiCount} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
