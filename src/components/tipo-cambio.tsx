'use client'

import { useEffect, useState } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────
interface TipoCambioData {
  compra: number | null
  venta:  number | null
  fecha:  string | null
  error:  boolean
}

// ── Utilidades de formato ────────────────────────────────────────────────
function fmtTC(n: number): string {
  return n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Componente ────────────────────────────────────────────────────────────
export default function TipoCambio() {
  const [data,    setData]    = useState<TipoCambioData | null>(null)
  const [colones, setColones] = useState('')
  const [dolares, setDolares] = useState('')

  useEffect(() => {
    fetch('/api/tipo-cambio')
      .then(r => r.json())
      .then((d: TipoCambioData) => setData(d))
      .catch(() => setData({ compra: null, venta: null, fecha: null, error: true }))
  }, [])

  // ── Estado de carga ──────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={{ padding: '8px 12px', textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '10px' }}>
          Cargando tipo de cambio…
        </p>
      </div>
    )
  }

  // ── Error o sin credenciales → ocultar completamente ───────────────
  if (data.error || !data.compra || !data.venta) return null

  // ── Convertidor bidireccional ────────────────────────────────────────
  function handleColones(val: string) {
    // Solo dígitos y punto/coma
    const clean = val.replace(/[^0-9.,]/g, '')
    setColones(clean)
    setDolares('')
    const n = parseFloat(clean.replace(',', '.'))
    if (!isNaN(n) && data!.venta) {
      setDolares((n / data!.venta).toLocaleString('es-CR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }))
    }
  }

  function handleDolares(val: string) {
    const clean = val.replace(/[^0-9.,]/g, '')
    setDolares(clean)
    setColones('')
    const n = parseFloat(clean.replace(',', '.'))
    if (!isNaN(n) && data!.compra) {
      setColones((n * data!.compra).toLocaleString('es-CR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }))
    }
  }

  // Capitalizar primera letra de la fecha
  const fechaMostrar = data.fecha
    ? data.fecha.charAt(0).toUpperCase() + data.fecha.slice(1)
    : ''

  return (
    <div
      style={{
        margin:       '0 8px 8px',
        background:   '#111827',
        borderRadius: '10px',
        border:       '1px solid rgba(255,255,255,0.09)',
        padding:      '10px 12px',
      }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   '8px',
        }}
      >
        <span
          style={{
            color:          'rgba(255,255,255,0.30)',
            fontSize:       '9px',
            fontWeight:     700,
            letterSpacing:  '0.10em',
            textTransform:  'uppercase',
          }}
        >
          Tipo de Cambio
        </span>

        {/* Badge BCCR con punto verde */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width:        '5px',
              height:       '5px',
              borderRadius: '50%',
              background:   '#22c55e',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '9px', fontWeight: 600 }}>
            BCCR
          </span>
        </div>
      </div>

      {/* ── Compra / Venta ───────────────────────────────────────── */}
      <div
        style={{
          display:             'grid',
          gridTemplateColumns: '1fr 1fr',
          gap:                 '6px',
          marginBottom:        '10px',
        }}
      >
        <div>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '9px', marginBottom: '2px' }}>
            Compra
          </p>
          <p style={{ color: 'white', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>
            ₡{fmtTC(data.compra)}
          </p>
        </div>

        <div>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '9px', marginBottom: '2px' }}>
            Venta
          </p>
          <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1 }}>
            ₡{fmtTC(data.venta)}
          </p>
        </div>
      </div>

      {/* ── Convertidor ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Colones → Dólares */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '6px',
            padding:    '5px 8px',
            gap:        '5px',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: '11px', flexShrink: 0 }}>₡</span>
          <input
            type="text"
            inputMode="decimal"
            value={colones}
            onChange={e => handleColones(e.target.value)}
            placeholder="Colones"
            style={{
              background:  'transparent',
              border:      'none',
              outline:     'none',
              color:       'white',
              fontSize:    '11px',
              fontFamily:  'monospace',
              width:       '100%',
            }}
          />
        </div>

        {/* Dólares → Colones */}
        <div
          style={{
            display:    'flex',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '6px',
            padding:    '5px 8px',
            gap:        '5px',
          }}
        >
          <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: '11px', flexShrink: 0 }}>$</span>
          <input
            type="text"
            inputMode="decimal"
            value={dolares}
            onChange={e => handleDolares(e.target.value)}
            placeholder="Dólares"
            style={{
              background:  'transparent',
              border:      'none',
              outline:     'none',
              color:       'white',
              fontSize:    '11px',
              fontFamily:  'monospace',
              width:       '100%',
            }}
          />
        </div>
      </div>

      {/* ── Fecha de la tasa ─────────────────────────────────────── */}
      {fechaMostrar && (
        <p
          style={{
            color:     'rgba(255,255,255,0.18)',
            fontSize:  '9px',
            marginTop: '8px',
            textAlign: 'center',
          }}
        >
          {fechaMostrar}
        </p>
      )}
    </div>
  )
}
