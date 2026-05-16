import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'

// ── Tipos del body ─────────────────────────────────────────────────────
export interface NuevaGestionBody {
  // Identificación
  cliente_cod:   string
  contribuyente: string

  // Gestión
  tipo:      string
  resultado: string
  nota:      string
  fecha:     string   // YYYY-MM-DD en America/Costa_Rica
  hora:      string   // HH:MM:SS en America/Costa_Rica

  // Próxima acción
  proxima_accion?:       string | null
  proxima_accion_fecha?: string | null

  // Metadata estructurada por resultado
  metadata?: Record<string, unknown> | null

  // Promesa (solo si resultado = "Compromiso de pago confirmado")
  promesa?: {
    monto:            number
    fecha_promesa:    string   // YYYY-MM-DD en America/Costa_Rica
    facturas_ids?:    number[]
  } | null
}

/**
 * POST /api/clientes/gestiones/nueva
 *
 * Operación cuasi-transaccional:
 *   1. Verificar no-duplicado si hay promesa
 *   2. INSERT gestión
 *   3. INSERT promesa (si aplica)
 *   4. UPDATE gestión.promesa_id (si aplica)
 *   5. Si cualquier paso falla → soft rollback (DELETE gestión)
 */
export async function POST(req: NextRequest) {
  let body: NuevaGestionBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, contribuyente, tipo, resultado, nota, fecha, hora,
          proxima_accion, proxima_accion_fecha, metadata, promesa } = body

  // ── Validaciones básicas ───────────────────────────────────────────
  if (!cliente_cod || !tipo || !resultado || !fecha || !hora) {
    return NextResponse.json({ error: 'Campos obligatorios faltantes' }, { status: 400 })
  }

  const supabase = await createClient()

  // ── Autenticación ──────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const analista_email = user.email   // quien REGISTRA, no el asignado

  // ── Anti-duplicado de promesa ──────────────────────────────────────
  if (promesa) {
    const { data: dup } = await supabase
      .from('promesas')
      .select('id')
      .eq('cliente_cod',   cliente_cod)
      .eq('monto',         promesa.monto)
      .eq('fecha_promesa', promesa.fecha_promesa)
      .eq('estado',        'PENDIENTE')
      .limit(1)

    if (dup && dup.length > 0) {
      return NextResponse.json({
        error: `Ya existe una promesa pendiente por ₡${promesa.monto.toLocaleString('es-CR')} para el ${promesa.fecha_promesa}. No se permiten promesas duplicadas.`,
      }, { status: 409 })
    }
  }

  // ── PASO 1: INSERT gestión ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gData, error: gErr } = await (supabase as any)
    .from('gestiones')
    .insert({
      cliente_cod,
      contribuyente,
      analista_email,
      fecha,
      hora,
      tipo,
      resultado,
      nota: nota.trim(),
      proxima_accion:       proxima_accion       ?? null,
      proxima_accion_fecha: proxima_accion_fecha ?? null,
      metadata:             metadata             ?? null,
      legacy:               false,
      archived:             false,
    })
    .select('id')
    .single()

  if (gErr || !gData) {
    return NextResponse.json(
      { error: `Error al guardar gestión: ${gErr?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }
  const gestionId: string = gData.id

  // ── PASO 2: INSERT promesa (si aplica) ─────────────────────────────
  if (promesa) {
    // Nombre del cliente para desnormalizar en la bandeja de promesas
    const { data: mRow } = await supabase
      .from('maestro_clientes')
      .select('cliente_nombre')
      .eq('cliente_cod', cliente_cod)
      .limit(1)
      .maybeSingle()
    const clienteNombre =
      (mRow as { cliente_nombre: string } | null)?.cliente_nombre ?? contribuyente ?? null

    // Evento inicial del mini-timeline
    const eventoCreada = {
      fecha:       fecha,
      tipo:        'creada',
      descripcion: `Promesa creada desde gestión (${resultado})`,
      por:         analista_email,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pData, error: pErr } = await (supabase as any)
      .from('promesas')
      .insert({
        cliente_cod,
        cliente_nombre: clienteNombre,
        contribuyente,
        analista_email,
        fecha_creacion: fecha,
        fecha_promesa:  promesa.fecha_promesa,
        monto:          promesa.monto,
        estado:         'PENDIENTE',
        notas:          nota.trim(),
        gestion_id:     gestionId,           // trazabilidad obligatoria
        eventos:        [eventoCreada],
      })
      .select('id')
      .single()

    if (pErr || !pData) {
      // ── ROLLBACK: eliminar la gestión recién creada ────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('gestiones').delete().eq('id', gestionId)

      return NextResponse.json(
        { error: `Error al crear promesa: ${pErr?.message ?? 'desconocido'}. La gestión no fue guardada.` },
        { status: 500 },
      )
    }

    const promesaId: string = pData.id

    // ── PASO 3: Vincular promesa_id en la gestión ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('gestiones')
      .update({ promesa_id: promesaId })
      .eq('id', gestionId)
  }

  return NextResponse.json({ ok: true, gestion_id: gestionId })
}
