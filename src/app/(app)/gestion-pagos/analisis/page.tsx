import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import AnalisisPagosTabs from '@/components/analisis-pagos/AnalisisPagosTabs'

export const dynamic = 'force-dynamic'

export default async function AnalisisPagosPage() {
  const supabase = await createClient()

  // Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Determinar rol del usuario
  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('rol, email')
    .eq('email', user.email!)
    .limit(1)
    .maybeSingle()

  const rol       = (perfilRow as { rol: string; email: string } | null)?.rol ?? 'ANALISTA'
  const userEmail = user.email!
  const esAnalista = rol === 'ANALISTA'

  return (
    <AnalisisPagosTabs
      userEmail={userEmail}
      esAnalista={esAnalista}
    />
  )
}
