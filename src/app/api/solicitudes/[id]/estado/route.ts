import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ESTADOS_OFICIALES } from '@/lib/solicitudes/catalogo'

// PATCH /api/solicitudes/[id]/estado  { estado_nuevo, nota? }
// Cambia el estado de una solicitud y registra el historial.
// Sin correo ni notificación (fuera de alcance del sprint).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { estado_nuevo?: string; nota?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { estado_nuevo, nota } = body
  if (!estado_nuevo) {
    return NextResponse.json({ error: 'estado_nuevo requerido' }, { status: 400 })
  }
  if (!(ESTADOS_OFICIALES as string[]).includes(estado_nuevo)) {
    return NextResponse.json(
      { error: `Estado inválido. Permitidos: ${ESTADOS_OFICIALES.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // usuarios.id es UUID independiente de auth.uid() → resolver por email
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('id').ilike('email', user.email).limit(1).single()
  const usuarioId = (usuarioRow as { id: string } | null)?.id ?? null
  if (!usuarioId) {
    return NextResponse.json({ error: 'Tu usuario no está registrado en el sistema.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: solRow } = await (supabase as any)
    .from('solicitudes').select('estado').eq('id', id).limit(1).single()
  if (!solRow) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  const estadoAnterior = (solRow as { estado: string }).estado
  if (estadoAnterior === estado_nuevo) {
    return NextResponse.json({ error: 'La solicitud ya está en ese estado' }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any)
    .from('solicitudes')
    .update({ estado: estado_nuevo, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: histErr } = await (supabase as any)
    .from('solicitud_historial_estados')
    .insert({
      solicitud_id:    id,
      estado_anterior: estadoAnterior,
      estado_nuevo,
      usuario_id:      usuarioId,
      nota:            nota?.trim() || null,
    })
  if (histErr) {
    return NextResponse.json(
      { error: `Estado actualizado pero el historial falló: ${histErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, estado_anterior: estadoAnterior, estado_nuevo })
}
