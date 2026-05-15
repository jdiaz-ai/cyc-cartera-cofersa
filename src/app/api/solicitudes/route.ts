import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/solicitudes
// { tipo, destinatario?, cliente_cod, cliente_nombre, justificacion,
//   para_email?, cc_emails?, datos?,
//   monto_actual?, monto_solicitado?, monto?, motivo_nota?, documento_ref?, fecha_limite? }
export async function POST(req: NextRequest) {
  let body: {
    tipo?: string
    destinatario?: string
    cliente_cod?: string
    cliente_nombre?: string
    justificacion?: string
    para_email?: string
    cc_emails?: string[]
    datos?: Record<string, unknown>
    monto_actual?: number
    monto_solicitado?: number
    monto?: number
    motivo_nota?: string
    documento_ref?: string
    fecha_limite?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { tipo, destinatario, cliente_cod, cliente_nombre, justificacion,
    para_email, cc_emails, datos,
    monto_actual, monto_solicitado, monto, motivo_nota, documento_ref, fecha_limite } = body

  if (!tipo || !cliente_cod || !justificacion?.trim()) {
    return NextResponse.json({ error: 'tipo, cliente_cod y justificacion son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // user.id proveniente de auth.getUser() ES auth.uid() — satisface el WITH CHECK
  // de la política RLS sin necesidad de un lookup adicional a la tabla usuarios.
  // El lookup por email puede retornar null si hay diferencia de capitalización
  // o si el usuario aún no tiene fila en usuarios, causando el error RLS.
  const solicitanteId = user.id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nuevaSolicitud, error } = await (supabase as any).from('solicitudes').insert({
    tipo,
    destinatario:     destinatario     ?? null,
    cliente_cod,
    cliente_nombre:   cliente_nombre   ?? '',
    solicitante_id:   solicitanteId,
    justificacion:    justificacion.trim(),
    para_email:       para_email       ?? null,
    cc_emails:        cc_emails        ?? null,
    datos:            datos            ?? null,
    monto_actual:     monto_actual     ?? null,
    monto_solicitado: monto_solicitado ?? null,
    monto:            monto            ?? null,
    motivo_nota:      motivo_nota      ?? null,
    documento_ref:    documento_ref    ?? null,
    fecha_limite:     fecha_limite     ?? null,
    estado:           'PENDIENTE',
    updated_at:       new Date().toISOString(),
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificación automática al coordinador
  const { data: coordRow } = await supabase
    .from('usuarios')
    .select('id')
    .eq('rol', 'COORDINADOR')
    .limit(1)
    .single()

  if (coordRow) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notificaciones').insert({
      usuario_id: (coordRow as { id: string }).id,
      tipo:       'SOLICITUD',
      titulo:     `Nueva solicitud: ${tipo.replace(/_/g, ' ')}`,
      mensaje:    `Cliente: ${cliente_nombre ?? cliente_cod}. Destinatario: ${destinatario ?? 'coordinador'}. Solicitante: ${user.email}`,
      leida:      false,
      link:       `/solicitudes/${(nuevaSolicitud as { id: string })?.id ?? ''}`,
      created_at: new Date().toISOString(),
    })
  }

  // ── Email via Resend (opcional — solo si RESEND_API_KEY está configurado) ──
  let emailSent = false
  let emailTo:   string | null = null

  const resendKey  = process.env.RESEND_API_KEY
  const emailFrom  = process.env.EMAIL_FROM ?? 'CYC Cofersa <cyc@cofersa.cr>'
  const coordEmail = process.env.EMAIL_COORDINADOR ?? 'jdiaz@cofersa.cr'

  // Destinatario del correo: para_email (si el analista lo especificó) o el coordinador por defecto
  const toEmail = para_email?.trim() || coordEmail

  if (resendKey) {
    const tipoLabel = tipo.replace(/_/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
    const ccList = cc_emails?.length ? cc_emails : []

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#003B5C;padding:20px 32px;text-align:left;">
            <p style="margin:0;color:#009ee3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SISTEMA CYC · COFERSA</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Nueva solicitud interna</h1>
          </td>
        </tr>

        <!-- Tipo badge -->
        <tr>
          <td style="padding:24px 32px 0;">
            <span style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;border-radius:999px;padding:5px 14px;text-transform:uppercase;letter-spacing:0.05em;">
              ${tipoLabel}
            </span>
          </td>
        </tr>

        <!-- Cliente -->
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
            <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${cliente_nombre ?? cliente_cod}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${cliente_cod}</p>
          </td>
        </tr>

        <!-- Justificación -->
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Justificación</p>
            <div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">${justificacion}</p>
            </div>
          </td>
        </tr>

        <!-- Solicitante -->
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Solicitante</p>
            <p style="margin:0;font-size:13px;color:#334155;">${user.email}</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:24px 32px 32px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cyc-cartera-cofersa.vercel.app'}/solicitudes"
               style="display:inline-block;background:#009ee3;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 24px;">
              Ver solicitudes →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">CYC Cofersa · Sistema de Gestión de Cartera · ${new Date().toLocaleDateString('es-CR')}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    emailFrom,
          to:      [toEmail],
          ...(ccList.length > 0 && { cc: ccList }),
          subject: `[${tipoLabel}] — ${cliente_nombre ?? cliente_cod} · CYC Cofersa`,
          html:    htmlBody,
        }),
      })
      if (emailRes.ok) { emailSent = true; emailTo = toEmail }
    } catch {
      // El email es best-effort — no fallar la solicitud si el correo falla
    }
  }

  return NextResponse.json({
    ok:         true,
    id:         (nuevaSolicitud as { id: string })?.id,
    email_sent: emailSent,
    email_to:   emailTo,
  })
}
