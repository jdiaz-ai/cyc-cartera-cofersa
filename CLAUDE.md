# CYC Cofersa — Documento Maestro para Claude Code
**Sistema de Gestión de Cartera, Crédito y Cobro (SIC)**
Versión 4.0 · Mayo 2026 · Confidencial · Cofersa

---

## INSTRUCCIONES PARA CLAUDE CODE

Este documento es la fuente de verdad del proyecto. Antes de escribir cualquier código:
1. Leé este documento completo
2. No hagas cambios no solicitados
3. Mostrá un plan antes de implementar cualquier módulo nuevo
4. Pedí aprobación antes de modificar archivos existentes
5. Avisá SIEMPRE cuando se requiera un nuevo deploy en Vercel

---

## 1. CONTEXTO DEL PROYECTO

### 1.1 Empresa y equipo
- **Empresa:** Cofersa — Mayorista ferretero, Costa Rica
- **Sistema:** CRM personalizado de Gestión de Cartera, Crédito y Cobro (C&C)
- **ERP fuente:** Softland 7.00 — datos vienen del cubo Excel vía Google Apps Script
- **URL producción:** https://cyc-cartera-cofersa.vercel.app

### 1.2 Usuarios del sistema
| Usuario | Rol | Email | Acceso |
|---|---|---|---|
| Jeffrey Díaz | COORDINADOR | jdiaz@cofersa.cr | Total — todos los módulos y analistas |
| María Paola Rodríguez | ANALISTA | mrodriguez@cofersa.cr | Solo su cartera asignada |
| Paula Chavarría | ANALISTA | pchavarria@cofersa.cr | Solo su cartera asignada |
| Angélica Gómez | ANALISTA | agomez@cofersa.cr | Solo su cartera asignada |
| Giovanny Milano | ANALISTA | gmilano@cofersa.cr | Solo su cartera asignada |

### 1.3 Datos reales que maneja el sistema
- **₡4.02 Billones** en cartera activa
- **1,359 clientes** activos
- **19,600 facturas** pendientes
- **37 vendedores** en Softland
- **Monedas:** CRC (₡) — foco principal

### 1.4 Flujo de datos (NO modificar sin aprobación)
```
Softland ERP 7.00
  → Power Query / Cubo Excel (actualización manual 3x al día)
  → Google Apps Script (lee el cubo y escribe en Supabase)
  → Supabase PostgreSQL (base de datos del sistema)
  → Next.js / Vercel (frontend)

Sincronizaciones automáticas: 7:15am, 12:15pm, 4:15pm (hora Costa Rica)
```

---

## 2. STACK TECNOLÓGICO (INAMOVIBLE)

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Next.js 14 (App Router), TypeScript | Configurado |
| Estilos | Tailwind CSS | Con tokens personalizados Cofersa |
| Base de datos | Supabase (PostgreSQL) | En producción |
| Autenticación | Google OAuth vía Supabase Auth | Solo @cofersa.cr |
| Hosting | Vercel | `cyc-cartera-cofersa.vercel.app` |
| Email | Gmail API (token OAuth del analista) | Vía `resolveGmailToken` |
| PDF | jsPDF + jspdf-autotable | En `estado-cuenta-export.ts` |
| Excel | SheetJS (xlsx) | En `estado-cuenta-export.ts` |

**REGLA CRÍTICA DE DEPLOY:** Cualquier cambio en el código requiere `git push` para activarse en Vercel. Nunca asumir que un cambio está activo sin confirmar el deploy.

---

## 3. IDENTIDAD VISUAL Y DESIGN SYSTEM

### 3.1 Paleta de colores (inamovible)

