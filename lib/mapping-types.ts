// Types for the Team Mapping feature

export type TeamName = "Team A" | "Team B" | "Team C" | "Team D" | "Team E"

export interface Coordinates {
  lat: number
  lon: number
}

export interface GeocodedLocation {
  address: string
  coordinates: Coordinates | null
}

// Individual scheduled task extracted from an order
export interface ScheduledTask {
  orderNumber: string
  customerName: string
  taskType: "setup" | "dismantle" | "other-adhoc"
  team: TeamName
  // Location info
  siteAddress: string
  coordinates: Coordinates | null
  // Departure origin for outbound leg
  departureFromType: "hub" | "other"
  departureFromAddress: string
  // Timing
  departureTime: string // HH:MM - when leaving hub/previous location
  arrivalTime: string // HH:MM - when arriving at site
  taskStartTime: string // HH:MM - when task begins
  taskEndTime: string // HH:MM - when task ends
  // Outbound journey (HUB -> Site)
  outboundDistanceKm: number
  outboundTravelMins: number
  // Return journey
  returnDepartureTime: string // HH:MM - when leaving site
  hubArrivalTime: string // HH:MM - when arriving back at hub
  returnDistanceKm: number
  returnTravelMins: number
}

// A waypoint in the team's journey
export interface Waypoint {
  type: "hub" | "site"
  address: string
  coordinates: Coordinates | null
  arrivalTime: string
  departureTime: string
  task?: ScheduledTask // Only for site waypoints
}

// Full journey for a team on a given day
export interface TeamJourney {
  team: TeamName
  color: string
  date: string
  waypoints: Waypoint[]
  tasks: ScheduledTask[]
  totalDistanceKm: number
  totalDurationMins: number
}

// Route geometry from Geoapify
export interface RouteGeometry {
  type: "LineString" | "MultiLineString"
  coordinates: number[][] | number[][][]
}

// Response from Geoapify Routing API
export interface RouteResponse {
  success: boolean
  route: {
    totalDistanceKm: number
    totalDurationMinutes: number
    geometry: RouteGeometry
    legs: RouteLeg[]
  } | null
  waypoints: GeocodedLocation[]
  error?: string
}

export interface RouteLeg {
  from: string
  to: string
  distanceKm: number
  durationMinutes: number
}

// Team schedule for a day with route info
export interface TeamDaySchedule {
  team: TeamName
  color: string
  date: string
  tasks: ScheduledTask[]
  journey: TeamJourney | null
  routeGeometry: RouteGeometry | null
  isLoading: boolean
  error?: string
}

// Timeline event for display
export interface TimelineEvent {
  id: string
  time: string
  type: "depart-hub" | "arrive-site" | "task-start" | "task-end" | "depart-site" | "arrive-hub"
  label: string
  description?: string
  orderNumber?: string
  customerName?: string
  address?: string
  team: TeamName
  color: string
}

// Map marker
export interface MapMarker {
  id: string
  type: "hub" | "site"
  coordinates: Coordinates
  label: string
  team?: TeamName
  color?: string
  orderNumber?: string
  taskType?: "setup" | "dismantle" | "other-adhoc"
}

// Team colors mapping (consistent with existing LORRIES in types.ts)
export const TEAM_COLORS: Record<TeamName, string> = {
  "Team A": "#ef4444", // Red
  "Team B": "#f59e0b", // Amber
  "Team C": "#3b82f6", // Blue
  "Team D": "#22c55e", // Green
  "Team E": "#8b5cf6", // Violet
}

// Get team color
export function getTeamColor(team: TeamName): string {
  if (typeof window !== "undefined") {
    try {
      // Lazy import pattern avoided; keep this small and resilient
      const stored = localStorage.getItem("etre_team_settings")
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const found = parsed.find((t: any) => t && typeof t === "object" && t.id === team)
          if (found?.color && typeof found.color === "string") return found.color
        }
      }
    } catch {
      // ignore
    }
  }
  return TEAM_COLORS[team] || "#6b7280"
}
