import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hoyISO_CR } from '@/lib/utils/timezone'

/**
 * MÓDULO PROMESAS — CENTRO DE SEGUIMIENTO
 *
 * Las promesas YA NO se crean manualmente desde aquí.
 * Toda promesa nace ÚNICAMENTE desde Gestiones cuando el resultado es
 * "Compromiso de pago confirmado" (ver gestiones/nueva/route.ts).
 *
 * Este endpoint solo permite:
 *   PATCH   → validación manual (CUMPLIDA | INCUMPLIDA | ABONO_PARCIAL)
 *   DELETE  → soft-delete (solo coordinador)
 *
 * Reprogramación → endpoint separado: /api/promesas/reprogramar
 */

// ── Tipo de evento del mini-timeline ───────────────────────────────────
interface EventoPromesa {
  fecha:       string
  tipo:        'creada' | 'cumplida' | 'incumplida' | 'abono' | 'reprogramada' | 'nota'
  descripcion: string
  por:         string
}

// PATCH /api/clientes/promesas
// { id, estado: 'CUMPLIDA'|'INCUMPLIDA'|'ABONO_PARCIAL',
//   comentario?, monto_abono_parcial? }
export async function PATCH(req: NextRequest) {
  let body: {
    id?:                  string
    estado?:              string
    comentario?:          string
    monto_abono_parcial?: number
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { id, estado, comentario, monto_abono_parcial } = body
  if (!id)     return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (!estado) return NextResponse.json({ error: 'estado requerido' }, { status: 400 })

  const ESTADOS_VALIDOS = ['CUMPLIDA', 'INCUMPLIDA', 'ABONO_PARCIAL']
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json(
      { error: 'Estado inválido. Use CUMPLIDA, INCUMPLIDA o ABONO_PARCIAL. Para reprogramar use /api/promesas/reprogramar' },
      { status: 400 },
    )
  }

  // ── Validaciones de campos obligatorios por estado ──────────────────
  if (estado === 'INCUMPLIDA' && !comentario?.trim()) {
    return NextResponse.json({ error: 'El motivo/comentario es obligatorio al marcar incumplida' }, { status: 400 })
  }
  if (estado === 'ABONO_PARCIAL') {
    if (!monto_abono_parcial || monto_abono_parcial <= 0) {
      return NextResponse.json({ error: 'El monto del abono es obligatorio y debe ser mayor a 0' }, { status: 400 })
    }
    if (!comentario?.trim()) {
      return NextResponse.json({ error: 'El comentario es obligatorio al registrar un abono parcial' }, { status: 400 })
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // ── Permisos ────────────────────────────────────────────────────────
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('rol').eq('email', user.email).limit(1).single()
  const rol = (usuarioRow as { rol: string } | null)?.rol ?? ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pRow } = await (supabase as any)
    .from('promesas')
    .select('analista_email, estado, monto, eventos')
    .eq('id', id)
    .limit(1)
    .single()
  if (!pRow) return NextResponse.json({ error: 'Promesa no encontrada' }, { status: 404 })

  if (rol !== 'COORDINADOR' && pRow.analista_email !== user.email) {
    return NextResponse.json({ error: 'Sin permisos para validar esta promesa' }, { status: 403 })
  }

  // No re-validar promesas ya cerradas
  if (['CUMPLIDA', 'REPROGRAMADA'].includes(pRow.estado)) {
    return NextResponse.json(
      { error: `Esta promesa ya está ${pRow.estado.toLowerCase()} y no puede modificarse` },
      { status: 409 },
    )
  }

  const hoy = hoyISO_CR()

  // ── Construir evento para el mini-timeline ─────────────────────────
  const eventosPrev: EventoPromesa[] = Array.isArray(pRow.eventos) ? pRow.eventos : []
  let descripcion = ''
  let tipoEvento: EventoPromesa['tipo'] = 'nota'

  if (estado === 'CUMPLIDA') {
    tipoEvento  = 'cumplida'
    descripcion = `Promesa validada como CUMPLIDA${comentario?.trim() ? ` — ${comentario.trim()}` : ''}`
  } else if (estado === 'INCUMPLIDA') {
    tipoEvento  = 'incumplida'
    descripcion = `Promesa marcada INCUMPLIDA — ${comentario!.trim()}`
  } else if (estado === 'ABONO_PARCIAL') {
    tipoEvento  = 'abono'
    descripcion = `Abono parcial de ₡${Math.round(monto_abono_parcial!).toLocaleString('es-CR')} — ${comentario!.trim()}`
  }

  const nuevoEvento: EventoPromesa = {
    fecha:       hoy,
    tipo:        tipoEvento,
    descripcion,
    por:         user.email,
  }

  // ── Updates ─────────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {
    estado,
    fecha_validacion:      hoy,
    validado_por:          user.email,
    comentario_validacion: comentario?.trim() ?? null,
    eventos:               [...eventosPrev, nuevoEvento],
    updated_at:            new Date().toISOString(),
  }
  if (estado === 'ABONO_PARCIAL') {
    updates.monto_abono_parcial = monto_abono_parcial
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('promesas').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, estado, evento: nuevoEvento })
}

// DELETE /api/clientes/promesas  { id }  — soft-delete (solo coordinador)
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
