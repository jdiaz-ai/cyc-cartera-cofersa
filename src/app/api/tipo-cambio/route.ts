import { NextResponse } from 'next/server'

// Revalida cada hora — el BCCR publica una vez al día
export const revalidate = 3600

const BCCR_BASE =
  'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos'

// Indicadores BCCR
const IND_COMPRA = '317'   // Tipo de cambio de compra del dólar
const IND_VENTA  = '318'   // Tipo de cambio de venta del dólar

// ── Formatea fecha como dd/mm/yyyy en zona horaria de Costa Rica ──────────
function fechaCR(): string {
  const hoy = new Date()
  const parts = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
  }).formatToParts(hoy)

  const d = parts.find(p => p.type === 'day')?.value   ?? '01'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const y = parts.find(p => p.type === 'year')?.value  ?? '2026'
  return `${d}/${m}/${y}`
}

// ── Llama al WS del BCCR y extrae NUM_VALOR del XML de respuesta ─────────
async function fetchIndicador(
  indicador: string,
  fecha: string,
  email: string,
  token: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    Indicador:        indicador,
    FechaInicio:      fecha,
    FechaFinal:       fecha,
    Nombre:           'SIC Cofersa',
    SubNiveles:       'N',
    CorreoElectronico: email,
    Token:            token,
  })

  const res = await fetch(`${BCCR_BASE}?${params.toString()}`, {
    next: { revalidate },
  })

  if (!res.ok) return null

  const xml = await res.text()

  // El WS devuelve XML con un elemento <NUM_VALOR> que usa coma como decimal
  const match = xml.match(/<NUM_VALOR>([\d,. ]+)<\/NUM_VALOR>/)
  if (!match) return null

  // Normalizar: eliminar espacios, cambiar coma decimal → punto
  const raw = match[1].trim().replace(/\s/g, '').replace(',', '.')
  const valor = parseFloat(raw)
  return isNaN(valor) ? null : valor
}

// ── Handler GET ───────────────────────────────────────────────────────────
export async function GET() {
  const email = process.env.BCCR_EMAIL
  const token = process.env.BCCR_TOKEN

  if (!email || !token) {
    return NextResponse.json(
      { compra: null, venta: null, fecha: null, error: true },
      { status: 200 },
    )
  }

  try {
    const fecha = fechaCR()
    const [compra, venta] = await Promise.all([
      fetchIndicador(IND_COMPRA, fecha, email, token),
      fetchIndicador(IND_VENTA,  fecha, email, token),
    ])

    // Fecha legible en español sin abreviaciones (ej: "15 de mayo de 2026")
    const fechaLegible = new Intl.DateTimeFormat('es-CR', {
      day:   'numeric',
      month: 'long',
      year:  'numeric',
      timeZone: 'America/Costa_Rica',
    }).format(new Date())

    return NextResponse.json({
      compra,
      venta,
      fecha: fechaLegible,
      error: false,
    })
  } catch {
    return NextResponse.json(
      { compra: null, venta: null, fecha: null, error: true },
      { status: 200 },
    )
  }
}
