import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/clientes/gestiones  { id, tipo?, resultado?, nota?, promesa_fecha?, promesa_monto? }
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string
    tipo?: string
    resultado?: string
    nota?: string
    promesa_fecha?: string
    promesa_monto?: number
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { id, tipo, resultado, nota, promesa_fecha, promesa_monto } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar que la gestión pertenece al usuario (o es coordinador)
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gRow } = await (supabase as any)
    .from('gestiones').select('analista_email').eq('id', id).limit(1).single()
  if (!gRow) return NextResponse.json({ error: 'Gestión no encontrada' }, { status: 404 })

  if (rol !== 'COORDINADOR' && (gRow as { analista_email: string }).analista_email !== user.email) {
    return NextResponse.json({ error: 'Sin permisos para editar esta gestión' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (tipo          !== undefined) updates.tipo          = tipo
  if (resultado     !== undefined) updates.resultado     = resultado
  if (nota          !== undefined) updates.nota          = nota.trim()
  if (promesa_fecha !== undefined) updates.promesa_fecha = promesa_fecha
  if (promesa_monto !== undefined) updates.promesa_monto = promesa_monto

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('gestiones').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/clientes/gestiones  { id }  — solo coordinador (soft-delete)
export async function DELETE(req: NextRequest) {
  let body: { id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { id } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  if (rol !== 'COORDINADOR') {
    return NextResponse.json({ error: 'Solo el coordinador puede eliminar gestiones' }, { status: 403 })
  }

  // Soft-delete: marcar activo = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('gestiones').update({ activo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