```css
:root {
  --cofersa-navy:   #003B5C;   /* Sidebar, headers principales */
  --cofersa-cyan:   #009ee3;   /* Acento, botones primarios */
  --bg-app:         #f0f4f8;   /* Fondo de la app */
  --bg-card:        #ffffff;   /* Cards y paneles */

  /* Semáforo */
  --riesgo-alto:    #dc2626;   /* Rojo — mora crítica */
  --riesgo-medio:   #f59e0b;   /* Amarillo — mora en riesgo */
  --riesgo-bajo:    #22c55e;   /* Verde — al día */

  /* Aging por tramo */
  --aging-aldia:    #16a34a;   /* Al día — green-600 */
  --aging-1-30:     #d97706;   /* 1-30d — amber-600 */
  --aging-31-60:    #ea580c;   /* 31-60d — orange-600 */
  --aging-61-90:    #ef4444;   /* 61-90d — red-500 */
  --aging-91-120:   #dc2626;   /* 91-120d — red-600 */
  --aging-120plus:  #991b1b;   /* +120d — red-800 */
}
```

### 3.2 Tipografía
- **Fuente principal:** Nunito (Google Fonts)
- **Montos:** `tabular-nums` siempre (alineación de números)
- **Títulos de página:** 20px / weight 500-600
- **Labels de KPI:** 10-11px / uppercase / letter-spacing

### 3.3 Formato de montos — REGLA CRÍTICA
```typescript
// SIEMPRE usar fmtCRC para montos visibles al usuario
// El equipo NO está acostumbrado a formato K/M
export function fmtCRC(n: number): string {
  return '₡' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
// fmtM() solo se permite en tooltips o contextos muy secundarios
// NUNCA usar toLocaleString() — produce espacios en algunos navegadores
```

### 3.4 Layout general
```
┌────────────────────────────────────────────────────┐
│  SIDEBAR (200px)    │  TOPBAR (52px)               │
│  #003B5C            ├──────────────────────────    │
│  Logo + nav items   │  CONTENIDO PRINCIPAL          │
│  + badges por rol   │  background: #f0f4f8          │
│  [perfil usuario]   │  padding: 16px 20px           │
└────────────────────────────────────────────────────┘
```

---

## 4. REGLAS DE DESARROLLO (OBLIGATORIAS)

1. **NO tocar el Sidebar bajo ninguna circunstancia** — está funcionando correctamente en producción.
2. **Leer cada archivo antes de modificarlo** — siempre usar el Read tool primero.
3. **No hacer cambios no solicitados** — si se detecta algo mejorable en otro módulo, mencionarlo pero NO modificarlo.
4. **fmtCRC() para TODOS los montos** — sin excepción para valores visibles al usuario.
5. **TypeScript estricto** — no usar `any` salvo casos inevitables (Supabase). Tipos en `src/types/`.
6. **Seguridad de roles del lado del servidor** — nunca confiar solo en el frontend. Usar RLS de Supabase + verificación en Server Components.
7. **Avisar cuando requiera deploy** — después de cada push indicar que Vercel desplegará automáticamente.
8. **Error handling visible** — si una query falla, mostrar mensaje claro al usuario, nunca pantalla en blanco.
9. **Mobile-responsive** — tablas con overflow-x-auto, formularios usables en celular.
10. **Optimistic UI** — actualizar UI inmediatamente al registrar gestiones o aprobar solicitudes.

---

## 5. BASE DE DATOS SUPABASE

### 5.1 Tablas principales

