import { NextRequest, NextResponse } from 'next/server'

// Proxy for Google Geocoding API — used by the Google Sheets import flow
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json(null, { status: 400 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json(null, { status: 500 })

  const query = encodeURIComponent(`${address}, Chillán, Chile`)
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${query}` +
    `&language=es` +
    `&region=cl` +
    `&key=${key}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()

    if (data.status !== 'OK') {
      if (data.status !== 'ZERO_RESULTS') {
        console.error('Geocoding API:', data.status, data.error_message)
      }
      return NextResponse.json(null)
    }

    const loc = data.results[0].geometry.location
    const address_fmt = shortenAddress(data.results[0].formatted_address ?? '')

    return NextResponse.json({ lat: loc.lat, lng: loc.lng, address: address_fmt })
  } catch (err) {
    console.error('Geocode proxy error:', err)
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
