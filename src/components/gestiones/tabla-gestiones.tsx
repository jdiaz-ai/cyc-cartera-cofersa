'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Filter } from 'lucide-react'
import { fmtFecha } from '@/lib/utils/formato'
import type { Gestion } from '@/types/database'

// ── Constantes ─────────────────────────────────────────────────────────
const TIPOS      = ['Todos', 'LLAMADA', 'CORREO', 'WHATSAPP', 'VISITA']
const RESULTADOS = ['Todos', 'Promesa OK', 'No contestó', 'No ubicado', 'Pagó', 'Email enviado', 'Pendiente', 'Aceptó convenio', 'Llamar más tarde']
const PERIODOS   = [
  { label: 'Hoy',         value: 'hoy' },
  { label: 'Esta semana', value: 'semana' },
  { label: 'Este mes',    value: 'mes' },
  { label: 'Todo',        value: 'todo' },
]

const RESULTADO_COLORS: Record<string, { bg: string; text: string }> = {
  'Promesa OK':       { bg: '#dcfce7', text: '#15803d' },
  'Pagó':             { bg: '#dcfce7', text: '#15803d' },
  'No contestó':      { bg: '#f1f5f9', text: '#64748b' },
  'No ubicado':       { bg: '#fee2e2', text: '#dc2626' },
  'Email enviado':    { bg: '#e0f2fe', text: '#0369a1' },
  'Pendiente':        { bg: '#fef9c3', text: '#a16207' },
  'Aceptó convenio':  { bg: '#dcfce7', text: '#15803d' },
  'Llamar más tarde': { bg: '#f1f5f9', text: '#64748b' },
}

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  LLAMADA:   { bg: '#e0f2fe', text: '#0369a1' },
  CORREO:    { bg: '#f0fdf4', text: '#15803d' },
  WHATSAPP:  { bg: '#dcfce7', text: '#16a34a' },
  VISITA:    { bg: '#fef9c3', text: '#a16207' },
}

// ── Helpers ────────────────────────────────────────────────────────────
function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function lunesISO() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function inicioMesISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

// ── Props ──────────────────────────────────────────────────────────────
interface Props {
  gestiones: Gestion[]
  rol:       'COORDINADOR' | 'ANALISTA'
  userEmail: string
  userName:  string
  analistas: { email: string; nombre: string }[]
}

// ══════════════════════════════════════════════════════════════════════
// COMPONENTE
// ══════════════════════════════════════════════════════════════════════
export default function TablaGestiones({ gestiones, rol, analistas }: Props) {
  const router = useRouter()
  const [periodo,    setPeriodo]    = useState('hoy')
  const [tipoFiltro, setTipoFiltro] = useState('Todos')
  const [resFiltro,  setResFiltro]  = useState('Todos')
  const [anaFiltro,  setAnaFiltro]  = useState('Todos')

  const selectCls = 'rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 bg-white focus:outline-none focus:border-blue-400 transition'

  // ── Filtrado ──────────────────────────────────────────────────────
  const filtradas = useMemo(() => {
    let list = [...gestiones]

    // Período
    if (periodo === 'hoy')   list = list.filter(g => g.fecha === hoyISO())
    if (periodo === 'semana') list = list.filter(g => g.fecha >= lunesISO())
    if (periodo === 'mes')   list = list.filter(g => g.fecha >= inicioMesISO())

    // Tipo
    if (tipoFiltro !== 'Todos') list = list.filter(g => g.tipo === tipoFiltro)

    // Resultado
    if (resFiltro !== 'Todos') list = list.filter(g => g.resultado === resFiltro)

    // Analista (solo COORDINADOR)
    if (anaFiltro !== 'Todos') list = list.filter(g => g.analista_email === anaFiltro)

    return list
  }, [gestiones, periodo, tipoFiltro, resFiltro, anaFiltro])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-gray-400 flex-shrink-0" />

          {/* Período — botones */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PERIODOS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className="px-3 py-1.5 text-[12px] font-semibold transition"
                style={periodo === p.value
                  ? { backgroundColor: '#009ee3', color: 'white' }
                  : { backgroundColor: 'white', color: '#64748b' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Tipo */}
          <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={selectCls}>
            {TIPOS.map(t => <option key={t}>{t}</option>)}
          </select>

          {/* Resultado */}
          <select value={resFiltro} onChange={e => setResFiltro(e.target.value)} className={selectCls}>
            {RESULTADOS.map(r => <option key={r}>{r}</option>)}
          </select>

          {/* Analista — solo COORDINADOR */}
          {rol === 'COORDINADOR' && (
            <select value={anaFiltro} onChange={e => setAnaFiltro(e.target.value)} className={selectCls}>
              <option value="Todos">Todos los analistas</option>
              {analistas.map(a => (
                <option key={a.email} value={a.email}>{a.nombre}</option>
              ))}
            </select>
          )}

          {/* Contador */}
          <span className="ml-auto text-[12px] text-gray-400 font-semibold">
            {filtradas.length} gestión{filtradas.length !== 1 ? 'es' : ''}
          </span>
        </div>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList size={36} className="text-gray-200 mb-3" />
            <p className="text-[13px] font-semibold text-gray-500">Sin gestiones para este período</p>
            <p className="text-[11px] text-gray-400 mt-1">Cambiá los filtros o registrá una nueva gestión desde la ficha de un cliente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  {rol === 'COORDINADOR' && <Th>Analista</Th>}
                  <Th>Tipo</Th>
                  <Th>Resultado</Th>
                  <Th>Nota</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((g, i) => {
                  const resSty = RESULTADO_COLORS[g.resultado] ?? { bg: '#f1f5f9', text: '#64748b' }
                  const tipSty = TIPO_COLORS[g.tipo]           ?? { bg: '#f1f5f9', text: '#64748b' }
                  return (
                    <tr
                      key={g.id}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      style={i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                      onClick={() => router.push(`/clientes/${encodeURIComponent(g.cliente_cod)}`)}
                    >
                      {/* Fecha + hora */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[12px] font-semibold text-gray-700">{fmtFecha(g.fecha)}</p>
                        <p className="text-[11px] text-gray-400">{g.hora?.slice(0,5)}</p>
                      </td>
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <p className="text-[12px] font-semibold text-gray-800">{g.cliente_cod}</p>
                        <p className="text-[11px] text-gray-400">{g.contribuyente}</p>
                      </td>
                      {/* Analista */}
                      {rol === 'COORDINADOR' && (
                        <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">
                          {g.analista_email?.split('@')[0]}
                        </td>
                      )}
                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: tipSty.bg, color: tipSty.text }}>
                          {g.tipo}
                        </span>
                      </td>
                      {/* Resultado */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ backgroundColor: resSty.bg, color: resSty.text }}>
                          {g.resultado}
                        </span>
                      </td>
                      {/* Nota */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-[12px] text-gray-500 truncate">{g.nota || '—'}</p>
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
