import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/clientes/email-cobro
 * Envía un email de cobro personalizado usando la cuenta Gmail del analista.
 *
 * Body: { to, asunto, mensaje, providerToken, clienteNombre, clienteCod }
 * Returns: { email_sent: true } | { error: string }
 */
export async function POST(req: NextRequest) {
  let body: {
    to?:            string
    asunto?:        string
    mensaje?:       string
    providerToken?: string | null
    clienteNombre?: string
    clienteCod?:    string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { to, asunto, mensaje, providerToken, clienteNombre, clienteCod } = body

  if (!to?.trim() || !asunto?.trim() || !mensaje?.trim()) {
    return NextResponse.json({ error: 'to, asunto y mensaje son requeridos' }, { status: 400 })
  }
  if (!providerToken) {
    return NextResponse.json(
      { error: 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar.' },
      { status: 401 },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // ── Nombre del analista ───────────────────────────────────────────────
  const { data: usuRow } = await supabase
    .from('usuarios').select('nombre').ilike('email', user.email!).limit(1).single()
  const nombreAnalista = (usuRow as { nombre: string } | null)?.nombre ?? user.email!

  // ── Fecha/hora Costa Rica ─────────────────────────────────────────────
  const hoyStr = new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: 'long', year: 'numeric' })

  // ── HTML del email ────────────────────────────────────────────────────
  const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media(max-width:600px){.sic-main{width:100%!important;border-radius:0!important}}</style></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table class="sic-main" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">
        <!-- HEADER -->
        <tr>
          <td style="background:#003B5C;padding:20px 32px;">
            <p style="margin:0;color:#009ee3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">COFERSA · CRÉDITO Y COBRO</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Gestión de Cobro</h1>
          </td>
        </tr>
        <!-- CLIENTE -->
        ${clienteNombre || clienteCod ? `
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
            <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${clienteNombre ?? clienteCod}</p>
            ${clienteCod ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${clienteCod}</p>` : ''}
          </td>
        </tr>` : ''}
        <!-- MENSAJE -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Mensaje</p>
            <div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:14px 18px;">
              <p style="margin:0;font-size:13px;color:#334155;line-height:1.7;white-space:pre-wrap;">${mensaje.trim()}</p>
            </div>
          </td>
        </tr>
        <!-- CONTACTO -->
        <tr>
          <td style="padding:20px 32px 28px;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;">Para consultas, comuníquese con su ejecutivo de cuenta:</p>
            <p style="margin:0;font-size:13px;font-weight:700;color:#1e293b;">${nombreAnalista} &lt;${user.email}&gt;</p>
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera · ${hoyStr}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  // ── Construir RFC 2822 + base64url ────────────────────────────────────
  const encH = (str: string) => `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`

  const rawEmail = [
    `From: ${encH(nombreAnalista)} <${user.email}>`,
    `To: ${to.trim()}`,
    `Subject: ${encH(asunto.trim())}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].join('\r\n')

  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // ── Gmail API ─────────────────────────────────────────────────────────
  try {
    const gmailRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ raw: encodedEmail }),
      },
    )

    if (!gmailRes.ok) {
      const errBody = await gmailRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: `Error Gmail API: ${(errBody as { error?: { message?: string } }).error?.message ?? gmailRes.status}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ email_sent: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Error de red al enviar: ${err instanceof Error ? err.message : 'desconocido'}` },
      { status: 502 },
    )
  }
}
