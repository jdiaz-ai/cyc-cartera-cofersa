'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fmtM } from '@/lib/utils/formato'
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, FileText } from 'lucide-react'
import type { ClienteRow, AnalistaOpt } from '@/app/(app)/clientes/page'

// ── Constantes ────────────────────────────────────────────────────────
const TRAMOS = ['Todos', 'Al día', '1-30 días', '31-60 días', '61-90 días', '91-120 días', '+120 días']

const URGENCIA_COLOR: Record<string, string> = {
  ROJO:     '#dc2626',
  AMARILLO: '#f59e0b',
  VERDE:    '#22c55e',
}

const TRAMO_STYLES: Record<string, { bg: string; text: string }> = {
  'Al día':      { bg: '#dcfce7', text: '#15803d' },
  '1-30 días':   { bg: '#fef9c3', text: '#a16207' },
  '31-60 días':  { bg: '#ffedd5', text: '#c2410c' },
  '61-90 días':  { bg: '#fee2e2', text: '#dc2626' },
  '91-120 días': { bg: '#fecaca', text: '#b91c1c' },
  '+120 días':   { bg: '#fca5a5', text: '#7f1d1d' },
}

// ── Lógica de urgencia ────────────────────────────────────────────────
function calcUrgencia(r: ClienteRow): 'ROJO' | 'AMARILLO' | 'VERDE' {
  if ((r.mora_61_90 + r.mora_91_120 + r.mora_120_plus) > 0) return 'ROJO'
  if (r.mora_31_60 > 0) return 'AMARILLO'
  return 'VERDE'
}

function tramoPeor(r: ClienteRow): string {
  if (r.mora_120_plus > 0) return '+120 días'
  if (r.mora_91_120  > 0) return '91-120 días'
  if (r.mora_61_90   > 0) return '61-90 días'
  if (r.mora_31_60   > 0) return '31-60 días'
  if (r.mora_1_30    > 0) return '1-30 días'
  return 'Al día'
}

// ── Tipos internos ────────────────────────────────────────────────────
type SortCol = 'mora_total' | 'total' | 'dias_sin_gestion' | 'cliente_nombre'
type SortDir = 'asc' | 'desc'

interface Props {
  rows:           ClienteRow[]
  esCoordinador:  boolean
  analistas:      AnalistaOpt[]
}

// ── Icono de ordenamiento ─────────────────────────────────────────────
function SortIcon({ activo, dir }: { activo: boolean; dir: SortDir }) {
  if (!activo) return <ChevronsUpDown size={11} className="text-gray-300 inline ml-0.5" />
  return dir === 'asc'
    ? <ChevronUp   size={11} className="text-blue-500 inline ml-0.5" />
    : <ChevronDown size={11} className="text-blue-500 inline ml-0.5" />
}

