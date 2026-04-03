import type { Location } from "./types"

// Punto de destino fijo: Constitución 901, Chillán
export const FIXED_DESTINATION = {
  lat: -36.6075,
  lng: -72.1028,
  name: "Destino Final",
  address: "Constitución 901, Chillán"
}

// Get walking distance between two points using OSRM
async function getWalkingDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): Promise<number> {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/foot/${lng1},${lat1};${lng2},${lat2}?overview=false`
    )
    const data = await response.json()
    if (data.routes && data.routes[0]) {
      return data.routes[0].distance / 1000
    }
  } catch (error) {
    console.error("Error getting walking distance:", error)
  }
  return haversineDistance(lat1, lng1, lat2, lng2)
}

// Get walking route geometry between multiple points
export async function getWalkingRoute(
  locations: Location[]
): Promise<[number, number][]> {
  if (locations.length < 2) return []
  
  const coordinates = locations
    .map((loc) => `${loc.lng},${loc.lat}`)
    .join(";")
  
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/foot/${coordinates}?overview=full&geometries=geojson`
    )
    const data = await response.json()
    
    if (data.routes && data.routes[0] && data.routes[0].geometry) {
      return data.routes[0].geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      )
    }
  } catch (error) {
    console.error("Error getting walking route:", error)
  }
  
  return locations.map((loc) => [loc.lat, loc.lng])
}

// Haversine formula fallback
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// Build complete distance matrix using Haversine (instant, no API rate limits).
// OSRM is only used for the final route geometry rendering, not for optimization.
function buildDistanceMatrix(
  locations: Location[],
  destination: { lat: number; lng: number }
): number[][] {
  const n = locations.length + 1
  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0))

  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      const dist = haversineDistance(
        locations[i].lat, locations[i].lng,
        locations[j].lat, locations[j].lng
      )
      matrix[i][j] = dist
      matrix[j][i] = dist
    }
  }

  for (let i = 0; i < locations.length; i++) {
    const dist = haversineDistance(
      locations[i].lat, locations[i].lng,
      destination.lat, destination.lng
    )
    matrix[i][locations.length] = dist
    matrix[locations.length][i] = dist
  }

  return matrix
}

// Calculate route cost for a given order
function calculateRouteCost(
  order: number[],
  distanceMatrix: number[][],
  destinationIndex: number
): number {
  let cost = 0
  for (let i = 0; i < order.length - 1; i++) {
    cost += distanceMatrix[order[i]][order[i + 1]]
  }
  // Add distance from last point to destination
  cost += distanceMatrix[order[order.length - 1]][destinationIndex]
  return cost
}

// Generate all permutations of an array (for small arrays)
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  const result: T[][] = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    const perms = permutations(rest)
    for (const perm of perms) {
      result.push([arr[i], ...perm])
    }
  }
  return result
}

// 2-opt improvement for larger routes
function twoOptImprove(
  route: number[],
  distanceMatrix: number[][],
  destinationIndex: number
): number[] {
  let improved = true
  let bestRoute = [...route]
  
  while (improved) {
    improved = false
    for (let i = 1; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const newRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ]
        
        const currentCost = calculateRouteCost(bestRoute, distanceMatrix, destinationIndex)
        const newCost = calculateRouteCost(newRoute, distanceMatrix, destinationIndex)
        
        if (newCost < currentCost) {
          bestRoute = newRoute
          improved = true
        }
      }
    }
  }
  
  return bestRoute
}

// Optimize route with fixed start and fixed end (destination)
export async function optimizeRoute(
  locations: Location[],
  startPointId: string
): Promise<{ route: Location[]; totalDistance: number }> {
  if (locations.length === 0) {
    return { route: [], totalDistance: 0 }
  }

  if (locations.length === 1) {
    const dist = haversineDistance(
      locations[0].lat, locations[0].lng,
      FIXED_DESTINATION.lat, FIXED_DESTINATION.lng
    )
    return {
      route: [{ ...locations[0], order: 1, status: locations[0].status ?? "pendiente", selected: true }],
      totalDistance: dist
    }
  }

  const startIndex = locations.findIndex((loc) => loc.id === startPointId)
  if (startIndex === -1) {
    return {
      route: locations.map((l, i) => ({ ...l, order: i + 1, status: l.status ?? "pendiente", selected: true })),
      totalDistance: 0
    }
  }

  // Build distance matrix including destination (synchronous Haversine)
  const distanceMatrix = buildDistanceMatrix(locations, FIXED_DESTINATION)
  const destinationIndex = locations.length

  // Get indices of non-start locations
  const otherIndices = locations
    .map((_, i) => i)
    .filter(i => i !== startIndex)

  let bestOrder: number[]
  let bestCost = Infinity

  // For small number of intermediate points, try all permutations
  if (otherIndices.length <= 6) {
    const allPerms = permutations(otherIndices)
    
    for (const perm of allPerms) {
      const order = [startIndex, ...perm]
      const cost = calculateRouteCost(order, distanceMatrix, destinationIndex)
      
      if (cost < bestCost) {
        bestCost = cost
        bestOrder = order
      }
    }
  } else {
    // For larger sets, use nearest neighbor + 2-opt improvement
    const visited = new Set<number>([startIndex])
    bestOrder = [startIndex]
    let currentIndex = startIndex

    while (visited.size < locations.length) {
      let nearestIndex = -1
      let nearestDistance = Infinity

      for (let i = 0; i < locations.length; i++) {
        if (!visited.has(i)) {
          // Consider both distance to this point AND its distance to destination
          // This helps avoid going far from destination
          const distToPoint = distanceMatrix[currentIndex][i]
          const distToDestFromPoint = distanceMatrix[i][destinationIndex]
          // Weight: prioritize nearby points that are also closer to destination
          const score = distToPoint + (distToDestFromPoint * 0.3)
          
          if (score < nearestDistance) {
            nearestDistance = score
            nearestIndex = i
          }
        }
      }

      if (nearestIndex !== -1) {
        visited.add(nearestIndex)
        bestOrder.push(nearestIndex)
        currentIndex = nearestIndex
      }
    }

    // Apply 2-opt improvement
    bestOrder = twoOptImprove(bestOrder, distanceMatrix, destinationIndex)
    bestCost = calculateRouteCost(bestOrder, distanceMatrix, destinationIndex)
  }

  // Build the optimized route
  const route = bestOrder!.map((idx, i) => ({
    ...locations[idx],
    order: i + 1,
    status: locations[idx].status ?? "pendiente",
    selected: true,
  }))

  return { route, totalDistance: bestCost }
}

// Export destination for use in map
export function getDestination(): Location {
  return {
    id: "destination-fixed",
    name: FIXED_DESTINATION.name,
    address: FIXED_DESTINATION.address,
    promotion: "",
    lat: FIXED_DESTINATION.lat,
    lng: FIXED_DESTINATION.lng,
    status: "pendiente",
    selected: true,
    order: 999
  }
}
