import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/clientes/estado-cuenta
// { cliente_cod, cliente_nombre, contribuyente, to_email, cc_emails?, mensaje?, providerToken }
export async function POST(req: NextRequest) {
  let body: {
    cliente_cod?:    string
    cliente_nombre?: string
    contribuyente?:  string
    to_email?:       string
    cc_emails?:      string[]
    mensaje?:        string
    providerToken?:  string | null
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, cliente_nombre, contribuyente, to_email, cc_emails, mensaje, providerToken } = body

  if (!cliente_cod || !to_email?.trim()) {
    return NextResponse.json({ error: 'cliente_cod y to_email son requeridos' }, { status: 400 })
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

  // ── Obtener nombre del analista ──────────────────────────────────────
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('nombre')
    .ilike('email', user.email!)
    .limit(1)
    .single()
  const nombreAnalista = (usuarioRow as { nombre: string } | null)?.nombre ?? user.email!

  // ── Cargar facturas del cliente con saldo > 0 ────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facturas } = await (supabase as any)
    .from('facturas')
    .select('documento, fecha_documento, fecha_vencimiento, monto, saldo')
    .eq('contribuyente', contribuyente ?? '')
    .gt('saldo', 0)
    .order('fecha_vencimiento', { ascending: true })

  const rows: { documento: string; fecha_documento: string; fecha_vencimiento: string; monto: number; saldo: number }[] =
    facturas ?? []

  // ── Cálculos de totales ──────────────────────────────────────────────
  const totalSaldo = rows.reduce((s, f) => s + (f.saldo ?? 0), 0)

  const hoy = new Date(Date.now() - 6 * 3600 * 1000)  // zona Costa Rica (~UTC-6)
  const hoyStr = hoy.toISOString().split('T')[0]

  function diasVencimiento(fv: string): number {
    if (!fv) return 0
    return Math.floor((hoy.getTime() - new Date(fv).getTime()) / 86400000)
  }

  function badgeEstado(fv: string): { label: string; color: string } {
    const dias = diasVencimiento(fv)
    if (dias < 0)  return { label: `Vence en ${Math.abs(dias)}d`, color: '#15803d' }
    if (dias === 0) return { label: 'Vence hoy',                  color: '#c2410c' }
    if (dias <= 30) return { label: `Vencida ${dias}d`,            color: '#f59e0b' }
    if (dias <= 60) return { label: `Vencida ${dias}d`,            color: '#f97316' }
    if (dias <= 90) return { label: `Vencida ${dias}d`,            color: '#ef4444' }
    return              { label: `Vencida ${dias}d`,               color: '#991b1b' }
  }

  function fmtFecha(iso: string): string {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  function fmtMonto(n: number): string {
    return '₡' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  }

  // ── HTML del correo ──────────────────────────────────────────────────
  const filasMora = rows
    .filter(f => diasVencimiento(f.fecha_vencimiento) > 0)  // solo vencidas
    .sort((a, b) => diasVencimiento(b.fecha_vencimiento) - diasVencimiento(a.fecha_vencimiento))

  const filasPorVencer = rows.filter(f => diasVencimiento(f.fecha_vencimiento) <= 0)

  const todasOrdenadas = [...filasMora, ...filasPorVencer]

  const filasHTML = todasOrdenadas.map((f, i) => {
    const est = badgeEstado(f.fecha_vencimiento)
    const fondo = i % 2 === 0 ? '#ffffff' : '#f8fafc'
    return `
    <tr style="background:${fondo};">
      <td style="padding:8px 16px;font-size:12px;font-family:monospace;color:#374151;border-bottom:1px solid #f1f5f9;">${f.documento ?? '—'}</td>
      <td style="padding:8px 16px;font-size:12px;color:#374151;border-bottom:1px solid #f1f5f9;">${fmtFecha(f.fecha_documento)}</td>
      <td style="padding:8px 16px;font-size:12px;color:#374151;border-bottom:1px solid #f1f5f9;">${fmtFecha(f.fecha_vencimiento)}</td>
      <td style="padding:8px 16px;font-size:12px;color:#374151;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtMonto(f.monto ?? 0)}</td>
      <td style="padding:8px 16px;font-size:12px;font-weight:700;color:#374151;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtMonto(f.saldo ?? 0)}</td>
      <td style="padding:8px 16px;text-align:center;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:10px;font-weight:700;color:${est.color};white-space:nowrap;">${est.label}</span>
      </td>
    </tr>`
  }).join('')

  const mensajeHtml = mensaje?.trim()
    ? `<tr><td colspan="1" style="padding:16px 32px 0;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Mensaje del analista</p>
        <div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">${mensaje.trim()}</p>
        </div>
      </td></tr>`
    : ''

  const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr>
          <td style="background:#003B5C;padding:20px 32px;text-align:left;">
            <p style="margin:0;color:#009ee3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">COFERSA · SISTEMA SIC</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Estado de Cuenta</h1>
          </td>
        </tr>
        <!-- CLIENTE -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
            <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${cliente_nombre ?? cliente_cod}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${cliente_cod}</p>
          </td>
        </tr>
        <!-- RESUMEN KPIs -->
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:16px;">
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Saldo total pendiente</p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#dc2626;">${fmtMonto(totalSaldo)}</p>
                </td>
                <td>
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Facturas pendientes</p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#1e293b;">${todasOrdenadas.length}</p>
                </td>
                <td>
                  <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Fecha de corte</p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#1e293b;">${fmtFecha(hoyStr)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${mensajeHtml}
        <!-- TABLA DE FACTURAS -->
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Detalle de facturas</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Documento</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Fecha</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Vencimiento</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Monto</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Saldo</th>
                  <th style="padding:10px 16px;font-size:10px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${filasHTML || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">Sin facturas pendientes</td></tr>'}
              </tbody>
              <tfoot>
                <tr style="background:#f8fafc;">
                  <td colspan="4" style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;border-top:2px solid #e2e8f0;">TOTAL PENDIENTE</td>
                  <td style="padding:10px 16px;font-size:13px;font-weight:800;color:#dc2626;text-align:right;border-top:2px solid #e2e8f0;">${fmtMonto(totalSaldo)}</td>
                  <td style="border-top:2px solid #e2e8f0;"></td>
                </tr>
              </tfoot>
            </table>
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
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              SIC Cofersa · Sistema de Gestión de Cartera · ${new Date().toLocaleDateString('es-CR')}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  // ── Construir RFC 2822 + base64url ───────────────────────────────────
  const encodeHeader = (str: string) =>
    `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`

  const subject = `Estado de cuenta — ${cliente_nombre ?? cliente_cod} al ${fmtFecha(hoyStr)}`
  const ccList  = cc_emails?.length ? cc_emails : []

  const rawEmail = [
    `From: ${encodeHeader(nombreAnalista)} <${user.email}>`,
    `To: ${to_email.trim()}`,
    ccList.length > 0 ? `Cc: ${ccList.join(', ')}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].filter((line): line is string => line !== null).join('\r\n')

  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // ── Gmail API ────────────────────────────────────────────────────────
  let emailSent  = false
  let emailError: string | null = null

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

    if (gmailRes.ok) {
      emailSent = true
    } else {
      const gmailErr = await gmailRes.json().catch(() => ({}))
      const status   = gmailRes.status
      if (status === 401) {
        emailError = 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar.'
      } else if (status === 403) {
        emailError = 'Sin permiso para enviar correos. Cerrá sesión y volvé a ingresar para otorgar acceso.'
      } else {
        emailError = (gmailErr as { error?: { message?: string } })?.error?.message
          ?? `Error Gmail API (${status})`
      }
    }
  } catch (err) {
    emailError = 'Error de red al contactar Gmail API.'
    console.error('[estado-cuenta] Gmail API error:', err)
  }

  // ── Registrar gestión automáticamente ───────────────────────────────
  if (emailSent) {
    const fecha = hoy.toISOString().split('T')[0]
    const hora  = hoy.toISOString().split('T')[1].slice(0, 8)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('gestiones').insert({
      cliente_cod,
      contribuyente: contribuyente ?? '',
      analista_email: user.email,
      fecha,
      hora,
      tipo:      'CORREO',
      resultado: 'Email enviado',
      nota:      `Estado de cuenta enviado a ${to_email.trim()} (${todasOrdenadas.length} facturas, saldo ${fmtMonto(totalSaldo)})`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok:          emailSent,
    email_sent:  emailSent,
    email_to:    to_email.trim(),
    email_error: emailError,
    facturas_count: todasOrdenadas.length,
    saldo_total:    totalSaldo,
  })
}
