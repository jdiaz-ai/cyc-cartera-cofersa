'use client'

// src/components/analista/AgendaCompacta.tsx
// Agenda compacta hoy+mañana. Reemplaza el calendario mensual.

import { fmtCRC } from '@/lib/utils/formato'
import type { AgendaGestion, AgendaPromesa } from '@/types/dashboard-analista'

interface Props {
  gestiones: AgendaGestion[]
  promesas:  AgendaPromesa[]
  hoyStr:    string
}

const DIAS  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

function labelDia(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  return `${DIAS[fecha.getDay()]} ${d} ${MESES[m - 1]}`
}

type ItemAgenda =
  | { tipo: 'gestion'; id: string; cliente_cod: string; accion: string; fecha: string }
  | { tipo: 'promesa'; id: string; cliente: string; monto: number; fecha: string }

export default function AgendaCompacta({ gestiones, promesas, hoyStr }: Props) {
  const mananaStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  function buildItems(fecha: string): ItemAgenda[] {
    const items: ItemAgenda[] = []
    for (const g of gestiones.filter(x => x.proxima_accion_fecha === fecha)) {
      items.push({ tipo: 'gestion', id: g.id, cliente_cod: g.cliente_cod, accion: g.proxima_accion, fecha })
    }
    for (const p of promesas.filter(x => x.fecha_promesa === fecha)) {
      items.push({ tipo: 'promesa', id: p.id, cliente: p.cliente_nombre || p.cliente_cod, monto: p.monto, fecha })
    }
    return items
  }

  const itemsHoy    = buildItems(hoyStr)
  const itemsManana = buildItems(mananaStr)

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">
        Agenda
      </p>

      {/* Hoy */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold text-[#009EE3] uppercase tracking-wider mb-2">
          Hoy — {labelDia(hoyStr)}
        </p>
        {itemsHoy.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos para este período.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsHoy.map(item => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>

      <hr className="border-slate-100 my-2" />

      {/* Mañana */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {labelDia(mananaStr)}
        </p>
        {itemsManana.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sin eventos para este período.</p>
        ) : (
          <div className="space-y-1.5">
            {itemsManana.map(item => (
              <AgendaItem key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AgendaItem({ item }: { item: ItemAgenda }) {
  const dotColor = item.tipo === 'promesa' ? '#f59e0b' : '#009EE3'
  const texto = item.tipo === 'promesa'
    ? `${item.cliente} · ${fmtCRC(item.monto)}`
    : `${item.cliente_cod} · ${item.accion}`

  return (
    <div className="flex items-start gap-2">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
        style={{ background: dotColor }}
      />
      <p className="text-[10px] text-slate-600 leading-tight">{texto}</p>
    </div>
  )
}
