import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import EstadosCuentaCliente from './estados-cuenta-cliente'

export const dynamic = 'force-dynamic'

export interface ClienteEC {
  cliente_cod:    string
  contribuyente:  string
  cliente_nombre: string
  correo:         string
  saldo:          number
  mora:           number
}

export default async function EstadosCuentaPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', user.email!)
    .limit(1)
    .maybeSingle()
  const rol = (perfilRow as { rol: string } | null)?.rol ?? 'ANALISTA'

  // ── Clientes asignados (analista) o todos (coordinador) ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mq = (supabase as any)
    .from('maestro_clientes')
    .select('cliente_cod, contribuyente, cliente_nombre, correo')
    .order('cliente_nombre', { ascending: true })
  if (rol !== 'COORDINADOR') mq = mq.eq('analista_email', user.email!)
  const { data: maestro } = await mq

  const clientesRaw = (maestro ?? []) as {
    cliente_cod: string; contribuyente: string; cliente_nombre: string; correo: string | null
  }[]

  // ── Saldos desde cartera (mapa por cliente_cod) ──────────────────────────
  const cods = clientesRaw.map(c => c.cliente_cod)
  const saldoMap = new Map<string, { saldo: number; mora: number }>()
  if (cods.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cart } = await (supabase as any)
      .from('cartera')
      .select('cliente_cod, total, mora_1_30, mora_31_60, mora_61_90, mora_91_120, mora_120_plus')
      .in('cliente_cod', cods)
    for (const c of (cart ?? []) as Record<string, number | string>[]) {
      const mora = Math.max(0, +c.mora_1_30) + Math.max(0, +c.mora_31_60) + Math.max(0, +c.mora_61_90)
                 + Math.max(0, +c.mora_91_120) + Math.max(0, +c.mora_120_plus)
      saldoMap.set(String(c.cliente_cod), { saldo: +c.total || 0, mora })
    }
  }

  const clientes: ClienteEC[] = clientesRaw.map(c => ({
    cliente_cod:    c.cliente_cod,
    contribuyente:  c.contribuyente,
    cliente_nombre: c.cliente_nombre,
    correo:         c.correo ?? '',
    saldo:          saldoMap.get(c.cliente_cod)?.saldo ?? 0,
    mora:           saldoMap.get(c.cliente_cod)?.mora ?? 0,
  }))

  return <EstadosCuentaCliente clientes={clientes} />
}
