'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter }                        from 'next/navigation'
import { fmtCRC, fmtM }                    from '@/lib/utils/formato'
import { fetchTodosLosClientes }            from '@/app/(app)/clientes/actions'
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Download, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react'
import type {
  ClienteRow, KPIsClientes, FiltrosClientes,
  AnalistaOpt, VendedorOpt,
} from '@/app/(app)/clientes/page'

// ── Helpers de presentación ───────────────────────────────────────────
function tramoPeor(r: ClienteRow): string {
  if (r.mora_120_plus > 0) return '+120d'
  if (r.mora_91_120  > 0) return '91-120d'
  if (r.mora_61_90   > 0) return '61-90d'
  if (r.mora_31_60   > 0) return '31-60d'
  if (r.mora_1_30    > 0) return '1-30d'
  return 'Al día'
}

const TRAMO_BADGE: Record<string, { bg: string; text: string }> = {
  '+120d':   { bg: '#fca5a5', text: '#991b1b' },
  '91-120d': { bg: '#fed7aa', text: '#9a3412' },
  '61-90d':  { bg: '#fde68a', text: '#92400e' },
  '31-60d':  { bg: '#fef08a', text: '#854d0e' },
  '1-30d':   { bg: '#bbf7d0', text: '#166534' },
  'Al día':  { bg: '#f1f5f9', text: '#64748b' },
}

/**
 * FIX: dias_mora no es populado por el GAS en Supabase (siempre llega en 0).
 * La función ahora deriva el riesgo del tramo de mora (mismo campo que el badge
 * "Rango Mora"), garantizando que ambas columnas nunca se contradigan.
 */
function calcRiesgoDesdeTramo(tramo: string): { label: string; color: string } {
  if (tramo === '+120d')   return { label: 'Mora crítica',  color: '#dc2626' }
  if (tramo === '91-120d') return { label: 'Mora alta',     color: '#f97316' }
  if (tramo === '61-90d')  return { label: 'Mora alta',     color: '#f97316' }
  if (tramo === '31-60d')  return { label: 'Mora media',    color: '#f59e0b' }
  if (tramo === '1-30d')   return { label: 'Mora reciente', color: '#22c55e' }
  return                          { label: 'Al día',         color: '#94a3b8' }
}

// ── Paginación ────────────────────────────────────────────────────────
function getPaginasVisibles(pag: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (pag <= 4)            return [1, 2, 3, 4, 5, '…', total]
  if (pag >= total - 3)    return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return                          [1, '…', pag - 1, pag, pag + 1, '…', total]
}

// ── Icono de ordenamiento ─────────────────────────────────────────────
function SortIcon({ activo, dir }: { activo: boolean; dir: 'asc' | 'desc' }) {
  if (!activo) return <ChevronsUpDown size={11} className="text-gray-300 inline ml-0.5" />
  return dir === 'asc'
    ? <ChevronUp   size={11} className="inline ml-0.5" style={{ color: '#009ee3' }} />
    : <ChevronDown size={11} className="inline ml-0.5" style={{ color: '#009ee3' }} />
}

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  rows:          ClienteRow[]
  kpis:          KPIsClientes
  totalRows:     number
  page:          number
  totalPages:    number
  filtros:       FiltrosClientes
  esCoordinador: boolean
  analistas:     AnalistaOpt[]
  vendedores:    VendedorOpt[]
  userEmail:     string
}

