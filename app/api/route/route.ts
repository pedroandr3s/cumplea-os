import { NextRequest, NextResponse } from 'next/server'

// Proxy for Google Directions API with mode=walking
// Accepts: ?points=lat,lng|lat,lng|lat,lng  (ordered: origin → waypoints → destination)
export async function GET(req: NextRequest) {
  const pointsParam = req.nextUrl.searchParams.get('points')
  if (!pointsParam) return NextResponse.json([], { status: 400 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json([], { status: 500 })

  const coords = pointsParam.split('|').map((p) => {
    const [lat, lng] = p.split(',').map(Number)
    return { lat, lng }
  })

  if (coords.length < 2) return NextResponse.json([])

  const origin = `${coords[0].lat},${coords[0].lng}`
  const destination = `${coords[coords.length - 1].lat},${coords[coords.length - 1].lng}`
  const waypoints = coords.slice(1, -1)
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

    if (data.status !== 'OK') {
      console.error('Directions API:', data.status, data.error_message)
      return NextResponse.json([])
    }

    // Decode the overview polyline into [lat, lng] array
    const encoded = data.routes[0]?.overview_polyline?.points
    if (!encoded) return NextResponse.json([])

    const decoded = decodePolyline(encoded)
    return NextResponse.json(decoded)
  } catch (err) {
    console.error('Route proxy error:', err)
    return NextResponse.json([])
  }
}

// Google encoded polyline decoder
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
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
