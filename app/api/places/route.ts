import { NextRequest, NextResponse } from 'next/server'

// Proxy for Google Places Autocomplete — keeps API key server-side only
export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input')
  if (!input || input.length < 2) return NextResponse.json([])

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return NextResponse.json([])

  const sessiontoken = req.nextUrl.searchParams.get('sessiontoken') || ''

  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(input + ', Chillán')}` +
    `&components=country:cl` +
    `&language=es` +
    `&sessiontoken=${sessiontoken}` +
    `&key=${key}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places API:', data.status, data.error_message)
      return NextResponse.json([])
    }

    return NextResponse.json(data.predictions ?? [])
  } catch (err) {
    console.error('Places proxy error:', err)
    return NextResponse.json([])
  }
}
