'use client'

/**
 * FormNuevaSolicitud — Flujo completo desde el sidebar (4 pasos)
 *
 * Paso 0: Seleccionar cliente (búsqueda en lista)
 * Paso 1: Seleccionar destinatario        ─┐
 * Paso 2: Seleccionar tipo                 ├─ WizardNuevaSolicitud (pasos 1-3)
 * Paso 3: Formulario específico + correos ─┘
 *
 * Al completar el envío → redirige a /solicitudes
 */

import { useState, useCallback } from 'react'
import { useRouter }              from 'next/navigation'
import { Search, X }              from 'lucide-react'
import { createClient }           from '@/lib/supabase/client'
import WizardNuevaSolicitud, { StepIndicator } from './wizard-nueva-solicitud'
import type { MaestroCliente, Cartera, Factura } from '@/types/database'

// ──────────────────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────────────────

type ClienteBasico = Pick<MaestroCliente, 'cliente_cod' | 'cliente_nombre' | 'limite_credito' | 'estado_manual'>

interface Props {
  userId:    string
  userEmail: string
  clientes:  ClienteBasico[]
}

// ──────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────

export default function FormNuevaSolicitud({ clientes }: Props) {
  const router   = useRouter()
  const supabase = createClient()

  // ── Paso 0: selección de cliente ─────────────────────────────────────
  const [busqueda,   setBusqueda]   = useState('')
  const [clienteSel, setClienteSel] = useState<ClienteBasico | null>(null)

  // ── Datos cargados al elegir cliente ─────────────────────────────────
  const [loadingData, setLoadingData] = useState(false)
  const [moraTotal,   setMoraTotal]   = useState(0)
  const [tramoPeor,   setTramoPeor]   = useState('Al día')
  const [creditoDisp, setCreditoDisp] = useState<number | null>(null)
  const [condicion,   setCondicion]   = useState('—')
  const [facturas,    setFacturas]    = useState<Factura[]>([])

  // ── Paso wizard (para StepIndicator externo) ─────────────────────────
  const [pasoWizard, setPasoWizard] = useState(1)

  // ── Lista filtrada ────────────────────────────────────────────────────
  const clientesFiltrados = busqueda.trim()
    ? clientes.filter(c =>
        c.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.cliente_cod.toLowerCase().includes(busqueda.toLowerCase())
      ).slice(0, 50)
    : clientes.slice(0, 50)

  // ── Cargar datos de cartera al seleccionar cliente ────────────────────
  const cargarDatosCliente = useCallback(async (cod: string, limite: number) => {
    setLoadingData(true)
    try {
      // Cartera
      const { data: cartRaw } = await supabase
        .from('cartera').select('*').eq('cliente_cod', cod).limit(1).single()
      const c = cartRaw as Cartera | null

      if (c) {
        const mora =
          (c.mora_1_30     || 0) + (c.mora_31_60  || 0) +
          (c.mora_61_90    || 0) + (c.mora_91_120 || 0) +
          (c.mora_120_plus || 0)
        setMoraTotal(mora)

        const tramo =
          (c.mora_120_plus || 0) > 0 ? '+120 días'   :
          (c.mora_91_120   || 0) > 0 ? '91-120 días' :
          (c.mora_61_90    || 0) > 0 ? '61-90 días'  :
          (c.mora_31_60    || 0) > 0 ? '31-60 días'  :
          (c.mora_1_30     || 0) > 0 ? '1-30 días'   : 'Al día'
        setTramoPeor(tramo)
        setCreditoDisp(limite > 0 ? limite - c.total : null)
      } else {
        setMoraTotal(0); setTramoPeor('Al día'); setCreditoDisp(null)
      }

      // Facturas pendientes
      const { data: factRaw } = await supabase
        .from('facturas')
        .select('*')
        .eq('cliente_cod', cod)
        .gt('saldo', 0)
        .order('saldo', { ascending: false })
        .limit(100)
      setFacturas((factRaw ?? []) as Factura[])

      // Condición de pago
      const { data: mRaw } = await supabase
        .from('maestro_clientes')
        .select('condicion_pago')
        .eq('cliente_cod', cod)
        .limit(1)
        .single()
      const m = mRaw as { condicion_pago?: string } | null
      setCondicion(m?.condicion_pago ? String(m.condicion_pago) : '—')

    } finally {
      setLoadingData(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function elegirCliente(c: ClienteBasico) {
    setClienteSel(c)
    setBusqueda('')
    setPasoWizard(1)
    cargarDatosCliente(c.cliente_cod, c.limite_credito ?? 0)
  }

  function volverAlCliente() {
    setClienteSel(null)
    setPasoWizard(1)
    setFacturas([])
    setMoraTotal(0)
    setTramoPeor('Al día')
    setCreditoDisp(null)
    setCondicion('—')
  }

  // paso global para indicador (1 = cliente, 2-4 = wizard 1-3)
  const pasoIndicador = clienteSel ? pasoWizard + 1 : 1

  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 sticky top-0 z-10">
        <p className="text-[12px] text-gray-400 mb-0.5">Solicitudes</p>
        <h1 className="text-[16px] font-semibold text-gray-800">Nueva solicitud</h1>
      </div>

      {/* ── Contenido ─────────────────────────────────────────────── */}
      <div className="px-5 py-6 flex flex-col items-center">

        {/* Step indicator — 4 pasos */}
        <div className="w-full max-w-[700px] mb-6">
          <StepIndicator paso={pasoIndicador} totalPasos={4} offset={1} />
        </div>

        <div className="w-full max-w-[700px]">

          {/* ── PASO 0: seleccionar cliente ───────────────────────── */}
          {!clienteSel && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-6">
              <p className="text-[14px] font-bold text-gray-800 mb-1">¿Para qué cliente es la solicitud?</p>
              <p className="text-[12px] text-gray-400 mb-4">Buscá por nombre o código de cliente</p>

              {/* Campo de búsqueda */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente..."
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-9 py-2.5 text-[13px] text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
                />
                {busqueda && (
                  <button type="button" onClick={() => setBusqueda('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Lista de clientes */}
              <div className="space-y-1 max-h-[400px] overflow-y-auto rounded-xl">
                {clientesFiltrados.length === 0 ? (
                  <p className="text-[13px] text-gray-400 text-center py-8">
                    Sin resultados para &quot;{busqueda}&quot;
                  </p>
                ) : clientesFiltrados.map(c => (
                  <button key={c.cliente_cod} type="button" onClick={() => elegirCliente(c)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 transition">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                      style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                      {c.cliente_nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{c.cliente_nombre}</p>
                      <p className="text-[11px] text-gray-400">{c.cliente_cod}</p>
                    </div>
                    {c.estado_manual && c.estado_manual !== 'Normal' && (
                      <span className="text-[10px] font-bold rounded px-1.5 py-0.5 flex-shrink-0"
                        style={{
                          backgroundColor: c.estado_manual === 'Bloqueado' ? '#fee2e2' : '#fef9c3',
                          color:           c.estado_manual === 'Bloqueado' ? '#dc2626' : '#a16207',
                        }}>
                        {c.estado_manual}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-4 mt-2 border-t border-gray-100">
                <p className="text-[11px] text-gray-400">{clientes.length} clientes disponibles</p>
                <button type="button" onClick={() => router.push('/solicitudes')}
                  className="text-[13px] font-semibold text-gray-500 hover:text-gray-700 transition">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── PASOS 1-3: wizard ─────────────────────────────────── */}
          {clienteSel && (
            <>
              {/* Cliente seleccionado */}
              <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 mb-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                  style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                  {clienteSel.cliente_nombre.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{clienteSel.cliente_nombre}</p>
                  <p className="text-[11px] text-gray-400">{clienteSel.cliente_cod}</p>
                </div>
                <button type="button" onClick={volverAlCliente}
                  className="text-[11px] font-semibold flex-shrink-0 transition"
                  style={{ color: '#009ee3' }}>
                  Cambiar
                </button>
              </div>

              {loadingData ? (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-12 flex items-center justify-center">
                  <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none" style={{ color: '#009ee3' }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-6">
                  <WizardNuevaSolicitud
                    clienteCod        = {clienteSel.cliente_cod}
                    clienteNombre     = {clienteSel.cliente_nombre}
                    limiteActual      = {clienteSel.limite_credito ?? 0}
                    moraTotal         = {moraTotal}
                    diasAtraso        = {tramoPeor}
                    creditoDisponible = {creditoDisp}
                    condicionPago     = {condicion}
                    facturas          = {facturas}
                    onCancel          = {volverAlCliente}
                    onSuccess         = {() => router.push('/solicitudes')}
                    onPasoChange      = {setPasoWizard}
                  />
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
