export interface SheetRow {
  lugar: string
  direccion: string
  promocion: string
}

export interface GeocodedRow extends SheetRow {
  lat: number
  lng: number
}

// Parse a single CSV line respecting quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// Parse full CSV text into SheetRow array
function parseCSV(csv: string): SheetRow[] {
  const lines = csv.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )

  const lugarIdx = headers.findIndex((h) => h.includes('lugar'))
  const dirIdx = headers.findIndex((h) => h.includes('direcci'))
  const promIdx = headers.findIndex((h) => h.includes('promoci'))

  const rows: SheetRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const lugar = cols[lugarIdx >= 0 ? lugarIdx : 0]?.replace(/^"|"$/g, '') ?? ''
    const direccion = cols[dirIdx >= 0 ? dirIdx : 1]?.replace(/^"|"$/g, '') ?? ''
    const promocion = cols[promIdx >= 0 ? promIdx : 2]?.replace(/^"|"$/g, '') ?? ''
    if (lugar.trim()) rows.push({ lugar: lugar.trim(), direccion: direccion.trim(), promocion: promocion.trim() })
  }
  return rows
}

// Geocode a single address using Nominatim (rate-limited to 1 req/s)
// Remove postal codes and redundant region info from addresses
// e.g. "5 de Abril 493, 3800693 Chillán, Ñuble" → "5 de Abril 493, Chillán"
function cleanAddress(raw: string): string {
  return raw
    .replace(/\b\d{7}\b\s*/g, '')   // remove 7-digit Chilean postal codes
    .replace(/,?\s*Ñuble\b/gi, '')   // remove ", Ñuble"
    .replace(/,?\s*Nuble\b/gi, '')   // remove without tilde
    .replace(/,\s*,/g, ',')          // fix double commas
    .replace(/,\s*$/, '')            // trailing comma
    .trim()
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(`${address}, Chillán, Ñuble, Chile`)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=cl`,
      { headers: { 'Accept-Language': 'es' } }
    )
    const data = await response.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (error) {
    console.error('Error geocoding:', address, error)
  }
  return null
}

// Main function: fetch sheet, parse CSV, geocode each address
export async function fetchGoogleSheetData(
  onProgress?: (current: number, total: number, lugar: string) => void
): Promise<GeocodedRow[]> {
  const response = await fetch('/api/sheets')
  if (!response.ok) {
    throw new Error('No se pudo obtener la hoja de cálculo. Verifica que el documento sea público.')
  }

  const csv = await response.text()
  const rows = parseCSV(csv)

  if (rows.length === 0) {
    throw new Error('La hoja está vacía o no tiene el formato esperado (columnas: Lugar, Dirección, Promoción).')
  }

  const results: GeocodedRow[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cleanDir = cleanAddress(row.direccion)
    onProgress?.(i + 1, rows.length, row.lugar)

    if (cleanDir) {
      const coords = await geocodeAddress(cleanDir)
      if (coords) {
        results.push({ ...row, direccion: cleanDir, ...coords })
      } else {
        console.warn(`No se pudo geocodificar: ${cleanDir}`)
        results.push({ ...row, direccion: cleanDir, lat: -36.6066, lng: -72.1034 })
      }
    } else {
      results.push({ ...row, direccion: cleanDir, lat: -36.6066, lng: -72.1034 })
    }

    // Nominatim rate limit: 1 request per second
    if (i < rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }

  return results
}