// ── Componente principal ──────────────────────────────────────────────
export default function TablaClientes({ rows, esCoordinador, analistas }: Props) {
  const router = useRouter()

  const [busqueda,       setBusqueda]       = useState('')
  const [filtroTramo,    setFiltroTramo]    = useState('Todos')
  const [filtroAnalista, setFiltroAnalista] = useState('Todos')
  const [sortCol,        setSortCol]        = useState<SortCol>('mora_total')
  const [sortDir,        setSortDir]        = useState<SortDir>('desc')

  // Mapa email → nombre para el coordinador
  const analistaNombreMap = useMemo(() =>
    Object.fromEntries(analistas.map(a => [a.email, a.nombre])),
    [analistas]
  )

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // ── Filtrado + ordenamiento ──────────────────────────────────────
  const filtered = useMemo(() => {
    let data = rows.map(r => ({
      ...r,
      urgencia: calcUrgencia(r),
      tramo:    tramoPeor(r),
    }))

    // Búsqueda libre
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      data = data.filter(r =>
        r.cliente_nombre.toLowerCase().includes(q) ||
        r.cliente_cod.toLowerCase().includes(q)    ||
        r.contribuyente.toLowerCase().includes(q)
      )
    }

    // Filtro por tramo de mora
    if (filtroTramo !== 'Todos') {
      data = data.filter(r => r.tramo === filtroTramo)
    }

    // Filtro por analista (solo coordinador)
    if (esCoordinador && filtroAnalista !== 'Todos') {
      data = data.filter(r => r.analista_email === filtroAnalista)
    }

    // Ordenamiento
    data.sort((a, b) => {
      if (sortCol === 'cliente_nombre') {
        return sortDir === 'asc'
          ? a.cliente_nombre.localeCompare(b.cliente_nombre)
          : b.cliente_nombre.localeCompare(a.cliente_nombre)
      }
      const va = a[sortCol] as number
      const vb = b[sortCol] as number
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return data
  }, [rows, busqueda, filtroTramo, filtroAnalista, sortCol, sortDir, esCoordinador])

  // ── Clases compartidas ───────────────────────────────────────────
  const selectCls = 'rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 bg-white ' +
    'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition'

  const thBtnCls = 'flex items-center gap-0.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider ' +
    'hover:text-gray-700 transition-colors'

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* ── Barra de filtros ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Búsqueda */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar cliente o código..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className={selectCls + ' pl-8 w-60'}
          />
        </div>

        {/* Filtro por tramo */}
        <select value={filtroTramo} onChange={e => setFiltroTramo(e.target.value)} className={selectCls}>
          {TRAMOS.map(t => <option key={t}>{t}</option>)}
        </select>

        {/* Filtro por analista (solo coordinador) */}
        {esCoordinador && (
          <select value={filtroAnalista} onChange={e => setFiltroAnalista(e.target.value)} className={selectCls}>
            <option value="Todos">Todos los analistas</option>
            {analistas.map(a => (
              <option key={a.email} value={a.email}>{a.nombre}</option>
            ))}
          </select>
        )}

        {/* Contador */}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <span className="font-semibold text-gray-600">{filtered.length}</span>
          <span>de {rows.length} clientes</span>
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: '13px' }}>

            {/* Encabezados */}
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {/* Semáforo */}
                <th className="px-3 py-3 w-8" />

                {/* Cliente */}
                <th className="px-3 py-3 text-left">
                  <button className={thBtnCls} onClick={() => toggleSort('cliente_nombre')}>
                    Cliente <SortIcon activo={sortCol === 'cliente_nombre'} dir={sortDir} />
                  </button>
                </th>

                {/* Analista (solo coordinador) */}
                {esCoordinador && (
                  <th className="px-3 py-3 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                    Analista
                  </th>
                )}

                {/* Vendedor */}
                <th className="px-3 py-3 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                  Vendedor
                </th>

                {/* Mora mayor */}
                <th className="px-3 py-3 text-left font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                  Mora mayor
                </th>

                {/* Mora total */}
                <th className="px-3 py-3 text-right">
                  <button className={thBtnCls + ' ml-auto'} onClick={() => toggleSort('mora_total')}>
                    Mora total <SortIcon activo={sortCol === 'mora_total'} dir={sortDir} />
                  </button>
                </th>

                {/* Total cartera */}
                <th className="px-3 py-3 text-right">
                  <button className={thBtnCls + ' ml-auto'} onClick={() => toggleSort('total')}>
                    Total cartera <SortIcon activo={sortCol === 'total'} dir={sortDir} />
                  </button>
                </th>

                {/* Última gestión */}
                <th className="px-3 py-3 text-center">
                  <button className={thBtnCls + ' mx-auto'} onClick={() => toggleSort('dias_sin_gestion')}>
                    Últ. gestión <SortIcon activo={sortCol === 'dias_sin_gestion'} dir={sortDir} />
                  </button>
                </th>

                {/* Acción */}
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>

            {/* Filas */}
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={esCoordinador ? 9 : 8}
                    className="px-4 py-16 text-center text-sm text-gray-400"
                  >
                    No se encontraron clientes con los filtros aplicados.
                  </td>
                </tr>
              )}

              {filtered.map((r, i) => {
                const urgColor  = URGENCIA_COLOR[r.urgencia]
                const tramoSty  = TRAMO_STYLES[r.tramo] ?? { bg: '#f1f5f9', text: '#64748b' }
                const diasStr   = r.dias_sin_gestion >= 999 ? 'Sin gestión' : `${r.dias_sin_gestion}d`
                const diasColor = r.dias_sin_gestion >= 7 ? '#dc2626' : r.dias_sin_gestion >= 3 ? '#f59e0b' : '#64748b'
                const analNombre = analistaNombreMap[r.analista_email]
                  ?? (r.analista_email ? r.analista_email.split('@')[0] : '—')

                return (
                  <tr
                    key={r.cliente_cod}
                    onClick={() => router.push(`/clientes/${encodeURIComponent(r.cliente_cod)}`)}
                    className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                    style={i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                  >
                    {/* Semáforo */}
                    <td className="px-3 py-3">
                      <div
                        className="w-2.5 h-2.5 rounded-full mx-auto"
                        style={{ backgroundColor: urgColor }}
                        title={r.urgencia}
                      />
                    </td>

                    {/* Cliente */}
                    <td className="px-3 py-3 max-w-[200px]">
                      <p className="font-semibold text-gray-800 text-[13px] leading-tight truncate">
                        {r.cliente_nombre}
                      </p>
                      <p className="text-gray-400 text-[11px] leading-tight font-mono">
                        {r.cliente_cod}
                      </p>
                    </td>

                    {/* Analista */}
                    {esCoordinador && (
                      <td className="px-3 py-3 text-[12px] text-gray-500 whitespace-nowrap">
                        {analNombre}
                      </td>
                    )}

                    {/* Vendedor */}
                    <td className="px-3 py-3 text-[12px] text-gray-500 max-w-[130px]">
                      <span className="truncate block">{r.vendedor_nombre || '—'}</span>
                    </td>

                    {/* Mora mayor */}
                    <td className="px-3 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                        style={{ backgroundColor: tramoSty.bg, color: tramoSty.text }}
                      >
                        {r.tramo}
                      </span>
                    </td>

                    {/* Mora total */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: r.mora_total > 0 ? '#dc2626' : '#94a3b8' }}
                      >
                        {r.mora_total > 0 ? fmtM(r.mora_total) : '—'}
                      </span>
                    </td>

                    {/* Total cartera */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="text-[12px] font-semibold text-gray-700 tabular-nums">
                        {fmtM(r.total)}
                      </span>
                    </td>

                    {/* Última gestión */}
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: diasColor }}
                      >
                        {diasStr}
                      </span>
                    </td>

                    {/* Icono ficha */}
                    <td className="px-3 py-3 text-center">
                      <FileText size={14} className="text-gray-300 group-hover:text-blue-400 mx-auto" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer de la tabla */}
        {filtered.length > 0 && (
          <div
            className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between"
            style={{ backgroundColor: '#fafbfc' }}
          >
            <span className="text-[11px] text-gray-400">
              Click en un cliente para ver su Ficha 360°
            </span>
            <span className="text-[11px] text-gray-400">
              Datos al corte de Softland · Sync 3× al día
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
