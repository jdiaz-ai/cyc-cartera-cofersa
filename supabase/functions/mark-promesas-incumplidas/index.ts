/**
 * mark-promesas-incumplidas
 *
 * Edge Function invocada por pg_cron cada noche a las 00:00 hora Costa Rica
 * (06:00 UTC). Marca como INCUMPLIDA toda promesa PENDIENTE cuya
 * fecha_promesa < hoy, y crea una notificación para el analista asignado.
 *
 * Solo acepta peticiones autorizadas con el Service Role Key en el header:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient } from '@supabase/supabase-js'

interface Promesa {
  id: string
  cliente_cod: string
  cliente_nombre: string | null
  analista_email: string
  monto: number
  fecha_promesa: string
}

interface Usuario {
  id: string
  email: string
}

Deno.serve(async (req: Request) => {
  // ── Verificar autorización ────────────────────────────────────────────
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''

  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Crear cliente con Service Role (bypassa RLS) ──────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
    { auth: { persistSession: false } },
  )

  // ── Fecha de hoy en Costa Rica (UTC-6) ───────────────────────────────
  const hoy = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10)

  console.log(`[mark-promesas] Ejecutando para fecha: ${hoy}`)

  // ── 1. Obtener promesas vencidas ──────────────────────────────────────
  const { data: promesas, error: fetchErr } = await supabase
    .from('promesas')
    .select('id, cliente_cod, cliente_nombre, analista_email, monto, fecha_promesa')
    .eq('estado', 'PENDIENTE')
    .lt('fecha_promesa', hoy)
    .eq('activo', true)

  if (fetchErr) {
    console.error('[mark-promesas] Error al obtener promesas:', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const lista = (promesas ?? []) as Promesa[]
  console.log(`[mark-promesas] Encontradas ${lista.length} promesas vencidas.`)

  if (lista.length === 0) {
    return new Response(JSON.stringify({ marked: 0, notificaciones: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 2. Marcar como INCUMPLIDA ─────────────────────────────────────────
  const ids = lista.map(p => p.id)

  const { error: updateErr } = await supabase
    .from('promesas')
    .update({
      estado:     'INCUMPLIDA',
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)

  if (updateErr) {
    console.error('[mark-promesas] Error al actualizar promesas:', updateErr.message)
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`[mark-promesas] Marcadas ${ids.length} promesas como INCUMPLIDA.`)

  // ── 3. Resolver usuario_id por analista_email ─────────────────────────
  const emails = [...new Set(lista.map(p => p.analista_email).filter(Boolean))]

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id, email')
    .in('email', emails)

  const emailToId: Record<string, string> = {}
  ;(usuarios as Usuario[] ?? []).forEach(u => { emailToId[u.email] = u.id })

  // ── 4. Crear notificaciones ───────────────────────────────────────────
  // Formato de monto: ₡ con punto como separador de miles (estándar Cofersa)
  function fmtMonto(n: number): string {
    return '₡' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  const notificaciones = lista
    .map(p => {
      const uid = emailToId[p.analista_email]
      if (!uid) return null
      return {
        usuario_id: uid,
        tipo:       'ALERTA',
        titulo:     `Promesa incumplida — ${p.cliente_nombre ?? p.cliente_cod}`,
        mensaje:    `${fmtMonto(p.monto)} prometidos para el ${p.fecha_promesa} — sin confirmación de pago.`,
        link:       `/clientes/${p.cliente_cod}`,
        leida:      false,
      }
    })
    .filter(Boolean)

  if (notificaciones.length > 0) {
    const { error: notiErr } = await supabase
      .from('notificaciones')
      .insert(notificaciones)

    if (notiErr) {
      console.error('[mark-promesas] Error al crear notificaciones:', notiErr.message)
      // No abortar — las promesas ya se marcaron correctamente
    }
  }

  console.log(`[mark-promesas] Creadas ${notificaciones.length} notificaciones.`)

  return new Response(
    JSON.stringify({ marked: ids.length, notificaciones: notificaciones.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
