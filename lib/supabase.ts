/**
 * Supabase integration for route persistence.
 *
 * SQL para crear las tablas en Supabase (ejecutar en el SQL Editor):
 *
 * CREATE TABLE rutas (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
 *   punto_inicio TEXT NOT NULL,
 *   punto_final TEXT DEFAULT 'Constitución 901, Chillán',
 *   distancia_total FLOAT,
 *   usuario_id TEXT
 * );
 *
 * CREATE TABLE puntos_ruta (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   ruta_id UUID REFERENCES rutas(id) ON DELETE CASCADE,
 *   orden INT NOT NULL,
 *   lugar TEXT NOT NULL,
 *   direccion TEXT,
 *   promocion TEXT,
 *   estado TEXT DEFAULT 'pendiente'
 *     CHECK (estado IN ('logrado', 'no_logrado', 'no_fui', 'pendiente'))
 * );
 *
 * CREATE TABLE historial_importaciones (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   fecha TIMESTAMPTZ DEFAULT NOW(),
 *   cantidad_registros INT NOT NULL
 * );
 *
 * -- Habilitar Row Level Security (opcional pero recomendado):
 * ALTER TABLE rutas ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE puntos_ruta ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE historial_importaciones ENABLE ROW LEVEL SECURITY;
 *
 * -- Permitir acceso público (sin auth) para pruebas:
 * CREATE POLICY "public_access" ON rutas FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "public_access" ON puntos_ruta FOR ALL USING (true) WITH CHECK (true);
 * CREATE POLICY "public_access" ON historial_importaciones FOR ALL USING (true) WITH CHECK (true);
 */

import type { Location, VisitStatus } from './types'

export interface SavedRouteResult {
  rutaId: string
  /** Maps frontend Location.id → Supabase puntos_ruta.id */
  pointIds: Record<string, string>
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  if (!url || !key) return null
  return { url, key }
}

async function sbFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  const cfg = getConfig()
  if (!cfg) {
    console.warn('Supabase no configurado. Agrega NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY en .env.local')
    return null
  }

  try {
    const res = await fetch(`${cfg.url}/rest/v1${path}`, {
      ...options,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers as Record<string, string>),
      },
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('Supabase error:', res.status, body)
      return null
    }
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : null
  } catch (error) {
    console.error('Supabase fetch error:', error)
    return null
  }
}

export async function saveRouteToSupabase(
  route: Location[],
  totalDistance: number
): Promise<SavedRouteResult | null> {
  const startPoint = route.find((l) => l.id !== 'destination-fixed')
  if (!startPoint) return null

  // Insert ruta
  const rutas = await sbFetch<{ id: string }[]>('/rutas', {
    method: 'POST',
    body: JSON.stringify([
      {
        punto_inicio: startPoint.name,
        punto_final: 'Constitución 901, Chillán',
        distancia_total: parseFloat(totalDistance.toFixed(3)),
      },
    ]),
  })

  if (!rutas || !rutas[0]) return null
  const rutaId = rutas[0].id

  // Insert puntos (excluding the fixed destination marker)
  const puntosList = route
    .filter((loc) => loc.id !== 'destination-fixed')
    .map((loc) => ({
      ruta_id: rutaId,
      orden: loc.order ?? 0,
      lugar: loc.name,
      direccion: loc.address,
      promocion: loc.promotion,
      estado: 'pendiente',
    }))

  const savedPuntos = await sbFetch<{ id: string }[]>('/puntos_ruta', {
    method: 'POST',
    body: JSON.stringify(puntosList),
  })

  const pointIds: Record<string, string> = {}
  if (savedPuntos) {
    const filteredRoute = route.filter((l) => l.id !== 'destination-fixed')
    savedPuntos.forEach((sp, i) => {
      if (filteredRoute[i]) {
        pointIds[filteredRoute[i].id] = sp.id
      }
    })
  }

  return { rutaId, pointIds }
}

export async function updatePointStatus(
  supabaseId: string,
  status: VisitStatus
): Promise<void> {
  await sbFetch(`/puntos_ruta?id=eq.${supabaseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: status }),
  })
}

export async function logImport(count: number): Promise<void> {
  await sbFetch('/historial_importaciones', {
    method: 'POST',
    body: JSON.stringify([{ cantidad_registros: count }]),
  })
}
