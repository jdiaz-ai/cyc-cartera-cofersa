import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/chat
 * Envía un mensaje al canal de chat del equipo.
 * Body: { mensaje: string }
 */
export async function POST(req: NextRequest) {
  let body: { mensaje?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { mensaje } = body

  if (!mensaje?.trim()) {
    return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })
  }

  if (mensaje.trim().length > 1000) {
    return NextResponse.json({ error: 'El mensaje excede los 1000 caracteres' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verificar sesión
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Obtener usuario_id del sistema
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id, activo')
    .eq('email', user.email!)
    .single()

  const usuario = usuarioRow as { id: string; activo: boolean } | null

  if (!usuario?.activo) {
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
  }

  // Insertar mensaje
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('mensajes_chat')
    .insert({ usuario_id: usuario.id, mensaje: mensaje.trim() })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[chat] Error al insertar mensaje:', error.message)
    return NextResponse.json({ error: 'Error al enviar el mensaje' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at })
}
