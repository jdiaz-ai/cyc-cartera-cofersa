'use client'

import { useState, useMemo }         from 'react'
import {
  Phone, MessageCircle, Mail, Wrench, MapPin, X,
  CheckCircle2, Calendar, DollarSign, FileText,
  ChevronDown, ChevronUp, Receipt, ArrowRight,
} from 'lucide-react'
import { fmtCRC }          from '@/lib/utils/formato'
import { hoyISO_CR, ahoraCR, esFechaPasadaCR } from '@/lib/utils/timezone'
import type { Factura }    from '@/types/database'
import type { NuevaGestionBody } from '@/app/api/clientes/gestiones/nueva/route'
import { AREAS, getTiposPorArea } from '@/lib/solicitudes/catalogo'
import type { AreaKey } from '@/lib/solicitudes/catalogo'

// ── Tipos ──────────────────────────────────────────────────────────────
type Tipo = 'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'INTERNA' | 'VISITA'

type ProximaAccion =
  | 'esperar_pago'
  | 'recontactar'
  | 'escalar'
  | 'crear_solicitud'
  | 'sin_seguimiento'

// ── Configuración de tipos ─────────────────────────────────────────────
const TIPOS: { value: Tipo; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'LLAMADA',   label: 'Llamada',          icon: <Phone          size={15} />, color: '#3b82f6' },
  { value: 'WHATSAPP',  label: 'WhatsApp',         icon: <MessageCircle  size={15} />, color: '#22c55e' },
  { value: 'CORREO',    label: 'Correo',            icon: <Mail           size={15} />, color: '#f59e0b' },
  { value: 'INTERNA',   label: 'Gestión Interna',  icon: <Wrench         size={15} />, color: '#8b5cf6' },
  { value: 'VISITA',    label: 'Visita',            icon: <MapPin         size={15} />, color: '#ef4444' },
]

// ── Resultados por tipo ────────────────────────────────────────────────
const RESULTADOS: Record<Tipo, string[]> = {
  LLAMADA: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'No contestó',
    'Número ocupado',
    'Llamar después',
    'Contacto inválido',
  ],
  WHATSAPP: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'Mensaje enviado',
    'Visto sin respuesta',
    'Sin respuesta',
    'Contacto inválido',
  ],
  CORREO: [
    'Compromiso de pago confirmado',
    'Cliente indica pago realizado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
    'Requiere revisión interna',
    'Correo enviado',
    'Pendiente respuesta',
    'Correo inválido',
  ],
  INTERNA: [
    'Validación comercial',
    'Validación logística',
    'Validación crédito',
    'Escalado coordinación',
    'Seguimiento interno',
  ],
  VISITA: [
    'Cliente visitado',
    'No localizado',
    'Compromiso de pago confirmado',
    'Solicitud de convenio',
    'Reclamo comercial',
    'Reclamo logístico',
  ],
}

// ── Próximas acciones ──────────────────────────────────────────────────
const PROXIMAS: { value: ProximaAccion; label: string; requiresFecha: boolean }[] = [
  { value: 'esperar_pago',      label: 'Esperar pago',      requiresFecha: true  },
  { value: 'recontactar',       label: 'Recontactar',       requiresFecha: true  },
  { value: 'escalar',           label: 'Escalar revisión',  requiresFecha: true  },
  { value: 'crear_solicitud',   label: 'Crear solicitud',   requiresFecha: false },
  { value: 'sin_seguimiento',   label: 'Sin seguimiento',   requiresFecha: false },
]

// ── Estilos compartidos ────────────────────────────────────────────────
const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white ' +
  'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

const labelCls = 'block text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider'

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  clienteCod:    string
  clienteNombre: string
  contribuyente: string
  facturas:      Factura[]      // TODAS — filtrar aquí (saldo > 0 y vencidas)
  onClose:       () => void
  onSuccess:     () => void
  onIrAReportarPago: () => void  // cierra modal + cambia al tab Reportar Pago
  // Guarda la gestión y navega al flujo NUEVO /solicitudes/nueva (no el wizard legacy)
  onCrearSolicitud: (p: { gestion_id: string; area: string; tipo: string }) => void
}

