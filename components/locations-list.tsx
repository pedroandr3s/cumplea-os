"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Play,
  Trash2,
  Route,
  MapPin,
  ListOrdered,
  RotateCcw,
  Sheet,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  AlertCircle,
} from "lucide-react"
import type { Location, VisitStatus } from "@/lib/types"

interface LocationsListProps {
  locations: Location[]
  optimizedRoute: Location[]
  isRouteGenerated: boolean
  isGenerating: boolean
  isImporting: boolean
  importProgress: { current: number; total: number; lugar: string }
  importError: string | null
  startPointId: string | null
  onSetStart: (id: string) => void
  onDelete: (id: string) => void
  onToggleLocation: (id: string) => void
  onUpdateStatus: (id: string, status: VisitStatus) => void
  onGenerateRoute: () => void
  onResetRoute: () => void
  onImportFromSheets: () => void
  totalDistance: number
}

const STATUS_CONFIG: Record<
  VisitStatus,
  { label: string; bgClass: string; borderClass: string; badgeClass: string }
> = {
  pendiente: {
    label: "Pendiente",
    bgClass: "bg-card",
    borderClass: "border-border",
    badgeClass: "bg-slate-100 text-slate-600",
  },
  logrado: {
    label: "Logrado",
    bgClass: "bg-green-50",
    borderClass: "border-green-400",
    badgeClass: "bg-green-100 text-green-700",
  },
  no_logrado: {
    label: "No logrado",
    bgClass: "bg-red-50",
    borderClass: "border-red-400",
    badgeClass: "bg-red-100 text-red-700",
  },
  no_fui: {
    label: "No fui",
    bgClass: "bg-gray-50",
    borderClass: "border-gray-300",
    badgeClass: "bg-gray-100 text-gray-500",
  },
}

