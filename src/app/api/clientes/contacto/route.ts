import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/clientes/contacto  { cliente_cod, nombre_cxp?, telefono?, telefono2?, correo? }
export async function PATCH(req: NextRequest) {
  let body: { cliente_cod?: string; nombre_cxp?: string; telefono?: string; telefono2?: string; correo?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, nombre_cxp, telefono, telefono2, correo } = body
  if (!cliente_cod) return NextResponse.json({ error: 'cliente_cod requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar que el usuario es el analista asignado o es coordinador
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  if (rol !== 'COORDINADOR') {
    // Analista solo puede editar su propio cliente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clienteRow } = await (supabase as any)
      .from('maestro_clientes').select('analista_email').eq('cliente_cod', cliente_cod).limit(1).single()
    if ((clienteRow as { analista_email: string } | null)?.analista_email !== user.email) {
      return NextResponse.json({ error: 'Sin permisos para editar este cliente' }, { status: 403 })
    }
  }

  // Solo actualizar los campos enviados
  const updates: Record<string, string> = { updated_at: new Date().toISOString() }
  if (nombre_cxp !== undefined) updates.nombre_cxp = nombre_cxp.trim()
  if (telefono   !== undefined) updates.telefono   = telefono.trim().replace(/\D/g, '').slice(0, 8)
  if (telefono2  !== undefined) updates.telefono2  = telefono2.trim().replace(/\D/g, '').slice(0, 8)
  if (correo     !== undefined) updates.correo     = correo.trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('maestro_clientes').update(updates).eq('cliente_cod', cliente_cod)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
