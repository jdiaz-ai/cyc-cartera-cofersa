import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import PlazoEspecialCliente from './plazo-especial-cliente'

export const dynamic = 'force-dynamic'

export default async function FacturasPlazoEspecialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).maybeSingle()
  const rol = (perfilRow as { rol: string } | null)?.rol ?? 'ANALISTA'
  if (rol !== 'COORDINADOR') redirect('/reportes')

  return <PlazoEspecialCliente />
}