```sql
cartera (
  id, codigo_cliente, nombre_cliente, vendedor, analista_id,
  no_vencido, mora_1_30, mora_31_60, mora_61_90, mora_91_120,
  mora_120_plus, total, fecha_corte, updated_at
)

facturas (
  id, cliente_id, documento, año, mes, dia,
  no_vencido, mora_1_30, mora_31_60, mora_61_90,
  mora_91_120, mora_120_plus, total, sync_id
)

maestro_clientes (
  id, codigo, nombre, vendedor, cod_vend,
  email, telefono, limite_credito, condicion_pago,
  analista_id, estatus, updated_at
)

gestiones (
  id, cliente_id, usuario_id, fecha, hora,
  tipo,        -- 'Llamada' | 'Email' | 'WhatsApp' | 'Visita' | 'CORREO'
  resultado,   -- 'Promesa OK' | 'No contestó' | 'No ubicado' | 'Pagó' | 'Email enviado' | etc.
  nota, promesa_fecha, promesa_monto, created_at
)

promesas (
  id, cliente_id, usuario_id, monto, fecha_prometida,
  estado,  -- 'Pendiente' | 'Cumplida' | 'Rota'
  nota, created_at, updated_at
)

solicitudes (
  id, tipo, cliente_id, solicitante_id, revisor_id,
  monto, monto_actual, monto_solicitado, justificacion,
  comentario_revisor, estado, created_at, updated_at
  -- tipo: 'AUMENTO_LIMITE' | 'EXCEPCION_CREDITO' | 'NOTA_CREDITO'
  -- estado: 'PENDIENTE' | 'EN_REVISION' | 'APROBADA' | 'RECHAZADA'
)

usuarios (
  id, nombre, email, rol,  -- 'COORDINADOR' | 'ANALISTA'
  avatar_url, activo, created_at
)

notificaciones (
  id, usuario_id, tipo, titulo, mensaje, leida, link, created_at
)
```

### 5.2 RPCs del Dashboard Analista

```typescript
// Todas reciben analista_email: text

fn_dashboard_kpis_analista(analista_email)
// → KpisAnalistaDashboard (cartera_total, mora_total, pct_mora,
//   gestiones_hoy, promesas_activas, promesas_vencen_hoy,
//   clientes_urgentes, meta_individual, cobrado_mes_estimado, meta_pct, etc.)
// NOTA: mora_91_120 puede ser negativo (ajuste Softland) — usar Math.max(0, v)

fn_dashboard_cola_analista(analista_email)
// → ColaItem[] (clientes priorizados por urgencia con semáforo ROJO/AMBAR/VERDE)

fn_dashboard_agenda_analista(analista_email)
// → AgendaGestion[] (próximas acciones programadas)

fn_dashboard_vendedores_analista(analista_email)
// → VendedorResumen[] (aging por vendedor: no_vencido + 5 tramos + mora_total + pct_mora)

fn_dashboard_progreso_analista(analista_email)
// → ProgresoDia (gestiones_hoy, meta, pct_meta)
```

### 5.3 RLS — Reglas críticas
```sql
-- COORDINADOR ve todo
-- ANALISTA solo ve registros donde analista_id = su propio id
-- Política ejemplo:
CREATE POLICY "analista_solo_su_cartera" ON cartera
  USING (
    auth.uid() IN (SELECT id FROM usuarios WHERE rol = 'COORDINADOR')
    OR analista_id = auth.uid()
  );
```

### 5.4 Patrón para RPCs con tipo cambiante
```typescript
// Cuando se modifica el tipo de retorno de un RPC:
// DROP FUNCTION IF EXISTS public.fn_nombre(text);
// CREATE FUNCTION ... (no CREATE OR REPLACE, falla si cambian columnas)
```

---

