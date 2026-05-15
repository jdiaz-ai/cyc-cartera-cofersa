'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Landmark, Hash, Calendar, DollarSign,
  CheckSquare, Square, AlertCircle, CheckCircle2,
  ChevronDown, Loader2, StickyNote,
} from 'lucide-react'
import { fmtCRC, fmtFecha, hoyISO } from '@/lib/utils/formato'
import type { Factura } from '@/types/database'

// ── Constantes ─────────────────────────────────────────────────────────

const BANCOS = [
  { value: 'BAC',       label: 'BAC Credomatic' },
  { value: 'BN',        label: 'Banco Nacional' },
  { value: 'BCR',       label: 'Banco de Costa Rica' },
  { value: 'DAVIVIENDA', label: 'Davivienda' },
] as const

type BancoValue = typeof BANCOS[number]['value']

// ── Tipos internos ──────────────────────────────────────────────────────

interface FacturaSeleccionada {
  factura_id:    number
  documento:     string
  saldo_max:     number      // saldo original de la factura
  monto_aplicado: number     // lo que el analista ingresó (parcial o total)
}

// ── Props ───────────────────────────────────────────────────────────────

interface Props {
  clienteCod:    string
  contribuyente: string
  facturas:      Factura[]   // todas las facturas del cliente
  onSuccess:     () => void
  onToast:       (msg: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────

function facturasVencidas(facturas: Factura[]): Factura[] {
  const hoy = hoyISO()
  return facturas.filter(f =>
    (f.saldo ?? 0) > 0 &&
    f.fecha_vencimiento &&
    f.fecha_vencimiento < hoy
  ).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)) // más antigua primero
}

function diasVencida(fechaVenc: string): number {
  const hoy = hoyISO()
  return Math.max(0, Math.floor(
    (new Date(hoy).getTime() - new Date(fechaVenc).getTime()) / 86400000
  ))
}

function colorDias(dias: number): { bg: string; text: string } {
  if (dias > 120) return { bg: '#fee2e2', text: '#dc2626' }
  if (dias > 60)  return { bg: '#fee2e2', text: '#dc2626' }
  if (dias > 30)  return { bg: '#ffedd5', text: '#c2410c' }
  if (dias > 0)   return { bg: '#fef9c3', text: '#a16207' }
  return { bg: '#dcfce7', text: '#15803d' }
}

// ── Subcomponentes ──────────────────────────────────────────────────────

