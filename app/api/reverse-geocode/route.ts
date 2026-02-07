import { NextResponse } from "next/server"

function toNumber(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = toNumber(url.searchParams.get("lat"))
  const lon = toNumber(url.searchParams.get("lon"))

  if (lat === null || lon === null) {
    return NextResponse.json({ error: "Missing or invalid lat/lon" }, { status: 400 })
  }

  const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Geoapify API key not configured" }, { status: 500 })
  }

  const upstreamUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${apiKey}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "")
      return NextResponse.json(
        {
          error: `Geoapify request failed (${upstream.status})`,
          details: details.slice(0, 500),
        },
        { status: 502 }
      )
    }

    const data = await upstream.json()
    const feature = data?.features?.[0]
    const props = feature?.properties ?? {}

    const streetName = props.street || props.name || props.district || "Unknown street"
    const fullAddress = props.formatted || streetName

    return NextResponse.json(
      { streetName, fullAddress },
      {
        status: 200,
        headers: { "cache-control": "no-store" },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: "Reverse geocoding failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

