import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

type Params = { params: Promise<{ cod: string }> }

// PUT /api/configuracion/vendedores/[cod]
// Reasigna analista (y opcionalmente otros campos).
// El trigger trg_asignar_analista en Supabase propaga analista_email
// a maestro_clientes donde asignacion_manual = FALSE.
export async function PUT(req: NextRequest, { params }: Params) {
  const { cod } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { analista_email?: string; supervisor_cod?: string; zona?: string; nombre?: string; email?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const admin = getAdminClient()

  // Leer valores actuales para el audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anterior } = await (admin as any)
    .from('vendedores')
    .select('analista_email, nombre, zona, supervisor_cod, email')
    .eq('cod', cod)
    .single()

  if (!anterior) return NextResponse.json({ error: 'Vendedor no encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.analista_email !== undefined) {
    updateData.analista_email = body.analista_email
    updateData.asignado_por   = check.email
    updateData.asignado_en    = new Date().toISOString()
  }
  if (body.supervisor_cod !== undefined) updateData.supervisor_cod = body.supervisor_cod
  if (body.zona           !== undefined) updateData.zona           = body.zona
  if (body.nombre         !== undefined) updateData.nombre         = body.nombre
  if (body.email          !== undefined) updateData.email          = body.email

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('vendedores')
    .update(updateData)
    .eq('cod', cod)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const desc = body.analista_email !== undefined
    ? `Vendedor ${cod} reasignado: ${(anterior as Record<string,unknown>).analista_email ?? 'sin asignación'} → ${body.analista_email ?? 'sin asignación'}`
    : `Vendedor ${cod} actualizado`

  await insertAuditLog(admin, {
    tabla: 'vendedores', accion: 'UPDATE',
    descripcion: desc,
    valor_anterior: anterior as Record<string, unknown>,
    valor_nuevo: updateData,
    realizado_por: check.email,
  })

  return NextResponse.json({ data })
}

// DELETE /api/configuracion/vendedores/[cod] → soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { cod } = await params
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('vendedores')
    .update({ activo: false })
    .eq('cod', cod)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'vendedores', accion: 'DELETE',
    descripcion: `Vendedor ${cod} desactivado`,
    valor_nuevo: { activo: false },
    realizado_por: check.email,
  })

  return NextResponse.json({ ok: true })
}
