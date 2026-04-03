export type VisitStatus = 'pendiente' | 'logrado' | 'no_logrado' | 'no_fui'

export interface Location {
  id: string
  name: string
  address: string
  promotion: string
  lat: number
  lng: number
  status: VisitStatus
  selected: boolean
  order?: number
  supabaseId?: string
}

export interface RouteState {
  locations: Location[]
  startPointId: string | null
  optimizedRoute: Location[]
  isRouteGenerated: boolean
}
