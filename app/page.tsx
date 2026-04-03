"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import LocationForm from "@/components/location-form"
import LocationsList from "@/components/locations-list"
import type { Location, VisitStatus } from "@/lib/types"
import { optimizeRoute, getWalkingRoute, getDestination, FIXED_DESTINATION } from "@/lib/route-optimizer"
import { fetchGoogleSheetData } from "@/lib/google-sheets"
import { saveRouteToSupabase, updatePointStatus, logImport } from "@/lib/supabase"
import { Route } from "lucide-react"

const MapComponent = dynamic(() => import("@/components/map-component"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/30">
      <div className="text-muted-foreground">Cargando mapa...</div>
    </div>
  ),
})

export default function RoutePlannerPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [startPointId, setStartPointId] = useState<string | null>(null)
  const [optimizedRouteData, setOptimizedRouteData] = useState<Location[]>([])
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([])
  const [isRouteGenerated, setIsRouteGenerated] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [totalDistance, setTotalDistance] = useState(0)
  const [pendingLocation, setPendingLocation] = useState<{
    lat: number
    lng: number
    address: string
  } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, lugar: "" })
  const [importError, setImportError] = useState<string | null>(null)

  const handleMapClick = useCallback(
    (lat: number, lng: number, address: string) => {
      if (isRouteGenerated) return
      setPendingLocation({ lat, lng, address })
    },
    [isRouteGenerated]
  )

  const handleSaveLocation = (data: {
    name: string
    address: string
    promotion: string
    lat: number
    lng: number
  }) => {
    const newLocation: Location = {
      id: crypto.randomUUID(),
      name: data.name,
      address: data.address,
      promotion: data.promotion,
      lat: data.lat,
      lng: data.lng,
      status: "pendiente",
      selected: true,
    }

    setLocations((prev) => [...prev, newLocation])
    setPendingLocation(null)

    if (locations.length === 0) {
      setStartPointId(newLocation.id)
    }
  }

  const handleImportFromSheets = async () => {
    setIsImporting(true)
    setImportError(null)
    setImportProgress({ current: 0, total: 0, lugar: "" })

    try {
      const rows = await fetchGoogleSheetData((current, total, lugar) => {
        setImportProgress({ current, total, lugar })
      })

      const newLocations: Location[] = rows.map((row) => ({
        id: crypto.randomUUID(),
        name: row.lugar,
        address: row.direccion || row.lugar,
        promotion: row.promocion,
        lat: row.lat,
        lng: row.lng,
        status: "pendiente" as VisitStatus,
        selected: true,
      }))

      setLocations(newLocations)
      setStartPointId(newLocations.length > 0 ? newLocations[0].id : null)

      // Log import to Supabase (fire and forget)
      logImport(newLocations.length).catch(() => {})
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido al importar"
      setImportError(msg)
    } finally {
      setIsImporting(false)
    }
  }

  const handleToggleLocation = (id: string) => {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, selected: !loc.selected } : loc))
    )
    // If deselecting the start point, clear it
    if (id === startPointId) {
      const loc = locations.find((l) => l.id === id)
      if (loc?.selected) setStartPointId(null)
    }
  }

  const handleSetStart = (id: string) => {
    setStartPointId(id || null)
  }

  const handleDelete = (id: string) => {
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
    if (startPointId === id) {
      const remaining = locations.filter((l) => l.id !== id && l.selected)
      setStartPointId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  const handleGenerateRoute = async () => {
    const selectedLocations = locations.filter((l) => l.selected)
    if (selectedLocations.length < 1) return

    setIsGenerating(true)
    try {
      // If user picked a valid start point use it; otherwise try all and pick shortest
      const validStart = startPointId && selectedLocations.find((l) => l.id === startPointId)
        ? startPointId
        : null

      const idsToTry = validStart ? [validStart] : selectedLocations.map((l) => l.id)

      let bestRoute: Location[] = []
      let bestDistance = Infinity

      for (const id of idsToTry) {
        const { route, totalDistance } = await optimizeRoute(selectedLocations, id)
        if (totalDistance < bestDistance) {
          bestDistance = totalDistance
          bestRoute = route
        }
      }

      const destination = getDestination()
      destination.order = bestRoute.length + 1
      const routeWithDestination = [...bestRoute, destination]

      setOptimizedRouteData(routeWithDestination)
      setTotalDistance(bestDistance)

      const geometry = await getWalkingRoute(routeWithDestination)
      setRouteGeometry(geometry)

      setIsRouteGenerated(true)

      // Save to Supabase (fire and forget, update supabaseIds if successful)
      saveRouteToSupabase(routeWithDestination, distance).then((result) => {
        if (result) {
          setOptimizedRouteData((prev) =>
            prev.map((loc) =>
              result.pointIds[loc.id]
                ? { ...loc, supabaseId: result.pointIds[loc.id] }
                : loc
            )
          )
        }
      }).catch(() => {})
    } catch (error) {
      console.error("Error generating route:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: VisitStatus) => {
    setOptimizedRouteData((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, status } : loc))
    )

    // Also update in the main locations list
    setLocations((prev) =>
      prev.map((loc) => (loc.id === id ? { ...loc, status } : loc))
    )

    // Persist to Supabase
    const loc = optimizedRouteData.find((l) => l.id === id)
    if (loc?.supabaseId) {
      updatePointStatus(loc.supabaseId, status).catch(() => {})
    }
  }

  const handleResetRoute = () => {
    setOptimizedRouteData([])
    setRouteGeometry([])
    setIsRouteGenerated(false)
    setTotalDistance(0)
    setLocations((prev) => prev.map((loc) => ({ ...loc, status: "pendiente" as VisitStatus })))
  }

  const handleClearPending = () => {
    setPendingLocation(null)
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Route className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Planificador de Rutas - Chillán
            </h1>
            <p className="text-sm text-muted-foreground">
              Optimiza tu recorrido caminando por las mejores promociones
            </p>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:overflow-hidden lg:flex-row lg:gap-6 lg:p-6">
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[420px] lg:overflow-hidden">
          {!isRouteGenerated && (
            <LocationForm
              onSave={handleSaveLocation}
              onClearPending={handleClearPending}
            />
          )}
          <div className="h-[480px] lg:h-auto lg:min-h-0 lg:flex-1">
            <LocationsList
              locations={locations}
              optimizedRoute={optimizedRouteData}
              isRouteGenerated={isRouteGenerated}
              isGenerating={isGenerating}
              isImporting={isImporting}
              importProgress={importProgress}
              importError={importError}
              startPointId={startPointId}
              onSetStart={handleSetStart}
              onDelete={handleDelete}
              onToggleLocation={handleToggleLocation}
              onUpdateStatus={handleUpdateStatus}
              onGenerateRoute={handleGenerateRoute}
              onResetRoute={handleResetRoute}
              onImportFromSheets={handleImportFromSheets}
              totalDistance={totalDistance}
            />
          </div>
        </aside>

        <section className="min-h-[350px] flex-1 overflow-hidden rounded-xl border border-border shadow-sm lg:min-h-0">
          <MapComponent
            locations={locations}
            optimizedRoute={optimizedRouteData}
            isRouteGenerated={isRouteGenerated}
            startPointId={startPointId}
            routeGeometry={routeGeometry}
            onMapClick={handleMapClick}
          />
        </section>
      </main>
    </div>
  )
}
