"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import type { TeamDaySchedule, Coordinates } from "@/lib/mapping-types"
import { getTeamColor } from "@/lib/mapping-types"
import { getHubAddress } from "@/lib/mapping-utils"
import { getTeamDisplayName } from "@/lib/team-settings"

interface RouteMapProps {
  teamSchedules: TeamDaySchedule[]
  hubCoordinates: Coordinates | null
  highlightedTask: string | null
  onMarkerClick?: (taskId: string) => void
  isLoading?: boolean
}

export default function RouteMap({
  teamSchedules,
  hubCoordinates,
  highlightedTask,
  onMarkerClick,
  isLoading,
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const initializingRef = useRef(false)

  // Initialize map only once
  useEffect(() => {
    // Skip if already initializing or initialized
    if (initializingRef.current || mapInstanceRef.current) return
    if (typeof window === "undefined") return
    if (!mapContainerRef.current) return

    // Check if container already has a map (Leaflet sets _leaflet_id)
    const container = mapContainerRef.current as HTMLDivElement & { _leaflet_id?: number }
    if (container._leaflet_id) {
      console.log("Map container already initialized, skipping")
      return
    }

    initializingRef.current = true

    const initMap = async () => {
      try {
        const L = (await import("leaflet")).default

        // Import CSS
        await import("leaflet/dist/leaflet.css")

        // Fix default marker icons
        delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        })

        // Double check container is still valid and not initialized
        if (!mapContainerRef.current) {
          initializingRef.current = false
          return
        }

        const containerCheck = mapContainerRef.current as HTMLDivElement & { _leaflet_id?: number }
        if (containerCheck._leaflet_id) {
          initializingRef.current = false
          return
        }

        // Default center (Ipoh, Malaysia)
        const defaultCenter: [number, number] = [4.5975, 101.0901]

        const map = L.map(mapContainerRef.current, {
          center: hubCoordinates ? [hubCoordinates.lat, hubCoordinates.lon] : defaultCenter,
          zoom: 12,
          zoomControl: true,
        })

        // Use Geoapify tile layer
        const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY
        L.tileLayer(
          `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${apiKey}`,
          {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }
        ).addTo(map)

        // Create layer group for routes and markers
        const layerGroup = L.layerGroup().addTo(map)

        mapInstanceRef.current = map
        layerGroupRef.current = layerGroup
        setMapReady(true)
        initializingRef.current = false
      } catch (error) {
        console.error("Error initializing map:", error)
        initializingRef.current = false
      }
    }

    initMap()

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        layerGroupRef.current = null
        setMapReady(false)
      }
      initializingRef.current = false
    }
  }, []) // Empty dependency array - only run once

  // Update hub center when coordinates change
  useEffect(() => {
    if (!mapInstanceRef.current || !hubCoordinates) return
    mapInstanceRef.current.setView([hubCoordinates.lat, hubCoordinates.lon], 12)
  }, [hubCoordinates])

  // Draw routes and markers when data changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !layerGroupRef.current) return

    const drawRoutesAndMarkers = async () => {
      const L = (await import("leaflet")).default
      const map = mapInstanceRef.current!
      const layerGroup = layerGroupRef.current!

      // Clear existing layers
      layerGroup.clearLayers()

      const bounds: [number, number][] = []

      // Add hub marker if coordinates available
      if (hubCoordinates) {
        const hubIcon = L.divIcon({
          className: "hub-marker",
          html: `<div style="
            background-color: #1f2937;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            border: 3px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">HUB</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        L.marker([hubCoordinates.lat, hubCoordinates.lon], { icon: hubIcon })
          .bindPopup(`<strong>HUB</strong><br/>${getHubAddress()}`)
          .addTo(layerGroup)

        bounds.push([hubCoordinates.lat, hubCoordinates.lon])
      }

      // Draw routes for each team
      for (const schedule of teamSchedules) {
        if (!schedule.routeGeometry) continue

        const color = getTeamColor(schedule.team)
        const isHighlighted = highlightedTask?.startsWith(schedule.team)

        // Draw route polyline
        const geometry = schedule.routeGeometry
        let coordinates: [number, number][] = []

        if (geometry.type === "LineString") {
          coordinates = (geometry.coordinates as number[][]).map(
            coord => [coord[1], coord[0]] as [number, number]
          )
        } else if (geometry.type === "MultiLineString") {
          // Flatten MultiLineString
          for (const line of geometry.coordinates as number[][][]) {
            for (const coord of line) {
              coordinates.push([coord[1], coord[0]])
            }
          }
        }

        if (coordinates.length > 0) {
          L.polyline(coordinates, {
            color,
            weight: isHighlighted ? 6 : 4,
            opacity: isHighlighted ? 1 : 0.7,
          }).addTo(layerGroup)

          bounds.push(...coordinates)
        }

        // Add site markers for this team
        let siteIndex = 1
        for (const task of schedule.tasks) {
          if (!task.coordinates) continue

          const markerColor = color
          const isTaskHighlighted = highlightedTask === `${task.orderNumber}-${task.taskType}`

          const siteIcon = L.divIcon({
            className: "site-marker",
            html: `<div style="
              background-color: ${markerColor};
              color: white;
              width: ${isTaskHighlighted ? 32 : 26}px;
              height: ${isTaskHighlighted ? 32 : 26}px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: ${isTaskHighlighted ? 14 : 12}px;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              cursor: pointer;
            ">${siteIndex}</div>`,
            iconSize: [isTaskHighlighted ? 32 : 26, isTaskHighlighted ? 32 : 26],
            iconAnchor: [isTaskHighlighted ? 16 : 13, isTaskHighlighted ? 16 : 13],
          })

          const taskTypeLabel = task.taskType === "setup" ? "Setup"
            : task.taskType === "dismantle" ? "Dismantle"
            : "Other Adhoc"

          const marker = L.marker([task.coordinates.lat, task.coordinates.lon], { icon: siteIcon })
            .bindPopup(`
              <div style="min-width: 180px;">
                <strong>${getTeamDisplayName(schedule.team)}</strong> - ${taskTypeLabel}<br/>
                <strong>${task.orderNumber}</strong><br/>
                ${task.customerName}<br/>
                <small>${task.siteAddress}</small><br/>
                <small>Time: ${task.taskStartTime} - ${task.taskEndTime}</small>
              </div>
            `)
            .addTo(layerGroup)

          if (onMarkerClick) {
            marker.on("click", () => {
              onMarkerClick(`${task.orderNumber}-${task.taskType}`)
            })
          }

          bounds.push([task.coordinates.lat, task.coordinates.lon])
          siteIndex++
        }
      }

      // Fit map to bounds if we have coordinates
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }

    drawRoutesAndMarkers()
  }, [mapReady, teamSchedules, hubCoordinates, highlightedTask, onMarkerClick])

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden border border-border">
      <div ref={mapContainerRef} className="h-full w-full" style={{ minHeight: "400px" }} />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">Loading routes...</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg p-3 border border-border z-10">
        <div className="text-xs font-semibold mb-2">Teams</div>
        <div className="flex flex-col gap-1">
          {teamSchedules.map(schedule => (
            <div key={schedule.team} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getTeamColor(schedule.team) }}
              />
              <span className="text-xs">{getTeamDisplayName(schedule.team)}</span>
              <span className="text-xs text-muted-foreground">
                ({schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""})
              </span>
            </div>
          ))}
          {teamSchedules.length === 0 && (
            <span className="text-xs text-muted-foreground">No teams scheduled</span>
          )}
        </div>
      </div>
    </div>
  )
}
