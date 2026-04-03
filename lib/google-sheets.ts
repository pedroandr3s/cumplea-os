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

// Geocode using the same Places API flow as manual search (autocomplete → details)
async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  try {
    const sessionToken = crypto.randomUUID()

    // Step 1: autocomplete to get a place_id
    const res1 = await fetch(
      `/api/places?input=${encodeURIComponent(address)}&sessiontoken=${sessionToken}`
    )
    if (!res1.ok) return null
    const predictions = await res1.json()
    if (!Array.isArray(predictions) || predictions.length === 0) return null

    const placeId = predictions[0].place_id

    // Step 2: place details to get lat/lng + clean address
    const res2 = await fetch(
      `/api/places/details?place_id=${placeId}&sessiontoken=${sessionToken}`
    )
    if (!res2.ok) return null
    const details = await res2.json()
    if (details?.lat && details?.lng) {
      return { lat: details.lat, lng: details.lng, formattedAddress: details.address ?? address }
    }
  } catch (error) {
    console.error('Error geocoding:', address, error)
  }
  return null
}

// Main function: fetch sheet, parse CSV, geocode each address via /api/geocode
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

  const geocodeRow = async (row: SheetRow, index: number): Promise<GeocodedRow> => {
    const cleanDir = cleanAddress(row.direccion)
    onProgress?.(index + 1, rows.length, row.lugar)

    if (cleanDir) {
      const result = await geocodeAddress(cleanDir)
      if (result) {
        return { ...row, direccion: result.formattedAddress || cleanDir, lat: result.lat, lng: result.lng }
      }
    }

    console.warn(`No se pudo geocodificar: ${cleanDir}`)
    return { ...row, direccion: cleanDir, lat: -36.6066, lng: -72.1034 }
  }

  // Process in batches of 5 concurrently
  const BATCH_SIZE = 5
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const geocoded = await Promise.all(batch.map((row, j) => geocodeRow(row, i + j)))
    results.push(...geocoded)
  }

  return results
}
