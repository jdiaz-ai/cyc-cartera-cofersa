'use client'

import { useState } from 'react'
import { Trophy, Users, AlertTriangle, Target } from 'lucide-react'
import TabRankingClientes   from './TabRankingClientes'
import TabPerfilVendedor    from './TabPerfilVendedor'
import TabAlertasDeterioro  from './TabAlertasDeterioro'
import TabConcentracion     from './TabConcentracion'

interface Props {
  userEmail:  string
  esAnalista: boolean
}

const PERIODOS = [
  { valor: 3, label: 'Últimos 3 meses'  },
  { valor: 6, label: 'Últimos 6 meses'  },
  { valor: 9, label: 'Últimos 9 meses'  },
]

export default function AnalisisPagosTabs({ userEmail, esAnalista }: Props) {
  const [activeTab,    setActiveTab]    = useState(0)
  const [periodo,      setPeriodo]      = useState(6)
  const [alertasCount, setAlertasCount] = useState<number | null>(null)

  const tabs = [
    { id: 0, label: 'Ranking de clientes',   icon: <Trophy     size={14} /> },
    { id: 1, label: 'Perfil por vendedor',   icon: <Users      size={14} /> },
    { id: 2, label: 'Alertas de deterioro',  icon: <AlertTriangle size={14} />, badge: alertasCount },
    { id: 3, label: 'Concentración de riesgo', icon: <Target   size={14} /> },
  ]

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">

        {/* ── Selector de período (sin título — el Topbar ya lo muestra) ── */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">
            Período
          </span>
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#E2E8F0' }}>
            {PERIODOS.map(p => (
              <button
                key={p.valor}
                onClick={() => setPeriodo(p.valor)}
                className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap"
                style={{
                  background: periodo === p.valor ? 'white'   : 'transparent',
                  color:      periodo === p.valor ? '#003B5C' : '#94a3b8',
                  boxShadow:  periodo === p.valor ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab navigation ──────────────────────────────────────────── */}
        <div className="flex gap-0.5 bg-white rounded-xl border border-slate-100 p-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap flex-shrink-0"
              style={{
                background: activeTab === tab.id ? '#003B5C' : 'transparent',
                color:      activeTab === tab.id ? 'white'   : '#64748b',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge !== null && tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none"
                  style={{
                    background: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                    color:      activeTab === tab.id ? 'white'                   : '#dc2626',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Contenido activo ────────────────────────────────────────── */}
        {activeTab === 0 && (
          <TabRankingClientes
            periodo={periodo}
            userEmail={esAnalista ? userEmail : null}
          />
        )}
        {activeTab === 1 && (
          <TabPerfilVendedor
            periodo={periodo}
            userEmail={esAnalista ? userEmail : null}
          />
        )}
        {activeTab === 2 && (
          <TabAlertasDeterioro
            userEmail={esAnalista ? userEmail : null}
            onDataLoaded={(count) => setAlertasCount(count)}
          />
        )}
        {activeTab === 3 && (
          <TabConcentracion esAnalista={esAnalista} />
        )}
      </div>
    </div>
  )
}
