'use client'

/**
 * SaludoDashboard
 * Saludo dinámico según hora local de Costa Rica (America/Costa_Rica).
 * Es un client component para poder leer la hora del navegador.
 */

import { useEffect, useState } from 'react'

interface Props {
  nombre: string
}

function calcularSaludo(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

export default function SaludoDashboard({ nombre }: Props) {
  const [saludo, setSaludo] = useState('')
  const [fecha,  setFecha]  = useState('')

  useEffect(() => {
    const tz  = 'America/Costa_Rica'
    const now = new Date()

    // Hora numérica en CR
    const horaStr = new Intl.DateTimeFormat('en-US', {
      hour:      'numeric',
      hour12:    false,
      timeZone:  tz,
    }).format(now)
    const hora = parseInt(horaStr, 10)

    setSaludo(calcularSaludo(hora))

    // Fecha larga en español: "Jueves, 15 de mayo de 2026"
    const raw = new Intl.DateTimeFormat('es-CR', {
      weekday:  'long',
      day:      'numeric',
      month:    'long',
      year:     'numeric',
      timeZone: tz,
    }).format(now)
    // Capitalizar primera letra
    setFecha(raw.charAt(0).toUpperCase() + raw.slice(1))
  }, [])

  // No renderizar hasta que el efecto se ejecute (evita parpadeo de hidratación)
  if (!saludo) return null

  return (
    <div
      style={{
        background:   'linear-gradient(135deg, #003B5C 0%, #005080 55%, #0083c1 100%)',
        borderRadius: '16px',
        padding:      '18px 24px',
        boxShadow:    '0 4px 20px rgba(0,59,92,0.20)',
        marginBottom: '0',           // el padre maneja el gap
      }}
    >
      <h2
        style={{
          fontSize:   '20px',
          fontWeight: 500,
          color:      'white',
          lineHeight: 1.2,
          margin:     0,
        }}
      >
        {saludo}, <span style={{ fontWeight: 700 }}>{nombre}</span>
      </h2>
      <p
        style={{
          fontSize:  '13px',
          color:     'rgba(255,255,255,0.55)',
          marginTop: '4px',
          lineHeight: 1,
        }}
      >
        {fecha}
      </p>
    </div>
  )
}