## 6. ESTRUCTURA DE ARCHIVOS CLAVE

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx                    ← Layout con Sidebar + Topbar
│   │   ├── page.tsx                      ← Dashboard (coordinador o analista según rol)
│   │   ├── clientes/
│   │   │   ├── page.tsx                  ← Tabla de clientes con filtros
│   │   │   └── [id]/page.tsx             ← Ficha 360° del cliente
│   │   ├── gestiones/page.tsx
│   │   ├── promesas/page.tsx
│   │   ├── solicitudes/
│   │   │   ├── page.tsx
│   │   │   ├── nueva/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── mi-equipo/page.tsx
│   │   └── reportes/page.tsx
│   └── api/
│       └── clientes/
│           ├── email-cobro/route.ts      ← Email cobro con CC + adjunto PDF/Excel
│           ├── estado-cuenta/route.ts    ← Estado de cuenta con adjunto
│           └── estado/route.ts           ← Cambio de estado del cliente
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                   ← NO TOCAR
│   │   └── Topbar.tsx
│   ├── analista/
│   │   ├── DashboardResumen.tsx          ← KPIs + Cola + Promesas
│   │   ├── PorVendedor.tsx               ← Tabla aging por vendedor (6 tramos)
│   │   ├── AgendaCompacta.tsx
│   │   ├── MiProgreso.tsx
│   │   └── NotasRapidas.tsx
│   ├── dashboard/
│   │   └── saludo-dashboard.tsx          ← Saludo dinámico + strip métricas
│   ├── clientes/
│   │   └── ficha/
│   │       ├── ficha-cliente.tsx         ← Componente principal Ficha 360°
│   │       ├── form-nueva-gestion.tsx
│   │       ├── tab-reportar-pago.tsx
│   │       └── tabla-gestiones-base.tsx
│   └── gestiones/
│       └── tabla-gestiones-base.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── utils/
│   │   ├── formato.ts                    ← fmtCRC, fmtM, fmtFecha, hoyISO
│   │   ├── estado-cuenta-export.ts       ← PDF/Excel: jsPDF + SheetJS
│   │   │                                    safeFilename() exportado
│   │   ├── gmail-token.ts                ← resolveGmailToken (renueva OAuth)
│   │   └── aging.ts
│   └── auth/
│       └── roles.ts
└── types/
    ├── dashboard-analista.ts             ← Tipos para RPCs del dashboard
    └── database.ts                       ← Tipos de tablas Supabase
