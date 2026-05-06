import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/solicitudes/[id]  { accion: 'APROBAR' | 'RECHAZAR' | 'CANCELAR', comentario? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { accion?: string; comentario?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { accion, comentario } = body
  if (!accion) return NextResponse.json({ error: 'accion requerida' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('id, rol').eq('email', user.email!).limit(1).single()
  const rol       = (usuarioRow as { id: string; rol: string } | null)?.rol       ?? ''
  const usuarioId = (usuarioRow as { id: string; rol: string } | null)?.id        ?? null

  // APROBAR / RECHAZAR — solo coordinador
  if ((accion === 'APROBAR' || accion === 'RECHAZAR') && rol !== 'COORDINADOR') {
    return NextResponse.json({ error: 'Solo el coordinador puede aprobar o rechazar' }, { status: 403 })
  }

  // CANCELAR — solo el analista que la creó o coordinador
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: solRow } = await (supabase as any)
    .from('solicitudes').select('solicitante_id, estado, cliente_cod, cliente_nombre, tipo').eq('id', id).limit(1).single()
  if (!solRow) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

  const s = solRow as { solicitante_id: string; estado: string; cliente_cod: string; cliente_nombre: string; tipo: string }

  if (accion === 'CANCELAR' && rol !== 'COORDINADOR' && s.solicitante_id !== usuarioId) {
    return NextResponse.json({ error: 'Sin permisos para cancelar esta solicitud' }, { status: 403 })
  }
  if (accion === 'CANCELAR' && s.estado !== 'PENDIENTE') {
    return NextResponse.json({ error: 'Solo se pueden cancelar solicitudes PENDIENTES' }, { status: 400 })
  }

  const estadoMap: Record<string, string> = {
    APROBAR:  'APROBADA',
    RECHAZAR: 'RECHAZADA',
    CANCELAR: 'RECHAZADA',  // cancelar = rechazar desde el analista
  }

  const updates: Record<string, unknown> = {
    estado:             estadoMap[accion],
    comentario_revisor: comentario?.trim() ?? null,
    revisor_id:         usuarioId,
    updated_at:         new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('solicitudes').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificación al solicitante (si no es el mismo que aprueba)
  if (s.solicitante_id && s.solicitante_id !== usuarioId) {
    const titulo = accion === 'APROBAR'
      ? `Solicitud aprobada: ${s.tipo.replace(/_/g, ' ')}`
      : `Solicitud rechazada: ${s.tipo.replace(/_/g, ' ')}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notificaciones').insert({
      usuario_id: s.solicitante_id,
      tipo:       'SOLICITUD',
      titulo,
      mensaje:    `Cliente: ${s.cliente_nombre ?? s.cliente_cod}. ${comentario ? 'Nota: ' + comentario : ''}`,
      leida:      false,
      link:       `/solicitudes/${id}`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}
