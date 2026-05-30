'use client'

import { useState, useMemo } from 'react'
import { Search, Download, Send, Loader2, CheckCircle2, AlertCircle, Mail, MailX } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtCRC } from '@/lib/utils/formato'
import { exportarEstadoCuentaPDF } from '@/lib/utils/estado-cuenta-export'
import type { ClienteEC } from './page'

type EstadoEnvio = 'pendiente' | 'procesando' | 'ok' | 'error' | 'sin-correo'

interface Props { clientes: ClienteEC[] }

export default function EstadosCuentaCliente({ clientes }: Props) {
  const [busqueda,   setBusqueda]   = useState('')
  const [soloSaldo,  setSoloSaldo]  = useState(true)
  const [sel,        setSel]        = useState<Set<string>>(new Set())
  const [corriendo,  setCorriendo]  = useState(false)
  const [progreso,   setProgreso]   = useState<{ hechos: number; total: number; modo: 'envio' | 'descarga' } | null>(null)
  const [resultado,  setResultado]  = useState<Map<string, EstadoEnvio>>(new Map())

  // ── Lista filtrada ───────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter(c => {
      if (soloSaldo && c.saldo <= 0) return false
      if (!q) return true
      return c.cliente_nombre.toLowerCase().includes(q) || c.cliente_cod.toLowerCase().includes(q)
    })
  }, [clientes, busqueda, soloSaldo])

  const seleccionados = filtrados.filter(c => sel.has(c.cliente_cod))
  const todosMarcados = filtrados.length > 0 && filtrados.every(c => sel.has(c.cliente_cod))

  function toggle(cod: string) {
    setSel(prev => { const n = new Set(prev); n.has(cod) ? n.delete(cod) : n.add(cod); return n })
  }
  function toggleTodos() {
    setSel(prev => {
      const n = new Set(prev)
      if (todosMarcados) filtrados.forEach(c => n.delete(c.cliente_cod))
      else               filtrados.forEach(c => n.add(c.cliente_cod))
      return n
    })
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ── Descargar (un PDF por cliente) ─────────────────────────────────────────
  async function descargar() {
    if (seleccionados.length === 0 || corriendo) return
    setCorriendo(true)
    setResultado(new Map())
    setProgreso({ hechos: 0, total: seleccionados.length, modo: 'descarga' })
    const res = new Map<string, EstadoEnvio>()

    for (let i = 0; i < seleccionados.length; i++) {
      const c = seleccionados[i]
      res.set(c.cliente_cod, 'procesando'); setResultado(new Map(res))
      try {
        const r = await fetch(`/api/clientes/estado-cuenta/data?cod=${encodeURIComponent(c.cliente_cod)}`)
        if (!r.ok) throw new Error()
        const d = await r.json()
        await exportarEstadoCuentaPDF({
          facturas:         d.facturas,
          clienteNombre:    d.clienteNombre,
          contribuyente:    d.contribuyente,
          clienteCod:       d.clienteCod,
          condicionPago:    d.condicionPago,
          cuentas:          d.cuentas,
          fechaCorte:       d.fechaCorte,
          analistaNombre:   d.analistaNombre,
          analistaEmail:    d.analistaEmail,
          analistaTelefono: d.analistaTelefono,
          analistaWhatsapp: d.analistaWhatsapp,
        })
        res.set(c.cliente_cod, 'ok')
      } catch {
        res.set(c.cliente_cod, 'error')
      }
      setResultado(new Map(res))
      setProgreso({ hechos: i + 1, total: seleccionados.length, modo: 'descarga' })
      await sleep(600) // evita que el browser bloquee descargas múltiples
    }
    setCorriendo(false)
  }

  // ── Enviar por correo (al correo registrado de cada cliente) ────────────────
  async function enviar() {
    if (seleccionados.length === 0 || corriendo) return
    const conCorreo = seleccionados.filter(c => c.correo.trim())
    if (conCorreo.length === 0) { alert('Ninguno de los clientes seleccionados tiene correo registrado.'); return }

    setCorriendo(true)
    setResultado(new Map())
    setProgreso({ hechos: 0, total: seleccionados.length, modo: 'envio' })
    const res = new Map<string, EstadoEnvio>()

    // Token de Gmail de la sesión (una sola vez)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const providerToken        = session?.provider_token         ?? null
    const providerRefreshToken = session?.provider_refresh_token ?? null

    let hechos = 0
    for (const c of seleccionados) {
      if (!c.correo.trim()) {
        res.set(c.cliente_cod, 'sin-correo'); setResultado(new Map(res))
        hechos++; setProgreso({ hechos, total: seleccionados.length, modo: 'envio' }); continue
      }
      res.set(c.cliente_cod, 'procesando'); setResultado(new Map(res))
      try {
        const r = await fetch('/api/clientes/estado-cuenta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_cod:    c.cliente_cod,
            cliente_nombre: c.cliente_nombre,
            contribuyente:  c.contribuyente,
            to_email:       c.correo.trim(),
            providerToken,
            providerRefreshToken,
          }),
        })
        const data = await r.json().catch(() => ({}))
        res.set(c.cliente_cod, r.ok && data.email_sent ? 'ok' : 'error')
      } catch {
        res.set(c.cliente_cod, 'error')
      }
      setResultado(new Map(res))
      hechos++; setProgreso({ hechos, total: seleccionados.length, modo: 'envio' })
      await sleep(450) // respeta límites de Gmail API
    }
    setCorriendo(false)
  }

  const okCount  = [...resultado.values()].filter(v => v === 'ok').length
  const errCount = [...resultado.values()].filter(v => v === 'error').length
  const sinCount = [...resultado.values()].filter(v => v === 'sin-correo').length

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100%' }}>
      <div className="px-5 py-5 space-y-4">

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" style={{ minWidth: '220px' }}>
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar cliente…"
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-[12px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={soloSaldo} onChange={e => setSoloSaldo(e.target.checked)} />
              Solo con saldo
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-500">{seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}</span>
            <button onClick={descargar} disabled={corriendo || seleccionados.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition disabled:opacity-40"
              style={{ background: 'white', borderColor: '#e2e8f0', color: '#374151' }}>
              {corriendo && progreso?.modo === 'descarga' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar PDF
            </button>
            <button onClick={enviar} disabled={corriendo || seleccionados.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition disabled:opacity-40"
              style={{ background: '#009ee3', color: 'white', border: '1px solid #009ee3' }}>
              {corriendo && progreso?.modo === 'envio' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar correo
            </button>
          </div>
        </div>

        {/* Progreso */}
        {progreso && (
          <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-gray-700">
                {progreso.modo === 'envio' ? 'Enviando estados de cuenta…' : 'Generando PDF…'} {progreso.hechos}/{progreso.total}
              </span>
              <span className="text-[11px] text-gray-400">
                {okCount > 0 && <span style={{ color: '#16a34a' }}>{okCount} ok</span>}
                {errCount > 0 && <span style={{ color: '#dc2626' }} className="ml-2">{errCount} error</span>}
                {sinCount > 0 && <span style={{ color: '#f59e0b' }} className="ml-2">{sinCount} sin correo</span>}
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ width: `${(progreso.hechos / progreso.total) * 100}%`, height: '100%', background: '#009ee3', transition: 'width 0.2s' }} />
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}</span>
            <button onClick={toggleTodos} className="text-[11px] font-semibold text-[#009ee3] hover:underline">
              {todosMarcados ? 'Quitar todos' : 'Seleccionar todos'}
            </button>
          </div>

          <table style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
            <colgroup>
              <col style={{ width: '44px' }} />
              <col style={{ width: '34%' }} />
              <col style={{ width: '28%' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 12px' }}>
                  <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
                </th>
                {([['Cliente','left'],['Correo','left'],['Saldo','right'],['Estado','center']] as [string, React.CSSProperties['textAlign']][]).map(([l,a]) => (
                  <th key={l} style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: a }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Sin clientes para el filtro</td></tr>
              ) : filtrados.map(c => {
                const estado = resultado.get(c.cliente_cod)
                const marcado = sel.has(c.cliente_cod)
                return (
                  <tr key={c.cliente_cod}
                      style={{ borderBottom: '1px solid #f1f5f9', background: marcado ? '#f0f9ff' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      <input type="checkbox" checked={marcado} onChange={() => toggle(c.cliente_cod)} />
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cliente_nombre}</p>
                      <p style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>{c.cliente_cod}</p>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: '11px', color: c.correo ? '#475569' : '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.correo
                        ? <span className="inline-flex items-center gap-1"><Mail size={11} className="text-gray-300" />{c.correo}</span>
                        : <span className="inline-flex items-center gap-1"><MailX size={11} />Sin correo</span>}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: c.saldo > 0 ? '#374151' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                      {c.saldo > 0 ? fmtCRC(c.saldo) : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      {estado === 'ok'        && <CheckCircle2 size={15} style={{ color: '#16a34a', display: 'inline' }} />}
                      {estado === 'error'     && <AlertCircle  size={15} style={{ color: '#dc2626', display: 'inline' }} />}
                      {estado === 'sin-correo'&& <MailX        size={15} style={{ color: '#f59e0b', display: 'inline' }} />}
                      {estado === 'procesando'&& <Loader2      size={15} className="animate-spin" style={{ color: '#009ee3', display: 'inline' }} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
