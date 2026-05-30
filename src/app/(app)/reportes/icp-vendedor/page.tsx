import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import IcpVendedorCliente from './icp-vendedor-cliente'

export const dynamic = 'force-dynamic'

export default async function IcpVendedorPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('rol, nombre')
    .eq('email', user.email!)
    .limit(1)
    .maybeSingle()

  const rol = (perfilRow as { rol: string; nombre: string } | null)?.rol ?? 'ANALISTA'
  if (rol !== 'COORDINADOR') redirect('/reportes')

  const nombre = (perfilRow as { nombre: string } | null)?.nombre ?? user.email!

  return <IcpVendedorCliente generadoPor={nombre} />
}
