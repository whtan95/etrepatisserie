"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import type { GPSPoint, GPSTrackingData } from "@/lib/types"

const DEFAULT_TRACKING_INTERVAL_MS = 30 * 1000 // 30 seconds (testing)
const TRACKING_INTERVAL_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_GPS_TRACKING_INTERVAL_MS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRACKING_INTERVAL_MS
})()
const PUBLIC_GEOAPIFY_API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || ""

interface UseGPSTrackingOptions {
  onLocationUpdate?: (point: GPSPoint) => void
  onError?: (error: string) => void
}

interface UseGPSTrackingReturn {
  isTracking: boolean
  route: GPSPoint[]
  currentLocation: GPSPoint | null
  error: string | null
  startTracking: () => Promise<GPSPoint | null>
  resumeTracking: (existingRoute?: GPSPoint[]) => Promise<GPSPoint | null>
  stopTracking: () => GPSPoint | null
  getCurrentLocation: () => Promise<GPSPoint | null>
  getTrackingData: () => GPSTrackingData
}

async function reverseGeocode(lat: number, lon: number): Promise<{ streetName: string; fullAddress: string }> {
  const coords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  const fallback = { streetName: coords, fullAddress: coords }

  try {
    // Prefer same-origin API route (hides key, avoids CORS issues).
    const response = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`, { cache: "no-store" })
    if (response.ok) {
      const data = await response.json()
      if (data?.streetName || data?.fullAddress) {
        return {
          streetName: data.streetName || fallback.streetName,
          fullAddress: data.fullAddress || data.streetName || fallback.fullAddress,
        }
      }
    }
  } catch (error) {
    console.error("Reverse geocoding failed:", error)
  }

  // Fallback: direct Geoapify call from the browser (requires NEXT_PUBLIC key).
  if (!PUBLIC_GEOAPIFY_API_KEY) {
    console.warn("Geoapify API key not configured")
    return fallback
  }

  try {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${PUBLIC_GEOAPIFY_API_KEY}`,
      { cache: "no-store" }
    )
    if (!response.ok) return fallback
    const data = await response.json()

    if (data?.features?.length) {
      const props = data.features[0].properties ?? {}
      const streetName = props.street || props.name || props.district || fallback.streetName
      const fullAddress = props.formatted || streetName
      return { streetName, fullAddress }
    }
  } catch (error) {
    console.error("Reverse geocoding failed:", error)
  }

  return fallback
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    })
  })
}

