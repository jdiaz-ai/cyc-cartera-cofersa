import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

// Claves de parámetros operativos (excluyendo semáforo y SLA que tienen sus propias rutas)
const CLAVES_PARAMETROS = [
  'meta_mensual',
  'meta_gestiones_diarias',
  'dias_sin_gestion_alerta',
  'pct_mora_referencia',
]

// GET /api/configuracion/parametros
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('config_sistema')
    .select('clave, valor, descripcion')
    .in('clave', CLAVES_PARAMETROS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// PUT /api/configuracion/parametros
// { clave: string, valor: string }
export async function PUT(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: { clave: string; valor: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  if (!CLAVES_PARAMETROS.includes(body.clave)) {
    return NextResponse.json({ error: `Clave no permitida: ${body.clave}` }, { status: 400 })
  }
  if (body.valor === undefined || body.valor === null) {
    return NextResponse.json({ error: 'valor es requerido' }, { status: 400 })
  }

  const admin = getAdminClient()

  // Leer valor anterior para audit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anterior } = await (admin as any)
    .from('config_sistema').select('valor').eq('clave', body.clave).single()
  const valorAnterior = (anterior as { valor: string } | null)?.valor ?? null

  // Upsert (insert si no existe, update si existe)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('config_sistema')
    .upsert({ clave: body.clave, valor: String(body.valor) }, { onConflict: 'clave' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'config_sistema', accion: 'UPDATE',
    descripcion: `Parámetro ${body.clave} actualizado: ${valorAnterior} → ${body.valor}`,
    valor_anterior: { clave: body.clave, valor: valorAnterior },
    valor_nuevo: { clave: body.clave, valor: body.valor },
    realizado_por: check.email,
  })

  return NextResponse.json({ data })
}