function InputField({
  label, value, onChange, type = 'text', placeholder, icon, required, disabled, hint,
}: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  type?:       string
  placeholder?: string
  icon?:       React.ReactNode
  required?:   boolean
  disabled?:   boolean
  hint?:       string
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full border border-gray-200 rounded-xl text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#009ee3] transition disabled:bg-gray-50 disabled:text-gray-400"
          style={{ padding: icon ? '9px 12px 9px 34px' : '9px 12px' }}
        />
      </div>
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

function BancoSelector({
  value, onChange,
}: {
  value:    BancoValue | ''
  onChange: (v: BancoValue) => void
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        Banco origen<span className="text-red-400 ml-0.5">*</span>
      </label>
      <div className="relative">
        <Landmark size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <select
          value={value}
          onChange={e => onChange(e.target.value as BancoValue)}
          className="w-full border border-gray-200 rounded-xl text-[13px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition appearance-none"
          style={{ padding: '9px 32px 9px 34px', backgroundColor: 'white' }}
        >
          <option value="" disabled>Seleccionar banco…</option>
          {BANCOS.map(b => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────

export default function TabReportarPago({
  clienteCod, contribuyente, facturas, onSuccess, onToast,
}: Props) {

  // ── Estado: lado derecho (datos del pago) ─────────────────────────
  const [banco,   setBanco]   = useState<BancoValue | ''>('')
  const [ref,     setRef]     = useState('')
  const [fecha,   setFecha]   = useState(hoyISO())
  const [monto,   setMonto]   = useState('')
  const [notas,   setNotas]   = useState('')

  // ── Estado: lado izquierdo (selección de facturas) ────────────────
  const [seleccion, setSeleccion] = useState<Map<number, FacturaSeleccionada>>(new Map())

  // ── Estado del submit ─────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Facturas vencidas (las únicas que aplican a un pago en mora) ──
  const facturasConSaldo = useMemo(() => facturasVencidas(facturas), [facturas])

  // ── Totalizador dinámico ──────────────────────────────────────────
  const totalSeleccion = useMemo(() =>
    Array.from(seleccion.values()).reduce((acc, f) => acc + f.monto_aplicado, 0),
    [seleccion]
  )

  const montoNum = parseFloat(monto.replace(/[^0-9.]/g, '')) || 0

  // ── Diferencia entre monto ingresado y suma facturas ─────────────
  const diferencia = Math.abs(montoNum - totalSeleccion)
  const cuadra     = seleccion.size > 0 && montoNum > 0 && diferencia <= 1

  // ── Toggle de factura ─────────────────────────────────────────────
  const toggleFactura = useCallback((f: Factura) => {
    setSeleccion(prev => {
      const next = new Map(prev)
      if (next.has(f.id)) {
        next.delete(f.id)
      } else {
        next.set(f.id, {
          factura_id:    f.id,
          documento:     f.documento,
          saldo_max:     f.saldo ?? 0,
          monto_aplicado: f.saldo ?? 0,   // default = saldo completo
        })
      }
      return next
    })
  }, [])

  // ── Cambiar monto aplicado a una factura ──────────────────────────
  const cambiarMontoAplicado = useCallback((facturaId: number, valor: string) => {
    const num = parseFloat(valor.replace(/[^0-9.]/g, '')) || 0
    setSeleccion(prev => {
      const next = new Map(prev)
      const item = next.get(facturaId)
      if (!item) return prev
      next.set(facturaId, { ...item, monto_aplicado: num })
      return next
    })
  }, [])

  // ── Seleccionar / deseleccionar todas ────────────────────────────
  function toggleTodas() {
    if (seleccion.size === facturasConSaldo.length) {
      setSeleccion(new Map())
    } else {
      const next = new Map<number, FacturaSeleccionada>()
      facturasConSaldo.forEach(f => {
        next.set(f.id, {
          factura_id:    f.id,
          documento:     f.documento,
          saldo_max:     f.saldo ?? 0,
          monto_aplicado: f.saldo ?? 0,
        })
      })
      setSeleccion(next)
    }
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!banco) { setError('Seleccione el banco de origen'); return }
    if (!ref.trim()) { setError('Ingrese el número de referencia'); return }
    if (!fecha) { setError('Ingrese la fecha de transferencia'); return }
    if (!montoNum || montoNum <= 0) { setError('Ingrese un monto válido'); return }
    if (seleccion.size === 0) { setError('Seleccione al menos una factura'); return }
    if (!cuadra) { setError(`La suma de facturas (${fmtCRC(totalSeleccion)}) no coincide con el monto transferido (${fmtCRC(montoNum)})`); return }

    setSubmitting(true)

    const detalles = Array.from(seleccion.values()).map(d => ({
      factura_id:    d.factura_id,
      documento:     d.documento,
      monto_aplicado: d.monto_aplicado,
    }))

    try {
      const res = await fetch('/api/clientes/pagos/reportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_cod:         clienteCod,
          contribuyente,
          banco_origen:        banco,
          referencia:          ref.trim(),
          monto_transferido:   montoNum,
          fecha_transferencia: fecha,
          detalles,
          notas: notas.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Error desconocido')
        return
      }
      onToast('Pago reportado correctamente')
      onSuccess()
    } catch {
      setError('Error de conexión. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  if (facturasConSaldo.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0fdf4' }}>
          <CheckCircle2 size={24} className="text-green-500" />
        </div>
        <p className="text-[14px] font-semibold text-gray-700">Sin facturas vencidas</p>
        <p className="text-[12px] text-gray-400 max-w-xs">
          Este cliente no tiene facturas vencidas pendientes de pago. No hay nada que reportar por el momento.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr' }}>

        {/* ══════════════════════════════════════════════════════════
            COLUMNA IZQUIERDA — Selección de facturas
        ══════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">

          {/* Header de la tabla */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-gray-100"
            style={{ backgroundColor: '#fafafa' }}
          >
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleTodas} className="text-gray-400 hover:text-[#009ee3] transition">
                {seleccion.size === facturasConSaldo.length
                  ? <CheckSquare size={15} className="text-[#009ee3]" />
                  : <Square size={15} />
                }
              </button>
              <span className="text-[12px] font-bold text-gray-700">
                Facturas vencidas
              </span>
              <span className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                {facturasConSaldo.length}
              </span>
            </div>
            <span className="text-[10px] text-gray-400">
              {seleccion.size} seleccionadas
            </span>
          </div>

          {/* Tabla scrolleable */}
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '380px' }}>
            {facturasConSaldo.map((f, i) => {
              const checked = seleccion.has(f.id)
              const item    = seleccion.get(f.id)
              const dias    = diasVencida(f.fecha_vencimiento)
              const clr     = colorDias(dias)

              return (
                <div
                  key={f.id}
                  className="flex items-center gap-3 px-4 py-3 transition cursor-pointer"
                  style={{
                    borderBottom: i < facturasConSaldo.length - 1 ? '1px solid #f8fafc' : 'none',
                    backgroundColor: checked ? '#f0f9ff' : 'transparent',
                  }}
                  onClick={() => toggleFactura(f)}
                >
                  {/* Checkbox */}
                  <div className="flex-shrink-0 mt-0.5">
                    {checked
                      ? <CheckSquare size={15} className="text-[#009ee3]" />
                      : <Square      size={15} className="text-gray-300" />
                    }
                  </div>

                  {/* Datos de la factura */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-gray-800 truncate">
                        {f.documento}
                      </span>
                      <span
                        className="text-[9px] font-black rounded-full px-1.5 py-0.5 flex-shrink-0"
                        style={{ backgroundColor: clr.bg, color: clr.text }}
                      >
                        {dias}d
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Venció: {fmtFecha(f.fecha_vencimiento)}
                    </p>
                  </div>

                  {/* Saldo + input de monto parcial */}
                  <div className="flex-shrink-0 text-right" onClick={e => e.stopPropagation()}>
                    {!checked ? (
                      <span className="text-[12px] font-bold text-gray-700">
                        {fmtCRC(f.saldo)}
                      </span>
                    ) : (
                      <div>
                        <input
                          type="number"
                          value={item?.monto_aplicado ?? f.saldo}
                          min={1}
                          max={f.saldo ?? undefined}
                          step={1}
                          onChange={e => cambiarMontoAplicado(f.id, e.target.value)}
                          className="border border-[#009ee3] rounded-lg text-[11px] font-bold text-gray-800 text-right focus:outline-none focus:ring-1 focus:ring-[#009ee3]"
                          style={{ width: '96px', padding: '4px 8px', backgroundColor: 'white' }}
                        />
                        <p className="text-[9px] text-gray-400 mt-0.5 text-right">
                          máx {fmtCRC(f.saldo)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totalizador */}
          <div
            className="px-4 py-3 border-t"
            style={{ borderColor: cuadra ? '#bbf7d0' : seleccion.size > 0 ? '#fde68a' : '#f1f5f9', backgroundColor: cuadra ? '#f0fdf4' : seleccion.size > 0 ? '#fffbeb' : '#fafafa' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Suma seleccionada
              </span>
              <span className="text-[15px] font-black" style={{ color: cuadra ? '#15803d' : seleccion.size > 0 ? '#a16207' : '#94a3b8' }}>
                {fmtCRC(totalSeleccion)}
              </span>
            </div>
            {seleccion.size > 0 && montoNum > 0 && !cuadra && (
              <p className="text-[10px] mt-1 font-semibold" style={{ color: '#a16207' }}>
                Diferencia: {fmtCRC(Math.abs(montoNum - totalSeleccion))} — ajuste los montos para que coincidan
              </p>
            )}
            {cuadra && (
              <p className="text-[10px] mt-1 font-semibold text-green-600 flex items-center gap-1">
                <CheckCircle2 size={10} /> Los montos coinciden
              </p>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            COLUMNA DERECHA — Datos del pago
        ══════════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">

          <div
            className="px-4 py-3 border-b border-gray-100"
            style={{ backgroundColor: '#fafafa' }}
          >
            <h3 className="text-[12px] font-bold text-gray-700">Datos del pago</h3>
          </div>

          <div className="flex-1 p-4 space-y-4">

            {/* Banco */}
            <BancoSelector value={banco} onChange={setBanco} />

            {/* Referencia */}
            <InputField
              label="Número de referencia"
              value={ref}
              onChange={setRef}
              placeholder="Ej: 789456123"
              icon={<Hash size={13} />}
              required
              hint="Número de comprobante de la transferencia"
            />

            {/* Fecha */}
            <InputField
              label="Fecha de transferencia"
              value={fecha}
              onChange={setFecha}
              type="date"
              icon={<Calendar size={13} />}
              required
            />

            {/* Monto */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                Monto transferido (CRC)<span className="text-red-400 ml-0.5">*</span>
              </label>
              <div className="relative">
                <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="number"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0"
                  min={1}
                  step={1}
                  className="w-full border border-gray-200 rounded-xl text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#009ee3] transition"
                  style={{ padding: '9px 12px 9px 34px' }}
                />
              </div>
              {montoNum > 0 && (
                <p className="mt-1 text-[10px] text-gray-400 font-medium">
                  {fmtCRC(montoNum)}
                </p>
              )}
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                <StickyNote size={10} />
                Notas <span className="font-normal text-gray-400 normal-case tracking-normal">(opcional)</span>
              </label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones del pago, acuerdo previo, etc."
                rows={2}
                className="w-full border border-gray-200 rounded-xl text-[12px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#009ee3] transition resize-none"
                style={{ padding: '9px 12px' }}
              />
            </div>

            {/* Error inline */}
            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold"
                style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

          </div>

          {/* Botón de envío */}
          <div className="px-4 pb-4 pt-2">
            <button
              type="submit"
              disabled={submitting || !cuadra || !banco || !ref.trim() || !fecha || !montoNum}
              className="w-full flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#009ee3', padding: '11px 16px' }}
              onMouseEnter={e => { if (!submitting) e.currentTarget.style.backgroundColor = '#0080c0' }}
              onMouseLeave={e => { if (!submitting) e.currentTarget.style.backgroundColor = '#009ee3' }}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                : <><CheckCircle2 size={14} /> Reportar pago</>
              }
            </button>
            <p className="mt-2 text-center text-[10px] text-gray-400">
              Se notificará al coordinador para confirmar el pago
            </p>
          </div>
        </div>

      </div>
    </form>
  )
}