// ── Componente principal ──────────────────────────────────────────────
export default function TablaClientes({
  rows, kpis, totalRows, page, totalPages,
  filtros, esCoordinador, analistas, vendedores, userEmail,
}: Props) {
  const router                  = useRouter()
  const [isPending, startTrans] = useTransition()

  // Input de búsqueda local (debounce antes de navegar)
  const [inputBusqueda, setInputBusqueda] = useState(filtros.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado del export
  const [exportando,  setExportando]  = useState(false)
  const [toast,       setToast]       = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Construcción de URL ───────────────────────────────────────────
  function buildUrl(overrides: Partial<Record<string, string>>) {
    const base = {
      q:        inputBusqueda,
      analista: filtros.analista,
      vendedor: filtros.vendedor,
      etiqueta: filtros.etiqueta,
      sort:     filtros.sort,
      dir:      filtros.dir,
      page:     '1',          // reset a página 1 por defecto
    }
    const merged = { ...base, ...overrides }
    const params = new URLSearchParams()
    Object.entries(merged).forEach(([k, v]) => {
      if (v && !(k === 'sort' && v === 'mora_total') && !(k === 'dir' && v === 'desc') && !(k === 'page' && v === '1')) {
        params.set(k, v)
      }
    })
    const qs = params.toString()
    return qs ? `/clientes?${qs}` : '/clientes'
  }

  // ── Navegar con filtro ────────────────────────────────────────────
  function navegarFiltro(key: string, value: string) {
    startTrans(() => router.push(buildUrl({ [key]: value, page: '1' })))
  }

  // ── Toggle etiqueta ───────────────────────────────────────────────
  function toggleEtiqueta(slug: string) {
    const nueva = filtros.etiqueta === slug ? '' : slug
    navegarFiltro('etiqueta', nueva)
  }

  // ── Toggle sort ───────────────────────────────────────────────────
  function navegarSort(col: string) {
    const dir = filtros.sort === col && filtros.dir === 'desc' ? 'asc' : 'desc'
    startTrans(() => router.push(buildUrl({ sort: col, dir, page: '1' })))
  }

  // ── Paginación ────────────────────────────────────────────────────
  function navegarPagina(p: number) {
    startTrans(() => {
      router.push(buildUrl({ page: String(p) }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // ── Búsqueda con debounce ─────────────────────────────────────────
  function handleBusqueda(v: string) {
    setInputBusqueda(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTrans(() => router.push(buildUrl({ q: v, page: '1' })))
    }, 400)
  }

  // ── Exportar Excel (Server Action → todos los registros filtrados) ─
  async function handleExport() {
    if (totalRows === 0) { showToast('Sin datos para exportar'); return }
    setExportando(true)
    try {
      const allRows = await fetchTodosLosClientes(filtros)
      // FIX: xlsx v0.18 no garantiza `default` en ESM — usar named exports directamente
      const xlsxMod = await import('xlsx')
      const fecha   = new Date().toISOString().split('T')[0]

      const dataRows = allRows.map(r => ({
        'Cliente':           r.cliente_nombre,
        'Código':            r.cliente_cod,
        'Contribuyente':     r.contribuyente,
        'Vendedor':          r.vendedor_nombre,
        'Analista':          r.analista_nombre,
        'Condición Pago':    r.condicion_pago || '—',
        'Dimensión':         r.dimension      || '—',
        'Rango Mora':        tramoPeor(r),
        'Monto Vencido':     r.mora_total > 0 ? fmtCRC(r.mora_total) : 'Sin mora',
        'Total Cartera':     fmtCRC(r.total),
        'Días sin Gestión':  r.dias_sin_gestion >= 999 ? 'Sin gestión' : String(r.dias_sin_gestion),
      }))

      const ws = xlsxMod.utils.json_to_sheet(dataRows)
      ws['!cols'] = [
        { wch: 45 }, { wch: 14 }, { wch: 12 }, { wch: 25 },
        { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
        { wch: 18 }, { wch: 18 }, { wch: 15 },
      ]
      const wb = xlsxMod.utils.book_new()
      xlsxMod.utils.book_append_sheet(wb, ws, 'Clientes')
      xlsxMod.writeFile(wb, `Clientes_CYC_${fecha}.xlsx`)
      showToast(`${allRows.length} clientes exportados ✓`)
    } catch (err) {
      console.error('[Export Excel]', err)
      showToast('Error al exportar — intentar de nuevo')
    } finally {
      setExportando(false)
    }
  }

  // ── Cálculo de rango desde / hasta para el footer ─────────────────
  const PAGE_SIZE = 25
  const desde = (page - 1) * PAGE_SIZE + 1
  const hasta  = Math.min(page * PAGE_SIZE, totalRows)

  // ── Clases reutilizables ──────────────────────────────────────────
  const selectCls =
    'rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 bg-white ' +
    'focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition'

  const thBtnCls =
    'flex items-center gap-0.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wider ' +
    'hover:text-gray-700 transition-colors cursor-pointer'

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-5 space-y-4">

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl
                     text-white text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#009ee3' }}
        >
          {toast}
        </div>
      )}

      {/* Overlay de carga */}
      {isPending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/30">
          <div className="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" style={{ color: '#009ee3' }} />
            Cargando…
          </div>
        </div>
      )}

      {/* ── KPI Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Cartera filtrada */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Cartera filtrada
          </p>
          <p className="text-[20px] font-bold text-gray-800 tabular-nums leading-tight break-all">
            {fmtCRC(kpis.carteraFiltrada)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            {kpis.totalClientes} cliente{kpis.totalClientes !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Mora filtrada */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Mora filtrada
          </p>
          <p className="text-[20px] font-bold tabular-nums leading-tight break-all" style={{ color: '#dc2626' }}>
            {fmtCRC(kpis.moraFiltrada)}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">monto vencido total</p>
        </div>

        {/* % Morosidad */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            % Morosidad
          </p>
          <p
            className="text-[20px] font-bold tabular-nums leading-tight"
            style={{
              color: kpis.pctMorosidad === null
                ? '#94a3b8'
                : kpis.pctMorosidad > 15
                ? '#dc2626'
                : kpis.pctMorosidad > 8
                ? '#f59e0b'
                : '#22c55e',
            }}
          >
            {kpis.pctMorosidad !== null ? `${kpis.pctMorosidad.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">mora ÷ cartera</p>
        </div>
      </div>

      {/* ── Barra de filtros ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Búsqueda */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar cliente, código..."
            value={inputBusqueda}
            onChange={e => handleBusqueda(e.target.value)}
            className={`${selectCls} pl-8 w-56`}
          />
        </div>

        {/* Analista (solo coordinador) */}
        {esCoordinador && (
          <select
            value={filtros.analista}
            onChange={e => navegarFiltro('analista', e.target.value)}
            className={selectCls}
          >
            <option value="">Todos los analistas</option>
            {analistas.map(a => (
              <option key={a.email} value={a.email}>{a.nombre}</option>
            ))}
          </select>
        )}

        {/* Vendedor */}
        <select
          value={filtros.vendedor}
          onChange={e => navegarFiltro('vendedor', e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => (
            <option key={v.nombre} value={v.nombre}>{v.nombre}</option>
          ))}
        </select>

        {/* Etiqueta: Críticos */}
        <button
          type="button"
          onClick={() => toggleEtiqueta('criticos')}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
          style={
            filtros.etiqueta === 'criticos'
              ? { backgroundColor: '#dc2626', color: '#fff', borderColor: '#dc2626' }
              : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
          }
        >
          🔴 Críticos +90d
        </button>

        {/* Etiqueta: Olvidados */}
        <button
          type="button"
          onClick={() => toggleEtiqueta('olvidados')}
          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
          style={
            filtros.etiqueta === 'olvidados'
              ? { backgroundColor: '#f59e0b', color: '#fff', borderColor: '#f59e0b' }
              : { backgroundColor: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }
          }
        >
          🟡 Olvidados +15d
        </button>

        {/* Limpiar filtros (si hay algo activo) */}
        {(filtros.q || filtros.analista || filtros.vendedor || filtros.etiqueta) && (
          <button
            type="button"
            onClick={() => {
              setInputBusqueda('')
              startTrans(() => router.push('/clientes'))
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline transition"
          >
            Limpiar filtros
          </button>
        )}

        {/* Derecha: contador + export */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-gray-400">
            <span className="font-semibold text-gray-600">{totalRows}</span> clientes
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportando || totalRows === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5
                       text-sm font-medium text-gray-600 bg-white hover:bg-gray-50
                       disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {exportando
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />
            }
            {exportando ? 'Exportando…' : 'Descargar Excel'}
          </button>
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed" style={{ fontSize: '13px' }}>

            {/* Encabezados */}
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>

                {/* CLIENTE */}
                <th className="px-4 py-3 text-left w-[24%]">
                  <button className={thBtnCls} onClick={() => navegarSort('cliente_nombre')}>
                    Cliente <SortIcon activo={filtros.sort === 'cliente_nombre'} dir={filtros.dir} />
                  </button>
                </th>

                {/* EQUIPO */}
                <th className="px-3 py-3 text-left w-[13%] font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                  Equipo
                </th>

                {/* PLAZO */}
                <th className="px-3 py-3 text-left w-[8%] font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                  Plazo
                </th>

                {/* DIMENSIÓN */}
                <th className="px-3 py-3 text-left w-[9%] font-semibold text-gray-500 text-[11px] uppercase tracking-wider">
                  Dimensión
                </th>

                {/* RANGO MORA */}
                <th className="pl-5 pr-2 py-3 text-left w-[9%] font-semibold text-gray-500 text-[11px] uppercase tracking-wider whitespace-nowrap">
                  Rango Mora
                </th>

                {/* MONTO VENCIDO */}
                <th className="px-3 py-3 text-right w-[12%]">
                  <button className={`${thBtnCls} ml-auto`} onClick={() => navegarSort('mora_total')}>
                    Monto Vencido <SortIcon activo={filtros.sort === 'mora_total'} dir={filtros.dir} />
                  </button>
                </th>

                {/* TOTAL CARTERA */}
                <th className="px-3 py-3 text-right w-[12%]">
                  <button className={`${thBtnCls} ml-auto`} onClick={() => navegarSort('total')}>
                    Total Cartera <SortIcon activo={filtros.sort === 'total'} dir={filtros.dir} />
                  </button>
                </th>

                {/* RIESGO ACTUAL */}
                <th className="pl-6 pr-3 py-3 text-left w-[13%]">
                  <button className={thBtnCls} onClick={() => navegarSort('dias_sin_gestion')}>
                    Riesgo Actual <SortIcon activo={filtros.sort === 'dias_sin_gestion'} dir={filtros.dir} />
                  </button>
                </th>

              </tr>
            </thead>

            {/* Filas */}
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-16 text-center text-sm text-gray-400"
                  >
                    No se encontraron clientes con los filtros aplicados.
                  </td>
                </tr>
              )}

              {rows.map((r, i) => {
                const tramo      = tramoPeor(r)
                const tramoBadge = TRAMO_BADGE[tramo] ?? { bg: '#f1f5f9', text: '#64748b' }
                const riesgo     = calcRiesgoDesdeTramo(tramo)  // misma fuente que RANGO MORA

                const diasStr =
                  r.dias_sin_gestion >= 999 ? 'Sin gestión' :
                  r.dias_sin_gestion === 0  ? 'Hoy'         :
                  `hace ${r.dias_sin_gestion} día${r.dias_sin_gestion !== 1 ? 's' : ''}`

                const diasColor =
                  r.dias_sin_gestion >= 999 ? '#dc2626' :
                  r.dias_sin_gestion >= 7   ? '#dc2626' :
                  r.dias_sin_gestion >= 3   ? '#f59e0b' : '#16a34a'

                return (
                  <tr
                    key={r.cliente_cod}
                    onClick={() => router.push(`/clientes/${encodeURIComponent(r.cliente_cod)}`)}
                    className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors"
                    style={i % 2 === 1 ? { backgroundColor: '#fafbfc' } : {}}
                  >

                    {/* CLIENTE */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 text-[13px] leading-snug truncate">
                        {r.cliente_nombre}
                      </p>
                      <p className="font-mono text-[11px] text-gray-400 leading-snug">
                        {r.cliente_cod}
                      </p>
                    </td>

                    {/* EQUIPO */}
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-700 text-[12px] leading-snug truncate">
                        {r.vendedor_nombre}
                      </p>
                      <p className="text-gray-400 text-[11px] leading-snug truncate">
                        {r.analista_nombre}
                      </p>
                    </td>

                    {/* PLAZO */}
                    <td className="px-3 py-3">
                      {r.condicion_pago ? (
                        <span className="text-[12px] font-medium text-gray-600 whitespace-nowrap">
                          {r.condicion_pago}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* DIMENSIÓN */}
                    <td className="px-3 py-3">
                      {r.dimension ? (
                        <span className="text-[12px] text-gray-600 truncate block">
                          {r.dimension}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>

                    {/* RANGO MORA */}
                    <td className="pl-5 pr-2 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                        style={{ backgroundColor: tramoBadge.bg, color: tramoBadge.text }}
                      >
                        {tramo}
                      </span>
                    </td>

                    {/* MONTO VENCIDO */}
                    <td className="px-3 py-3 text-right">
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: r.mora_total > 0 ? '#dc2626' : '#94a3b8' }}
                      >
                        {r.mora_total > 0 ? fmtCRC(r.mora_total) : 'Sin mora'}
                      </span>
                    </td>

                    {/* TOTAL CARTERA */}
                    <td className="px-3 py-3 text-right">
                      <span
                        className="text-[12px] font-semibold tabular-nums"
                        style={{ color: '#009ee3' }}
                      >
                        {fmtCRC(r.total)}
                      </span>
                    </td>

                    {/* RIESGO ACTUAL */}
                    <td className="pl-6 pr-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: riesgo.color }}
                        />
                        <span
                          className="text-[11px] font-semibold leading-snug"
                          style={{ color: riesgo.color }}
                        >
                          {riesgo.label}
                        </span>
                      </div>
                      <p
                        className="text-[10px] mt-0.5 leading-snug pl-3.5"
                        style={{ color: diasColor }}
                      >
                        {diasStr}
                      </p>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer: paginación ──────────────────────────────────────── */}
        <div
          className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3"
          style={{ backgroundColor: '#fafbfc' }}
        >
          {/* Contador */}
          <span className="text-[11px] text-gray-400">
            {totalRows === 0
              ? 'Sin resultados'
              : `Mostrando ${desde}–${hasta} de ${totalRows} clientes`}
          </span>

          {/* Controles */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">

              {/* Anterior */}
              <button
                type="button"
                disabled={page === 1}
                onClick={() => navegarPagina(page - 1)}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200
                           text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={13} />
              </button>

              {/* Páginas */}
              {getPaginasVisibles(page, totalPages).map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} className="text-[12px] text-gray-300 px-1">…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => navegarPagina(p as number)}
                    className="w-7 h-7 rounded-lg border text-[12px] font-medium transition"
                    style={
                      p === page
                        ? { backgroundColor: '#009ee3', borderColor: '#009ee3', color: '#fff' }
                        : { borderColor: '#e5e7eb', color: '#6b7280' }
                    }
                  >
                    {p}
                  </button>
                )
              )}

              {/* Siguiente */}
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => navegarPagina(page + 1)}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200
                           text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}

          <span className="text-[11px] text-gray-400 hidden md:block">
            Datos al corte de Softland · Sync cada 2h
          </span>
        </div>
      </div>
    </div>
  )
}
