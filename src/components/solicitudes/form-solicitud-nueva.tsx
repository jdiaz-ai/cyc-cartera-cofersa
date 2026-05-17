'use client'

/**
 * FormSolicitudNueva — Flujo NUEVO (catálogo Centro Operativo)
 *
 * Selección: Cliente → Área → Tipo  (pasos compactos)
 * Detalle:   layout 2 columnas a pantalla completa, sin scroll vertical,
 *            con topbar de acciones siempre visible.
 *
 * Pre-carga desde URL (cliente_cod, gestion_id, area, tipo, origen).
 * Adjuntos: misma compresión que Reportar Pago (módulo compartido).
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, ArrowLeft, ChevronRight, Link2, Send,
  Building2, Truck, CreditCard, UserCog, CheckCircle2, Upload, FileText, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import { comprimirImagen } from '@/lib/utils/comprimir-imagen'
import {
  AREAS, AREA_MAP, getTiposPorArea, getCatalogoItem, getResponsableFijo,
  esAreaValida, PRIORIDAD_CFG, getCamposSolicitud,
} from '@/lib/solicitudes/catalogo'
import type { AreaKey } from '@/lib/solicitudes/catalogo'
import type { ClienteConDatos, GestionOrigenPreload } from '@/app/(app)/solicitudes/nueva/page'
import type { Factura } from '@/types/database'

const AREA_ICON: Record<AreaKey, React.ReactNode> = {
  credito_cobro:       <CreditCard size={22} />,
  comercial:           <Building2  size={22} />,
  logistica:           <Truck      size={22} />,
  actualizacion_datos: <UserCog    size={22} />,
}

// Prioridad — colores del card disabled (spec)
const PRIO_BOX: Record<string, { bg: string; text: string }> = {
  Alta:  { bg: '#fef2f2', text: '#b91c1c' },
  Media: { bg: '#fef9ee', text: '#854f0b' },
  Baja:  { bg: '#f0fdf4', text: '#166534' },
}

const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 bg-white ' +
  'focus:outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-blue-50 transition'
const inputDisabled =
  'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] bg-gray-50 text-gray-500 cursor-not-allowed'
const labelCls = 'block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5'

function initials(n: string) {
  const p = n.trim().split(/\s+/)
  return (p.length >= 2 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase()
}

interface AdjuntoUI { name: string; sizeKB: number; tipo: string }

interface Props {
  userId:        string
  userEmail:     string
  clientes:      ClienteConDatos[]
  preCliente:    ClienteConDatos | null
  preArea:       string | null
  preTipo:       string | null
  gestionOrigen: GestionOrigenPreload | null
  origenFicha?:  boolean
}

export default function FormSolicitudNueva({
  clientes, preCliente, preArea, preTipo, gestionOrigen, origenFicha = false,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [cliente, setCliente] = useState<ClienteConDatos | null>(preCliente)
  const [area,    setArea]    = useState<AreaKey | ''>(preArea && esAreaValida(preArea) ? preArea : '')
  const [tipo,    setTipo]    = useState<string>(
    preArea && preTipo && getCatalogoItem(preArea, preTipo) ? preTipo : '',
  )
  const [busqueda, setBusqueda] = useState('')

  const descInicial = gestionOrigen
    ? `${gestionOrigen.resultado}${gestionOrigen.nota ? ' — ' + gestionOrigen.nota : ''}`
    : ''
  const [descripcion,   setDescripcion]   = useState(descInicial)
  const [monto,         setMonto]         = useState('')
  const [respNombre,    setRespNombre]    = useState('')
  const [respEmail,     setRespEmail]     = useState('')
  const [facturaSel,    setFacturaSel]    = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [adjuntos,      setAdjuntos]      = useState<AdjuntoUI[]>([])
  const [dragOver,      setDragOver]      = useState(false)

  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const respFijo = area ? getResponsableFijo(area) : null

  // Responsable fijo según área
  useEffect(() => {
    if (!area) return
    const fijo = getResponsableFijo(area)
    if (fijo) { setRespNombre(fijo.nombre); setRespEmail(fijo.email) }
    else      { setRespNombre(''); setRespEmail('') }
  }, [area])

  const cargarFacturas = useCallback(async (contribuyente: string) => {
    const { data } = await supabase
      .from('facturas').select('*')
      .eq('contribuyente', contribuyente).gt('saldo', 0)
      .order('saldo', { ascending: false }).limit(100)
    setFacturas((data ?? []) as Factura[])
  }, [supabase])

  useEffect(() => { if (cliente) cargarFacturas(cliente.contribuyente) }, [cliente, cargarFacturas])

  const paso: 'cliente' | 'area' | 'tipo' | 'detalle' =
    !cliente ? 'cliente' : !area ? 'area' : !tipo ? 'tipo' : 'detalle'

  const catItem = area && tipo ? getCatalogoItem(area, tipo) : undefined
  const areaDef = area ? AREA_MAP[area] : null
  const campos  = tipo ? getCamposSolicitud(tipo) : null

  const venceStr = useMemo(() => {
    if (!catItem) return '—'
    const v = new Date(Date.now() + catItem.sla_horas * 3_600_000)
    return v.toLocaleString('es-CR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  }, [catItem])

  const q = busqueda.trim().toLowerCase()
  const listaClientes = useMemo(() => {
    const b = q
      ? clientes.filter(c => c.cliente_nombre.toLowerCase().includes(q) || c.cliente_cod.toLowerCase().includes(q))
      : clientes
    return b.slice(0, 60)
  }, [clientes, q])

  // ── Navegación FIX 2 ───────────────────────────────────────────────
  function volver() {
    if (origenFicha && cliente) {
      router.push(`/clientes/${encodeURIComponent(cliente.cliente_cod)}?tab=solicitudes`)
    } else if (origenFicha && preCliente) {
      router.push(`/clientes/${encodeURIComponent(preCliente.cliente_cod)}?tab=solicitudes`)
    } else {
      router.push('/solicitudes')
    }
  }

  // ── Adjuntos (compresión compartida) ───────────────────────────────
  const procesarArchivos = useCallback(async (files: FileList | File[]) => {
    const aceptados = ['image/jpeg', 'image/png', 'application/pdf']
    const next: AdjuntoUI[] = []
    for (const f of Array.from(files)) {
      if (!aceptados.includes(f.type)) continue
      if (f.size > 10 * 1024 * 1024) { setError(`"${f.name}" supera 10MB`); continue }
      if (f.type === 'application/pdf') {
        next.push({ name: f.name, sizeKB: Math.round(f.size / 1024), tipo: 'pdf' })
      } else {
        try {
          const c = await comprimirImagen(f)
          next.push({ name: f.name, sizeKB: c.finalKB, tipo: c.formato })
        } catch {
          next.push({ name: f.name, sizeKB: Math.round(f.size / 1024), tipo: 'img' })
        }
      }
    }
    if (next.length) setAdjuntos(prev => [...prev, ...next])
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────
  async function enviar(e?: React.FormEvent) {
    e?.preventDefault()
    if (!cliente || !area || !tipo || !catItem || !campos) return
    if (!descripcion.trim()) { setError('La descripción del caso es obligatoria'); return }
    if (campos.observaciones === 'obligatoria' && !observaciones.trim()) {
      setError('Las observaciones son obligatorias para este tipo'); return
    }
    if (campos.factura === 'obligatoria' && !facturaSel) {
      setError('La factura relacionada es obligatoria para este tipo'); return
    }
    if (!respNombre.trim() || !respEmail.trim()) {
      setError('El responsable (nombre y email) es obligatorio'); return
    }

    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token ?? null

      const res = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area, tipo,
          prioridad:              catItem.prioridad,
          sla_horas:              catItem.sla_horas,
          cliente_cod:            cliente.cliente_cod,
          cliente_nombre:         cliente.cliente_nombre,
          gestion_id:             gestionOrigen?.id ?? undefined,
          descripcion:            descripcion.trim(),
          responsable_nombre:     respNombre.trim(),
          responsable_email:      respEmail.trim(),
          observaciones_internas: observaciones.trim() || undefined,
          providerToken,
          datos: {
            factura_relacionada: facturaSel || null,
            monto:               monto.trim() || null,
            adjuntos:            adjuntos.map(a => ({ name: a.name, sizeKB: a.sizeKB, tipo: a.tipo })),
            origen:              gestionOrigen ? 'gestion' : origenFicha ? 'ficha' : 'manual',
          },
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Error al crear la solicitud'); setLoading(false); return }
      setDone(true)
      setTimeout(() => volver(), 1000)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
      setLoading(false)
    }
  }

  // ── Éxito ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }} className="flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-10 flex flex-col items-center text-center gap-3">
          <div className="rounded-full p-4" style={{ backgroundColor: '#dcfce7' }}>
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
          </div>
          <p className="text-[16px] font-bold text-gray-800">¡Solicitud creada!</p>
          <p className="text-[13px] text-gray-500">
            {origenFicha ? 'Volviendo a la ficha del cliente…' : 'Volviendo a solicitudes…'}
          </p>
        </div>
      </div>
    )
  }

  // ══════════════ PASOS DE SELECCIÓN ══════════════
  if (paso !== 'detalle') {
    return (
      <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh' }}>
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <button onClick={volver} className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-700">
            <ArrowLeft size={15} /> {origenFicha ? 'Volver al cliente' : 'Volver'}
          </button>
          <span className="text-gray-300">›</span>
          <span className="text-[13px] text-gray-500">Nueva solicitud</span>
        </div>

        <div className="px-5 py-6 flex flex-col items-center">
          <div className="w-full max-w-[720px] space-y-4">

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

            {paso === 'cliente' && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                  <p className="text-[15px] font-bold text-gray-800 mb-0.5">¿Para qué cliente es la solicitud?</p>
                  <p className="text-[12px] text-gray-400">Buscá por nombre o código</p>
                </div>
                <div className="px-6 py-4">
                  <div className="relative mb-4">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={busqueda} autoFocus
                      onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente…"
                      className="w-full h-[38px] rounded-xl border border-gray-200 pl-8 pr-8 text-[13px] text-gray-800 focus:outline-none focus:border-[#009ee3] transition" />
                    {busqueda && (
                      <button onClick={() => setBusqueda('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
                    {listaClientes.length === 0 ? (
                      <p className="text-[13px] text-gray-400 text-center py-10">Sin resultados</p>
                    ) : listaClientes.map(c => (
                      <button key={c.cliente_cod} onClick={() => { setCliente(c); setBusqueda('') }}
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
                </div>
              </div>
            )}

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
              </div>
            )}

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
          </div>
        </div>
      </div>
    )
  }

  // ══════════════ PASO DETALLE — layout 2 columnas ══════════════
  const prioBox = catItem ? (PRIO_BOX[catItem.prioridad] ?? PRIO_BOX.Media) : PRIO_BOX.Media

  return (
    <div style={{ backgroundColor: '#f0f4f8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* TOPBAR — siempre visible */}
      <div className="bg-white border-b border-gray-200 flex items-center justify-between px-6 py-3 flex-shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={volver}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-gray-900 flex-shrink-0">
            <ArrowLeft size={15} /> {origenFicha ? 'Volver al cliente' : 'Volver'}
          </button>
          <span className="text-gray-300 hidden sm:inline">·</span>
          <p className="text-[12px] text-gray-400 truncate hidden sm:block">
            Clientes › <span className="font-semibold text-gray-600">{cliente?.cliente_nombre}</span> › Nueva solicitud
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={volver}
            className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={() => enviar()} disabled={loading}
            className="flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#009ee3' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Enviar solicitud
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }} className="flex-1">

        {/* CLIENTE CARD — ancho completo */}
        {cliente && (
          <div className="rounded-[10px] bg-white px-4 py-3 flex items-center gap-3 mb-4"
            style={{ border: '0.5px solid #e2e8f0' }}>
            <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-[13px] font-black"
              style={{ backgroundColor: '#009ee3', color: '#fff' }}>
              {initials(cliente.cliente_nombre)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-800 truncate">{cliente.cliente_nombre}</p>
              <p className="text-[11px] text-gray-400">
                {cliente.cliente_cod} · {cliente.tramo_peor}
              </p>
            </div>
            <span className="text-[11px] font-bold rounded-full px-3 py-1 flex items-center gap-1.5 flex-shrink-0"
              style={{ backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
              <Link2 size={12} />
              {gestionOrigen ? 'Originada desde gestión' : origenFicha ? 'Creada desde ficha del cliente' : 'Creación manual'}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-[12px] text-red-700 font-semibold mb-4">
            {error}
          </div>
        )}

        {/* GRID 2 COLUMNAS */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>

          {/* ── COLUMNA IZQUIERDA ── */}
          <div className="space-y-4">

            {/* Card 1 — Información de la solicitud */}
            {areaDef && catItem && campos && (
              <div className="rounded-[10px] bg-white" style={{ border: '0.5px solid #e2e8f0' }}>
                <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-50"
                  style={{ backgroundColor: areaDef.bg }}>
                  <span className="text-[12px] font-bold" style={{ color: areaDef.color }}>{areaDef.label}</span>
                  <ChevronRight size={12} className="text-gray-400" />
                  <span className="text-[13px] font-bold text-gray-800">{catItem.tipo}</span>
                  <span className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{ backgroundColor: PRIORIDAD_CFG[catItem.prioridad].bg, color: PRIORIDAD_CFG[catItem.prioridad].text }}>
                    {catItem.prioridad} · SLA {catItem.sla_horas}h
                  </span>
                </div>
                <div className="p-4 space-y-3.5">
                  <div>
                    <label className={labelCls}>Descripción del caso *</label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                      rows={5} placeholder="Detallá el caso, contexto y lo que se solicita…"
                      className={`${inputCls} resize-none`} />
                  </div>

                  {campos.monto && (
                    <div>
                      <label className={labelCls}>{campos.monto}</label>
                      <input type="text" value={monto} onChange={e => setMonto(e.target.value)}
                        placeholder="Ej: 250000" className={inputCls} />
                    </div>
                  )}

                  <div>
                    <label className={labelCls}>
                      Observaciones {campos.observaciones === 'obligatoria' ? '*' : '(opcional)'}
                    </label>
                    <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
                      rows={3} placeholder="Notas, contexto adicional o el dato a actualizar…"
                      className={`${inputCls} resize-none`} />
                  </div>
                </div>
              </div>
            )}

            {/* Card 2 — Factura (solo si aplica) */}
            {campos && campos.factura && (
              <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
                <label className={labelCls}>
                  Factura relacionada {campos.factura === 'obligatoria' ? '*' : '(opcional)'}
                </label>
                {facturaSel ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-blue-800">{facturaSel}</span>
                    <button type="button" onClick={() => setFacturaSel('')}
                      className="text-blue-400 hover:text-blue-700"><X size={14} /></button>
                  </div>
                ) : (
                  <select value={facturaSel} onChange={e => setFacturaSel(e.target.value)}
                    className={inputCls} disabled={facturas.length === 0}>
                    <option value="">{facturas.length === 0 ? 'Sin facturas con saldo' : 'Seleccionar factura…'}</option>
                    {facturas.map(f => (
                      <option key={f.id} value={String(f.documento)}>
                        {f.documento} · {fmtCRC(f.saldo)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* ── COLUMNA DERECHA ── */}
          <div className="space-y-4">

            {/* Card 1 — Responsable */}
            <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
              <p className="text-[12px] font-bold text-gray-700 mb-3">Responsable</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Nombre {!respFijo && '*'}</label>
                  <input type="text" value={respNombre}
                    onChange={e => setRespNombre(e.target.value)}
                    disabled={!!respFijo} placeholder="Nombre del responsable"
                    className={respFijo ? inputDisabled : inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email {!respFijo && '*'}</label>
                  <input type="email" value={respEmail}
                    onChange={e => setRespEmail(e.target.value)}
                    disabled={!!respFijo} placeholder="correo@cofersa.cr"
                    className={respFijo ? inputDisabled : inputCls} />
                </div>
                {respFijo && (
                  <p className="text-[11px] text-gray-400">Responsable fijo del área</p>
                )}
              </div>
            </div>

            {/* Card 2 — Prioridad y SLA */}
            {catItem && (
              <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
                <p className="text-[12px] font-bold text-gray-700 mb-3">Prioridad y SLA</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Prioridad</label>
                    <input readOnly value={catItem.prioridad}
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] font-bold cursor-default border-0"
                      style={{ backgroundColor: prioBox.bg, color: prioBox.text }} />
                  </div>
                  <div>
                    <label className={labelCls}>SLA objetivo</label>
                    <input readOnly value={`${catItem.sla_horas} horas`} className={inputDisabled} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelCls}>Vencimiento estimado</label>
                  <input readOnly value={venceStr} className={inputDisabled} />
                </div>
              </div>
            )}

            {/* Card 3 — Adjuntos */}
            <div className="rounded-[10px] bg-white p-4" style={{ border: '0.5px solid #e2e8f0' }}>
              <p className="text-[12px] font-bold text-gray-700 mb-3">Adjuntos (opcional)</p>
              <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden"
                onChange={e => { if (e.target.files) procesarArchivos(e.target.files); e.target.value = '' }} />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) procesarArchivos(e.dataTransfer.files) }}
                className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all"
                style={{
                  padding: 16,
                  borderColor: dragOver ? '#009ee3' : '#e2e8f0',
                  backgroundColor: dragOver ? '#f0f9ff' : '#fafafa',
                }}>
                <Upload size={18} style={{ color: dragOver ? '#009ee3' : '#94a3b8' }} />
                <p className="text-[12px] font-semibold" style={{ color: dragOver ? '#009ee3' : '#64748b' }}>
                  Arrastrá o hacé clic para adjuntar
                </p>
                <p className="text-[10px] text-gray-400">PDF, JPG, PNG — máx. 10MB</p>
              </div>
              {adjuntos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {adjuntos.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5"
                      style={{ backgroundColor: '#f0fdf4', border: '0.5px solid #bbf7d0' }}>
                      <FileText size={12} className="text-green-600 flex-shrink-0" />
                      <span className="flex-1 truncate text-gray-700">{a.name}</span>
                      <span className="text-gray-400">{a.sizeKB} KB</span>
                      <button type="button"
                        onClick={() => setAdjuntos(prev => prev.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-500"><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
