import { NextResponse } from 'next/server'

// Revalida cada hora — GoMeta actualiza el tipo de cambio una vez al día
export const revalidate = 3600

// ── Handler GET ───────────────────────────────────────────────────────────
export async function GET() {
  try {
    const response = await fetch('https://apis.gometa.org/tdc/tdc.json', {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return NextResponse.json(
        { compra: null, venta: null, fecha: null, error: true },
        { status: 200 },
      )
    }

    const data = await response.json()

    const compra = parseFloat(data.compra)
    const venta  = parseFloat(data.venta)

    if (isNaN(compra) || isNaN(venta)) {
      return NextResponse.json(
        { compra: null, venta: null, fecha: null, error: true },
        { status: 200 },
      )
    }

    // Formatear fecha ISO → "15 de mayo de 2026" en zona horaria de Costa Rica
    const fechaLegible = new Date(data.compra_date).toLocaleDateString('es-CR', {
      day:      'numeric',
      month:    'long',
      year:     'numeric',
      timeZone: 'America/Costa_Rica',
    })

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
