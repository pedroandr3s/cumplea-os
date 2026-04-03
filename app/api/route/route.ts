import { NextRequest, NextResponse } from 'next/server'

// Walking route proxy — tries Google Directions first, falls back to OSRM foot profile
// Accepts: ?points=lat,lng|lat,lng|lat,lng  (ordered: origin → waypoints → destination)
export async function GET(req: NextRequest) {
  const pointsParam = req.nextUrl.searchParams.get('points')
  if (!pointsParam) return NextResponse.json([], { status: 400 })

  const coords = pointsParam.split('|').map((p) => {
    const [lat, lng] = p.split(',').map(Number)
    return { lat, lng }
  })

  if (coords.length < 2) return NextResponse.json([])

  // --- 1. Try Google Directions API (mode=walking) ---
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    const result = await tryGoogleDirections(coords, key)
    if (result.length > 1) return NextResponse.json(result)
  }

  // --- 2. Fallback: OSRM foot profile (free, no key needed) ---
  const osrmResult = await tryOsrmFoot(coords)
  if (osrmResult.length > 1) return NextResponse.json(osrmResult)

  // --- 3. Last resort: straight lines ---
  return NextResponse.json(coords.map((c) => [c.lat, c.lng]))
}

async function tryGoogleDirections(
  coords: { lat: number; lng: number }[],
  key: string
): Promise<[number, number][]> {
  const origin = `${coords[0].lat},${coords[0].lng}`
  const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`
  const waypoints = coords
    .slice(1, -1)
    .map((c) => `via:${c.lat},${c.lng}`)
    .join('|')

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${origin}` +
    `&destination=${destination}` +
    (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
    `&mode=walking` +
    `&language=es` +
    `&key=${key}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()

    if (data.status === 'OK') {
      const encoded = data.routes[0]?.overview_polyline?.points
      if (encoded) return decodePolyline(encoded)
    } else {
      console.warn('Google Directions:', data.status, data.error_message ?? '')
    }
  } catch (err) {
    console.error('Google Directions error:', err)
  }
  return []
}

async function tryOsrmFoot(
  coords: { lat: number; lng: number }[]
): Promise<[number, number][]> {
  // OSRM expects lng,lat order
  const coordinates = coords.map((c) => `${c.lng},${c.lat}`).join(';')
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson`,
      { cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
      )
    }
  } catch (err) {
    console.error('OSRM foot error:', err)
  }
  return []
}

// Google encoded polyline decoder
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0, result = 0, b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0; result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push([lat / 1e5, lng / 1e5])
  }

  return points
}
