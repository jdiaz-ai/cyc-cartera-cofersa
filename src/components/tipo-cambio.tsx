'use client'

import { useEffect, useState } from 'react'
import { DollarSign, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────
interface TipoCambioData {
  compra: number | null
  venta:  number | null
  fecha:  string | null
  error:  boolean
}

// ── Formato de tasas ─────────────────────────────────────────────────────
function fmtRate(n: number): string {
  return n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Componente ────────────────────────────────────────────────────────────
export default function TipoCambio() {
  const [data,         setData]         = useState<TipoCambioData | null>(null)
  const [colones,      setColones]      = useState('')
  const [dolares,      setDolares]      = useState('')
  const [resultUSD,    setResultUSD]    = useState('')   // resultado ₡ → $
  const [resultCRC,    setResultCRC]    = useState('')   // resultado $ → ₡
  const [focusColones, setFocusColones] = useState(false)
  const [focusDolares, setFocusDolares] = useState(false)

  useEffect(() => {
    fetch('/api/tipo-cambio')
      .then(r => r.json())
      .then((d: TipoCambioData) => setData(d))
      .catch(() => setData({ compra: null, venta: null, fecha: null, error: true }))
  }, [])

  const sinDatos = !data || data.error || !data.compra || !data.venta

  // ── Convertidor: colones → dólares (usa tasa venta) ─────────────────
  function handleColones(val: string) {
    const clean = val.replace(/[^0-9.,]/g, '')
    setColones(clean)
    setDolares('')
    setResultCRC('')
    if (!sinDatos && clean !== '') {
      const n = parseFloat(clean.replace(',', '.'))
      setResultUSD(isNaN(n) ? '' : '$ ' + (n / data!.venta!).toFixed(2))
    } else {
      setResultUSD('')
    }
  }

  // ── Convertidor: dólares → colones (usa tasa compra) ────────────────
  function handleDolares(val: string) {
    const clean = val.replace(/[^0-9.,]/g, '')
    setDolares(clean)
    setColones('')
    setResultUSD('')
    if (!sinDatos && clean !== '') {
      const n = parseFloat(clean.replace(',', '.'))
      setResultCRC(isNaN(n) ? '' : '₡' + Math.round(n * data!.compra!).toLocaleString('es-CR'))
    } else {
      setResultCRC('')
    }
  }

  const fechaMostrar = (!sinDatos && data!.fecha)
    ? data!.fecha.charAt(0).toUpperCase() + data!.fecha.slice(1)
    : ''

  return (
    <div
      style={{
        margin:       '0 10px 12px',
        background:   '#162032',
        borderRadius: '9px',
        border:       '0.5px solid rgba(255,255,255,0.10)',
        overflow:     'hidden',
      }}
    >
      {/* ── Header franja ────────────────────────────────────────── */}
      <div
        style={{
          background:     '#1c2c42',
          padding:        '9px 11px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <DollarSign size={11} color="rgba(255,255,255,0.45)" />
          <span
            style={{
              color:         'rgba(255,255,255,0.55)',
              fontSize:      '9px',
              fontWeight:    700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}
          >
            Tipo de Cambio
          </span>
        </div>

        {/* Badge BCCR — verde si hay datos, gris si no */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '4px',
            background:   sinDatos ? 'rgba(255,255,255,0.05)' : 'rgba(52,211,153,0.10)',
            borderRadius: '999px',
            padding:      '2px 7px',
          }}
        >
          <div
            style={{
              width:        '4px',
              height:       '4px',
              borderRadius: '50%',
              background:   sinDatos ? 'rgba(255,255,255,0.20)' : '#34d399',
            }}
          />
          <span
            style={{
              color:      sinDatos ? 'rgba(255,255,255,0.25)' : 'rgba(52,211,153,0.85)',
              fontSize:   '8px',
              fontWeight: 600,
            }}
          >
            BCCR
          </span>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 11px 0' }}>

        {/* ── Tasas: Compra / Venta ────────────────────────────── */}
        <div
          style={{
            display:             'grid',
            gridTemplateColumns: '1fr 1fr',
            gap:                 '8px',
            marginBottom:        '10px',
          }}
        >
          {/* Compra */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <ArrowDownCircle size={9} color="rgba(255,255,255,0.30)" />
              <span
                style={{
                  color:         'rgba(255,255,255,0.35)',
                  fontSize:      '8px',
                  fontWeight:    600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Compra
              </span>
            </div>
            <span
              style={{
                color:      sinDatos ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.90)',
                fontSize:   '15px',
                fontWeight: 700,
                fontFamily: 'monospace',
                lineHeight: 1,
              }}
            >
              {sinDatos ? '—' : `₡${fmtRate(data!.compra!)}`}
            </span>
          </div>

          {/* Venta */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <ArrowUpCircle size={9} color="rgba(74,222,128,0.60)" />
              <span
                style={{
                  color:         'rgba(74,222,128,0.55)',
                  fontSize:      '8px',
                  fontWeight:    600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Venta
              </span>
            </div>
            <span
              style={{
                color:      sinDatos ? 'rgba(255,255,255,0.20)' : '#4ade80',
                fontSize:   '15px',
                fontWeight: 700,
                fontFamily: 'monospace',
                lineHeight: 1,
              }}
            >
              {sinDatos ? '—' : `₡${fmtRate(data!.venta!)}`}
            </span>
          </div>
        </div>

        {/* ── Separador ───────────────────────────────────────── */}
        <div
          style={{
            height:       '0.5px',
            background:   'rgba(255,255,255,0.06)',
            marginBottom: '8px',
          }}
        />

        {/* ── Convertidor ─────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px' }}>

          {/* Fila ₡ → $ */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '5px',
              background:   'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              border:       `0.5px solid ${focusColones ? 'rgba(0,158,227,0.60)' : 'rgba(255,255,255,0.06)'}`,
              padding:      '5px 8px',
              transition:   'border-color 0.15s',
            }}
          >
            <span
              style={{
                color:      'rgba(255,255,255,0.35)',
                fontSize:   '10px',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              ₡
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={colones}
              onChange={e => handleColones(e.target.value)}
              onFocus={() => setFocusColones(true)}
              onBlur={() => setFocusColones(false)}
              placeholder={sinDatos ? '—' : '0'}
              disabled={sinDatos}
              style={{
                background: 'transparent',
                border:     'none',
                outline:    'none',
                color:      sinDatos ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                fontSize:   '11px',
                fontFamily: 'monospace',
                width:      '100%',
                minWidth:   0,
                cursor:     sinDatos ? 'not-allowed' : 'text',
              }}
            />
            {resultUSD && (
              <span
                style={{
                  color:      '#34d399',
                  fontSize:   '10px',
                  fontFamily: 'monospace',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {resultUSD}
              </span>
            )}
          </div>

          {/* Fila $ → ₡ */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          '5px',
              background:   'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              border:       `0.5px solid ${focusDolares ? 'rgba(0,158,227,0.60)' : 'rgba(255,255,255,0.06)'}`,
              padding:      '5px 8px',
              transition:   'border-color 0.15s',
            }}
          >
            <span
              style={{
                color:      'rgba(255,255,255,0.35)',
                fontSize:   '10px',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={dolares}
              onChange={e => handleDolares(e.target.value)}
              onFocus={() => setFocusDolares(true)}
              onBlur={() => setFocusDolares(false)}
              placeholder={sinDatos ? '—' : '0'}
              disabled={sinDatos}
              style={{
                background: 'transparent',
                border:     'none',
                outline:    'none',
                color:      sinDatos ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                fontSize:   '11px',
                fontFamily: 'monospace',
                width:      '100%',
                minWidth:   0,
                cursor:     sinDatos ? 'not-allowed' : 'text',
              }}
            />
            {resultCRC && (
              <span
                style={{
                  color:      'rgba(255,255,255,0.70)',
                  fontSize:   '10px',
                  fontFamily: 'monospace',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {resultCRC}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer con fecha ─────────────────────────────────────── */}
      <div
        style={{
          borderTop: '0.5px solid rgba(255,255,255,0.05)',
          padding:   '5px 11px',
          textAlign: 'center',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9px' }}>
          {data === null
            ? 'Cargando...'
            : sinDatos
              ? 'No disponible'
              : fechaMostrar}
        </span>
      </div>
    </div>
  )
}
