import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hoyISO_CR } from '@/lib/utils/timezone'

/**
 * POST /api/clientes/promesas/reprogramar
 *
 * Reprogramar NO edita la promesa original. Crea una NUEVA promesa
 * relacionada (reprogramada_de_id) y marca la original como REPROGRAMADA.
 * Esto preserva la trazabilidad histórica completa.
 *
 * Body: { id, nueva_fecha, nuevo_monto, motivo }
 */

interface EventoPromesa {
  fecha:       string
  tipo:        'creada' | 'cumplida' | 'incumplida' | 'abono' | 'reprogramada' | 'nota'
  descripcion: string
  por:         string
}

export async function POST(req: NextRequest) {
  let body: {
    id?:          string
    nueva_fecha?: string
    nuevo_monto?: number
    motivo?:      string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { id, nueva_fecha, nuevo_monto, motivo } = body
  if (!id)                                return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (!nueva_fecha)                       return NextResponse.json({ error: 'La nueva fecha es obligatoria' }, { status: 400 })
  if (!nuevo_monto || nuevo_monto <= 0)   return NextResponse.json({ error: 'El nuevo monto es obligatorio y debe ser mayor a 0' }, { status: 400 })
  if (!motivo?.trim())                    return NextResponse.json({ error: 'El motivo de reprogramación es obligatorio' }, { status: 400 })

  const hoy = hoyISO_CR()
  if (nueva_fecha < hoy) {
    return NextResponse.json({ error: 'La nueva fecha no puede ser en el pasado' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // ── Permisos ────────────────────────────────────────────────────────
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orig } = await (supabase as any)
    .from('promesas')
    .select('*')
    .eq('id', id)
    .limit(1)
    .single()
  if (!orig) return NextResponse.json({ error: 'Promesa no encontrada' }, { status: 404 })

  if (rol !== 'COORDINADOR' && orig.analista_email !== user.email) {
    return NextResponse.json({ error: 'Sin permisos para reprogramar esta promesa' }, { status: 403 })
  }

  if (['CUMPLIDA', 'REPROGRAMADA'].includes(orig.estado)) {
    return NextResponse.json(
      { error: `Esta promesa ya está ${orig.estado.toLowerCase()} y no puede reprogramarse` },
      { status: 409 },
    )
  }

  // ── PASO 1: Crear la nueva promesa relacionada ─────────────────────
  const eventoCreada: EventoPromesa = {
    fecha:       hoy,
    tipo:        'reprogramada',
    descripcion: `Reprogramada desde promesa anterior (₡${Math.round(orig.monto).toLocaleString('es-CR')} → ₡${Math.round(nuevo_monto).toLocaleString('es-CR')}) — ${motivo.trim()}`,
    por:         user.email,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nueva, error: nErr } = await (supabase as any)
    .from('promesas')
    .insert({
      cliente_cod:        orig.cliente_cod,
      cliente_nombre:     orig.cliente_nombre,
      contribuyente:      orig.contribuyente,
      analista_email:     orig.analista_email,
      fecha_creacion:     hoy,
      fecha_promesa:      nueva_fecha,
      monto:              nuevo_monto,
      estado:             'PENDIENTE',
      notas:              orig.notas,
      gestion_id:         orig.gestion_id,    // mantiene trazabilidad a la gestión origen
      reprogramada_de_id: orig.id,
      eventos:            [eventoCreada],
    })
    .select('id')
    .single()

  if (nErr || !nueva) {
    return NextResponse.json(
      { error: `Error al crear la promesa reprogramada: ${nErr?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }

  // ── PASO 2: Marcar la original como REPROGRAMADA ───────────────────
  const eventosPrev: EventoPromesa[] = Array.isArray(orig.eventos) ? orig.eventos : []
  const eventoCierre: EventoPromesa = {
    fecha:       hoy,
    tipo:        'reprogramada',
    descripcion: `Reprogramada a nueva fecha ${nueva_fecha} por ₡${Math.round(nuevo_monto).toLocaleString('es-CR')} — ${motivo.trim()}`,
    por:         user.email,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: uErr } = await (supabase as any)
    .from('promesas')
    .update({
      estado:                'REPROGRAMADA',
      fecha_validacion:      hoy,
      validado_por:          user.email,
      comentario_validacion: motivo.trim(),
      eventos:               [...eventosPrev, eventoCierre],
      updated_at:            new Date().toISOString(),
    })
    .eq('id', id)

  if (uErr) {
    // Soft rollback: eliminar la nueva promesa para no dejar duplicado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('promesas').delete().eq('id', nueva.id)
    return NextResponse.json(
      { error: `Error al cerrar la promesa original: ${uErr.message}. No se reprogramó.` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, nueva_promesa_id: nueva.id })
}
