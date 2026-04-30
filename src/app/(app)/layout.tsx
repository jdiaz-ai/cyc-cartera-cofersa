import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/sidebar'
import Topbar from '@/components/topbar'
import type { Usuario } from '@/types/database'

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

  // Notificaciones no leídas
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
      <Sidebar usuario={perfil} notiCount={notiCount} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar notiCount={notiCount} fechaCorte={fechaCorte} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
