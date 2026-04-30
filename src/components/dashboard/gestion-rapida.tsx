'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'

export interface ClienteOpt {
  cod: string
  nombre: string
  contribuyente: string
}

const TIPOS = ['LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA']

const RESULTADOS = [
  'Promesa OK',
  'No contestó',
  'No ubicado',
  'Pagó',
  'Email enviado',
  'Pendiente',
  'Aceptó convenio',
  'Llamar más tarde',
]

const NOTAS_RAPIDAS = [
  'No contestó, se dejó mensaje de voz',
  'Prometió pagar a fin de mes',
  'Solicitó estado de cuenta',
  'No ubicado, teléfono fuera de servicio',
  'Aceptó convenio de pago',
]

interface Props {
  clientes: ClienteOpt[]
  analistaEmail: string
  hoyStr: string
}

export default function GestionRapida({ clientes, analistaEmail, hoyStr }: Props) {
  const [clienteCod, setClienteCod] = useState('')
  const [tipo,       setTipo]       = useState('LLAMADA')
  const [resultado,  setResultado]  = useState('Pendiente')
  const [nota,       setNota]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [ok,         setOk]         = useState(false)
  const [error,      setError]      = useState('')

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clienteCod) { setError('Seleccioná un cliente'); return }
    setLoading(true)
    setError('')

    const cliente = clientes.find(c => c.cod === clienteCod)
    const supabase = createClient()
    const now  = new Date()
    const hora = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await supabase.from('gestiones').insert({
      cliente_cod:   clienteCod,
      contribuyente: cliente?.contribuyente ?? '',
      analista_email: analistaEmail,
      fecha:         hoyStr,
      hora,
      tipo,
      resultado,
      nota,
    } as any)

    if (dbErr) {
      setError('Error al guardar. Intentá de nuevo.')
    } else {
      setOk(true)
      setClienteCod('')
      setNota('')
      setResultado('Pendiente')
      // Refrescar la página para que aparezca en el listado
      setTimeout(() => { window.location.reload() }, 1500)
    }
    setLoading(false)
  }

  if (ok) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 size={36} className="text-green-500 mb-3" />
        <p className="text-sm font-bold text-gray-700">¡Gestión guardada!</p>
        <p className="text-xs text-gray-400 mt-1">Actualizando...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-semibold">
          {error}
        </div>
      )}

      {/* Cliente */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Cliente</label>
        <select value={clienteCod} onChange={e => setClienteCod(e.target.value)} className={inputCls}>
          <option value="">Seleccioná un cliente...</option>
          {clientes.map(c => (
            <option key={c.cod} value={c.cod}>{c.nombre} ({c.cod})</option>
          ))}
        </select>
      </div>

      {/* Tipo + Resultado */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
            {TIPOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Resultado</label>
          <select value={resultado} onChange={e => setResultado(e.target.value)} className={inputCls}>
            {RESULTADOS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Notas rápidas */}
      <div>
        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nota</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {NOTAS_RAPIDAS.map(n => (
            <button
              key={n} type="button"
              onClick={() => setNota(n)}
              className="text-xs px-2.5 py-1 rounded-full border transition"
              style={nota === n
                ? { background: '#009ee3', color: 'white', borderColor: '#009ee3' }
                : { background: 'white', color: '#64748b', borderColor: '#E2E8F0' }}
            >
              {n.slice(0, 28)}{n.length > 28 ? '…' : ''}
            </button>
          ))}
        </div>
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          rows={2}
          placeholder="O escribí tu nota aquí..."
          className={inputCls + ' resize-none'}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
        style={{ backgroundColor: '#009ee3' }}
      >
        <Send size={14} />
        {loading ? 'Guardando...' : 'Registrar gestión'}
      </button>
    </form>
  )
}
