"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Tag, Building2, Save, X, Loader2 } from "lucide-react"

interface AddressSuggestion {
  display_name: string
  lat: string
  lon: string
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

export default function LocationForm({
  onSave,
  onClearPending,
}: LocationFormProps) {
  const [name, setName] = useState("")
  const [addressQuery, setAddressQuery] = useState("")
  const [selectedAddress, setSelectedAddress] = useState<{
    display_name: string
    lat: number
    lng: number
  } | null>(null)
  const [promotion, setPromotion] = useState("")
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Buscar direcciones mientras el usuario escribe
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (addressQuery.length < 3 || selectedAddress) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        // Buscar en Chillan, Nuble, Chile usando Nominatim
        const query = encodeURIComponent(`${addressQuery}, Chillán, Ñuble, Chile`)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=6&addressdetails=1`
        )
        const data = await response.json()
        
        // Filtrar solo resultados de Chillan
        const filteredResults = data.filter((item: AddressSuggestion & { address?: { city?: string; town?: string; state?: string } }) => {
          const displayLower = item.display_name.toLowerCase()
          return displayLower.includes("chillán") || displayLower.includes("chillan") || displayLower.includes("ñuble") || displayLower.includes("nuble")
        })
        
        setSuggestions(filteredResults)
        setShowSuggestions(filteredResults.length > 0)
      } catch (error) {
        console.error("Error buscando direcciones:", error)
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [addressQuery, selectedAddress])

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setSelectedAddress({
      display_name: suggestion.display_name,
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon),
    })
    setAddressQuery(suggestion.display_name)
    setShowSuggestions(false)
    setSuggestions([])
  }

  const handleAddressChange = (value: string) => {
    setAddressQuery(value)
    setSelectedAddress(null)
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
    setSelectedAddress(null)
    setPromotion("")
  }

  const handleCancel = () => {
    setName("")
    setAddressQuery("")
    setSelectedAddress(null)
    setPromotion("")
    onClearPending()
  }

  const formatAddress = (displayName: string) => {
    // Acortar la direccion para mostrar en el listado
    const parts = displayName.split(",")
    return parts.slice(0, 3).join(",")
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Agregar Ubicacion
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Busca una direccion en Chillan y selecciona del listado
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

          <div className="relative flex flex-col gap-1.5" ref={suggestionsRef}>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Direccion en Chillan
            </label>
            <div className="relative">
              <Input
                value={addressQuery}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder="Escribe para buscar... Ej: El Roble 560"
                className={`bg-background pr-8 ${selectedAddress ? "border-accent text-accent-foreground" : ""}`}
              />
              {isSearching && (
                <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            
            {selectedAddress && (
              <p className="text-xs text-accent">
                Direccion seleccionada correctamente
              </p>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-card shadow-lg">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                    onClick={() => handleSelectSuggestion(suggestion)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="line-clamp-2">{formatAddress(suggestion.display_name)}</span>
                  </button>
                ))}
              </div>
            )}

            {showSuggestions && suggestions.length === 0 && !isSearching && addressQuery.length >= 3 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground shadow-lg">
                No se encontraron direcciones. Intenta con otro termino.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Promocion
            </label>
            <Input
              value={promotion}
              onChange={(e) => setPromotion(e.target.value)}
              placeholder="Ej: 20% de descuento en lacteos"
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
            {(name || addressQuery || promotion) && (
              <Button type="button" variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {!selectedAddress && addressQuery.length > 0 && addressQuery.length < 3 && (
            <p className="text-xs text-muted-foreground">
              Escribe al menos 3 caracteres para buscar
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
