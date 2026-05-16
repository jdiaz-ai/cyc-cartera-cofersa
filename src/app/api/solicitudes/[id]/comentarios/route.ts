import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/solicitudes/[id]/comentarios  { contenido }
// Agrega un comentario interno. Sin correo ni notificación.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { contenido?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const contenido = body.contenido?.trim()
  if (!contenido) {
    return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: usuarioRow } = await supabase
    .from('usuarios').select('id, nombre').ilike('email', user.email).limit(1).single()
  const u = usuarioRow as { id: string; nombre: string } | null
  if (!u?.id) {
    return NextResponse.json({ error: 'Tu usuario no está registrado en el sistema.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nuevo, error } = await (supabase as any)
    .from('solicitud_comentarios')
    .insert({ solicitud_id: id, usuario_id: u.id, contenido })
    .select('id, contenido, created_at')
    .single()

  if (error || !nuevo) {
    return NextResponse.json(
      { error: `Error al guardar el comentario: ${error?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok:        true,
    comentario: {
      ...(nuevo as { id: string; contenido: string; created_at: string }),
      usuario_id:     u.id,
      usuario_nombre: u.nombre,
    },
  })
}