export default function LocationsList({
  locations,
  optimizedRoute,
  isRouteGenerated,
  isGenerating,
  isImporting,
  importProgress,
  importError,
  startPointId,
  onSetStart,
  onDelete,
  onToggleLocation,
  onUpdateStatus,
  onGenerateRoute,
  onResetRoute,
  onImportFromSheets,
  totalDistance,
}: LocationsListProps) {
  const displayLocations = isRouteGenerated ? optimizedRoute : locations
  const logradoCount = optimizedRoute.filter((loc) => loc.status === "logrado").length
  const selectedCount = locations.filter((l) => l.selected).length

  return (
    <Card className="flex h-full flex-col border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="h-5 w-5 text-primary" />
            Ubicaciones
            {locations.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {isRouteGenerated ? optimizedRoute.length : `${selectedCount}/${locations.length}`}
              </Badge>
            )}
          </CardTitle>
        </div>
        {isRouteGenerated && (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="font-normal">
              <Route className="mr-1 h-3 w-3" />
              {totalDistance.toFixed(2)} km
            </Badge>
            <Badge
              variant={logradoCount === optimizedRoute.filter(l => l.id !== "destination-fixed").length ? "default" : "secondary"}
              className="font-normal"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {logradoCount} logrados
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden pb-4">
        {/* Import button and progress */}
        {!isRouteGenerated && (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={onImportFromSheets}
              disabled={isImporting}
              className="w-full border-green-300 text-green-700 hover:bg-green-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Sheet className="mr-2 h-4 w-4" />
                  Importar desde Google Sheets
                </>
              )}
            </Button>
            {isImporting && importProgress.total > 0 && (
              <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                <div className="mb-1 flex justify-between">
                  <span>Geocodificando direcciones…</span>
                  <span>{importProgress.current}/{importProgress.total}</span>
                </div>
                <div className="mb-1 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
                {importProgress.lugar && (
                  <p className="truncate text-[10px]">→ {importProgress.lugar}</p>
                )}
              </div>
            )}
            {importError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}
          </div>
        )}

        {locations.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MapPin className="h-10 w-10 opacity-40" />
            <p className="text-sm">No hay ubicaciones</p>
            <p className="text-xs">Importa desde Google Sheets o haz clic en el mapa</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-3">
              <div className="flex flex-col gap-2">
                {displayLocations.map((location) => {
                  const isDestination = location.id === "destination-fixed"
                  const cfg = STATUS_CONFIG[location.status ?? "pendiente"]

                  return (
                    <div
                      key={location.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isDestination
                          ? "border-purple-400 bg-purple-50"
                          : isRouteGenerated
                          ? `${cfg.bgClass} ${cfg.borderClass}`
                          : location.id === startPointId
                          ? "border-primary/50 bg-primary/5"
                          : !location.selected
                          ? "border-border/40 bg-muted/30 opacity-60"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Checkbox (pre-route) */}
                        {!isRouteGenerated && !isDestination && (
                          <input
                            type="checkbox"
                            checked={location.selected}
                            onChange={() => onToggleLocation(location.id)}
                            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isRouteGenerated && (
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                                  isDestination
                                    ? "bg-purple-500"
                                    : location.status === "logrado"
                                    ? "bg-green-500"
                                    : location.status === "no_logrado"
                                    ? "bg-red-500"
                                    : location.status === "no_fui"
                                    ? "bg-gray-400"
                                    : "bg-primary"
                                }`}
                              >
                                {isDestination ? "★" : location.order}
                              </span>
                            )}
                            <span className="truncate font-medium text-sm">
                              {location.name}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {location.address}
                          </p>
                          {location.promotion && (
                            <p className="mt-1 text-xs font-medium text-accent">
                              {location.promotion}
                            </p>
                          )}
                          {/* Status badge (after route) */}
                          {isRouteGenerated && !isDestination && (
                            <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cfg.badgeClass}`}>
                              {cfg.label}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 flex-col gap-1">
                          {!isRouteGenerated && !isDestination && (
                            <>
                              <Button
                                variant={location.id === startPointId ? "default" : "ghost"}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => onSetStart(location.id === startPointId ? "" : location.id)}
                                title={location.id === startPointId ? "Quitar como inicio" : "Establecer como inicio (opcional)"}
                                disabled={!location.selected}
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => onDelete(location.id)}
                                title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          {/* Status buttons (after route generated) */}
                          {isRouteGenerated && !isDestination && (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => onUpdateStatus(location.id, "logrado")}
                                title="Logrado"
                                className={`flex h-6 w-6 items-center justify-center rounded transition-opacity ${
                                  location.status === "logrado"
                                    ? "opacity-100"
                                    : "opacity-40 hover:opacity-80"
                                }`}
                              >
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              </button>
                              <button
                                onClick={() => onUpdateStatus(location.id, "no_logrado")}
                                title="No logrado"
                                className={`flex h-6 w-6 items-center justify-center rounded transition-opacity ${
                                  location.status === "no_logrado"
                                    ? "opacity-100"
                                    : "opacity-40 hover:opacity-80"
                                }`}
                              >
                                <XCircle className="h-5 w-5 text-red-500" />
                              </button>
                              <button
                                onClick={() => onUpdateStatus(location.id, "no_fui")}
                                title="No fui"
                                className={`flex h-6 w-6 items-center justify-center rounded transition-opacity ${
                                  location.status === "no_fui"
                                    ? "opacity-100"
                                    : "opacity-40 hover:opacity-80"
                                }`}
                              >
                                <MinusCircle className="h-5 w-5 text-gray-400" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {!isRouteGenerated ? (
                <>
                  <Button
                    onClick={onGenerateRoute}
                    disabled={selectedCount < 1 || isGenerating}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Calculando ruta…
                      </>
                    ) : (
                      <>
                        <Route className="mr-2 h-4 w-4" />
                        Generar Ruta Óptima
                      </>
                    )}
                  </Button>
                  {selectedCount >= 1 && (
                    <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      <p>
                        <strong>Destino final fijo:</strong> Constitución 923
                      </p>
                      <p className="mt-0.5">
                        {startPointId
                          ? <span className="text-primary">Inicio seleccionado <Play className="inline h-3 w-3" /></span>
                          : <span>Inicio automático — el sistema elige el mejor punto</span>
                        }
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Status legend */}
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Logrado</span>
                    <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3 w-3" /> No logrado</span>
                    <span className="flex items-center gap-1 text-gray-400"><MinusCircle className="h-3 w-3" /> No fui</span>
                  </div>
                  <Button variant="outline" onClick={onResetRoute} className="w-full">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reiniciar Ruta
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
