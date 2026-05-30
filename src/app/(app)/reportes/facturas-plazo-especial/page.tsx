import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import PlazoEspecialCliente from './plazo-especial-cliente'

export const dynamic = 'force-dynamic'

export default async function FacturasPlazoEspecialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios').select('rol, nombre, telefono, whatsapp').eq('email', user.email!).limit(1).maybeSingle()
  const perfil = perfilRow as { rol: string; nombre: string; telefono?: string | null; whatsapp?: string | null } | null
  const rol = perfil?.rol ?? 'ANALISTA'
  if (rol !== 'COORDINADOR') redirect('/reportes')

  const remitente = {
    nombre:   perfil?.nombre ?? user.email!,
    puesto:   'Coordinador de Crédito y Cobro',
    telefono: perfil?.telefono ?? null,
    whatsapp: perfil?.whatsapp ?? null,
  }

  return <PlazoEspecialCliente remitente={remitente} />
}
