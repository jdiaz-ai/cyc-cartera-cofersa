import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ESTADOS_VALIDOS = ['Normal', 'Bloqueado', 'Convenio', 'Suspendido']

// POST /api/clientes/estado  { cliente_cod, estado }
export async function POST(req: NextRequest) {
  let cliente_cod: string, estado: string
  try {
    const body = await req.json()
    cliente_cod = body.cliente_cod
    estado      = body.estado
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (!cliente_cod || !estado || !ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo COORDINADOR puede cambiar estado
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', user.email!)
    .limit(1)
    .single()
  if ((usuarioRow as { rol: string } | null)?.rol !== 'COORDINADOR') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('maestro_clientes')
    .update({ estado_manual: estado, updated_at: new Date().toISOString() })
    .eq('cliente_cod', cliente_cod)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