// ══════════════════════════════════════════════════════════════════════
export default function FormNuevaGestion({
  clienteCod, clienteNombre, contribuyente, facturas, onClose, onSuccess,
  onIrAReportarPago, onCrearSolicitud,
}: Props) {
  const hoy = hoyISO_CR()

  // ── Estado del formulario ──────────────────────────────────────────
  const [tipo,           setTipo]           = useState<Tipo>('LLAMADA')
  const [resultado,      setResultado]      = useState<string>('')
  const [nota,           setNota]           = useState('')
  const [proximaAccion,  setProximaAccion]  = useState<ProximaAccion | ''>('')
  const [proximaFecha,   setProximaFecha]   = useState('')

  // Compromiso de pago
  const [compromisoMonto,  setCompromisoMonto]  = useState('')
  const [compromisoFecha,  setCompromisoFecha]  = useState('')
  const [factSeleccionadas, setFactSeleccionadas] = useState<Set<number>>(new Set())
  const [mostrarFacturas,   setMostrarFacturas]  = useState(false)

  // Solicitud de convenio
  const [convMonto,     setConvMonto]     = useState('')
  const [convCuotas,    setConvCuotas]    = useState('')
  const [convFrecuencia,setConvFrecuencia]= useState('')
  const [convFecha,     setConvFecha]     = useState('')

  // Llamar después
  const [llamarFecha,   setLlamarFecha]   = useState('')

  // Requiere revisión interna / escalado
  const [areaResponsable, setAreaResponsable] = useState('')
  const [prioridad,       setPrioridad]       = useState('')

  // Contacto inválido
  const [tipoProblema, setTipoProblema] = useState('')

  // Próxima acción = "Crear solicitud" → destino (área + tipo del catálogo nuevo)
  const [solArea, setSolArea] = useState<AreaKey | ''>('')
  const [solTipo, setSolTipo] = useState('')

  // Cambia la próxima acción y limpia el sub-bloque de solicitud si aplica
  function handleProxima(v: ProximaAccion) {
    setProximaAccion(v)
    setError('')
    if (v !== 'crear_solicitud') { setSolArea(''); setSolTipo('') }
  }

  // UX
  const [loading,  setLoading]  = useState(false)
  const [ok,       setOk]       = useState(false)
  const [error,    setError]    = useState('')

  // ── Facturas vencidas con saldo ────────────────────────────────────
  const facturasFiltradas = useMemo(() =>
    facturas.filter(f =>
      (f.saldo ?? 0) > 0 &&
      f.fecha_vencimiento &&
      f.fecha_vencimiento < hoy,
    ),
    [facturas, hoy],
  )

  const montoSeleccionado = useMemo(() =>
    facturasFiltradas
      .filter(f => factSeleccionadas.has(f.id))
      .reduce((s, f) => s + (f.saldo ?? 0), 0),
    [facturasFiltradas, factSeleccionadas],
  )

  const montoTotalFacturas = useMemo(() =>
    facturasFiltradas.reduce((s, f) => s + (f.saldo ?? 0), 0),
    [facturasFiltradas],
  )

  // ── Cuando cambia el tipo, resetear resultado ──────────────────────
  function handleTipo(t: Tipo) {
    setTipo(t)
    setResultado('')
    setError('')
  }

  // ── Auto-poblar próxima acción en "Llamar después" ─────────────────
  function handleResultado(r: string) {
    setResultado(r)
    setError('')
    if (r === 'Llamar después') {
      setProximaAccion('recontactar')
    }
    // El pago se concilia en Reportar Pago → la próxima acción natural es esperar/validar
    if (r === 'Cliente indica pago realizado') {
      setProximaAccion('esperar_pago')
    }
  }

  function toggleFactura(id: number) {
    setFactSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Tramo aging de la factura ──────────────────────────────────────
  function tramoFact(f: Factura): { label: string; color: string } {
    if (!f.fecha_vencimiento) return { label: '—', color: '#94a3b8' }
    const dias = Math.floor((new Date(hoy).getTime() - new Date(f.fecha_vencimiento).getTime()) / 86_400_000)
    if (dias > 120) return { label: '+120d',   color: '#991b1b' }
    if (dias > 90)  return { label: '91-120d', color: '#dc2626' }
    if (dias > 60)  return { label: '61-90d',  color: '#ef4444' }
    if (dias > 30)  return { label: '31-60d',  color: '#f97316' }
    return              { label: '1-30d',   color: '#f59e0b' }
  }

  // ── Validación ─────────────────────────────────────────────────────
  function validar(): string | null {
    if (!resultado) return 'Seleccioná un resultado'
    if (!nota.trim() && resultado !== 'Mensaje enviado' && resultado !== 'Correo enviado')
      return 'La observación es obligatoria'

    if (resultado === 'Compromiso de pago confirmado') {
      if (!compromisoMonto || parseFloat(compromisoMonto.replace(/\./g, '').replace(',', '.')) <= 0)
        return 'Ingresá el monto del compromiso'
      if (!compromisoFecha)
        return 'Ingresá la fecha del compromiso'
      if (esFechaPasadaCR(compromisoFecha))
        return 'La fecha del compromiso no puede ser en el pasado'
    }

    if (resultado === 'Solicitud de convenio') {
      if (!convMonto) return 'Ingresá el monto solicitado'
      if (!convCuotas || parseInt(convCuotas) < 1) return 'Ingresá la cantidad de cuotas'
      if (!convFrecuencia) return 'Seleccioná la frecuencia de pago'
      if (!convFecha) return 'Ingresá la fecha del primer pago'
      if (esFechaPasadaCR(convFecha)) return 'La fecha del primer pago no puede ser en el pasado'
    }

    if (resultado === 'Llamar después' || resultado === 'Recontactar') {
      if (!llamarFecha) return 'Ingresá la fecha de seguimiento'
      if (esFechaPasadaCR(llamarFecha)) return 'La fecha de seguimiento no puede ser en el pasado'
    }

    if (resultado === 'Requiere revisión interna') {
      if (!areaResponsable) return 'Seleccioná el área responsable'
      if (!prioridad)       return 'Seleccioná la prioridad'
    }

    if (resultado === 'Escalado coordinación') {
      if (!nota.trim()) return 'La observación es obligatoria para escalar'
    }

    if (resultado === 'Contacto inválido') {
      if (!tipoProblema) return 'Seleccioná el tipo de problema'
    }

    // Próxima acción
    if (!proximaAccion) return 'Seleccioná una próxima acción'
    if (proximaAccion === 'crear_solicitud') {
      if (!solArea) return 'Seleccioná el área destino de la solicitud'
      if (!solTipo) return 'Seleccioná el tipo de solicitud'
    }
    const pa = PROXIMAS.find(p => p.value === proximaAccion)
    if (pa?.requiresFecha && !proximaFecha) return 'Ingresá la fecha de la próxima acción'
    if (pa?.requiresFecha && proximaFecha && esFechaPasadaCR(proximaFecha))
      return 'La fecha de próxima acción no puede ser en el pasado'

    return null
  }

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const err = validar()
    if (err) { setError(err); return }

    setLoading(true)
    setError('')

    const { fecha, hora } = ahoraCR()

    // Construir metadata según resultado
    let metadata: Record<string, unknown> | null = null
    if (resultado === 'Compromiso de pago confirmado') {
      metadata = {
        compromiso_monto: parseFloat(compromisoMonto.replace(/\./g, '').replace(',', '.')),
        compromiso_fecha: compromisoFecha,
        facturas_ids:     Array.from(factSeleccionadas),
      }
    } else if (resultado === 'Solicitud de convenio') {
      metadata = {
        convenio_monto:      parseFloat(convMonto.replace(/\./g, '').replace(',', '.')),
        convenio_cuotas:     parseInt(convCuotas),
        convenio_frecuencia: convFrecuencia,
        convenio_primer_pago: convFecha,
      }
    } else if (resultado === 'Requiere revisión interna') {
      metadata = { area: areaResponsable, prioridad }
    } else if (resultado === 'Contacto inválido') {
      metadata = { tipo_problema: tipoProblema }
    } else if (resultado === 'Llamar después') {
      metadata = { seguimiento_fecha: llamarFecha }
    }

    // Construir promesa si aplica
    let promesa: NuevaGestionBody['promesa'] = null
    if (resultado === 'Compromiso de pago confirmado' && compromisoFecha) {
      const monto = parseFloat(compromisoMonto.replace(/\./g, '').replace(',', '.'))
      promesa = {
        monto,
        fecha_promesa: compromisoFecha,
        facturas_ids:  Array.from(factSeleccionadas),
      }
    }

    const body: NuevaGestionBody = {
      cliente_cod:   clienteCod,
      contribuyente,
      tipo,
      resultado,
      nota:          nota.trim(),
      fecha,
      hora,
      proxima_accion:       proximaAccion || null,
      proxima_accion_fecha: (proximaAccion && proximaAccion !== 'sin_seguimiento')
        ? (resultado === 'Llamar después' ? llamarFecha : proximaFecha) || null
        : null,
      metadata,
      promesa,
    }

    const res = await fetch('/api/clientes/gestiones/nueva', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al guardar. Intentá de nuevo.')
      setLoading(false)
      return
    }

    // ── Próxima acción = "Crear solicitud" ───────────────────────────
    // La gestión SIEMPRE se guarda antes de navegar. Solo si el guardado
    // fue exitoso, navegamos al flujo NUEVO /solicitudes/nueva.
    if (proximaAccion === 'crear_solicitud') {
      const d = await res.json().catch(() => ({}))
      const gestionId: string = d.gestion_id ?? ''
      onCrearSolicitud({ gestion_id: gestionId, area: solArea, tipo: solTipo })
      return
    }

    setOk(true)
    setTimeout(() => { onSuccess() }, 1200)
  }

  // ── Pantalla de éxito ──────────────────────────────────────────────
  if (ok) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <CheckCircle2 size={44} className="text-green-500 mb-3" />
          <p className="text-[16px] font-bold text-gray-800">¡Gestión registrada!</p>
          <p className="text-[12px] text-gray-400 mt-1">Actualizando bitácora…</p>
        </div>
      </Overlay>
    )
  }

  const tipoActivo = TIPOS.find(t => t.value === tipo)!
  const resultados = RESULTADOS[tipo]

  return (
    <Overlay onClose={onClose}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Registrar gestión</h2>
          <p className="text-[12px] text-gray-400 mt-0.5">{clienteNombre}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition text-gray-400"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Cuerpo scrolleable ────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-6">

        {/* Error global */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[12px] text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* ── BLOQUE 1: Tipo de gestión ────────────────────────── */}
        <div>
          <p className={labelCls}>Tipo de gestión</p>
          <div className="flex gap-2 flex-wrap">
            {TIPOS.map(t => {
              const activo = tipo === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTipo(t.value)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[12px] font-semibold transition-all"
                  style={activo
                    ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                    : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}
                >
                  {t.icon}
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── BLOQUE 2: Resultado dinámico ─────────────────────── */}
        <div>
          <p className={labelCls}>Resultado — {tipoActivo.label}</p>
          <div className="flex flex-wrap gap-2">
            {resultados.map(r => {
              const activo = resultado === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleResultado(r)}
                  className="px-3 py-1.5 rounded-full border text-[12px] font-medium transition-all"
                  style={activo
                    ? { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f', color: '#fff' }
                    : { backgroundColor: '#fff',    borderColor: '#e5e7eb', color: '#374151' }}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── BLOQUE 3: Campos dinámicos por resultado ─────────── */}
        {resultado === 'Compromiso de pago confirmado' && (
          <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-[12px] font-bold text-green-700 flex items-center gap-1.5">
              <DollarSign size={14} /> Datos del compromiso de pago
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Monto compromiso *</label>
                <input type="text" value={compromisoMonto}
                  onChange={e => setCompromisoMonto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="Ej: 450000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fecha compromiso *</label>
                <input type="date" value={compromisoFecha} min={hoy}
                  onChange={e => setCompromisoFecha(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Selección de facturas */}
            {facturasFiltradas.length > 0 && (
              <div>
                <button type="button"
                  onClick={() => setMostrarFacturas(v => !v)}
                  className="flex items-center gap-2 text-[12px] font-semibold text-green-700 hover:text-green-900 transition"
                >
                  <FileText size={13} />
                  {factSeleccionadas.size > 0
                    ? `${factSeleccionadas.size} factura${factSeleccionadas.size !== 1 ? 's' : ''} seleccionada${factSeleccionadas.size !== 1 ? 's' : ''} — ${fmtCRC(montoSeleccionado)} de ${fmtCRC(montoTotalFacturas)}`
                    : `Vincular facturas (${facturasFiltradas.length} vencidas con saldo)`}
                  {mostrarFacturas ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {mostrarFacturas && (
                  <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {facturasFiltradas.map(f => {
                      const sel   = factSeleccionadas.has(f.id)
                      const tramo = tramoFact(f)
                      return (
                        <label key={f.id}
                          className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all"
                          style={sel
                            ? { backgroundColor: '#dcfce7', borderColor: '#86efac' }
                            : { backgroundColor: '#fff',    borderColor: '#e5e7eb' }}
                        >
                          <input type="checkbox" checked={sel}
                            onChange={() => toggleFactura(f.id)}
                            className="w-4 h-4 accent-green-600 flex-shrink-0" />
                          <span className="text-[11px] font-mono text-gray-500 flex-shrink-0">
                            {f.documento}
                          </span>
                          <span className="text-[12px] font-semibold text-gray-800 flex-1">
                            {fmtCRC(f.saldo ?? 0)}
                          </span>
                          <span className="text-[10px] font-bold rounded-full px-2 py-0.5 flex-shrink-0"
                            style={{ backgroundColor: `${tramo.color}22`, color: tramo.color }}>
                            {tramo.label}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {resultado === 'Cliente indica pago realizado' && (
          <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <p className="text-[12px] font-bold text-blue-700 flex items-center gap-1.5">
              <Receipt size={14} /> El pago se documenta en Reportar Pago
            </p>
            <p className="text-[12px] text-blue-600 leading-relaxed">
              No se registra el pago aquí para evitar duplicidad operativa. La evidencia
              documental (OCR del comprobante, selección de facturas y conciliación) se
              gestiona en la pestaña <strong>Reportar Pago</strong>.
            </p>
            <p className="text-[11px] text-blue-500 leading-relaxed">
              Esta gestión queda registrada como el contacto donde el cliente indicó el
              pago. Guardala normalmente y luego adjuntá el comprobante en Reportar Pago,
              o usá el botón para ir directo.
            </p>
            <button
              type="button"
              onClick={onIrAReportarPago}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: '#009ee3' }}
            >
              <Receipt size={14} /> Ir a Reportar Pago <ArrowRight size={14} />
            </button>
          </div>
        )}

        {resultado === 'Solicitud de convenio' && (
          <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#fefce8', border: '1px solid #fde68a' }}>
            <p className="text-[12px] font-bold text-yellow-700">Datos del convenio solicitado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Monto total *</label>
                <input type="text" value={convMonto}
                  onChange={e => setConvMonto(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="Ej: 1200000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Cantidad de cuotas *</label>
                <input type="number" min="1" value={convCuotas}
                  onChange={e => setConvCuotas(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Frecuencia *</label>
                <select value={convFrecuencia}
                  onChange={e => setConvFrecuencia(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {['Semanal', 'Quincenal', 'Mensual', 'Única'].map(f =>
                    <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Primer pago *</label>
                <input type="date" value={convFecha} min={hoy}
                  onChange={e => setConvFecha(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>
        )}

        {resultado === 'Llamar después' && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <label className={labelCls}>Fecha de seguimiento *</label>
            <input type="date" value={llamarFecha} min={hoy}
              onChange={e => { setLlamarFecha(e.target.value); setProximaFecha(e.target.value) }}
              className={inputCls} />
          </div>
        )}

        {resultado === 'Requiere revisión interna' && (
          <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
            <p className="text-[12px] font-bold text-purple-700">Detalles de revisión interna</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Área responsable *</label>
                <select value={areaResponsable}
                  onChange={e => setAreaResponsable(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {['Comercial', 'Logística', 'Crédito', 'Coordinación'].map(a =>
                    <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Prioridad *</label>
                <div className="flex gap-2 mt-1">
                  {(['Alta', 'Media', 'Baja'] as const).map(p => (
                    <button key={p} type="button"
                      onClick={() => setPrioridad(p)}
                      className="flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all"
                      style={prioridad === p
                        ? { backgroundColor: p === 'Alta' ? '#dc2626' : p === 'Media' ? '#f59e0b' : '#22c55e', color: '#fff', borderColor: 'transparent' }
                        : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {resultado === 'Contacto inválido' && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
            <label className={labelCls}>Tipo de problema *</label>
            <select value={tipoProblema}
              onChange={e => setTipoProblema(e.target.value)} className={inputCls}>
              <option value="">Seleccionar...</option>
              {['Número equivocado', 'No existe', 'Correo rebotó', 'WhatsApp inválido'].map(t =>
                <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {/* ── BLOQUE 4: Próxima acción ──────────────────────────── */}
        <div>
          <p className={labelCls}>Próxima acción</p>
          <div className="flex flex-wrap gap-2">
            {PROXIMAS.map(pa => {
              const activo = proximaAccion === pa.value
              return (
                <button key={pa.value} type="button"
                  onClick={() => handleProxima(pa.value)}
                  className="px-3 py-1.5 rounded-full border text-[12px] font-medium transition-all"
                  style={activo
                    ? { backgroundColor: '#003B5C', borderColor: '#003B5C', color: '#fff' }
                    : { backgroundColor: '#fff',    borderColor: '#e5e7eb', color: '#374151' }}>
                  {pa.label}
                </button>
              )
            })}
          </div>

          {/* ── Sub-bloque: Destino de la solicitud ─────────────────── */}
          {proximaAccion === 'crear_solicitud' && (
            <div className="mt-3 rounded-xl p-4 space-y-3" style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <p className="text-[12px] font-bold text-[#0369a1] flex items-center gap-1.5">
                <FileText size={14} /> Destino de la solicitud
              </p>

              <div>
                <label className={labelCls}>Área destino *</label>
                <div className="relative">
                  <select
                    value={solArea}
                    onChange={e => { setSolArea(e.target.value as AreaKey); setSolTipo(''); setError('') }}
                    className={`${inputCls} appearance-none pr-9`}
                  >
                    <option value="">Seleccionar área…</option>
                    {AREAS.map(a => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {solArea && (
                <div>
                  <label className={labelCls}>Tipo de solicitud *</label>
                  <div className="relative">
                    <select
                      value={solTipo}
                      onChange={e => { setSolTipo(e.target.value); setError('') }}
                      className={`${inputCls} appearance-none pr-9`}
                    >
                      <option value="">Seleccionar tipo…</option>
                      {getTiposPorArea(solArea).map(t => (
                        <option key={t.tipo} value={t.tipo}>
                          {t.tipo} · {t.prioridad} · SLA {t.sla_horas}h
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={loading || !solArea || !solTipo}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: '#009ee3' }}
              >
                {loading ? 'Guardando gestión…' : <>Continuar a Solicitud <ArrowRight size={14} /></>}
              </button>
              <p className="text-[11px] text-[#0369a1] leading-relaxed">
                Se guardará la gestión y serás llevado al formulario de solicitud con
                el área y tipo pre-cargados, vinculado a esta gestión.
              </p>
            </div>
          )}

          {/* Fecha próxima acción */}
          {proximaAccion && proximaAccion !== 'sin_seguimiento'
            && proximaAccion !== 'crear_solicitud' && resultado !== 'Llamar después' && (
            <div className="mt-3">
              <label className={labelCls}>
                <Calendar size={11} className="inline mr-1" />
                Fecha próxima acción *
              </label>
              <input type="date" value={proximaFecha} min={hoy}
                onChange={e => setProximaFecha(e.target.value)}
                className={`${inputCls} max-w-[200px]`} />
            </div>
          )}
          {resultado === 'Llamar después' && proximaAccion === 'recontactar' && llamarFecha && (
            <p className="text-[11px] text-gray-400 mt-2">
              Fecha de seguimiento: <strong>{llamarFecha}</strong> (pre-poblada desde el resultado)
            </p>
          )}
        </div>

        {/* ── BLOQUE 5: Observaciones ───────────────────────────── */}
        <div>
          <label className={labelCls}>Observaciones</label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={3}
            placeholder="Detallá la gestión, acuerdos, contexto relevante..."
            className={`${inputCls} resize-none`}
          />
        </div>

      </form>

      {/* ── Footer fijo ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3"
        style={{ backgroundColor: '#fafbfc' }}>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-500 hover:bg-gray-100 transition">
          Cancelar
        </button>
        <button
          type="submit"
          form="form-gestion"
          disabled={loading}
          onClick={handleSubmit}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition disabled:opacity-60"
          style={{ backgroundColor: '#009ee3' }}>
          {loading ? 'Guardando…' : 'Registrar gestión'}
        </button>
      </div>

    </Overlay>
  )
}

// ── Overlay compartido ─────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
        style={{ maxWidth: '680px', maxHeight: '92vh' }}
      >
        {children}
      </div>
    </div>
  )
}
