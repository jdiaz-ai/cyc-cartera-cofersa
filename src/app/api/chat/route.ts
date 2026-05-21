import { NextRequest, NextResponse } from 'next/server'
import { createClient }        from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

/**
 * POST /api/chat
 * Envía un mensaje al canal de chat del equipo.
 * Body: { mensaje: string }
 *
 * Auth: se valida con el cliente de sesión (anon key + cookies).
 * Insert: se hace con service role para evitar conflictos de RLS entre
 *         usuarios.id y auth.uid() (IDs no coinciden en este proyecto).
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

  // ── 1. Verificar sesión (cliente anon con cookies del usuario) ─────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('[chat] No autorizado — sin sesión')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // ── 2. Obtener usuario_id del sistema (tabla usuarios, no auth.users) ──
  const { data: usuarioRow, error: userErr } = await supabase
    .from('usuarios')
    .select('id, activo')
    .eq('email', user.email!)
    .single()

  if (userErr) {
    console.error('[chat] Error al buscar usuario:', userErr.message)
    return NextResponse.json({ error: 'Error al verificar usuario' }, { status: 500 })
  }

  const usuario = usuarioRow as { id: string; activo: boolean } | null

  if (!usuario) {
    console.error('[chat] Usuario no encontrado para email:', user.email)
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })
  }
  if (!usuario.activo) {
    console.error('[chat] Usuario inactivo:', user.email)
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
  }

  // ── 3. Insertar con service role (omite RLS — la auth ya fue validada) ──
  // Los IDs en la tabla usuarios no coinciden con auth.uid(), por lo que
  // las políticas RLS de mensajes_chat no pueden comparar auth.uid() = usuario_id.
  // Usamos service role aquí porque la validación de identidad ya se hizo arriba.
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await admin
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
