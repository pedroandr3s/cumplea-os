"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Tag, Building2, Save, X } from "lucide-react"

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

declare global {
  interface Window {
    google: any
    __gmapsLoaded?: boolean
  }
}

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.__gmapsLoaded || window.google?.maps?.places) {
      window.__gmapsLoaded = true
      resolve()
      return
    }
    if (document.querySelector('script[data-gm="1"]')) {
      // Script already injected, wait for it
      const check = setInterval(() => {
        if (window.google?.maps?.places) {
          window.__gmapsLoaded = true
          clearInterval(check)
          resolve()
        }
      }, 100)
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es&region=CL`
    script.async = true
    script.setAttribute('data-gm', '1')
    script.onload = () => {
      window.__gmapsLoaded = true
      resolve()
    }
    document.head.appendChild(script)
  })
}

export default function LocationForm({ onSave, onClearPending }: LocationFormProps) {
  const [name, setName] = useState("")
  const [promotion, setPromotion] = useState("")
  const [selectedAddress, setSelectedAddress] = useState<{
    display_name: string
    lat: number
    lng: number
  } | null>(null)

  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)

  // Load Google Maps and initialize Places Autocomplete
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || typeof window === 'undefined') return

    loadGoogleMapsScript(apiKey).then(() => {
      if (!addressInputRef.current || autocompleteRef.current) return

      const autocomplete = new window.google.maps.places.Autocomplete(
        addressInputRef.current,
        {
          componentRestrictions: { country: 'cl' },
          fields: ['formatted_address', 'geometry', 'name'],
          types: ['address'],
        }
      )

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (place.geometry?.location) {
          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          const address = shortenAddress(place.formatted_address || place.name || '')
          setSelectedAddress({ display_name: address, lat, lng })
          // Update the input to show the cleaned address
          if (addressInputRef.current) {
            addressInputRef.current.value = address
          }
        }
      })

      autocompleteRef.current = autocomplete
    })
  }, [])

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

  const handleAddressInput = () => {
    // Clear selected address when user types manually (before selecting a suggestion)
    if (selectedAddress) {
      setSelectedAddress(null)
    }
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
    setPromotion("")
    setSelectedAddress(null)
    if (addressInputRef.current) addressInputRef.current.value = ""
  }

  const handleCancel = () => {
    setName("")
    setPromotion("")
    setSelectedAddress(null)
    if (addressInputRef.current) addressInputRef.current.value = ""
    onClearPending()
  }

  const hasContent = name || selectedAddress || promotion

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Agregar Ubicación
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Busca una dirección en Chillán con Google Maps
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

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Dirección en Chillán
            </label>
            <input
              ref={addressInputRef}
              type="text"
              onChange={handleAddressInput}
              placeholder="Escribe para buscar con Google Maps..."
              className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors bg-background outline-none focus:ring-1 focus:ring-ring ${
                selectedAddress
                  ? 'border-green-400 focus:ring-green-400'
                  : 'border-input'
              }`}
              autoComplete="off"
            />
            {selectedAddress && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Ubicación confirmada por Google Maps
              </p>
            )}
            {!selectedAddress && (
              <p className="text-xs text-muted-foreground">
                Selecciona una opción del desplegable de Google
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
