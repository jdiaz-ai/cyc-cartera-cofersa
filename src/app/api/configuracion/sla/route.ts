import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

// GET /api/configuracion/sla
// Devuelve todas las filas de config_sistema con clave LIKE 'sla_%'
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('config_sistema')
    .select('clave, valor')
    .like('clave', 'sla_%')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result: Record<string, string> = {}
  ;(data ?? []).forEach((r: { clave: string; valor: string }) => {
    result[r.clave] = r.valor
  })

  return NextResponse.json({ data: result })
}

// PUT /api/configuracion/sla
// Body: { [clave: string]: string } — todas las claves deben empezar con 'sla_'
export async function PUT(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: Record<string, string>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const claves = Object.keys(body)
  if (claves.length === 0) {
    return NextResponse.json({ error: 'Body vacío' }, { status: 400 })
  }

  const invalidas = claves.filter(k => !k.startsWith('sla_'))
  if (invalidas.length > 0) {
    return NextResponse.json({ error: `Claves no permitidas (deben comenzar con sla_): ${invalidas.join(', ')}` }, { status: 400 })
  }

  const admin = getAdminClient()

  const upserts = claves.map(clave => ({ clave, valor: String(body[clave]) }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('config_sistema')
    .upsert(upserts, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'config_sistema', accion: 'UPDATE',
    descripcion: `SLAs actualizados: ${claves.join(', ')}`,
    valor_nuevo: body as Record<string, unknown>,
    realizado_por: check.email,
  })

  return NextResponse.json({ ok: true })
}
