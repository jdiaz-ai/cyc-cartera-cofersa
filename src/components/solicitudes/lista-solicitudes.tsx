'use client'

/**
 * ListaSolicitudes — Centro Operativo (cards + SLA)
 *
 * Rediseño: cards operativas con número SIC-XXXXX, badges de área /
 * prioridad / estado, contador visual de SLA y filtros. El detalle y
 * el cambio de estado viven en /solicitudes/[id].
 *
 * Solicitudes legacy (estado MAYÚSCULA, sin área/SLA) se muestran con
 * fallbacks y siguen siendo accesibles.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, AlertTriangle, Zap, Clock } from 'lucide-react'
import type { Solicitud } from '@/types/database'
import {
  AREA_MAP, ESTADO_CFG, PRIORIDAD_CFG, ESTADOS_OFICIALES,
  numeroSolicitud, slaEstado,
} from '@/lib/solicitudes/catalogo'

// Fallback de estados legacy (MAYÚSCULA)
const ESTADO_LEGACY: Record<string, { bg: string; text: string; label: string }> = {
  PENDIENTE: { bg: '#fef9c3', text: '#a16207', label: 'Pendiente (legacy)' },
  EN_REVISION: { bg: '#e0f2fe', text: '#0369a1', label: 'En revisión (legacy)' },
  APROBADA:  { bg: '#dcfce7', text: '#15803d', label: 'Aprobada (legacy)' },
  RECHAZADA: { bg: '#fee2e2', text: '#dc2626', label: 'Rechazada (legacy)' },
}

function estadoStyle(estado: string) {
  if (estado in ESTADO_CFG) {
    const c = ESTADO_CFG[estado as keyof typeof ESTADO_CFG]
    return { bg: c.bg, text: c.text, label: estado }
  }
  return ESTADO_LEGACY[estado] ?? { bg: '#f1f5f9', text: '#475569', label: estado }
}

const SLA_COLOR = { verde: '#16a34a', amarillo: '#d97706', rojo: '#dc2626' } as const

interface Props {
  solicitudes:    Solicitud[]
  rol:            'COORDINADOR' | 'ANALISTA'
  userEmail:      string
  userName:       string
  coordId:        string
  solicitanteMap: Record<string, string>
}

export default function ListaSolicitudes({ solicitudes: init, rol, solicitanteMap }: Props) {
  const router = useRouter()
  const [busqueda,   setBusqueda]   = useState('')
  const [fEstados,   setFEstados]   = useState<Set<string>>(new Set())
  const [fPrioridad, setFPrioridad] = useState('Todas')
  const [fArea,      setFArea]      = useState('Todas')
  const [soloVencido, setSoloVencido] = useState(false)

  const selectCls = 'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none focus:border-[#009ee3] transition'

  function toggleEstado(e: string) {
    setFEstados(prev => {
      const s = new Set(prev)
      s.has(e) ? s.delete(e) : s.add(e)
      return s
    })
  }

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return init.filter(s => {
      if (fEstados.size > 0 && !fEstados.has(s.estado)) return false
      if (fPrioridad !== 'Todas' && s.prioridad !== fPrioridad) return false
      if (fArea !== 'Todas' && s.area !== fArea) return false
      if (soloVencido) {
        const sla = slaEstado(s.created_at, s.sla_vencimiento)
        if (!sla.vencido) return false
      }
      if (q) {
        const hay =
          (s.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (s.cliente_cod ?? '').toLowerCase().includes(q) ||
          (s.tipo ?? '').toLowerCase().includes(q)
        if (!hay) return false
      }
      return true
    })
  }, [init, busqueda, fEstados, fPrioridad, fArea, soloVencido])

  // Áreas presentes (para el filtro)
  const areasDisponibles = useMemo(
    () => Array.from(new Set(init.map(s => s.area).filter(Boolean))) as string[],
    [init],
  )

  return (
    <div className="p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-[#003B5C]" />
        <h1 className="text-[18px] font-bold text-gray-800">Solicitudes — Centro Operativo</h1>
        <span className="ml-auto text-[12px] text-gray-400 font-semibold mr-2">
          {filtradas.length} de {init.length}
        </span>
        <button
          onClick={() => router.push('/solicitudes/nueva')}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-white transition hover:opacity-90"
          style={{ backgroundColor: '#009ee3' }}
        >
          <Plus size={14} /> Nueva solicitud
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, código o tipo…"
              className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:border-[#009ee3] transition"
            />
          </div>
          <select value={fPrioridad} onChange={e => setFPrioridad(e.target.value)} className={selectCls}>
            <option value="Todas">Toda prioridad</option>
            {(['Alta', 'Media', 'Baja']).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={fArea} onChange={e => setFArea(e.target.value)} className={selectCls}>
            <option value="Todas">Toda área</option>
            {areasDisponibles.map(a => (
              <option key={a} value={a}>{AREA_MAP[a as keyof typeof AREA_MAP]?.label ?? a}</option>
            ))}
          </select>
          <button
            onClick={() => setSoloVencido(v => !v)}
            className="rounded-full px-3 py-1.5 text-[11px] font-bold transition flex items-center gap-1"
            style={soloVencido
              ? { backgroundColor: '#dc2626', color: '#fff' }
              : { backgroundColor: '#fee2e2', color: '#dc2626' }}
          >
            <AlertTriangle size={11} /> SLA vencido
          </button>
        </div>
        {/* Estados multi-select */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ESTADOS_OFICIALES.map(e => {
            const on = fEstados.has(e)
            const c = ESTADO_CFG[e]
            return (
              <button key={e} onClick={() => toggleEstado(e)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold transition border"
                style={on
                  ? { backgroundColor: c.text, color: '#fff', borderColor: c.text }
                  : { backgroundColor: c.bg, color: c.text, borderColor: 'transparent' }}>
                {e}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <FileText size={36} className="text-gray-200 mb-3" />
          <p className="text-[13px] font-semibold text-gray-500">Sin solicitudes para este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtradas.map(s => {
            const est   = estadoStyle(s.estado)
            const areaD = s.area ? AREA_MAP[s.area as keyof typeof AREA_MAP] : null
            const pr    = s.prioridad ? PRIORIDAD_CFG[s.prioridad] : null
            const sla   = slaEstado(s.created_at, s.sla_vencimiento)
            const solNombre = s.solicitante_id ? (solicitanteMap[s.solicitante_id] ?? '—') : '—'
            const esEscalada = (s.tipo ?? '').toLowerCase().includes('escalamiento')

            return (
              <button
                key={s.id}
                onClick={() => router.push(`/solicitudes/${s.id}`)}
                className="text-left bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition flex flex-col"
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-50 flex items-start justify-between gap-3"
                  style={{ backgroundColor: '#fafbfc' }}>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black tracking-wider text-gray-400">{numeroSolicitud(s.id)}</p>
                    <p className="text-[13px] font-bold text-gray-800 truncate">
                      {s.cliente_nombre || s.cliente_cod || '—'}
                    </p>
                    {s.cliente_cod && <p className="text-[11px] text-gray-400 font-mono">{s.cliente_cod}</p>}
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 flex-shrink-0 whitespace-nowrap"
                    style={{ backgroundColor: est.bg, color: est.text }}>
                    <span style={{ fontSize: 7 }}>●</span> {est.label}
                  </span>
                </div>

                {/* Body */}
                <div className="px-4 py-3 flex-1 space-y-2.5">
                  <p className="text-[13px] font-semibold text-gray-800">{s.tipo}</p>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {areaD && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: areaD.bg, color: areaD.color }}>{areaD.label}</span>
                    )}
                    {pr && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: pr.bg, color: pr.text }}>{s.prioridad}</span>
                    )}
                    {s.prioridad === 'Alta' && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 flex items-center gap-0.5"
                        style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                        <Zap size={9} /> ALTA PRIORIDAD
                      </span>
                    )}
                    {esEscalada && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}>ESCALADA</span>
                    )}
                    {sla.vencido && s.sla_vencimiento && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: '#dc2626', color: '#fff' }}>SLA VENCIDO</span>
                    )}
                  </div>

                  {/* SLA bar */}
                  {s.sla_vencimiento ? (
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                          <Clock size={10} /> SLA
                        </span>
                        <span className="font-bold" style={{ color: SLA_COLOR[sla.nivel] }}>
                          {sla.vencido ? 'Vencido' : `${Math.round(sla.pct)}% restante`}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max(3, sla.pct)}%`, backgroundColor: SLA_COLOR[sla.nivel] }} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-300">Solicitud legacy — sin SLA</p>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2.5 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400"
                  style={{ backgroundColor: '#fafbfc' }}>
                  <span>Resp: <span className="font-semibold text-gray-600">{s.responsable_nombre || '—'}</span></span>
                  <span>Por {solNombre} · {new Date(s.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
