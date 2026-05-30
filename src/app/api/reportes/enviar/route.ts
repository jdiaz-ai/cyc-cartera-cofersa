import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { resolveGmailToken }        from '@/lib/utils/gmail-token'

/**
 * POST /api/reportes/enviar
 * Envía un correo HTML (reporte por vendedor) vía Gmail del usuario logueado.
 * Body: { to, cc?: string[], subject, html, providerToken?, providerRefreshToken? }
 */
export async function POST(req: NextRequest) {
  let body: {
    to?: string; cc?: string[]; subject?: string; html?: string
    providerToken?: string | null; providerRefreshToken?: string | null
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { to, cc, subject, html, providerToken, providerRefreshToken } = body
  if (!to?.trim() || !subject?.trim() || !html?.trim()) {
    return NextResponse.json({ error: 'to, subject y html son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo coordinador puede enviar reportes por vendedor
  const { data: perfil } = await supabase
    .from('usuarios').select('rol, nombre').ilike('email', user.email!).limit(1).maybeSingle()
  const rol    = (perfil as { rol?: string } | null)?.rol ?? 'ANALISTA'
  const nombre = (perfil as { nombre?: string } | null)?.nombre ?? user.email!
  if (rol !== 'COORDINADOR') {
    return NextResponse.json({ error: 'Solo el coordinador puede enviar estos reportes' }, { status: 403 })
  }

  const gmailToken = await resolveGmailToken(providerToken, providerRefreshToken, user.email)
  if (!gmailToken) {
    return NextResponse.json({ error: 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar.' }, { status: 401 })
  }

  const encH    = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`
  const ccList  = (cc ?? []).filter(x => x && x.trim())
  const rawEmail = [
    `From: ${encH(nombre)} <${user.email}>`,
    `To: ${to.trim()}`,
    ...(ccList.length > 0 ? [`Cc: ${ccList.join(', ')}`] : []),
    `Subject: ${encH(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n')

  const encoded = Buffer.from(rawEmail).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  try {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    })
    if (r.ok) return NextResponse.json({ ok: true, email_sent: true, to: to.trim() })
    const e = await r.json().catch(() => ({}))
    const msg = r.status === 401 ? 'Sesión de Google expirada.'
              : (e as { error?: { message?: string } })?.error?.message ?? `Error Gmail (${r.status})`
    return NextResponse.json({ ok: false, email_sent: false, error: msg }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ ok: false, email_sent: false, error: `Error de red: ${err instanceof Error ? err.message : 'desconocido'}` }, { status: 200 })
  }
}
