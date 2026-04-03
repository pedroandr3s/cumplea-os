"use client"

import { useEffect, useRef, useState } from "react"
import type { Location } from "@/lib/types"

interface MapComponentProps {
  locations: Location[]
  optimizedRoute: Location[]
  isRouteGenerated: boolean
  startPointId: string | null
  routeGeometry: [number, number][]
  onMapClick: (lat: number, lng: number, address: string) => void
}

// Centro de Chillán, Ñuble, Chile
const CHILLAN_CENTER = { lat: -36.6066, lng: -72.1034 }
const DEFAULT_ZOOM = 14

function getMarkerColor(location: Location, isStart: boolean, isDestination: boolean): string {
  if (isDestination) return "#8b5cf6"              // purple
  if (location.status === "logrado") return "#22c55e"    // green
  if (location.status === "no_logrado") return "#ef4444" // red
  if (location.status === "no_fui") return "#9ca3af"     // gray
  if (isStart) return "#3b82f6"                          // blue
  return "#f97316"                                       // orange (pendiente)
}

function getMarkerLabel(location: Location, isDestination: boolean, orderNumber: number | null | undefined): string {
  if (isDestination) return "★"
  if (location.status === "logrado") return "✓"
  if (location.status === "no_logrado") return "✗"
  if (location.status === "no_fui") return "—"
  if (orderNumber != null) return String(orderNumber)
  return "•"
}

export default function MapComponent({
  locations,
  optimizedRoute,
  isRouteGenerated,
  startPointId,
  routeGeometry,
  onMapClick,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [L, setL] = useState<any>(null)

  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick

  // Load Leaflet from CDN
  useEffect(() => {
    if (typeof window === "undefined") return

    const existingL = (window as any).L
    if (existingL) {
      setL(existingL)
      setIsLoaded(true)
      return
    }

    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    link.crossOrigin = "anonymous"
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.crossOrigin = "anonymous"
    script.onload = () => {
      const leaflet = (window as any).L
      setL(leaflet)
      setIsLoaded(true)
    }
    document.body.appendChild(script)
  }, [])

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !L || !mapContainerRef.current || mapRef.current) return

    mapRef.current = L.map(mapContainerRef.current).setView(
      [CHILLAN_CENTER.lat, CHILLAN_CENTER.lng],
      DEFAULT_ZOOM
    )

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapRef.current)

    mapRef.current.on("click", async (e: any) => {
      const { lat, lng } = e.latlng
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        )
        const data = await response.json()
        const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        onMapClickRef.current(lat, lng, address)
      } catch {
        onMapClickRef.current(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [isLoaded, L])

  // Update markers and route
  useEffect(() => {
    if (!isLoaded || !L || !mapRef.current) return

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Clear existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove()
      polylineRef.current = null
    }

    const displayLocations = isRouteGenerated ? optimizedRoute : locations

    displayLocations.forEach((location) => {
      const isStart = location.id === startPointId
      const isDestination = location.id === "destination-fixed"
      const orderNumber = isRouteGenerated ? location.order : null

      const bgColor = getMarkerColor(location, isStart, isDestination)
      const label = getMarkerLabel(location, isDestination, orderNumber)

      const iconHtml = `
        <div style="
          background-color: ${bgColor};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 13px;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">${label}</div>
      `

      const icon = L.divIcon({
        html: iconHtml,
        className: "custom-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })

      const statusLabel = location.status === "logrado" ? "✓ Logrado"
        : location.status === "no_logrado" ? "✗ No logrado"
        : location.status === "no_fui" ? "— No fui"
        : ""

      const marker = L.marker([location.lat, location.lng], { icon })
        .addTo(mapRef.current!)
        .bindPopup(`
          <div style="min-width: 160px;">
            <strong>${location.name}</strong><br/>
            <span style="font-size:12px;color:#666;">${location.address}</span><br/>
            ${location.promotion ? `<span style="color:#22c55e;font-weight:500;">${location.promotion}</span><br/>` : ""}
            ${statusLabel ? `<span style="font-size:11px;font-weight:600;color:${bgColor};">${statusLabel}</span>` : ""}
          </div>
        `)

      markersRef.current.push(marker)
    })

    // Draw walking route polyline
    if (isRouteGenerated && routeGeometry.length > 1) {
      polylineRef.current = L.polyline(routeGeometry, {
        color: "#3b82f6",
        weight: 5,
        opacity: 0.8,
      }).addTo(mapRef.current)
    }

    // Fit bounds
    if (displayLocations.length > 0) {
      const bounds = L.latLngBounds(
        displayLocations.map((loc: Location) => [loc.lat, loc.lng])
      )
      mapRef.current.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [isLoaded, L, locations, optimizedRoute, isRouteGenerated, startPointId, routeGeometry])

  return (
    <div className="relative h-full w-full">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg">
          <div className="text-muted-foreground">Cargando mapa...</div>
        </div>
      )}
      <div
        ref={mapContainerRef}
        className="h-full w-full rounded-lg"
        style={{ minHeight: "400px" }}
      />
    </div>
  )
}
