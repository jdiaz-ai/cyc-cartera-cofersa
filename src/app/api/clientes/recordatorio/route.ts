import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/clientes/recordatorio  { cliente_cod, documento, nota }
// Registra una gestión de tipo "Recordatorio" para la factura indicada
export async function POST(req: NextRequest) {
  let body: { cliente_cod?: string; documento?: string; nota?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, documento, nota } = body
  if (!cliente_cod || !documento) {
    return NextResponse.json({ error: 'cliente_cod y documento son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Registrar como gestión de tipo Email / resultado Recordatorio enviado
  const hoyISO = new Date(Date.now() - 6 * 3600 * 1000).toISOString().split('T')[0]
  const horaISO = new Date(Date.now() - 6 * 3600 * 1000).toISOString().split('T')[1].slice(0, 8)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('gestiones')
    .insert({
      cliente_cod,
      analista_email: user.email,
      fecha:          hoyISO,
      hora:           horaISO,
      tipo:           'Email',
      resultado:      'Recordatorio enviado',
      nota:           nota ?? `Recordatorio de factura ${documento}`,
      created_at:     new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
