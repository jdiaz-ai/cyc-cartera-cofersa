import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hoyISO } from '@/lib/utils/formato'

// POST /api/clientes/promesas  { cliente_cod, contribuyente, monto, fecha_promesa, notas? }
export async function POST(req: NextRequest) {
  let body: {
    cliente_cod?: string
    contribuyente?: string
    monto?: number
    fecha_promesa?: string
    notas?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, contribuyente, monto, fecha_promesa, notas } = body
  if (!cliente_cod || !monto || !fecha_promesa) {
    return NextResponse.json({ error: 'cliente_cod, monto y fecha_promesa son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('promesas').insert({
    cliente_cod,
    contribuyente: contribuyente ?? '',
    analista_email: user.email,
    monto,
    fecha_promesa,
    fecha_creacion: hoyISO(),
    estado: 'PENDIENTE',
    notas: notas?.trim() ?? '',
    activo: true,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/clientes/promesas  { id, estado, monto_real?, fecha_cumplimiento?, motivo? }
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string
    estado?: string
    monto_real?: number
    fecha_cumplimiento?: string
    motivo?: string
    notas?: string
    monto?: number
    fecha_promesa?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { id, estado, monto_real, motivo, notas, monto, fecha_promesa } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verificar permisos
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email!).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pRow } = await (supabase as any)
    .from('promesas').select('analista_email').eq('id', id).limit(1).single()
  if (!pRow) return NextResponse.json({ error: 'Promesa no encontrada' }, { status: 404 })

  if (rol !== 'COORDINADOR' && (pRow as { analista_email: string }).analista_email !== user.email) {
    return NextResponse.json({ error: 'Sin permisos para editar esta promesa' }, { status: 403 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (estado        !== undefined) updates.estado        = estado
  if (monto         !== undefined) updates.monto         = monto
  if (fecha_promesa !== undefined) updates.fecha_promesa = fecha_promesa
  if (notas         !== undefined) updates.notas         = notas.trim()

  // Si cumplida: agregar nota de monto real
  if (estado === 'CUMPLIDA' && monto_real) {
    updates.notas = `Monto real pagado: ₡${Math.round(monto_real).toLocaleString('es-CR')}. ${notas ?? ''}`
  }
  // Si incumplida: agregar motivo
  if (estado === 'INCUMPLIDA' && motivo) {
    updates.notas = `Motivo: ${motivo}. ${notas ?? ''}`
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('promesas').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/clientes/promesas  { id }  — solo coordinador (soft-delete)
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
    return NextResponse.json({ error: 'Solo el coordinador puede eliminar promesas' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('promesas').update({ activo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
