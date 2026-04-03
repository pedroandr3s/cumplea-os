import { NextRequest, NextResponse } from 'next/server'

// Proxy for Google Place Details — resolves place_id → lat/lng + formatted_address
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id')
  const sessiontoken = req.nextUrl.searchParams.get('sessiontoken') || ''
  if (!placeId) return NextResponse.json(null, { status: 400 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json(null, { status: 500 })

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}` +
    `&fields=formatted_address,geometry` +
    `&language=es` +
    `&sessiontoken=${sessiontoken}` +
    `&key=${key}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()

    if (data.status !== 'OK') {
      console.error('Place Details API:', data.status, data.error_message)
      return NextResponse.json(null)
    }

    const loc = data.result.geometry.location
    const address = shortenAddress(data.result.formatted_address ?? '')

    return NextResponse.json({ lat: loc.lat, lng: loc.lng, address })
  } catch (err) {
    console.error('Place details proxy error:', err)
    return NextResponse.json(null)
  }
}

function shortenAddress(full: string): string {
  return full
    .replace(/,?\s*Chile$/i, '')
    .replace(/,?\s*Región de Ñuble/i, '')
    .replace(/,?\s*Provincia de Diguillín/i, '')
    .replace(/\b\d{7}\b/g, '')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .trim()
}
