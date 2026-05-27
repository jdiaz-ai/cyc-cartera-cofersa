import { NextRequest, NextResponse } from 'next/server'
import { checkCoordinador, getAdminClient, insertAuditLog } from '@/lib/configuracion/admin'

// Claves del semáforo almacenadas en config_sistema
const CLAVES_SEMAFORO = [
  'semaforo_rojo_mora_dias',
  'semaforo_rojo_sin_gestion_dias',
  'semaforo_ambar_mora_min',
  'semaforo_ambar_mora_max',
  'semaforo_ambar_promesa_dias',
  'semaforo_ambar_sin_gestion_dias',
]

// Valores por defecto si no existen en BD
const DEFAULTS: Record<string, string> = {
  semaforo_rojo_mora_dias:         '60',
  semaforo_rojo_sin_gestion_dias:  '10',
  semaforo_ambar_mora_min:         '31',
  semaforo_ambar_mora_max:         '60',
  semaforo_ambar_promesa_dias:     '7',
  semaforo_ambar_sin_gestion_dias: '5',
}

// GET /api/configuracion/semaforo
export async function GET() {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  const admin = getAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('config_sistema')
    .select('clave, valor')
    .in('clave', CLAVES_SEMAFORO)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Merge con defaults
  const result: Record<string, string> = { ...DEFAULTS }
  ;(data ?? []).forEach((r: { clave: string; valor: string }) => {
    result[r.clave] = r.valor
  })

  return NextResponse.json({ data: result })
}

// PUT /api/configuracion/semaforo — guarda todas las reglas de una vez
// { semaforo_rojo_mora_dias: 60, semaforo_rojo_sin_gestion_dias: 10, ... }
export async function PUT(req: NextRequest) {
  const check = await checkCoordinador()
  if (!check.ok) return check.res

  let body: Record<string, number>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  // Validar que solo vengan las claves permitidas
  const clavesRecibidas = Object.keys(body)
  const invalidas = clavesRecibidas.filter(k => !CLAVES_SEMAFORO.includes(k))
  if (invalidas.length > 0) {
    return NextResponse.json({ error: `Claves no permitidas: ${invalidas.join(', ')}` }, { status: 400 })
  }

  const admin = getAdminClient()

  // Upsert cada clave
  const upserts = clavesRecibidas.map(clave => ({
    clave,
    valor: String(body[clave]),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('config_sistema')
    .upsert(upserts, { onConflict: 'clave' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await insertAuditLog(admin, {
    tabla: 'config_sistema', accion: 'UPDATE',
    descripcion: 'Reglas del semáforo de riesgo actualizadas',
    valor_nuevo: body as Record<string, unknown>,
    realizado_por: check.email,
  })

  return NextResponse.json({ ok: true })
}
