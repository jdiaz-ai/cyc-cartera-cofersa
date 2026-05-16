'use client'

/**
 * FormSolicitudNueva — Flujo NUEVO (catálogo Centro Operativo)
 *
 * Pasos: Cliente → Área → Tipo → Detalle
 * Pre-carga desde URL cuando viene originada de una gestión
 * (cliente_cod, gestion_id, area, tipo).
 *
 * Sin correo ni notificación (fuera de alcance del sprint).
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, ArrowRight, ArrowLeft, ChevronRight, Link2,
  Building2, Truck, CreditCard, UserCog, CheckCircle2, Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import {
  AREAS, AREA_MAP, getTiposPorArea, getCatalogoItem, getResponsableFijo,
  esAreaValida, PRIORIDAD_CFG,
} from '@/lib/solicitudes/catalogo'
import type { AreaKey } from '@/lib/solicitudes/catalogo'
import type { ClienteConDatos, GestionOrigenPreload } from '@/app/(app)/solicitudes/nueva/page'
import type { Factura } from '@/types/database'

// ── Iconos por área ────────────────────────────────────────────────────
const AREA_ICON: Record<AreaKey, React.ReactNode> = {
  credito_cobro:       <CreditCard size={22} />,
  comercial:           <Building2  size={22} />,
  logistica:           <Truck      size={22} />,
  actualizacion_datos: <UserCog    size={22} />,
}

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white ' +
  'focus:outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-blue-50 transition'
const labelCls = 'block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5'

function initials(n: string) {
  const p = n.trim().split(/\s+/)
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase()
}

interface Props {
  userId:        string
  userEmail:     string
  clientes:      ClienteConDatos[]
  preCliente:    ClienteConDatos | null
  preArea:       string | null
  preTipo:       string | null
  gestionOrigen: GestionOrigenPreload | null
}

export default function FormSolicitudNueva({
  clientes, preCliente, preArea, preTipo, gestionOrigen,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  // ── Estado de selección ────────────────────────────────────────────
  const [cliente, setCliente] = useState<ClienteConDatos | null>(preCliente)
  const [area,    setArea]    = useState<AreaKey | ''>(
    preArea && esAreaValida(preArea) ? preArea : '',
  )
  const [tipo,    setTipo]    = useState<string>(
    preArea && preTipo && getCatalogoItem(preArea, preTipo) ? preTipo : '',
  )
  const [busqueda, setBusqueda] = useState('')

  // ── Datos del formulario (paso Detalle) ────────────────────────────
  const descInicial = gestionOrigen
    ? `${gestionOrigen.resultado}${gestionOrigen.nota ? ' — ' + gestionOrigen.nota : ''}`
    : ''
  const [descripcion,  setDescripcion]  = useState(descInicial)
  const [respNombre,   setRespNombre]   = useState('')
  const [respEmail,    setRespEmail]    = useState('')
  const [facturaSel,   setFacturaSel]   = useState('')
  const [observaciones, setObservaciones] = useState('')

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  // ── Responsable fijo según área ────────────────────────────────────
  useEffect(() => {
    if (!area) return
    const fijo = getResponsableFijo(area)
    if (fijo) { setRespNombre(fijo.nombre); setRespEmail(fijo.email) }
    else      { setRespNombre(''); setRespEmail('') }
  }, [area])

  // ── Cargar facturas al fijar cliente ───────────────────────────────
  const cargarFacturas = useCallback(async (contribuyente: string) => {
    const { data } = await supabase
      .from('facturas')
      .select('*')
      .eq('contribuyente', contribuyente)
      .gt('saldo', 0)
      .order('saldo', { ascending: false })
      .limit(100)
    setFacturas((data ?? []) as Factura[])
  }, [supabase])

  useEffect(() => {
    if (cliente) cargarFacturas(cliente.contribuyente)
  }, [cliente, cargarFacturas])

  // ── Paso actual ────────────────────────────────────────────────────
  const paso: 'cliente' | 'area' | 'tipo' | 'detalle' =
    !cliente ? 'cliente' : !area ? 'area' : !tipo ? 'tipo' : 'detalle'

  const catItem  = area && tipo ? getCatalogoItem(area, tipo) : undefined
  const areaDef  = area ? AREA_MAP[area] : null

  // ── Lista de clientes filtrada ─────────────────────────────────────
  const q = busqueda.trim().toLowerCase()
  const listaClientes = useMemo(() => {
    const base = q
      ? clientes.filter(c =>
          c.cliente_nombre.toLowerCase().includes(q) ||
          c.cliente_cod.toLowerCase().includes(q))
      : clientes
    return base.slice(0, 60)
  }, [clientes, q])

  // ── Submit ─────────────────────────────────────────────────────────
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!cliente || !area || !tipo || !catItem) return
    if (!descripcion.trim()) { setError('La descripción del caso es obligatoria'); return }
    if (!respNombre.trim() || !respEmail.trim()) {
      setError('El responsable (nombre y email) es obligatorio'); return
    }

    setLoading(true); setError('')
    try {
      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area,
          tipo,
          prioridad:              catItem.prioridad,
          sla_horas:              catItem.sla_horas,
          cliente_cod:            cliente.cliente_cod,
          cliente_nombre:         cliente.cliente_nombre,
          gestion_id:             gestionOrigen?.id ?? undefined,
          descripcion:            descripcion.trim(),
          responsable_nombre:     respNombre.trim(),
          responsable_email:      respEmail.trim(),
          observaciones_internas: observaciones.trim() || undefined,
          datos: {
            factura_relacionada: facturaSel || null,
            origen: gestionOrigen ? 'gestion' : 'manual',
          },
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Error al crear la solicitud'); setLoading(false); return }
      setDone(true)
      setTimeout(() => router.push(`/solicitudes/${d.id}`), 900)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
      setLoading(false)
    }
  }

  // ── Pantalla de éxito ──────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }} className="flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 flex flex-col items-center text-center gap-3">
          <div className="rounded-full p-4" style={{ backgroundColor: '#dcfce7' }}>
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
          </div>
          <p className="text-[16px] font-bold text-gray-800">¡Solicitud creada!</p>
          <p className="text-[13px] text-gray-500">Abriendo el detalle…</p>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>
      <div className="bg-white border-b border-gray-200 px-5 py-3 sticky top-0 z-20">
        <p className="text-[12px] text-gray-400 mb-0.5">Solicitudes</p>
        <h1 className="text-[16px] font-semibold text-gray-800">Nueva solicitud</h1>
      </div>

      <div className="px-5 py-6 flex flex-col items-center">
        <div className="w-full max-w-[720px] space-y-4">

          {/* Badge originada desde gestión */}
          {gestionOrigen && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-[12px]"
              style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1' }}>
              <Link2 size={14} />
              <span className="font-semibold">Originada desde gestión</span>
              <span className="text-[#0369a1]/70">· {gestionOrigen.tipo} · {gestionOrigen.resultado}</span>
              {cliente && (
                <button
                  onClick={() => router.push(`/clientes/${encodeURIComponent(cliente.cliente_cod)}`)}
                  className="ml-auto font-bold hover:underline"
                >
                  Ver cliente →
                </button>
              )}
            </div>
          )}

          {/* Cliente confirmado (chip) */}
          {cliente && (
            <div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                {initials(cliente.cliente_nombre)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 truncate">{cliente.cliente_nombre}</p>
                <p className="text-[11px] text-gray-400">{cliente.cliente_cod}</p>
              </div>
              {!preCliente && (
                <button onClick={() => { setCliente(null); setArea(''); setTipo('') }}
                  className="text-[11px] font-semibold transition hover:opacity-70" style={{ color: '#009ee3' }}>
                  Cambiar
                </button>
              )}
            </div>
          )}

          {/* ════ PASO: CLIENTE ════ */}
          {paso === 'cliente' && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <p className="text-[15px] font-bold text-gray-800 mb-0.5">¿Para qué cliente es la solicitud?</p>
                <p className="text-[12px] text-gray-400">Buscá por nombre o código</p>
              </div>
              <div className="px-6 py-4">
                <div className="relative mb-4">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" value={busqueda} autoFocus
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar cliente…"
                    className="w-full h-[38px] rounded-xl border border-gray-200 pl-8 pr-8 text-[13px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition"
                  />
                  {busqueda && (
                    <button onClick={() => setBusqueda('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="space-y-0.5 max-h-[380px] overflow-y-auto">
                  {listaClientes.length === 0 ? (
                    <p className="text-[13px] text-gray-400 text-center py-10">Sin resultados</p>
                  ) : listaClientes.map(c => (
                    <button key={c.cliente_cod}
                      onClick={() => { setCliente(c); setBusqueda('') }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50 transition">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                        style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                        {initials(c.cliente_nombre)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{c.cliente_nombre}</p>
                        <p className="text-[11px] text-gray-400">{c.cliente_cod}</p>
                      </div>
                      {c.mora_total > 0 && (
                        <p className="text-[12px] font-bold tabular-nums text-gray-500">{fmtCRC(c.mora_total)}</p>
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-3 mt-2 border-t border-gray-100">
                  <button onClick={() => router.push('/solicitudes')}
                    className="text-[13px] font-semibold text-gray-500 hover:text-gray-700">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {/* ════ PASO: ÁREA ════ */}
          {paso === 'area' && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <p className="text-[15px] font-bold text-gray-800 mb-1">Área destino</p>
              <p className="text-[12px] text-gray-400 mb-4">¿A qué área se dirige esta solicitud?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AREAS.map(a => (
                  <button key={a.key} onClick={() => { setArea(a.key); setTipo('') }}
                    className="flex items-start gap-3 rounded-2xl p-4 text-left transition hover:scale-[1.01]"
                    style={{ border: `1.5px solid ${a.color}40`, backgroundColor: a.bg }}>
                    <div className="flex-shrink-0 rounded-xl p-2.5" style={{ backgroundColor: `${a.color}20`, color: a.color }}>
                      {AREA_ICON[a.key]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-800 mb-0.5">{a.label}</p>
                      <p className="text-[11px] text-gray-500 leading-snug">{a.descripcion}</p>
                    </div>
                    <ChevronRight size={16} className="flex-shrink-0 self-center text-gray-300" />
                  </button>
                ))}
              </div>
              <div className="pt-4">
                <button onClick={() => { if (!preCliente) setCliente(null) }}
                  disabled={!!preCliente}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40">
                  <ArrowLeft size={14} /> Cambiar cliente
                </button>
              </div>
            </div>
          )}

          {/* ════ PASO: TIPO ════ */}
          {paso === 'tipo' && areaDef && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <p className="text-[15px] font-bold text-gray-800 mb-1">Tipo de solicitud</p>
              <p className="text-[12px] text-gray-400 mb-4">
                Área: <span className="font-semibold" style={{ color: areaDef.color }}>{areaDef.label}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {getTiposPorArea(area).map(t => {
                  const pr = PRIORIDAD_CFG[t.prioridad]
                  return (
                    <button key={t.tipo} onClick={() => setTipo(t.tipo)}
                      className="flex flex-col gap-2 rounded-xl p-3.5 text-left transition hover:scale-[1.01]"
                      style={{ backgroundColor: areaDef.bg, border: `1.5px solid ${areaDef.color}40` }}>
                      <span className="text-[13px] font-bold text-gray-800 leading-tight">{t.tipo}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                          style={{ backgroundColor: pr.bg, color: pr.text }}>{t.prioridad}</span>
                        <span className="text-[10px] font-semibold text-gray-500">SLA {t.sla_horas}h</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="pt-4">
                <button onClick={() => setArea('')}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700">
                  <ArrowLeft size={14} /> Cambiar área
                </button>
              </div>
            </div>
          )}

          {/* ════ PASO: DETALLE ════ */}
          {paso === 'detalle' && areaDef && catItem && (
            <form onSubmit={enviar} className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-4">
              {/* Resumen tipo */}
              <div className="rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap"
                style={{ backgroundColor: areaDef.bg, border: `1px solid ${areaDef.color}40` }}>
                <span className="text-[12px] font-bold" style={{ color: areaDef.color }}>{areaDef.label}</span>
                <ChevronRight size={12} className="text-gray-400" />
                <span className="text-[13px] font-bold text-gray-800">{catItem.tipo}</span>
                <span className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5"
                  style={{ backgroundColor: PRIORIDAD_CFG[catItem.prioridad].bg, color: PRIORIDAD_CFG[catItem.prioridad].text }}>
                  {catItem.prioridad} · SLA {catItem.sla_horas}h
                </span>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[12px] text-red-700 font-semibold">
                  {error}
                </div>
              )}

              <div>
                <label className={labelCls}>Descripción del caso *</label>
                <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                  rows={4} placeholder="Detallá el caso, contexto y lo que se solicita…"
                  className={`${inputCls} resize-none`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Responsable — nombre *</label>
                  <input type="text" value={respNombre} onChange={e => setRespNombre(e.target.value)}
                    placeholder="Nombre del responsable" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Responsable — email *</label>
                  <input type="email" value={respEmail} onChange={e => setRespEmail(e.target.value)}
                    placeholder="email@cofersa.cr" className={inputCls} />
                </div>
              </div>
              {getResponsableFijo(area) && (
                <p className="text-[11px] text-gray-400 -mt-2">
                  Responsable fijo del área (editable si corresponde).
                </p>
              )}

              {/* Factura relacionada */}
              <div>
                <label className={labelCls}>Factura relacionada (opcional)</label>
                {facturaSel ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-blue-800">{facturaSel}</span>
                    <button type="button" onClick={() => setFacturaSel('')}
                      className="text-blue-400 hover:text-blue-700"><X size={14} /></button>
                  </div>
                ) : (
                  <select value={facturaSel} onChange={e => setFacturaSel(e.target.value)}
                    className={inputCls}
                    disabled={facturas.length === 0}>
                    <option value="">{facturas.length === 0 ? 'Sin facturas con saldo' : 'Seleccionar factura…'}</option>
                    {facturas.map(f => (
                      <option key={f.id} value={String(f.documento)}>
                        {f.documento} · {fmtCRC(f.saldo)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className={labelCls}>Observaciones internas (opcional)</label>
                <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
                  rows={2} placeholder="Notas internas para el equipo…"
                  className={`${inputCls} resize-none`} />
              </div>

              {/* Adjuntos (UI — carga documental se gestiona aparte) */}
              <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-4 text-center text-gray-400">
                <Upload size={20} className="mx-auto mb-1.5 text-gray-300" />
                <p className="text-[12px]">Adjuntos (opcional)</p>
                <p className="text-[10px] text-gray-300 mt-0.5">La evidencia documental también puede gestionarse en Reportar Pago</p>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button type="button" onClick={() => setTipo('')}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">
                  <ArrowLeft size={14} /> Volver
                </button>
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#009ee3' }}>
                  {loading ? 'Creando…' : <>Crear solicitud <ArrowRight size={15} /></>}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
