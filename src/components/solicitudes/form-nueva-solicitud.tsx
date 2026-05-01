'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Shield, FileText, ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import type { TipoSolicitud, MaestroCliente } from '@/types/database'

// ── Tipos ──────────────────────────────────────────────────────────────
type ClienteMin = Pick<MaestroCliente, 'cliente_cod' | 'cliente_nombre' | 'limite_credito' | 'estado_manual'>

const TIPOS_SOL: { key: TipoSolicitud; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    key: 'AUMENTO_LIMITE',
    label: 'Aumento de límite de crédito',
    desc: 'Solicitar incremento del límite aprobado para un cliente.',
    icon: <TrendingUp size={24} />,
    color: '#009ee3',
  },
  {
    key: 'EXCEPCION_CREDITO',
    label: 'Excepción de crédito',
    desc: 'Autorizar un pedido puntual para un cliente bloqueado.',
    icon: <Shield size={24} />,
    color: '#f59e0b',
  },
  {
    key: 'NOTA_CREDITO',
    label: 'Nota de crédito',
    desc: 'Solicitar emisión de una nota de crédito por devolución, error o descuento.',
    icon: <FileText size={24} />,
    color: '#8b5cf6',
  },
]

const MOTIVOS_NOTA = ['Devolución', 'Error de facturación', 'Descuento acordado', 'Otro']

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  userId:    string
  userEmail: string
  clientes:  ClienteMin[]
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════
export default function FormNuevaSolicitud({ userId, clientes }: Props) {
  const router = useRouter()

  const [tipo,          setTipo]          = useState<TipoSolicitud | null>(null)
  const [clienteCod,    setClienteCod]    = useState('')
  const [montoActual,   setMontoActual]   = useState(0)
  const [montoSol,      setMontoSol]      = useState('')
  const [monto,         setMonto]         = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [fechaLimite,   setFechaLimite]   = useState('')
  const [motivoNota,    setMotivoNota]    = useState(MOTIVOS_NOTA[0])
  const [docRef,        setDocRef]        = useState('')
  const [loading,       setLoading]       = useState(false)
  const [ok,            setOk]            = useState(false)
  const [error,         setError]         = useState('')

  // Al elegir cliente, auto-llenar límite actual
  function onClienteChange(cod: string) {
    setClienteCod(cod)
    const c = clientes.find(x => x.cliente_cod === cod)
    setMontoActual(c?.limite_credito ?? 0)
  }

  const clienteSelec = clientes.find(c => c.cliente_cod === clienteCod)

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tipo || !clienteCod) { setError('Seleccioná el tipo y el cliente.'); return }
    if (!justificacion.trim()) { setError('La justificación es obligatoria.'); return }
    setLoading(true); setError('')

    const supabase = createClient()
    const payload: Record<string, unknown> = {
      tipo,
      solicitante_id: userId,
      cliente_cod:    clienteCod,
      cliente_nombre: clienteSelec?.cliente_nombre ?? '',
      justificacion,
      estado:         'PENDIENTE',
    }
    if (tipo === 'AUMENTO_LIMITE') {
      payload.monto_actual    = montoActual
      payload.monto_solicitado = parseFloat(montoSol.replace(/\./g,'').replace(',','.')) || 0
    }
    if (tipo === 'EXCEPCION_CREDITO') {
      payload.monto       = parseFloat(monto.replace(/\./g,'').replace(',','.')) || 0
      payload.fecha_limite = fechaLimite || null
    }
    if (tipo === 'NOTA_CREDITO') {
      payload.monto       = parseFloat(monto.replace(/\./g,'').replace(',','.')) || 0
      payload.motivo_nota  = motivoNota
      payload.documento_ref = docRef || null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any).from('solicitudes').insert(payload)
    if (dbErr) { setError(`Error: ${dbErr.message}`); setLoading(false); return }

    setOk(true)
    setTimeout(() => router.push('/solicitudes'), 1500)
  }

  // ── Éxito ──────────────────────────────────────────────────────────
  if (ok) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <CheckCircle2 size={40} className="text-green-500 mb-3" />
        <p className="text-[15px] font-bold text-gray-800">¡Solicitud enviada!</p>
        <p className="text-[12px] text-gray-400 mt-1">El coordinador recibirá la solicitud para revisión.</p>
      </div>
    )
  }

  // ── Paso 1: elegir tipo ────────────────────────────────────────────
  if (!tipo) {
    return (
      <div className="p-5 max-w-2xl">
        <button
          onClick={() => router.push('/solicitudes')}
          className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 transition mb-5"
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <h2 className="text-[16px] font-bold text-gray-800 mb-1">Nueva solicitud</h2>
        <p className="text-[12px] text-gray-400 mb-5">Seleccioná el tipo de solicitud que querés crear.</p>
        <div className="space-y-3">
          {TIPOS_SOL.map(t => (
            <button
              key={t.key}
              onClick={() => setTipo(t.key)}
              className="w-full flex items-center gap-4 bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:shadow-md hover:border-blue-200 transition group"
            >
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: '44px', height: '44px', backgroundColor: t.color + '15', color: t.color }}
              >
                {t.icon}
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-gray-800 group-hover:text-blue-600 transition">{t.label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t.desc}</p>
              </div>
              <ArrowLeft size={14} className="text-gray-300 rotate-180 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Paso 2: formulario según tipo ──────────────────────────────────
  const tipCfg = TIPOS_SOL.find(t => t.key === tipo)!
  return (
    <div className="p-5 max-w-2xl">
      <button
        onClick={() => setTipo(null)}
        className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 transition mb-5"
      >
        <ArrowLeft size={14} /> Cambiar tipo
      </button>

      {/* Header del tipo */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center justify-center rounded-xl"
          style={{ width: '40px', height: '40px', backgroundColor: tipCfg.color + '15', color: tipCfg.color }}
        >
          {tipCfg.icon}
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-gray-800">{tipCfg.label}</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700 font-semibold">{error}</div>
        )}

        {/* Cliente */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Cliente *</label>
          <select value={clienteCod} onChange={e => onClienteChange(e.target.value)} className={inputCls} required>
            <option value="">Seleccioná un cliente...</option>
            {clientes.map(c => (
              <option key={c.cliente_cod} value={c.cliente_cod}>
                {c.cliente_nombre} ({c.cliente_cod})
              </option>
            ))}
          </select>
        </div>

        {/* ── Campos específicos por tipo ── */}

        {/* AUMENTO DE LÍMITE */}
        {tipo === 'AUMENTO_LIMITE' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Límite actual</label>
              <input
                type="text"
                readOnly
                value={montoActual > 0 ? `₡${montoActual.toLocaleString('es-CR')}` : 'Sin datos'}
                className={inputCls + ' bg-gray-50 text-gray-500'}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Límite solicitado (₡) *</label>
              <input
                type="text"
                value={montoSol}
                onChange={e => setMontoSol(e.target.value.replace(/[^0-9.,]/g,''))}
                placeholder="Ej: 5000000"
                className={inputCls}
                required
              />
            </div>
          </div>
        )}

        {/* EXCEPCIÓN DE CRÉDITO */}
        {tipo === 'EXCEPCION_CREDITO' && clienteSelec?.estado_manual === 'Bloqueado' === false && clienteCod && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-700 font-semibold">
            ⚠ Este cliente no está bloqueado. Las excepciones son para clientes con crédito suspendido.
          </div>
        )}
        {tipo === 'EXCEPCION_CREDITO' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Monto del pedido (₡) *</label>
              <input
                type="text"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^0-9.,]/g,''))}
                placeholder="Ej: 1500000"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Fecha límite excepción</label>
              <input
                type="date"
                value={fechaLimite}
                onChange={e => setFechaLimite(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* NOTA DE CRÉDITO */}
        {tipo === 'NOTA_CREDITO' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Monto (₡) *</label>
              <input
                type="text"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^0-9.,]/g,''))}
                placeholder="Ej: 250000"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Motivo *</label>
              <select value={motivoNota} onChange={e => setMotivoNota(e.target.value)} className={inputCls}>
                {MOTIVOS_NOTA.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Documento de referencia</label>
              <input
                type="text"
                value={docRef}
                onChange={e => setDocRef(e.target.value)}
                placeholder="Número de factura o documento"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Justificación (siempre) */}
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Justificación *</label>
          <textarea
            value={justificacion}
            onChange={e => setJustificacion(e.target.value)}
            rows={4}
            placeholder="Explicá el motivo de esta solicitud con detalle suficiente para que el coordinador pueda evaluar..."
            className={inputCls + ' resize-none'}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold text-white transition disabled:opacity-60"
          style={{ backgroundColor: tipCfg.color }}
        >
          <Send size={14} />
          {loading ? 'Enviando...' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  )
}
