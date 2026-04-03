import { NextResponse } from 'next/server'

const SHEET_ID = '1tEgx2iZlN4mA8gBPDtF5rFSKUqmxUrAWHiJ-Oo436LI'
const GID = '17898626'

export async function GET() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'No se pudo acceder a Google Sheets. Verifica que el documento sea público.' },
        { status: response.status }
      )
    }

    const csv = await response.text()
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Error fetching Google Sheets:', error)
    return NextResponse.json(
      { error: 'Error de red al obtener la hoja de cálculo.' },
      { status: 500 }
    )
  }
}
