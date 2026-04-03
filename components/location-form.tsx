"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Tag, Building2, Save, X, Loader2 } from "lucide-react"

interface Prediction {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
}

interface LocationFormProps {
  onSave: (data: {
    name: string
    address: string
    promotion: string
    lat: number
    lng: number
  }) => void
  onClearPending: () => void
}

export default function LocationForm({ onSave, onClearPending }: LocationFormProps) {
  const [name, setName] = useState("")
  const [addressQuery, setAddressQuery] = useState("")
  const [promotion, setPromotion] = useState("")
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<{
    display_name: string
    lat: number
    lng: number
  } | null>(null)

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionTokenRef = useRef(crypto.randomUUID())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Search predictions as user types
  useEffect(() => {
    if (selectedAddress) return
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (addressQuery.length < 3) {
      setPredictions([])
      setShowDropdown(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/places?input=${encodeURIComponent(addressQuery)}&sessiontoken=${sessionTokenRef.current}`
        )
        const data: Prediction[] = await res.json()
        setPredictions(data)
        setShowDropdown(data.length > 0)
      } catch {
        setPredictions([])
      } finally {
        setIsSearching(false)
      }
    }, 350)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [addressQuery, selectedAddress])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleSelectPrediction = useCallback(async (prediction: Prediction) => {
    setShowDropdown(false)
    setAddressQuery(prediction.description)
    setIsSearching(true)
    try {
      const res = await fetch(
        `/api/places/details?place_id=${prediction.place_id}&sessiontoken=${sessionTokenRef.current}`
      )
      const data = await res.json()
      if (data) {
        setSelectedAddress({ display_name: data.address, lat: data.lat, lng: data.lng })
        setAddressQuery(data.address)
      }
    } catch {
      // fallback: keep the prediction text, no coordinates
    } finally {
      setIsSearching(false)
      // Rotate session token after a completed session
      sessionTokenRef.current = crypto.randomUUID()
    }
  }, [])

  const handleAddressChange = (value: string) => {
    setAddressQuery(value)
    if (selectedAddress) setSelectedAddress(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !selectedAddress) return

    onSave({
      name: name.trim(),
      address: selectedAddress.display_name,
      promotion: promotion.trim(),
      lat: selectedAddress.lat,
      lng: selectedAddress.lng,
    })

    setName("")
    setAddressQuery("")
    setPromotion("")
    setSelectedAddress(null)
    setPredictions([])
  }

  const handleCancel = () => {
    setName("")
    setAddressQuery("")
    setPromotion("")
    setSelectedAddress(null)
    setPredictions([])
    onClearPending()
  }

  const hasContent = name || addressQuery || promotion

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Agregar Ubicación
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Busca una dirección en Chillán
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Nombre del lugar
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Supermercado Central"
              className="bg-background"
            />
          </div>

          <div className="relative flex flex-col gap-1.5" ref={dropdownRef}>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Dirección en Chillán
            </label>
            <div className="relative">
              <Input
                value={addressQuery}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="Escribe para buscar... Ej: El Roble 736"
                className={`bg-background pr-8 ${selectedAddress ? "border-green-400" : ""}`}
                autoComplete="off"
              />
              {isSearching && (
                <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {selectedAddress && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Ubicación confirmada
              </p>
            )}

            {/* Google Places suggestions dropdown */}
            {showDropdown && predictions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-card shadow-lg">
                {predictions.map((pred) => (
                  <button
                    key={pred.place_id}
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                    onClick={() => handleSelectPrediction(pred)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {pred.structured_formatting?.main_text ?? pred.description}
                      </p>
                      {pred.structured_formatting?.secondary_text && (
                        <p className="truncate text-xs text-muted-foreground">
                          {pred.structured_formatting.secondary_text}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                <p className="px-3 py-1.5 text-right text-[10px] text-muted-foreground/60">
                  powered by Google
                </p>
              </div>
            )}

            {!isSearching && !showDropdown && !selectedAddress && addressQuery.length >= 3 && predictions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No se encontraron resultados. Intenta con otra dirección.
              </p>
            )}

            {addressQuery.length > 0 && addressQuery.length < 3 && (
              <p className="text-xs text-muted-foreground">
                Escribe al menos 3 caracteres
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Promoción
            </label>
            <Input
              value={promotion}
              onChange={(e) => setPromotion(e.target.value)}
              placeholder="Ej: 20% de descuento en lácteos"
              className="bg-background"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={!name.trim() || !selectedAddress}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>
            {hasContent && (
              <Button type="button" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
