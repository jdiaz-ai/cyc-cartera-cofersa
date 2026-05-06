import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/solicitudes
// { tipo, cliente_cod, cliente_nombre, justificacion, monto_actual?, monto_solicitado?, monto?, motivo_nota?, documento_ref? }
export async function POST(req: NextRequest) {
  let body: {
    tipo?: string
    cliente_cod?: string
    cliente_nombre?: string
    justificacion?: string
    monto_actual?: number
    monto_solicitado?: number
    monto?: number
    motivo_nota?: string
    documento_ref?: string
    fecha_limite?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { tipo, cliente_cod, cliente_nombre, justificacion,
    monto_actual, monto_solicitado, monto, motivo_nota, documento_ref, fecha_limite } = body

  if (!tipo || !cliente_cod || !justificacion?.trim()) {
    return NextResponse.json({ error: 'tipo, cliente_cod y justificacion son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Obtener solicitante_id
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('id').eq('email', user.email!).limit(1).single()
  const solicitanteId = (usuarioRow as { id: string } | null)?.id ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nuevaSolicitud, error } = await (supabase as any).from('solicitudes').insert({
    tipo,
    cliente_cod,
    cliente_nombre:   cliente_nombre ?? '',
    solicitante_id:   solicitanteId,
    justificacion:    justificacion.trim(),
    monto_actual:     monto_actual     ?? null,
    monto_solicitado: monto_solicitado ?? null,
    monto:            monto            ?? null,
    motivo_nota:      motivo_nota      ?? null,
    documento_ref:    documento_ref    ?? null,
    fecha_limite:     fecha_limite     ?? null,
    estado:           'PENDIENTE',
    updated_at:       new Date().toISOString(),
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificación automática al coordinador
  const { data: coordRow } = await supabase
    .from('usuarios')
    .select('id')
    .eq('rol', 'COORDINADOR')
    .limit(1)
    .single()

  if (coordRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notificaciones').insert({
      usuario_id: (coordRow as { id: string }).id,
      tipo:       'SOLICITUD',
      titulo:     `Nueva solicitud de ${tipo.replace(/_/g, ' ')}`,
      mensaje:    `Cliente: ${cliente_nombre ?? cliente_cod}. Solicitante: ${user.email}`,
      leida:      false,
      link:       `/solicitudes/${(nuevaSolicitud as { id: string })?.id ?? ''}`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true, id: (nuevaSolicitud as { id: string })?.id })
}
