/**
 * Utilidad de búsqueda en el directorio de la empresa.
 * Alimenta el autocomplete de correos en la Ficha 360° y en Solicitudes.
 *
 * IMPORTANTE: solo llama a esta función desde Client Components vía
 * fetch a la API route, NO directamente (usa createClient del servidor).
 * Esta función es para uso en Server Components o API Routes.
 */
import { createClient } from '@/lib/supabase/server'

export interface ContactoDirectorio {
  nombre: string
  email:  string
  cargo:  string | null
  area:   string
}

/**
 * Busca contactos activos por nombre o email.
 * Útil en Server Components para cargar sugerencias iniciales.
 */
export async function buscarContactos(query: string): Promise<ContactoDirectorio[]> {
  if (!query.trim()) return []
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('directorio_empresa')
    .select('nombre, email, cargo, area')
    .eq('activo', true)
    .or(`nombre.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(8)
    .order('nombre')
  if (error) return []
  return (data ?? []) as ContactoDirectorio[]
}

/**
 * Retorna todos los contactos activos de un área específica.
 */
export async function contactosPorArea(area: string): Promise<ContactoDirectorio[]> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('directorio_empresa')
    .select('nombre, email, cargo, area')
    .eq('activo', true)
    .eq('area', area)
    .order('nombre')
  return (data ?? []) as ContactoDirectorio[]
}
