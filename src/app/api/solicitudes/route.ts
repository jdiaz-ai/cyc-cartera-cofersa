import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { numeroSolicitud } from '@/lib/solicitudes/catalogo'

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
    providerToken?: string | null
    // ── Catálogo nuevo (Centro Operativo de Solicitudes) ──────────────
    area?: string
    prioridad?: string
    sla_horas?: number
    gestion_id?: string
    descripcion?: string
    responsable_nombre?: string
    responsable_email?: string
    observaciones_internas?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { tipo, destinatario, cliente_cod, cliente_nombre,
    para_email, cc_emails, datos,
    monto_actual, monto_solicitado, monto, motivo_nota, documento_ref, fecha_limite,
    providerToken } = body

  // FIX 1: el formulario nuevo envía `descripcion`; el legacy `justificacion`.
  // Aceptar ambos para compatibilidad.
  const descripcion = (body.descripcion ?? body.justificacion ?? '').toString()
  const justificacion = descripcion

  if (!tipo || !cliente_cod || !descripcion.trim()) {
    return NextResponse.json({ error: 'tipo, cliente_cod y descripcion son requeridos' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // usuarios.id es un UUID independiente (gen_random_uuid()), distinto de auth.uid().
  // Se busca por email (case-insensitive) para obtener el UUID correcto de la FK.
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id')
    .ilike('email', user.email!)
    .limit(1)
    .single()
  const solicitanteId = (usuarioRow as { id: string } | null)?.id ?? null

  // Si el usuario autenticado no tiene fila en la tabla usuarios, no puede crear solicitudes.
  if (!solicitanteId) {
    return NextResponse.json(
      { error: 'Tu usuario no está registrado en el sistema. Contactá al administrador.' },
      { status: 400 }
    )
  }

  // ════════════════════════════════════════════════════════════════════
  // RAMA NUEVA — Catálogo Centro Operativo
  // Se detecta por la presencia de `area` + `sla_horas`.
  // Crea la solicitud + historial y envía correo best-effort (no bloquea).
  // ════════════════════════════════════════════════════════════════════
  if (body.area && body.sla_horas != null) {
    const {
      tipo: tipoCat, area, prioridad, sla_horas, gestion_id,
      responsable_nombre, responsable_email,
      observaciones_internas, datos: datosCat,
    } = body

    if (!tipoCat || !cliente_cod || !descripcion.trim()) {
      return NextResponse.json(
        { error: 'tipo, cliente_cod y descripcion son requeridos' },
        { status: 400 },
      )
    }

    const slaVenc = new Date(Date.now() + sla_horas * 3_600_000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nueva, error: insErr } = await (supabase as any)
      .from('solicitudes')
      .insert({
        tipo:                   tipoCat,
        area:                   area ?? null,
        cliente_cod,
        cliente_nombre:         cliente_nombre ?? '',
        solicitante_id:         solicitanteId,
        gestion_id:             gestion_id ?? null,
        justificacion:          descripcion.trim(),   // columna NOT NULL
        descripcion:            descripcion.trim(),
        observaciones_internas: observaciones_internas?.trim() ?? null,
        prioridad:              prioridad ?? null,
        sla_horas,
        sla_vencimiento:        slaVenc,
        responsable_nombre:     responsable_nombre?.trim() ?? null,
        responsable_email:      responsable_email?.trim() ?? null,
        datos:                  datosCat ?? null,
        estado:                 'Pendiente',
        updated_at:             new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insErr || !nueva) {
      return NextResponse.json(
        { error: `Error al crear la solicitud: ${insErr?.message ?? 'desconocido'}` },
        { status: 500 },
      )
    }

    const solicitudId = (nueva as { id: string }).id

    // Historial de estados — fila inicial (estado_anterior = null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('solicitud_historial_estados').insert({
      solicitud_id:    solicitudId,
      estado_anterior: null,
      estado_nuevo:    'Pendiente',
      usuario_id:      solicitanteId,
      nota:            'Solicitud creada',
    })

    // ── MEJORA 3: correo con número SIC (best-effort, no bloquea) ──────
    const numeroSic = numeroSolicitud(solicitudId)
    let emailSent = false
    let emailTo:   string | null = null
    let emailError: string | null = null

    if (providerToken) {
      const { data: solRow } = await supabase
        .from('usuarios').select('nombre').eq('id', solicitanteId).single()
      const nombreSolicitante = (solRow as { nombre: string } | null)?.nombre ?? user.email!
      const toEmail   = responsable_email?.trim() || process.env.EMAIL_COORDINADOR || 'jdiaz@cofersa.cr'
      const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cyc-cartera-cofersa.vercel.app'
      const venceStr  = new Date(slaVenc).toLocaleString('es-CR', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
      })

      const htmlBody = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#003B5C;padding:20px 32px;">
          <p style="margin:0;color:#009ee3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SISTEMA SIC · COFERSA</p>
          <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:800;">${numeroSic}</h1>
          <p style="margin:4px 0 0;color:#bae6fd;font-size:13px;">Nueva solicitud interna</p>
        </td></tr>
        <tr><td style="padding:24px 32px 0;">
          <span style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;border-radius:999px;padding:5px 14px;text-transform:uppercase;letter-spacing:0.05em;">${tipoCat}</span>
          ${prioridad ? `<span style="display:inline-block;margin-left:6px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;border-radius:999px;padding:5px 14px;">${prioridad} · SLA ${sla_horas}h</span>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
          <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${cliente_nombre ?? cliente_cod}</p>
          <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${cliente_cod}</p>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Descripción</p>
          <div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">${descripcion}</p>
          </div>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0;font-size:12px;color:#475569;"><strong>Vencimiento estimado:</strong> ${venceStr}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Responsable:</strong> ${responsable_nombre ?? '—'} &lt;${toEmail}&gt;</p>
          <p style="margin:6px 0 0;font-size:12px;color:#475569;"><strong>Solicitante:</strong> ${nombreSolicitante} &lt;${user.email}&gt;</p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px;">
          <a href="${appUrl}/solicitudes/${solicitudId}" style="display:inline-block;background:#009ee3;color:#fff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 24px;">Ver solicitud →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera · ${new Date().toLocaleDateString('es-CR')}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

      const encH = (str: string) => `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`
      const subject = `[${numeroSic}] ${tipoCat} — ${cliente_nombre ?? cliente_cod}`
      const rawEmail = [
        `From: ${encH(nombreSolicitante)} <${user.email}>`,
        `To: ${toEmail}`,
        `Subject: ${encH(subject)}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlBody,
      ].join('\r\n')
      const encoded = Buffer.from(rawEmail).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

      try {
        const gmailRes = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: encoded }),
          },
        )
        if (gmailRes.ok) { emailSent = true; emailTo = toEmail }
        else {
          const ge = await gmailRes.json().catch(() => ({}))
          emailError = (ge as { error?: { message?: string } })?.error?.message ?? `Error Gmail API (${gmailRes.status})`
        }
      } catch {
        emailError = 'Error de red al contactar Gmail API.'
      }
    } else {
      emailError = 'Sesión de Google no disponible — solicitud creada sin correo.'
    }

    return NextResponse.json({
      ok: true, id: solicitudId, numero: numeroSic,
      email_sent: emailSent, email_to: emailTo, email_error: emailError,
    })
  }

  // ════════════════════════════════════════════════════════════════════
  // RAMA LEGACY — wizard de la ficha (con correo + notificación)
  // ════════════════════════════════════════════════════════════════════

  // Verificar provider_token ANTES del INSERT — si el token expiró no queremos
  // guardar la solicitud y que el usuario crea que falló (causaría duplicados).
  if (!providerToken) {
    return NextResponse.json(
      { error: 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar para renovar el acceso.' },
      { status: 401 }
    )
  }

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

  // ── Email via Gmail API usando el provider_token del usuario ──────────────
  // (providerToken ya fue validado arriba — si llegamos aquí, existe)
  let emailSent = false
  let emailTo:   string | null = null
  let emailError: string | null = null

  const coordEmail = process.env.EMAIL_COORDINADOR ?? 'jdiaz@cofersa.cr'
  const toEmail    = para_email?.trim() || coordEmail
  const ccList     = cc_emails?.length ? cc_emails : []

  const tipoLabel = tipo.replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase())

  // Obtener nombre del analista desde usuarios para el campo From
  const { data: solicitanteRow } = await supabase
    .from('usuarios').select('nombre').eq('id', solicitanteId).single()
  const nombreSolicitante = (solicitanteRow as { nombre: string } | null)?.nombre ?? user.email!

  // ── Cuerpo HTML del correo ───────────────────────────────────────────────
  const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#003B5C;padding:20px 32px;text-align:left;">
            <p style="margin:0;color:#009ee3;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">SISTEMA SIC · COFERSA</p>
            <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:800;">Nueva solicitud interna</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0;">
            <span style="display:inline-block;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:700;border-radius:999px;padding:5px 14px;text-transform:uppercase;letter-spacing:0.05em;">
              ${tipoLabel}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
            <p style="margin:0;font-size:18px;font-weight:800;color:#1e293b;">${cliente_nombre ?? cliente_cod}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;font-family:monospace;">${cliente_cod}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Justificación</p>
            <div style="background:#f8fafc;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#334155;line-height:1.6;">${justificacion}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Solicitante</p>
            <p style="margin:0;font-size:13px;color:#334155;">${nombreSolicitante} &lt;${user.email}&gt;</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cyc-cartera-cofersa.vercel.app'}/solicitudes"
               style="display:inline-block;background:#009ee3;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:10px;padding:12px 24px;">
              Ver solicitudes →
            </a>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera · ${new Date().toLocaleDateString('es-CR')}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  // ── Construir email en formato RFC 2822 y codificar en base64url ─────────
  // Los headers From y Subject deben usar encoded-word (RFC 2047) para
  // caracteres no-ASCII (tildes, ñ, etc.) — de lo contrario los MTA los
  // corrompen a Latin-1 mostrando "DÃƒÂaz" en vez de "Díaz".
  const encodeHeader = (str: string) =>
    `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`

  const subject = `[SIC Cofersa] ${tipoLabel} — ${cliente_nombre ?? cliente_cod}`

  // Nota: se usa null como centinela para la línea Cc opcional.
  // El filter excluye null pero CONSERVA '' (línea en blanco separadora
  // de headers y body — obligatoria en RFC 2822, sin ella el body no se parsea).
  const rawEmail = [
    `From: ${encodeHeader(nombreSolicitante)} <${user.email}>`,
    `To: ${toEmail}`,
    ccList.length > 0 ? `Cc: ${ccList.join(', ')}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',        // ← línea en blanco obligatoria entre headers y body
    htmlBody,
  ].filter((line): line is string => line !== null).join('\r\n')

  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  // ── Llamada a Gmail API ──────────────────────────────────────────────────
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
      }
    )

    if (gmailRes.ok) {
      emailSent = true
      emailTo   = toEmail
    } else {
      const gmailErr = await gmailRes.json().catch(() => ({}))
      const status   = gmailRes.status

      if (status === 401) {
        emailError = 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar para renovar el acceso.'
      } else if (status === 403) {
        emailError = 'Sin permiso para enviar correos. Cerrá sesión y volvé a ingresar para otorgar acceso a Gmail.'
      } else {
        emailError = (gmailErr as { error?: { message?: string } })?.error?.message ?? `Error Gmail API (${status})`
      }
    }
  } catch (err) {
    emailError = 'Error de red al contactar Gmail API.'
    console.error('[solicitudes] Gmail API error:', err)
  }

  return NextResponse.json({
    ok:          true,
    id:          (nuevaSolicitud as { id: string })?.id,
    email_sent:  emailSent,
    email_to:    emailTo,
    email_error: emailError,
  })
}