```

---

## 7. MÓDULOS — ESTADO ACTUAL

### ✅ En producción y funcionando

**Dashboard Analista** (`/`)
- KPIs: Mi Cartera, En Mora, Gestiones Hoy (con barra progreso /15), Promesas Activas
- Cola del día con semáforo ROJO/AMBAR/VERDE y acción sugerida
- Mis Promesas con badges de estado (VENCIDA / HOY)
- Por Vendedor: tabla aging completa (Al día + 6 tramos + Mora Total + % Mora)
- Agenda de próximas acciones
- Mi Progreso del día
- Notas Rápidas predefinidas
- Saludo dinámico según hora CR + strip de métricas (gestiones / promesas / urgentes)

**Dashboard Coordinador** (`/`)
- KPIs globales
- Aging de cartera consolidado
- Panel Mi Equipo con métricas por analista
- Gestiones recientes feed

**Ficha 360° del cliente** (`/clientes/[id]`)
- Header: nombre, código, vendedor, analista, estado (editable coordinador), límite crédito
- Tab Información: datos de contacto CXP, datos fiscales, tipo de cambio
- Tab Estado de Cuenta: tabla facturas con filtros por tramo + aging visual
  - Botones: Descargar PDF / Descargar Excel / Enviar por Email
- Tab Gestiones: historial + registro nueva gestión
- Tab Solicitudes: solicitudes del cliente
- Botones header: Llamar / WhatsApp / Email de cobro / Estado de cuenta

**Email de cobro** (modal en Ficha)
- Para: type="text", acepta múltiples correos separados por `;`
- CC: opcional, mismo formato
- Asunto: dropdown con opciones predefinidas
- Adjunto: botones toggle Sin adjunto / PDF / Excel (ninguno por defecto)
- Registra gestión de tipo CORREO automáticamente

**Estado de cuenta por email** (modal en Ficha)
- Para: type="text", acepta múltiples correos
- Adjunto: Sin adjunto / PDF / Excel
- Template HTML branded Cofersa con datos reales del cliente
- Registra gestión automáticamente

**Descarga de archivos**
- Nombres de archivo usan `safeFilename(clienteNombre)` — NO el código del cliente
- Ejemplo: `estado-cuenta-Ferreteria-El-Tornillo.pdf`

**Módulo Clientes** (`/clientes`)
- Tabla con búsqueda + filtros (tramo mora, analista, estado)
- Semáforo de urgencia por fila

**Módulo Gestiones** (`/gestiones`)

**Módulo Promesas** (`/promesas`)

**Módulo Solicitudes** (`/solicitudes`)
- 3 tipos: Aumento límite, Excepción crédito, Nota de crédito
- Flujo: analista crea → coordinador aprueba/rechaza → notificación

**Módulo Mi Equipo** (`/mi-equipo`) — solo COORDINADOR

**Módulo Reportes** (`/reportes`) — solo COORDINADOR

**Notificaciones internas** — badge en sidebar + panel

---

### ⏳ Pendiente de implementar

| Feature | Dependencia | Prioridad |
|---|---|---|
| Score ICP en Ficha 360° | Requiere ≥3 meses de datos históricos en `historico_pagos` | Media |
| Generador de emails con IA | Anthropic API (ANTHROPIC_API_KEY en .env) | Media |
| Briefing diario con IA para coordinador | Anthropic API | Baja |
| Notas de voz → gestión | Whisper API, enfoque mobile | Baja |
| **SPF/DKIM en DNS** | Admin DNS de `cofersa.cr` — NO es tarea de código | Alta (SPAM) |

**Fix SPAM (instrucciones para admin DNS):**
- Agregar `include:_spf.google.com` al registro SPF TXT de `cofersa.cr`
- Configurar DKIM desde Google Workspace Admin → Apps → Gmail → Autenticar correo

---

## 8. LÓGICA DE NEGOCIO

### Semáforo de urgencia (Cola del analista)
```typescript
// ROJO: mora 61-90d ó 91-120d ó +120d ó promesa vence hoy ó sin gestión ≥10 días
// AMBAR: mora 31-60d ó promesa vence esta semana ó sin gestión ≥5 días
// VERDE: mora 1-30d, seguimiento normal
// prioridad viene de RPC como 'ROJO' | 'AMBAR' | 'VERDE'
// (la BD usa 'AMBAR' sin tilde — así viene del RPC, no cambiar)
```

### KPIs financieros
```typescript
const moraTotal = mora_1_30 + mora_31_60 + mora_61_90 + mora_91_120 + mora_120_plus
const pctMora   = (moraTotal / carteraTotal) * 100
const DSO       = (moraTotal / carteraTotal) * 30
// mora_91_120 puede ser negativo (ajuste Softland) → Math.max(0, mora_91_120)
```

### safeFilename — helper para nombres de archivo
```typescript
// Exportado desde src/lib/utils/estado-cuenta-export.ts
export function safeFilename(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita acentos
    .replace(/[^a-zA-Z0-9\s]/g, '')                     // solo alfanumérico
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}
```

---

## 9. VARIABLES DE ENTORNO

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Email (Gmail API vía OAuth del usuario — ya configurado)
EMAIL_FROM=cyc@cofersa.cr

# IA (pendiente de implementar)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://cyc-cartera-cofersa.vercel.app
```

---

## 10. DECISIONES YA TOMADAS (NO reabrir)

| Decisión | Elección | Razón |
|---|---|---|
| Color sidebar | `#003B5C` navy | Identidad corporativa |
| Color acento | `#009ee3` cyan | Identidad corporativa |
| Fondo app | `#f0f4f8` gris azulado | Contrasta con cards blancas |
| Tipografía | Nunito | Establecida desde versiones anteriores |
| Formato montos | `fmtCRC()` punto como separador | `toLocaleString` da espacios en algunos browsers; equipo no acostumbrado a K/M |
| Email | Gmail API con OAuth del analista | Ya en producción |
| PDF | jsPDF + jspdf-autotable | Ya en producción |
| Excel | SheetJS (xlsx) | Ya en producción |
| Nombres de archivo | Nombre del cliente (safeFilename) | Pedido del equipo — más fácil identificar |
| Aging PorVendedor | Columnas individuales (no barra) | Solicitado por coordinador para ver tramos exactos |
| Para/CC en emails | type="text" (no type="email") | Para admitir múltiples correos con `;` |

---

*Documento actualizado: 25 de mayo 2026. Actualizar ante cualquier cambio de arquitectura o decisión aprobada.*
