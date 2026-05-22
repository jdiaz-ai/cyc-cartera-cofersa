// src/components/analista/PorVendedor.tsx
// Panel de distribución de mora por vendedor. Full-width debajo de Cola+Promesas.

import Link from 'next/link'
import { fmtCRC } from '@/lib/utils/formato'
import type { VendedorResumen } from '@/types/dashboard-analista'

interface Props {
  vendedores: VendedorResumen[]
}

export default function PorVendedor({ vendedores }: Props) {
  const visibles  = vendedores.slice(0, 5)
  const restantes = Math.max(0, vendedores.length - 5)

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-[3px] h-4 bg-[#009EE3] rounded-full flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Por Vendedor
            </p>
          </div>
        </div>
        <Link
          href="/mi-cartera"
          className="text-[10px] text-[#009EE3] font-semibold hover:underline"
        >
          Ver Mi Cartera →
        </Link>
      </div>

      {/* Cabecera de columnas */}
      <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 bg-slate-50 border-b border-slate-100">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">Vendedor</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">Cartera</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">Mora</span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">%</span>
      </div>

      {visibles.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-slate-500">Sin datos de vendedores disponibles.</p>
        </div>
      ) : (
        <>
          {visibles.map(v => {
            const moraBase = v.mora_total || 1
            const pct1_30  = Math.round((v.mora_tramo_1_30  / moraBase) * 100)
            const pct31_60 = Math.round((v.mora_tramo_31_60 / moraBase) * 100)
            const pct61mas = Math.round((v.mora_tramo_61_mas / moraBase) * 100)

            return (
              <div
                key={v.vendedor_cod}
                className="px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-b-0"
              >
                {/* Línea 1: nombre + datos principales */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
                      {v.vendedor_nombre}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {v.clientes_asignados} asig · {v.clientes_con_saldo} con saldo
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 leading-none mb-0.5">Cartera</p>
                      <p className="text-[11px] font-medium tabular-nums text-slate-600">
                        {fmtCRC(v.cartera_total)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 leading-none mb-0.5">Mora</p>
                      <p className="text-[11px] font-semibold tabular-nums text-slate-800">
                        {fmtCRC(v.mora_total)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums min-w-[38px] text-center ${
                      v.pct_mora >= 40 ? 'bg-red-50 text-red-700 border border-red-200'      :
                      v.pct_mora >= 20 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                         'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {v.pct_mora}%
                    </span>
                  </div>
                </div>

                {/* Línea 2: mini aging bar + leyenda + badge urgentes */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex h-1.5 rounded-full overflow-hidden flex-1 bg-slate-100">
                    {pct1_30  > 0 && <div style={{ width: `${pct1_30}%`  }} className="bg-amber-400 h-full" />}
                    {pct31_60 > 0 && <div style={{ width: `${pct31_60}%`}} className="bg-orange-500 h-full" />}
                    {pct61mas > 0 && <div style={{ width: `${pct61mas}%`}} className="bg-red-500 h-full" />}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {pct1_30  > 0 && <span className="text-[9px] text-amber-600">{pct1_30}% 1-30d</span>}
                    {pct31_60 > 0 && <span className="text-[9px] text-orange-600">{pct31_60}% 31-60d</span>}
                    {pct61mas > 0 && <span className="text-[9px] text-red-600">{pct61mas}% +61d</span>}
                  </div>
                  {v.clientes_urgentes > 0 && (
                    <span className="text-[9px] font-semibold bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded flex-shrink-0">
                      {v.clientes_urgentes} urgente{v.clientes_urgentes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {restantes > 0 && (
            <div className="px-4 py-2 text-center border-t border-slate-100">
              <Link
                href="/mi-cartera"
                className="text-[10px] text-[#009EE3] font-semibold hover:underline"
              >
                Ver los {vendedores.length} vendedores →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
