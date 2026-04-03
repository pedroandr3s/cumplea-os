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

// Remove postal codes and redundant region info from addresses
// e.g. "5 de Abril 493, 3800693 Chillán, Ñuble" → "5 de Abril 493, Chillán"
function cleanAddress(raw: string): string {
  return raw
    .replace(/\b\d{7}\b\s*/g, '')
    .replace(/,?\s*Ñuble\b/gi, '')
    .replace(/,?\s*Nuble\b/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .trim()
}

// Shorten a full Google formatted_address to just street + city
function shortenGoogleAddress(full: string): string {
  return full
    .replace(/,?\s*Chile$/i, '')
    .replace(/,?\s*Región de Ñuble/i, '')
    .replace(/,?\s*Provincia de Diguillín/i, '')
    .replace(/\b\d{7}\b/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .trim()
}

// Geocode using Google Maps Geocoding API (fast, accurate, no rate limit issues)
async function geocodeAddressGoogle(
  address: string,
  apiKey: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  try {
    const query = encodeURIComponent(`${address}, Chillán, Chile`)
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}&language=es&region=cl`
    )
    const data = await res.json()
    if (data.status === 'OK' && data.results[0]) {
      const loc = data.results[0].geometry.location
      return {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: shortenGoogleAddress(data.results[0].formatted_address),
      }
    }
    if (data.status !== 'ZERO_RESULTS') {
      console.warn('Google Geocoding:', data.status, address)
    }
  } catch (error) {
    console.error('Error geocoding with Google:', address, error)
  }
  return null
}

// Main function: fetch sheet, parse CSV, geocode each address with Google Maps
export async function fetchGoogleSheetData(
  onProgress?: (current: number, total: number, lugar: string) => void
): Promise<GeocodedRow[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

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

  // With Google Maps API we can geocode concurrently (much faster than Nominatim)
  const geocodeRow = async (row: SheetRow, index: number): Promise<GeocodedRow> => {
    const cleanDir = cleanAddress(row.direccion)
    onProgress?.(index + 1, rows.length, row.lugar)

    if (cleanDir && apiKey) {
      const result = await geocodeAddressGoogle(cleanDir, apiKey)
      if (result) {
        return {
          ...row,
          direccion: result.formattedAddress || cleanDir,
          lat: result.lat,
          lng: result.lng,
        }
      }
    }

    // Fallback: use Chillán center
    console.warn(`No se pudo geocodificar: ${cleanDir}`)
    return { ...row, direccion: cleanDir, lat: -36.6066, lng: -72.1034 }
  }

  // Process in small batches to avoid overwhelming the API
  const BATCH_SIZE = 5
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const geocoded = await Promise.all(
      batch.map((row, j) => geocodeRow(row, i + j))
    )
    results.push(...geocoded)
  }

  return results
}
