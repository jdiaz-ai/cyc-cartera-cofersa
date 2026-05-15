import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'

// ── Tipos del body ─────────────────────────────────────────────────────
export interface ReportarPagoBody {
  // Identificación del cliente
  cliente_cod:   string
  contribuyente: string

  // Datos del pago
  banco_origen:        string   // 'BAC' | 'BN' | 'BCR' | 'DAVIVIENDA'
  referencia:          string   // número de transferencia único
  monto_transferido:   number   // total en CRC
  fecha_transferencia: string   // YYYY-MM-DD

  // Facturas seleccionadas
  detalles: {
    factura_id:    number
    documento:     string
    monto_aplicado: number
  }[]

  // Opcional
  notas?: string
}

/**
 * POST /api/clientes/pagos/reportar
 *
 * Registra un reporte de pago con sus facturas aplicadas.
 * Operación cuasi-transaccional:
 *   1. Validar que Σ detalles === monto_transferido
 *   2. Verificar unicidad de referencia
 *   3. INSERT reportes_pago
 *   4. INSERT reporte_pago_detalles (bulk)
 *   5. Si paso 4 falla → DELETE reporte (rollback)
 */
export async function POST(req: NextRequest) {
  let body: ReportarPagoBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const {
    cliente_cod, contribuyente,
    banco_origen, referencia, monto_transferido, fecha_transferencia,
    detalles, notas,
  } = body

  // ── Validaciones básicas ───────────────────────────────────────────
  if (!cliente_cod || !contribuyente) {
    return NextResponse.json({ error: 'Cliente requerido' }, { status: 400 })
  }
  if (!banco_origen || !referencia || !monto_transferido || !fecha_transferencia) {
    return NextResponse.json({ error: 'Datos del pago incompletos' }, { status: 400 })
  }
  if (!detalles || detalles.length === 0) {
    return NextResponse.json({ error: 'Debe seleccionar al menos una factura' }, { status: 400 })
  }

  // ── Validar que la suma de detalles cuadra con el monto total ──────
  const sumaDetalles = detalles.reduce((acc, d) => acc + Number(d.monto_aplicado), 0)
  const diff = Math.abs(sumaDetalles - Number(monto_transferido))
  if (diff > 1) {   // tolerancia de ₡1 por redondeos
    return NextResponse.json({
      error: `La suma de facturas (₡${sumaDetalles.toFixed(0)}) no coincide con el monto transferido (₡${monto_transferido.toFixed(0)})`,
    }, { status: 422 })
  }

  const supabase = await createClient()

  // ── Autenticación ──────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const analista_email = user.email

  // ── Verificar unicidad de referencia ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refExist } = await (supabase as any)
    .from('reportes_pago')
    .select('id')
    .eq('referencia', referencia.trim())
    .limit(1)

  if (refExist && refExist.length > 0) {
    return NextResponse.json({
      error: `Ya existe un reporte con la referencia "${referencia.trim()}". Verifique el número de transferencia.`,
    }, { status: 409 })
  }

  // ── PASO 1: INSERT cabecera reportes_pago ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rData, error: rErr } = await (supabase as any)
    .from('reportes_pago')
    .insert({
      cliente_cod,
      contribuyente,
      analista_email,
      banco_origen,
      referencia:          referencia.trim(),
      monto_transferido:   Number(monto_transferido),
      fecha_transferencia,
      notas:               notas?.trim() ?? null,
      estado:              'pendiente',
    })
    .select('id')
    .single()

  if (rErr || !rData) {
    return NextResponse.json(
      { error: `Error al guardar reporte: ${rErr?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }
  const reporteId: string = rData.id

  // ── PASO 2: INSERT detalles (bulk) ────────────────────────────────
  const detallesRows = detalles.map(d => ({
    reporte_id:     reporteId,
    factura_id:     d.factura_id,
    documento:      d.documento,
    monto_aplicado: Number(d.monto_aplicado),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dErr } = await (supabase as any)
    .from('reporte_pago_detalles')
    .insert(detallesRows)

  if (dErr) {
    // ── ROLLBACK: eliminar cabecera ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('reportes_pago').delete().eq('id', reporteId)

    return NextResponse.json(
      { error: `Error al guardar detalles: ${dErr.message}. El reporte no fue guardado.` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, reporte_id: reporteId })
}
