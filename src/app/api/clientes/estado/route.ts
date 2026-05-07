import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ESTADOS_VALIDOS = ['Normal', 'Bloqueado', 'Convenio', 'Suspendido']

// POST /api/clientes/estado  { cliente_cod, estado, estado_anterior? }
export async function POST(req: NextRequest) {
  let cliente_cod: string, estado: string, estado_anterior: string | undefined
  try {
    const body    = await req.json()
    cliente_cod   = body.cliente_cod
    estado        = body.estado
    estado_anterior = body.estado_anterior
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
  const { data: coordRow } = await supabase
    .from('usuarios')
    .select('id, rol, nombre')
    .eq('email', user.email!)
    .limit(1)
    .single()

  const coordTyped = coordRow as { id: string; rol: string; nombre: string } | null
  if (coordTyped?.rol !== 'COORDINADOR') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const coord = coordTyped!

  // Actualizar estado en maestro_clientes + obtener analista_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: clienteRow, error } = await (supabase as any)
    .from('maestro_clientes')
    .update({ estado_manual: estado, updated_at: new Date().toISOString() })
    .eq('cliente_cod', cliente_cod)
    .select('analista_id, nombre')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cliente = clienteRow as { analista_id: string | null; nombre: string } | null

  // Log de auditoría: registrar en gestiones como tipo SISTEMA
  const hoy  = new Date()
  const fecha = hoy.toISOString().split('T')[0]
  const hora  = `${String(hoy.getHours()).padStart(2,'0')}:${String(hoy.getMinutes()).padStart(2,'0')}:00`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('gestiones').insert({
    cliente_cod,
    contribuyente: cliente_cod,
    analista_email: user.email,
    fecha,
    hora,
    tipo:      'SISTEMA',
    resultado: 'Cambio de estado',
    nota:      `Estado cambiado de "${estado_anterior ?? 'desconocido'}" a "${estado}" por ${coord.nombre ?? user.email}.`,
    activo:    true,
    updated_at: new Date().toISOString(),
  })

  // Notificación al analista asignado (si existe y no es el mismo coordinador)
  if (cliente?.analista_id && cliente.analista_id !== coord.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notificaciones').insert({
      usuario_id: cliente.analista_id,
      tipo:       'ALERTA',
      titulo:     `Estado de cliente cambiado a ${estado}`,
      mensaje:    `El coordinador cambió el estado de ${cliente_cod} de "${estado_anterior ?? '—'}" a "${estado}".`,
      leida:      false,
      link:       `/clientes/${cliente_cod}`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true, estado })
}
