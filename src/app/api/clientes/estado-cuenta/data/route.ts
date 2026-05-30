import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'

/**
 * GET /api/clientes/estado-cuenta/data?cod=XXXX
 * Devuelve los datos necesarios para construir el Estado de Cuenta (PDF/Excel)
 * en el cliente. Reusa las mismas consultas que el envío por correo.
 * No envía nada — solo retorna datos.
 */
export async function GET(req: NextRequest) {
  const cod = req.nextUrl.searchParams.get('cod')
  if (!cod) return NextResponse.json({ error: 'cod requerido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // ── Cliente (maestro): nombre, contribuyente, condición, analista, correo ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mc } = await (supabase as any)
    .from('maestro_clientes')
    .select('cliente_nombre, contribuyente, condicion_pago, analista_email, correo')
    .eq('cliente_cod', cod)
    .limit(1)
    .single()

  if (!mc) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const contribuyente = (mc as { contribuyente?: string }).contribuyente ?? ''
  const analistaEmail = (mc as { analista_email?: string }).analista_email ?? user.email!

  // ── Analista asignado ──────────────────────────────────────────────────
  const { data: usr } = await supabase
    .from('usuarios')
    .select('nombre, telefono, whatsapp')
    .ilike('email', analistaEmail)
    .limit(1)
    .single()
  const analista = usr as { nombre: string; telefono?: string | null; whatsapp?: string | null } | null

  // ── Facturas con saldo ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facturas } = await (supabase as any)
    .from('facturas')
    .select('documento, fecha_documento, fecha_vencimiento, monto, saldo')
    .eq('contribuyente', contribuyente)
    .gt('saldo', 0)
    .order('fecha_vencimiento', { ascending: true })

  // ── Cuentas bancarias ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cuentasData } = await (supabase as any)
    .from('cuentas_bancarias')
    .select('banco, moneda, tipo, numero, iban, orden')
    .eq('activo', true)
    .order('orden', { ascending: true })

  const hoy = new Date(Date.now() - 6 * 3600_000).toISOString().split('T')[0]
  const [y, m, d] = hoy.split('-')

  return NextResponse.json({
    clienteNombre:    (mc as { cliente_nombre?: string }).cliente_nombre ?? cod,
    contribuyente,
    clienteCod:       cod,
    correo:           (mc as { correo?: string }).correo ?? '',
    condicionPago:    (mc as { condicion_pago?: string }).condicion_pago ?? null,
    analistaNombre:   analista?.nombre ?? analistaEmail,
    analistaEmail,
    analistaTelefono: analista?.telefono ?? null,
    analistaWhatsapp: analista?.whatsapp ?? null,
    cuentas:          cuentasData ?? [],
    facturas:         facturas ?? [],
    fechaCorte:       `${d}/${m}/${y}`,
  })
}
