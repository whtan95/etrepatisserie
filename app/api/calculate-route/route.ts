import { NextResponse } from "next/server"

interface GeocodeResult {
  lat: number
  lon: number
  formatted: string
}

interface WaypointInput {
  address: string
  lat?: number
  lon?: number
}

interface RouteLeg {
  from: string
  to: string
  distanceKm: number
  durationMinutes: number
}

async function geocodeAddress(address: string, apiKey: string): Promise<GeocodeResult | null> {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&limit=1&apiKey=${apiKey}`

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })

    if (!response.ok) return null

    const data = await response.json()
    const feature = data?.features?.[0]

    if (!feature) return null

    return {
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      formatted: feature.properties?.formatted || address,
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { waypoints } = body as { waypoints: WaypointInput[] }

    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return NextResponse.json(
        { error: "At least 2 waypoints are required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Geoapify API key not configured" },
        { status: 500 }
      )
    }

    // Geocode waypoints that don't have coordinates
    const geocodedWaypoints: (GeocodeResult & { originalAddress: string })[] = []

    for (const wp of waypoints) {
      if (wp.lat !== undefined && wp.lon !== undefined) {
        // Already has coordinates
        geocodedWaypoints.push({
          lat: wp.lat,
          lon: wp.lon,
          formatted: wp.address,
          originalAddress: wp.address,
        })
      } else {
        // Need to geocode
        const result = await geocodeAddress(wp.address, apiKey)
        if (!result) {
          return NextResponse.json(
            {
              success: false,
              error: `Could not geocode address: ${wp.address}`,
              failedAddress: wp.address,
            },
            { status: 400 }
          )
        }
        geocodedWaypoints.push({
          ...result,
          originalAddress: wp.address,
        })
      }
    }

    // Build waypoints string for Geoapify Routing API
    const waypointsString = geocodedWaypoints
      .map(wp => `${wp.lat},${wp.lon}`)
      .join("|")

    // Get route using Geoapify Routing API
    const routeUrl = `https://api.geoapify.com/v1/routing?waypoints=${waypointsString}&mode=drive&details=route_details&apiKey=${apiKey}`

    const routeResponse = await fetch(routeUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })

    if (!routeResponse.ok) {
      return NextResponse.json(
        { success: false, error: "Could not calculate route" },
        { status: 502 }
      )
    }

    const routeData = await routeResponse.json()
    const route = routeData?.features?.[0]

    if (!route) {
      return NextResponse.json(
        { success: false, error: "No route found between waypoints" },
        { status: 404 }
      )
    }

    // Extract route properties
    const distanceMeters = route.properties?.distance || 0
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10
    const durationSeconds = route.properties?.time || 0
    const durationMinutes = Math.round(durationSeconds / 60)

    // Extract legs information
    const legs: RouteLeg[] = []
    const routeLegs = route.properties?.legs || []

    for (let i = 0; i < routeLegs.length; i++) {
      const leg = routeLegs[i]
      legs.push({
        from: geocodedWaypoints[i]?.formatted || `Waypoint ${i + 1}`,
        to: geocodedWaypoints[i + 1]?.formatted || `Waypoint ${i + 2}`,
        distanceKm: Math.round((leg.distance || 0) / 1000 * 10) / 10,
        durationMinutes: Math.round((leg.time || 0) / 60),
      })
    }

    // Get the geometry for rendering on map
    const geometry = route.geometry

    return NextResponse.json({
      success: true,
      route: {
        totalDistanceKm: distanceKm,
        totalDurationMinutes: durationMinutes,
        geometry,
        legs,
      },
      waypoints: geocodedWaypoints.map(wp => ({
        address: wp.formatted,
        originalAddress: wp.originalAddress,
        lat: wp.lat,
        lon: wp.lon,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Route calculation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

// GET endpoint for geocoding a single address
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get("address")

    if (!address) {
      return NextResponse.json(
        { error: "Address parameter is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Geoapify API key not configured" },
        { status: 500 }
      )
    }

    const result = await geocodeAddress(address, apiKey)

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Could not geocode address" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      address: result.formatted,
      lat: result.lat,
      lon: result.lon,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Geocoding failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
