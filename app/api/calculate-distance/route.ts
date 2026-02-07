import { NextResponse } from "next/server"

interface GeocodeResult {
  lat: number
  lon: number
  formatted: string
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
    const { fromAddress, toAddress } = body

    if (!fromAddress || !toAddress) {
      return NextResponse.json(
        { error: "Missing fromAddress or toAddress" },
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

    // Geocode both addresses
    const [fromCoords, toCoords] = await Promise.all([
      geocodeAddress(fromAddress, apiKey),
      geocodeAddress(toAddress, apiKey),
    ])

    if (!fromCoords) {
      return NextResponse.json(
        { error: "Could not geocode origin address", fromAddress },
        { status: 400 }
      )
    }

    if (!toCoords) {
      return NextResponse.json(
        { error: "Could not geocode destination address", toAddress },
        { status: 400 }
      )
    }

    // Get route/distance using Geoapify Routing API
    const routeUrl = `https://api.geoapify.com/v1/routing?waypoints=${fromCoords.lat},${fromCoords.lon}|${toCoords.lat},${toCoords.lon}&mode=drive&apiKey=${apiKey}`

    const routeResponse = await fetch(routeUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })

    if (!routeResponse.ok) {
      return NextResponse.json(
        { error: "Could not calculate route" },
        { status: 502 }
      )
    }

    const routeData = await routeResponse.json()
    const route = routeData?.features?.[0]

    if (!route) {
      return NextResponse.json(
        { error: "No route found between addresses" },
        { status: 404 }
      )
    }

    const distanceMeters = route.properties?.distance || 0
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10 // Round to 1 decimal
    const durationSeconds = route.properties?.time || 0
    const durationMinutes = Math.round(durationSeconds / 60)

    // Generate static map URL with route markers
    const staticMapUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=600&height=300&marker=lonlat:${fromCoords.lon},${fromCoords.lat};type:awesome;color:%23bb3f73;size:large|lonlat:${toCoords.lon},${toCoords.lat};type:awesome;color:%231da1f2;size:large&apiKey=${apiKey}`

    return NextResponse.json({
      success: true,
      from: {
        address: fromCoords.formatted,
        lat: fromCoords.lat,
        lon: fromCoords.lon,
      },
      to: {
        address: toCoords.formatted,
        lat: toCoords.lat,
        lon: toCoords.lon,
      },
      distance: {
        km: distanceKm,
        meters: distanceMeters,
      },
      duration: {
        minutes: durationMinutes,
        seconds: durationSeconds,
      },
      mapUrl: staticMapUrl,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Distance calculation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
