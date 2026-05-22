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
        <div>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Por vendedor
          </p>
          <p className="text-xs font-semibold text-slate-800 mt-0.5">
            Distribución de mora por agente
          </p>
        </div>
        <Link
          href="/mi-cartera"
          className="text-[10px] text-[#009EE3] font-semibold hover:underline"
        >
          Ver Mi Cartera →
        </Link>
      </div>

      {/* Cabecera de columnas */}
      <div className="px-4 py-1.5 grid grid-cols-[1fr_80px_80px_60px] gap-2 bg-slate-50 border-b border-slate-100">
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px]">
          Vendedor
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          Clientes
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          Mora total
        </span>
        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.4px] text-right">
          % Mora
        </span>
      </div>

      {visibles.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-slate-500">Sin datos de vendedores disponibles.</p>
        </div>
      ) : (
        <>
          {visibles.map(v => (
            <div
              key={v.vendedor_cod}
              className="px-4 py-2 grid grid-cols-[1fr_80px_80px_60px] gap-2 items-center border-b border-slate-50 hover:bg-slate-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">{v.vendedor_nombre}</p>
                <p className="text-[10px] text-slate-400">{v.clientes_con_saldo} con saldo activo</p>
              </div>
              <p className="text-xs text-slate-500 tabular-nums text-right">
                {v.clientes_asignados}
              </p>
              <p className="text-xs font-semibold tabular-nums text-slate-800 text-right">
                {fmtCRC(v.mora_total)}
              </p>
              <div className="text-right">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                  v.pct_mora >= 40 ? 'bg-red-50 text-red-700'     :
                  v.pct_mora >= 20 ? 'bg-amber-50 text-amber-700' :
                  'bg-emerald-50 text-emerald-700'
                }`}>
                  {v.pct_mora}%
                </span>
              </div>
            </div>
          ))}

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
