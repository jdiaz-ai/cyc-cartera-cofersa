// Google Calendar API v3 — fetch nativo, sin SDK externo.
// Requiere scope: https://www.googleapis.com/auth/calendar.readonly
// Configurar en Supabase Dashboard → Auth → Providers → Google → Scopes.

export interface CalendarEvent {
  id: string
  summary: string
  start: string   // YYYY-MM-DD (allDay) o ISO datetime
  end: string
  allDay: boolean
  colorHex: string // color del evento para el dot del calendario
}

// Mapa de colorId de Google Calendar → hex
const COLOR_MAP: Record<string, string> = {
  '1':  '#a4bdfc', // Lavanda
  '2':  '#7ae7bf', // Salvia
  '3':  '#dbadff', // Uva
  '4':  '#ff887c', // Flamingo
  '5':  '#fbd75b', // Banana
  '6':  '#ffb878', // Mandarina
  '7':  '#46d6db', // Pavo real
  '8':  '#e1e1e1', // Grafito
  '9':  '#5484ed', // Arándano
  '10': '#51b749', // Salvia
  '11': '#dc2626', // Tomate
}
const DEFAULT_COLOR = '#009ee3' // Cyan Cofersa

interface GoogleEventItem {
  id: string
  summary?: string
  colorId?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  status?: string
}

interface GoogleCalendarResponse {
  items?: GoogleEventItem[]
  error?: { message: string; code: number }
}

export async function fetchCalendarEvents(
  accessToken: string,
  timeMin: string,  // YYYY-MM-DD
  timeMax: string   // YYYY-MM-DD
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin:      `${timeMin}T00:00:00-06:00`, // Costa Rica UTC-6
    timeMax:      `${timeMax}T23:59:59-06:00`,
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '100',
  })

  // next: { revalidate } es una extensión de Next.js a fetch; no es parte del tipo
  // estándar RequestInit pero funciona correctamente en el runtime de Next.js.
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    } as RequestInit
  )

  if (!res.ok) {
    // Token expirado u otro error — devolver vacío para degradar elegantemente
    return []
  }

  const json = (await res.json()) as GoogleCalendarResponse
  if (json.error || !json.items) return []

  return json.items
    .filter(e => e.status !== 'cancelled')
    .map(e => {
      const allDay = Boolean(e.start?.date && !e.start?.dateTime)
      const start  = e.start?.date ?? e.start?.dateTime?.split('T')[0] ?? timeMin
      const end    = e.end?.date   ?? e.end?.dateTime?.split('T')[0]   ?? start
      return {
        id:       e.id,
        summary:  e.summary ?? '(Sin título)',
        start,
        end,
        allDay,
        colorHex: e.colorId ? (COLOR_MAP[e.colorId] ?? DEFAULT_COLOR) : DEFAULT_COLOR,
      }
    })
}
