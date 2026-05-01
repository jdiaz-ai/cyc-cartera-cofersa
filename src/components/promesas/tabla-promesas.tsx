'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Handshake, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { fmtFecha, fmtCRC } from '@/lib/utils/formato'
import type { Promesa } from '@/types/database'

// ── Constantes ─────────────────────────────────────────────────────────
const ESTADO_CONFIG = {
  PENDIENTE:     { label: 'Pendiente',     bg: '#fef9c3', text: '#a16207', icon: <Clock       size={11} /> },
  CUMPLIDA:      { label: 'Cumplida',      bg: '#dcfce7', text: '#15803d', icon: <CheckCircle2 size={11} /> },
  INCUMPLIDA:    { label: 'Incumplida',    bg: '#fee2e2', text: '#dc2626', icon: <XCircle      size={11} /> },
  ABONO_PARCIAL: { label: 'Abono parcial', bg: '#e0f2fe', text: '#0369a1', icon: <AlertTriangle size={11} /> },
} as const

const ESTADOS_FILTRO = ['Todos', 'PENDIENTE', 'CUMPLIDA', 'INCUMPLIDA', 'ABONO_PARCIAL']

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  promesas:  Promesa[]
  rol:       'COORDINADOR' | 'ANALISTA'
  userEmail: string
  analistas: { email: string; nombre: string }[]
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════
export default function TablaPromesas({ promesas: initialPromesas, rol, analistas }: Props) {
  const router = useRouter()
  const hoy    = hoyISO()

  const [promesas,   setPromesas]   = useState<Promesa[]>(initialPromesas)
  const [estadoFilt, setEstadoFilt] = useState('PENDIENTE')
  const [anaFilt,    setAnaFilt]    = useState('Todos')
  const [loadingId,  setLoadingId]  = useState<string | null>(null)

  const selectCls = 'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none focus:border-blue-400 transition'

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let list = [...promesas]
    if (estadoFilt !== 'Todos') list = list.filter(p => p.estado === estadoFilt)
    if (anaFilt    !== 'Todos') list = list.filter(p => p.analista_email === anaFilt)
    return list
  }, [promesas, estadoFilt, anaFilt])

  // Contadores por estado
  const counts = useMemo(() => ({
    PENDIENTE:     promesas.filter(p => p.estado === 'PENDIENTE').length,
    CUMPLIDA:      promesas.filter(p => p.estado === 'CUMPLIDA').length,
    INCUMPLIDA:    promesas.filter(p => p.estado === 'INCUMPLIDA').length,
    ABONO_PARCIAL: promesas.filter(p => p.estado === 'ABONO_PARCIAL').length,
  }), [promesas])

  // ── Actualizar estado ─────────────────────────────────────────────
  async function actualizarEstado(id: string, nuevoEstado: 'CUMPLIDA' | 'INCUMPLIDA') {
    setLoadingId(id)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('promesas') as any)
      .update({ estado: nuevoEstado })
      .eq('id', id)
    setPromesas(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p))
    setLoadingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* ── KPI chips de estados ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(ESTADO_CONFIG) as [keyof typeof ESTADO_CONFIG, typeof ESTADO_CONFIG[keyof typeof ESTADO_CONFIG]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setEstadoFilt(estadoFilt === key ? 'Todos' : key)}
            className="bg-white rounded-xl border shadow-sm px-4 py-3 text-left transition hover:shadow-md"
            style={{ borderColor: estadoFilt === key ? cfg.text : '#e2e8f0' }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: cfg.text }}>{cfg.label}</p>
            <p className="text-[22px] font-bold text-gray-800">{counts[key]}</p>
          </button>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <select value={estadoFilt} onChange={e => setEstadoFilt(e.target.value)} className={selectCls}>
          {ESTADOS_FILTRO.map(e => <option key={e} value={e}>{e === 'Todos' ? 'Todos los estados' : ESTADO_CONFIG[e as keyof typeof ESTADO_CONFIG]?.label ?? e}</option>)}
        </select>

        {rol === 'COORDINADOR' && (
          <select value={anaFilt} onChange={e => setAnaFilt(e.target.value)} className={selectCls}>
            <option value="Todos">Todos los analistas</option>
            {analistas.map(a => <option key={a.email} value={a.email}>{a.nombre}</option>)}
          </select>
        )}

        <span className="ml-auto text-[12px] text-gray-400 font-semibold">
          {filtradas.length} promesa{filtradas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Handshake size={36} className="text-gray-200 mb-3" />
            <p className="text-[13px] font-semibold text-gray-500">Sin promesas para este filtro</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <Th>Cliente</Th>
                  <Th>Monto</Th>
                  <Th>Vence</Th>
                  <Th>Estado</Th>
                  {rol === 'COORDINADOR' && <Th>Analista</Th>}
                  <Th>Nota</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((p, i) => {
                  const cfg     = ESTADO_CONFIG[p.estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.PENDIENTE
                  const vencida = p.estado === 'PENDIENTE' && p.fecha_promesa < hoy
                  const hoyFlag = p.estado === 'PENDIENTE' && p.fecha_promesa === hoy
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-gray-50"
                      style={i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                    >
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <button
                          className="text-[12px] font-semibold text-blue-600 hover:underline text-left"
                          onClick={() => router.push(`/clientes/${encodeURIComponent(p.cliente_cod)}`)}
                        >
                          {p.cliente_cod}
                        </button>
                        <p className="text-[11px] text-gray-400 truncate max-w-[140px]">{p.contribuyente}</p>
                      </td>
                      {/* Monto */}
                      <td className="px-4 py-3 text-[13px] font-bold text-gray-800 tabular-nums whitespace-nowrap">
                        {p.monto > 0 ? fmtCRC(p.monto) : '—'}
                      </td>
                      {/* Vence */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[12px] font-semibold" style={{ color: vencida ? '#dc2626' : hoyFlag ? '#f59e0b' : '#374151' }}>
                          {fmtFecha(p.fecha_promesa)}
                        </p>
                        {vencida && <p className="text-[10px] font-bold text-red-500">VENCIDA</p>}
                        {hoyFlag && <p className="text-[10px] font-bold text-amber-500">HOY</p>}
                      </td>
                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 w-fit" style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      {/* Analista */}
                      {rol === 'COORDINADOR' && (
                        <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">
                          {p.analista_email?.split('@')[0]}
                        </td>
                      )}
                      {/* Nota */}
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-[12px] text-gray-500 truncate">{p.notas || '—'}</p>
                      </td>
                      {/* Acciones — solo PENDIENTE */}
                      <td className="px-4 py-3">
                        {p.estado === 'PENDIENTE' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={loadingId === p.id}
                              onClick={() => actualizarEstado(p.id, 'CUMPLIDA')}
                              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1 transition hover:opacity-80 disabled:opacity-40"
                              style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
                            >
                              <CheckCircle2 size={11} /> Cumplida
                            </button>
                            <button
                              disabled={loadingId === p.id}
                              onClick={() => actualizarEstado(p.id, 'INCUMPLIDA')}
                              className="flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1 transition hover:opacity-80 disabled:opacity-40"
                              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                            >
                              <XCircle size={11} /> Rota
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">
      {children}
    </th>
  )
}