export function useGPSTracking(options: UseGPSTrackingOptions = {}): UseGPSTrackingReturn {
  const { onLocationUpdate, onError } = options

  const [isTracking, setIsTracking] = useState(false)
  const [route, setRoute] = useState<GPSPoint[]>([])
  const [currentLocation, setCurrentLocation] = useState<GPSPoint | null>(null)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startLocationRef = useRef<GPSPoint | null>(null)

  const captureLocation = useCallback(async (): Promise<GPSPoint | null> => {
    try {
      const position = await getCurrentPosition()
      const { latitude, longitude, accuracy } = position.coords
      const timestamp = new Date().toISOString()

      const { streetName, fullAddress } = await reverseGeocode(latitude, longitude)

      const point: GPSPoint = {
        latitude,
        longitude,
        timestamp,
        accuracy: accuracy || undefined,
        streetName,
        fullAddress,
      }

      setCurrentLocation(point)
      setError(null)

      return point
    } catch (err) {
      const errorMessage = err instanceof GeolocationPositionError
        ? getGeolocationErrorMessage(err)
        : "Failed to get location"

      setError(errorMessage)
      onError?.(errorMessage)
      return null
    }
  }, [onError])

  const addRoutePoint = useCallback(async () => {
    const point = await captureLocation()
    if (point) {
      setRoute((prev) => [...prev, point])
      onLocationUpdate?.(point)
    }
  }, [captureLocation, onLocationUpdate])

  const getCurrentLocation = useCallback(async (): Promise<GPSPoint | null> => {
    return captureLocation()
  }, [captureLocation])

  const startTracking = useCallback(async (): Promise<GPSPoint | null> => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    // Capture initial location
    const startPoint = await captureLocation()
    if (!startPoint) {
      return null
    }

    startLocationRef.current = startPoint
    setRoute([startPoint])
    setIsTracking(true)

    // Start interval for subsequent captures
    intervalRef.current = setInterval(addRoutePoint, TRACKING_INTERVAL_MS)

    onLocationUpdate?.(startPoint)
    return startPoint
  }, [captureLocation, addRoutePoint, onLocationUpdate])

  const resumeTracking = useCallback(
    async (existingRoute?: GPSPoint[]): Promise<GPSPoint | null> => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      if (existingRoute?.length) {
        const start = existingRoute[0] || null
        const last = existingRoute[existingRoute.length - 1] || null
        startLocationRef.current = start
        setRoute(existingRoute)
        setCurrentLocation(last)
      }

      setIsTracking(true)

      // Capture immediately so user sees progress right away.
      const point = await captureLocation()
      if (point) {
        setRoute((prev) => [...prev, point])
        onLocationUpdate?.(point)
      }

      intervalRef.current = setInterval(addRoutePoint, TRACKING_INTERVAL_MS)
      return point
    },
    [addRoutePoint, captureLocation, onLocationUpdate]
  )

  const stopTracking = useCallback((): GPSPoint | null => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setIsTracking(false)
    return currentLocation
  }, [currentLocation])

  const getTrackingData = useCallback((): GPSTrackingData => {
    return {
      startLocation: startLocationRef.current,
      endLocation: currentLocation,
      route,
      startedAt: startLocationRef.current?.timestamp || null,
      endedAt: isTracking ? null : currentLocation?.timestamp || null,
    }
  }, [route, currentLocation, isTracking])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    isTracking,
    route,
    currentLocation,
    error,
    startTracking,
    resumeTracking,
    stopTracking,
    getCurrentLocation,
    getTrackingData,
  }
}

function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Please allow location access in your browser settings."
    case error.POSITION_UNAVAILABLE:
      return "Location information is unavailable. Please check your GPS settings."
    case error.TIMEOUT:
      return "Location request timed out. Please try again."
    default:
      return "An unknown error occurred while getting location."
  }
}

// Helper to generate static map URL from route
export function generateStaticMapUrl(route: GPSPoint[], width = 600, height = 400): string {
  if (!PUBLIC_GEOAPIFY_API_KEY || route.length === 0) {
    return ""
  }

  // Keep URLs reasonably sized (browsers/CDNs have practical URL length limits).
  const maxPoints = 100
  const sampledRoute =
    route.length <= maxPoints
      ? route
      : route.filter((_, idx) => idx % Math.ceil(route.length / maxPoints) === 0)

  const startPoint = route[0]
  const endPoint = route[route.length - 1]

  // Create markers for start (green) and end (red)
  const markers = `lonlat:${startPoint.longitude},${startPoint.latitude};color:%2322c55e;size:medium|lonlat:${endPoint.longitude},${endPoint.latitude};color:%23ef4444;size:medium`

  // Geoapify expects polyline coordinates in lon,lat order
  // https://apidocs.geoapify.com/docs/maps/static/#add-a-geometry
  const polylinePoints = sampledRoute.map((p) => `${p.longitude},${p.latitude}`).join(",")

  return `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=${width}&height=${height}&marker=${markers}&geometry=polyline:${polylinePoints};linecolor:%233b82f6;linewidth:3&apiKey=${PUBLIC_GEOAPIFY_API_KEY}`
}

// Format timestamp for display
export function formatTrackingTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

// Format tracking duration
export function formatTrackingDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const diffMs = end.getTime() - start.getTime()

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}
