import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/clientes/estado-cuenta
 * Envía un Estado de Cuenta por Gmail API, con formato HTML profesional.
 * Opcionalmente adjunta PDF o Excel como multipart/mixed MIME.
 *
 * Body: { cliente_cod, cliente_nombre, contribuyente, to_email, cc_emails?,
 *         observaciones?, providerToken,
 *         adjunto?: { base64, mimeType, filename } }
 */
export async function POST(req: NextRequest) {
  let body: {
    cliente_cod?:    string
    cliente_nombre?: string
    contribuyente?:  string
    to_email?:       string
    cc_emails?:      string[]
    observaciones?:  string
    providerToken?:  string | null
    adjunto?:        { base64: string; mimeType: string; filename: string } | null
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 }) }

  const { cliente_cod, cliente_nombre, contribuyente, to_email,
          cc_emails, observaciones, providerToken, adjunto } = body

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

  // ── Datos del analista (nombre, teléfono, whatsapp) ──────────────────
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('nombre, telefono, whatsapp')
    .ilike('email', user.email!)
    .limit(1)
    .single()

  const analista = usuarioRow as { nombre: string; telefono?: string | null; whatsapp?: string | null } | null
  const nombreAnalista    = analista?.nombre       ?? user.email!
  const telefonoAnalista  = analista?.telefono     ?? null
  const whatsappAnalista  = analista?.whatsapp     ?? null

  // ── Facturas del cliente con saldo > 0 ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: facturas } = await (supabase as any)
    .from('facturas')
    .select('documento, fecha_documento, fecha_vencimiento, monto, saldo')
    .eq('contribuyente', contribuyente ?? '')
    .gt('saldo', 0)
    .order('fecha_vencimiento', { ascending: true })

  const rows: { documento: string; fecha_documento: string; fecha_vencimiento: string; monto: number; saldo: number }[] =
    facturas ?? []

  // ── Cuentas bancarias CRC ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cuentasData } = await (supabase as any)
    .from('cuentas_bancarias')
    .select('banco, moneda, tipo, numero, iban, orden')
    .eq('activo', true)
    .order('orden', { ascending: true })

  const cuentas: { banco: string; moneda: string; tipo: string; numero: string; iban?: string }[] = cuentasData ?? []
  const cuentasCRC = cuentas.filter(c => c.moneda === 'CRC' && c.tipo === 'cuenta')
  const cuentasUSD = cuentas.filter(c => c.moneda === 'USD' && c.tipo === 'cuenta')
  const sinpeCRC   = cuentas.find(c => c.tipo === 'sinpe' && c.moneda === 'CRC')

  // ── Condición de pago del cliente ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maestroRow } = await (supabase as any)
    .from('maestro_clientes')
    .select('condicion_pago')
    .eq('cliente_cod', cliente_cod)   // columna real en la tabla
    .limit(1)
    .single()
  const condicionPago = (maestroRow as { condicion_pago?: string } | null)?.condicion_pago ?? '—'

  // ── Fecha y hora Costa Rica ───────────────────────────────────────────
  const hoyDate = new Date(Date.now() - 6 * 3600_000)  // UTC-6 approx
  const hoyStr  = hoyDate.toISOString().split('T')[0]
  // Formato DD/MM/YYYY para el email
  const [fy, fm, fd] = hoyStr.split('-')
  const fechaCorte = `${fd}/${fm}/${fy}`

  // ── Helpers ───────────────────────────────────────────────────────────
  function diasVenc(fv: string): number {
    return Math.floor((hoyDate.getTime() - new Date(fv + 'T00:00:00').getTime()) / 86_400_000)
  }

  // Colores corporativos Cofersa — Guía Tipográfica oficial
  function badgeEstado(fv: string): { label: string; bg: string; color: string } {
    const d = diasVenc(fv)
    if (d < 0)   return { label: `Vence en ${Math.abs(d)}d`, bg: '#f0fdf4', color: '#006400' }  // verde corporativo
    if (d === 0) return { label: 'Vence hoy',                 bg: '#fff7ed', color: '#FF6F00' }  // naranja corporativo
    return              { label: `Vencida ${d}d`,             bg: '#fff1f2', color: '#D80236' }  // rojo corporativo
  }

  function fmtFecha(iso: string): string {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  function fmtMonto(n: number): string {
    // ₡38.543,00  (miles con punto, decimales con coma — estándar CR financiero)
    const [intPart, decPart] = (Math.round(n * 100) / 100).toFixed(2).split('.')
    return '₡' + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + decPart
  }

  // ── Cálculos globales ─────────────────────────────────────────────────
  const totalSaldo  = rows.reduce((s, f) => s + (f.saldo  ?? 0), 0)
  const totalMonto  = rows.reduce((s, f) => s + (f.monto  ?? 0), 0)
  const totalVencido = rows.filter(f => f.fecha_vencimiento && diasVenc(f.fecha_vencimiento) > 0)
                           .reduce((s, f) => s + (f.saldo ?? 0), 0)

  // ── Aging ─────────────────────────────────────────────────────────────
  const aging = { aldia: 0, m1_30: 0, m31_60: 0, m61_90: 0, m91_120: 0, m120plus: 0 }
  for (const f of rows) {
    if (!f.saldo || f.saldo <= 0 || !f.fecha_vencimiento) continue
    const d = diasVenc(f.fecha_vencimiento)
    if (d < 0)        aging.aldia    += f.saldo
    else if (d <= 30) aging.m1_30    += f.saldo
    else if (d <= 60) aging.m31_60   += f.saldo
    else if (d <= 90) aging.m61_90   += f.saldo
    else if (d <= 120) aging.m91_120 += f.saldo
    else              aging.m120plus += f.saldo
  }

  // Filas de facturas ordenadas: vencidas primero (más antiguas)
  const todasOrdenadas = [...rows].sort((a, b) => {
    const da = a.fecha_vencimiento ? diasVenc(a.fecha_vencimiento) : -9999
    const db = b.fecha_vencimiento ? diasVenc(b.fecha_vencimiento) : -9999
    return db - da
  })

  // ── HTML — filas de facturas ──────────────────────────────────────────
  const filasHTML = todasOrdenadas.map((f, i) => {
    const est  = badgeEstado(f.fecha_vencimiento)
    const fondo = i % 2 === 0 ? '#ffffff' : '#f8fafc'
    return `
    <tr style="background:${fondo};">
      <td style="padding:7px 14px;font-size:11.5px;font-family:monospace;color:#374151;border-bottom:1px solid #f1f5f9;">${f.documento ?? '—'}</td>
      <td style="padding:7px 14px;font-size:11.5px;color:#374151;border-bottom:1px solid #f1f5f9;">${fmtFecha(f.fecha_documento)}</td>
      <td style="padding:7px 14px;font-size:11.5px;color:#374151;border-bottom:1px solid #f1f5f9;">${fmtFecha(f.fecha_vencimiento)}</td>
      <td style="padding:7px 14px;font-size:11.5px;color:#374151;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtMonto(f.monto ?? 0)}</td>
      <td style="padding:7px 14px;font-size:11.5px;font-weight:700;color:#374151;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtMonto(f.saldo ?? 0)}</td>
      <td style="padding:7px 14px;text-align:center;border-bottom:1px solid #f1f5f9;">
        <span style="font-size:10px;font-weight:700;color:${est.color};background:${est.bg};padding:2px 6px;border-radius:9999px;white-space:nowrap;">${est.label}</span>
      </td>
    </tr>`
  }).join('')

  // ── HTML — aging boxes (igual ancho, fondo gris, labels oscuros) ────────
  const agingTramos = [
    { label: 'Al día',      amount: aging.aldia    },
    { label: '1-30 días',   amount: aging.m1_30   },
    { label: '31-60 días',  amount: aging.m31_60  },
    { label: '61-90 días',  amount: aging.m61_90  },
    { label: '91-120 días', amount: aging.m91_120 },
    { label: '+120 días',   amount: aging.m120plus },
  ]
  const agingBoxes = agingTramos.map(t => {
    const pct       = totalSaldo > 0 ? Math.round((t.amount / totalSaldo) * 100) : 0
    const hasAmount = t.amount > 0
    // Label gris arriba — valores blancos abajo
    const montoLine = hasAmount
      ? '<p style="margin:0 0 1px;font-size:10.5px;font-weight:700;color:#1e293b;">' + fmtMonto(t.amount) + '</p>'
      : '<p style="margin:0 0 1px;font-size:10.5px;color:#cbd5e1;">—</p>'
    const pctLine = hasAmount
      ? '<p style="margin:0;font-size:10px;color:#64748b;">' + pct + '%</p>'
      : '<p style="margin:0;font-size:10px;color:transparent;">0%</p>'
    return `
    <td style="width:16.66%;text-align:center;padding:0 3px;">
      <div style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <div style="background:#f1f5f9;padding:8px 4px 7px;">
          <p style="margin:0;font-size:9.5px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.03em;">${t.label}</p>
        </div>
        <div style="background:#ffffff;padding:7px 4px 8px;">
          ${montoLine}${pctLine}
        </div>
      </div>
    </td>`
  }).join('')

  // ── HTML — cuentas bancarias (3 col × 2 filas = 6 cajones) ─────────────
  // Todas las cuentas (no sinpe) ordenadas por campo 'orden' en la DB
  const todasCuentas = cuentas.filter(c => c.tipo === 'cuenta')

  // Etiqueta dinámica según moneda
  const etiqMoneda = (moneda: string) =>
    moneda === 'CRC' ? 'Colones · Cta corriente' : 'Dólares · Cta corriente'

  // Card de banco (margin-top para la segunda en cada columna)
  const mkCuenta = (c: { banco: string; moneda: string; numero: string; iban?: string }, marginTop = false) =>
    '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;' + (marginTop ? 'margin-top:8px;' : '') + '">'
    + '<p style="margin:0 0 3px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">' + c.banco + '</p>'
    + '<p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#111827;font-family:monospace;">' + (c.iban ?? c.numero) + '</p>'
    + '<p style="margin:0;font-size:10px;color:#9ca3af;">' + etiqMoneda(c.moneda) + '</p>'
    + '</div>'

  // Grupos de 2 cuentas → una columna (las primeras 2 van a col1, etc.)
  const grp1 = todasCuentas.slice(0, 2)
  const grp2 = todasCuentas.slice(2, 4)
  const grp3 = todasCuentas.slice(4, 6)

  const buildCol = (grp: typeof todasCuentas) =>
    grp.map((c, i) => mkCuenta(c, i > 0)).join('')

  const sinpeBadge = sinpeCRC
    ? '<div style="margin-top:10px;padding:9px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;display:inline-block;">'
      + '<span style="font-size:13px;">📱</span>'
      + '<span style="font-size:12px;font-weight:700;color:#15803d;margin-left:6px;">Sinpe Móvil: ' + sinpeCRC.numero + '</span>'
      + '</div>'
    : ''

  const hayBancarios = todasCuentas.length > 0 || !!sinpeCRC
  const cuentasHtml = hayBancarios
    ? `
    <!-- INFORMACIÓN PARA PAGOS -->
    <tr>
      <td style="padding:20px 32px 0;">
        <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Información para pagos</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
          <tr>
            <td style="width:33.33%;vertical-align:top;padding-right:8px;">${buildCol(grp1)}</td>
            <td style="width:33.33%;vertical-align:top;padding-right:8px;">${buildCol(grp2)}</td>
            <td style="width:33.33%;vertical-align:top;">${buildCol(grp3)}</td>
          </tr>
        </table>
        ${sinpeBadge}
      </td>
    </tr>`
    : ''

  // ── HTML — observaciones ──────────────────────────────────────────────
  const obsHtml = observaciones?.trim()
    ? `
    <tr>
      <td style="padding:16px 32px 0;">
        <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Observaciones</p>
        <div style="background:#f0f9ff;border-left:4px solid #009ee3;border-radius:0 8px 8px 0;padding:12px 16px;">
          <p style="margin:0;font-size:12.5px;color:#0c4a6e;line-height:1.65;font-style:italic;">${observaciones.trim().replace(/\n/g, '<br>')}</p>
        </div>
      </td>
    </tr>`
    : ''

  // ── HTML — footer analista ────────────────────────────────────────────
  const footerContacto = [
    `<strong>${nombreAnalista}</strong>`,
    user.email,
    telefonoAnalista  ? `Tel: ${telefonoAnalista}` : null,
    whatsappAnalista  ? `WA: ${whatsappAnalista}`  : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ')

  // ── HTML email completo ───────────────────────────────────────────────
  const htmlBody = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media(max-width:600px){
      .sic-main{width:100%!important;border-radius:0!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Nunito',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 0;">
    <tr><td align="center">
      <table class="sic-main" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);width:100%;max-width:780px;">

        <!-- HEADER — fondo blanco para que el logo PNG quede limpio;
             borde inferior cyan como acento de marca -->
        <tr>
          <td style="background:#ffffff;padding:20px 32px;border-bottom:3px solid #009EE3;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Zona 1: Logo sobre blanco — sin problemas de fondo -->
                <td style="width:130px;vertical-align:middle;">
                  <img src="https://cyc-cartera-cofersa.vercel.app/logo-cofersa.png" alt="Cofersa" style="height:48px;width:auto;display:block;">
                </td>
                <!-- Zona 2: Título centrado en negro (igual que el logo) -->
                <td style="text-align:center;vertical-align:middle;">
                  <h1 style="margin:0;color:#000000;font-size:22px;font-weight:800;letter-spacing:0.01em;">Estado de Cuenta</h1>
                </td>
                <!-- Zona 3: Fecha de corte — negro -->
                <td style="width:130px;text-align:right;vertical-align:middle;white-space:nowrap;">
                  <p style="margin:0;color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Fecha de corte</p>
                  <p style="margin:4px 0 0;color:#000000;font-size:16px;font-weight:800;">${fechaCorte}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DATOS DEL CLIENTE -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:60%;vertical-align:top;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Cliente</p>
                  <p style="margin:0;font-size:16px;font-weight:800;color:#1e293b;line-height:1.2;">${cliente_nombre ?? cliente_cod}</p>
                  <p style="margin:5px 0 0;font-size:13px;color:#64748b;">Contribuyente: <span style="font-family:monospace;font-weight:600;">${contribuyente ?? '—'}</span></p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <p style="margin:0 0 3px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Condición de pago</p>
                  <p style="margin:0;font-size:15px;font-weight:800;color:#1e293b;">${condicionPago}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- 3 KPIs -->
        <tr>
          <td style="padding:16px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;">
                    <div style="background:#f1f5f9;padding:7px 14px 6px;">
                      <p style="margin:0;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Saldo total pendiente</p>
                    </div>
                    <div style="background:#ffffff;padding:10px 14px 12px;">
                      <p style="margin:0;font-size:20px;font-weight:800;color:#1e293b;">${fmtMonto(totalSaldo)}</p>
                    </div>
                  </div>
                </td>
                <td style="padding-right:12px;">
                  <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;">
                    <div style="background:#f1f5f9;padding:7px 14px 6px;">
                      <p style="margin:0;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Total vencido</p>
                    </div>
                    <div style="background:#ffffff;padding:10px 14px 12px;">
                      <p style="margin:0;font-size:20px;font-weight:800;color:#1e293b;">${fmtMonto(totalVencido)}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-align:center;">
                    <div style="background:#f1f5f9;padding:7px 14px 6px;">
                      <p style="margin:0;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Facturas pendientes</p>
                    </div>
                    <div style="background:#ffffff;padding:10px 14px 12px;">
                      <p style="margin:0;font-size:20px;font-weight:800;color:#1e293b;">${todasOrdenadas.length}</p>
                    </div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DISTRIBUCIÓN POR ANTIGÜEDAD -->
        <tr>
          <td style="padding:16px 32px 0;">
            <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Distribución por antigüedad</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
              <tr>${agingBoxes}</tr>
            </table>
          </td>
        </tr>

        ${obsHtml}

        <!-- DETALLE DE FACTURAS -->
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
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Documento</th>
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Emisión</th>
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Vencimiento</th>
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Monto</th>
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Saldo</th>
                  <th style="padding:9px 14px;font-size:9px;font-weight:700;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${filasHTML || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">Sin facturas pendientes</td></tr>'}
              </tbody>
              <tfoot>
                <tr style="background:#f8fafc;">
                  <td colspan="3" style="padding:9px 14px;font-size:10px;font-weight:700;color:#64748b;border-top:2px solid #e2e8f0;text-transform:uppercase;">
                    Total (${todasOrdenadas.length} facturas)
                  </td>
                  <td style="padding:9px 14px;font-size:12px;font-weight:800;color:#1e293b;text-align:right;border-top:2px solid #e2e8f0;">${fmtMonto(totalMonto)}</td>
                  <td style="padding:9px 14px;font-size:12px;font-weight:800;color:#1e293b;text-align:right;border-top:2px solid #e2e8f0;">${fmtMonto(totalSaldo)}</td>
                  <td style="border-top:2px solid #e2e8f0;"></td>
                </tr>
              </tfoot>
            </table>
          </td>
        </tr>

        ${cuentasHtml}

        <!-- CONTACTO DEL ANALISTA -->
        <tr>
          <td style="padding:20px 32px 24px;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;">Para consultas, comuníquese con su ejecutivo de cuenta:</p>
            <p style="margin:0;font-size:12.5px;font-weight:700;color:#1e293b;">${footerContacto}</p>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:10px;color:#94a3b8;">SIC Cofersa · Sistema de Gestión de Cartera</p>
                </td>
                <td style="text-align:right;">
                  <p style="margin:0;font-size:10px;color:#cbd5e1;">© Cofersa 2026 · ${fmtFecha(hoyStr)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  // ── Construir y enviar email ──────────────────────────────────────────
  const encH = (str: string) => `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`
  const subject = `Estado de cuenta — ${cliente_nombre ?? cliente_cod}`
  const ccList  = cc_emails?.length ? cc_emails : []

  let emailSent  = false
  let emailError: string | null = null

  if (adjunto?.base64 && adjunto.mimeType && adjunto.filename) {
    // ── Multipart/mixed con adjunto ────────────────────────────────────
    const boundary  = `----=_SIC_${Date.now()}`
    const htmlBase64 = Buffer.from(htmlBody, 'utf-8').toString('base64')

    const rawLines = [
      `From: ${encH(nombreAnalista)} <${user.email}>`,
      `To: ${to_email.trim()}`,
      ...(ccList.length > 0 ? [`Cc: ${ccList.join(', ')}`] : []),
      `Subject: ${encH(subject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBase64,
      '',
      `--${boundary}`,
      `Content-Type: ${adjunto.mimeType}; name="${adjunto.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${adjunto.filename}"`,
      '',
      adjunto.base64,
      '',
      `--${boundary}--`,
    ]
    const encodedEmail = Buffer.from(rawLines.join('\r\n'))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedEmail }),
      })
      if (r.ok) {
        emailSent = true
      } else {
        const e = await r.json().catch(() => ({}))
        emailError = buildGmailError(r.status, e)
      }
    } catch (err) {
      emailError = `Error de red: ${err instanceof Error ? err.message : 'desconocido'}`
    }
  } else {
    // ── Email simple text/html ─────────────────────────────────────────
    const rawEmail = [
      `From: ${encH(nombreAnalista)} <${user.email}>`,
      `To: ${to_email.trim()}`,
      ...(ccList.length > 0 ? [`Cc: ${ccList.join(', ')}`] : []),
      `Subject: ${encH(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody,
    ].join('\r\n')

    const encodedEmail = Buffer.from(rawEmail)
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    try {
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${providerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedEmail }),
      })
      if (r.ok) {
        emailSent = true
      } else {
        const e = await r.json().catch(() => ({}))
        emailError = buildGmailError(r.status, e)
      }
    } catch (err) {
      emailError = `Error de red: ${err instanceof Error ? err.message : 'desconocido'}`
    }
  }

  // ── Registrar gestión automáticamente ────────────────────────────────
  if (emailSent) {
    const fecha = hoyDate.toISOString().split('T')[0]
    const hora  = hoyDate.toISOString().split('T')[1].slice(0, 8)
    const adjLabel = adjunto?.filename ? ` (adjunto: ${adjunto.filename})` : ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('gestiones').insert({
      cliente_cod,
      contribuyente: contribuyente ?? '',
      analista_email: user.email,
      fecha, hora,
      tipo:      'CORREO',
      resultado: 'Email enviado',
      nota: `Estado de cuenta enviado a ${to_email.trim()}${adjLabel} (${todasOrdenadas.length} facturas, saldo ${fmtMonto(totalSaldo)})`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok:             emailSent,
    email_sent:     emailSent,
    email_to:       to_email.trim(),
    email_error:    emailError,
    facturas_count: todasOrdenadas.length,
    saldo_total:    totalSaldo,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildGmailError(status: number, body: any): string {
  if (status === 401) return 'Sesión de Google expirada. Cerrá sesión y volvé a ingresar.'
  if (status === 403) return 'Sin permiso para enviar correos. Cerrá sesión y volvé a ingresar.'
  return (body as { error?: { message?: string } })?.error?.message ?? `Error Gmail API (${status})`
}
