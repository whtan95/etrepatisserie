"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { Calendar, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getAllOrders } from "@/lib/order-storage"
import {
  buildTeamDaySchedules,
  getHubAddress,
  formatDateForDisplay,
  getDatesWithTasks,
  getUniqueAddresses,
} from "@/lib/mapping-utils"
import type { TeamDaySchedule, Coordinates, RouteGeometry, TeamName } from "@/lib/mapping-types"
import TeamTimeline from "./TeamTimeline"
import EngagedGanttTimeline from "./EngagedGanttTimeline"
import { getTeamDisplayName } from "@/lib/team-settings"
import { optimizeDailyRoute, applyOptimizedRoute } from "@/lib/daily-route-optimizer"
import type { DailyRouteOptimization } from "@/lib/daily-route-optimizer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Dynamically import RouteMap to avoid SSR issues with Leaflet
const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Loading map...</span>
      </div>
    </div>
  ),
})

export default function TeamMappingView() {
  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date()
    return today.toISOString().split("T")[0]
  }

  const [selectedDate, setSelectedDate] = useState(getTodayDate())
  const [schedules, setSchedules] = useState<TeamDaySchedule[]>([])
  const [hubCoordinates, setHubCoordinates] = useState<Coordinates | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<"All" | TeamName>("All")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [datesWithTasks, setDatesWithTasks] = useState<Set<string>>(new Set())

  // Route Optimizer Modal States
  const [showRouteOptimizerModal, setShowRouteOptimizerModal] = useState(false)
  const [routeOptimizerStep, setRouteOptimizerStep] = useState<"select" | "loading" | "result">("select")
  const [routeOptimizerTeam, setRouteOptimizerTeam] = useState<TeamName>("Team A")
  const [routeOptimizerStartingPoint, setRouteOptimizerStartingPoint] = useState<"hub" | "other">("hub")
  const [routeOptimizerCustomAddress, setRouteOptimizerCustomAddress] = useState("")
  const [routeOptimization, setRouteOptimization] = useState<DailyRouteOptimization | null>(null)
  const [routeOptimizerError, setRouteOptimizerError] = useState<string | null>(null)

  // Geocode an address
  const geocodeAddress = useCallback(async (address: string): Promise<Coordinates | null> => {
    try {
      const response = await fetch(`/api/calculate-route?address=${encodeURIComponent(address)}`)
      const data = await response.json()
      if (data.success && data.lat && data.lon) {
        return { lat: data.lat, lon: data.lon }
      }
      return null
    } catch {
      return null
    }
  }, [])

  // Calculate route for a team
  const calculateTeamRoute = useCallback(async (
    schedule: TeamDaySchedule,
    hubCoords: Coordinates
  ): Promise<RouteGeometry | null> => {
    // Build waypoints: HUB -> Site 1 -> HUB -> Site 2 -> HUB ...
    const waypoints: { address: string; lat?: number; lon?: number }[] = []

    for (const task of schedule.tasks) {
      // Add hub
      waypoints.push({
        address: getHubAddress(),
        lat: hubCoords.lat,
        lon: hubCoords.lon,
      })

      // Add site
      if (task.coordinates) {
        waypoints.push({
          address: task.siteAddress,
          lat: task.coordinates.lat,
          lon: task.coordinates.lon,
        })
      } else {
        waypoints.push({ address: task.siteAddress })
      }
    }

    // Add final return to hub
    waypoints.push({
      address: getHubAddress(),
      lat: hubCoords.lat,
      lon: hubCoords.lon,
    })

    if (waypoints.length < 2) return null

    try {
      const response = await fetch("/api/calculate-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints }),
      })

      const data = await response.json()
      if (data.success && data.route?.geometry) {
        return data.route.geometry
      }
      return null
    } catch {
      return null
    }
  }, [])

  // Load schedules and routes for selected date
  const loadSchedulesForDate = useCallback(async (date: string) => {
    setIsLoading(true)
    setError(null)
    setSelectedTask(null)

    try {
      const orders = getAllOrders()
      const daySchedules = buildTeamDaySchedules(orders, date)

      // Get hub coordinates first
      let hubCoords = hubCoordinates
      if (!hubCoords) {
        const hubAddress = getHubAddress()
        hubCoords = await geocodeAddress(hubAddress)
        if (hubCoords) {
          setHubCoordinates(hubCoords)
        }
      }

      if (!hubCoords) {
        setError("Could not geocode hub address")
        setSchedules(daySchedules)
        setIsLoading(false)
        return
      }

      // Geocode all site addresses and calculate routes
      const updatedSchedules = await Promise.all(
        daySchedules.map(async schedule => {
          // Geocode task addresses
          const updatedTasks = await Promise.all(
            schedule.tasks.map(async task => {
              if (!task.siteAddress) return task
              const coords = await geocodeAddress(task.siteAddress)
              return { ...task, coordinates: coords }
            })
          )

          const updatedSchedule = { ...schedule, tasks: updatedTasks }

          // Calculate route
          const routeGeometry = await calculateTeamRoute(updatedSchedule, hubCoords)
          return { ...updatedSchedule, routeGeometry }
        })
      )

      setSchedules(updatedSchedules)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules")
    } finally {
      setIsLoading(false)
    }
  }, [hubCoordinates, geocodeAddress, calculateTeamRoute])

  // Load dates with tasks on mount
  useEffect(() => {
    const orders = getAllOrders()
    const dates = getDatesWithTasks(orders)
    setDatesWithTasks(dates)
  }, [])

  // Load schedules when date changes
  useEffect(() => {
    loadSchedulesForDate(selectedDate)
  }, [selectedDate, loadSchedulesForDate])

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value)
  }

  // Quick navigation buttons
  const goToToday = () => setSelectedDate(getTodayDate())
  const goToPrevDay = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() - 1)
    setSelectedDate(date.toISOString().split("T")[0])
  }
  const goToNextDay = () => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + 1)
    setSelectedDate(date.toISOString().split("T")[0])
  }

  const hasTasksToday = datesWithTasks.has(selectedDate)
  const allTeams: TeamName[] = ["Team A", "Team B", "Team C", "Team D", "Team E"]
  const visibleSchedules =
    selectedTeam === "All" ? schedules : schedules.filter((s) => s.team === selectedTeam)

  // Handle running route optimization
  const handleRunRouteOptimization = async () => {
    setRouteOptimizerStep("loading")
    setRouteOptimizerError(null)

    try {
      const optimization = await optimizeDailyRoute(
        routeOptimizerTeam,
        selectedDate,
        routeOptimizerStartingPoint,
        routeOptimizerStartingPoint === "other" ? routeOptimizerCustomAddress : undefined
      )
      setRouteOptimization(optimization)
      setRouteOptimizerStep("result")
    } catch (error) {
      setRouteOptimizerError(error instanceof Error ? error.message : "Failed to optimize route")
      setRouteOptimizerStep("select")
    }
  }

  // Handle applying optimization
  const handleApplyOptimization = async () => {
    if (!routeOptimization) return

    try {
      await applyOptimizedRoute(routeOptimization)
      setShowRouteOptimizerModal(false)
      // Reload schedules to reflect changes
      await loadSchedulesForDate(selectedDate)
      alert("✅ Route optimization applied successfully!")
    } catch (error) {
      alert(`❌ Failed to apply optimization: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header with date picker */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Team Route Mapping</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPrevDay}>
            &larr;
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="w-auto"
          />
          <Button variant="outline" size="sm" onClick={goToNextDay}>
            &rarr;
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant={selectedTeam === "All" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTeam("All")}
            >
              All
            </Button>
            {allTeams.map((t) => (
              <Button
                key={t}
                variant={selectedTeam === t ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTeam(t)}
                className="max-w-[90px] truncate"
              >
                {getTeamDisplayName(t)}
              </Button>
            ))}
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          <Button
            size="sm"
            onClick={() => {
              setShowRouteOptimizerModal(true)
              setRouteOptimizerStep("select")
              setRouteOptimizerTeam(selectedTeam !== "All" ? selectedTeam : "Team A")
              setRouteOptimizerStartingPoint("hub")
              setRouteOptimizerCustomAddress("")
              setRouteOptimization(null)
              setRouteOptimizerError(null)
            }}
            className="gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 hover:from-purple-600 hover:to-indigo-600"
          >
            <Sparkles className="h-4 w-4" />
            🚀 Optimize Routes
          </Button>
        </div>
      </div>

      {/* Date display and status */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted-foreground">
            {formatDateForDisplay(selectedDate)}
          </span>
          {!hasTasksToday && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
              (No tasks scheduled)
            </span>
          )}
        </div>
        {isLoading && (
          <span className="text-xs text-muted-foreground">Loading routes...</span>
        )}
        {error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>

      {/* Main content: Timeline + Map */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[500px]">
        {/* Timeline (left) */}
        <div className="lg:col-span-1 bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-3 border-b border-border bg-muted/30">
            <h3 className="font-medium text-sm">Daily Timeline</h3>
          </div>
          <div className="h-[calc(100%-48px)]">
            <TeamTimeline
              schedules={visibleSchedules}
              selectedTask={selectedTask}
              onTaskSelect={setSelectedTask}
            />
          </div>
        </div>

        {/* Map (right) */}
        <div className="lg:col-span-2 min-h-[400px]">
          <RouteMap
            teamSchedules={visibleSchedules}
            hubCoordinates={hubCoordinates}
            highlightedTask={selectedTask}
            onMarkerClick={setSelectedTask}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Engaged (Gantt) timeline below */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
          <h3 className="font-medium text-sm">Daily Timeline</h3>
          <div className="text-xs text-muted-foreground">
            06:30 – 21:00
          </div>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <EngagedGanttTimeline
            schedules={visibleSchedules}
            selectedTask={selectedTask}
            onTaskSelect={setSelectedTask}
          />
        </div>
      </div>

      {/* Summary stats */}
      {visibleSchedules.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Teams active:</span>
            <span className="font-medium">{visibleSchedules.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total tasks:</span>
            <span className="font-medium">
              {visibleSchedules.reduce((sum, s) => sum + s.tasks.length, 0)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Setup:</span>
            <span className="font-medium">
              {visibleSchedules.reduce(
                (sum, s) => sum + s.tasks.filter(t => t.taskType === "setup").length,
                0
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Dismantle:</span>
            <span className="font-medium">
              {visibleSchedules.reduce(
                (sum, s) => sum + s.tasks.filter(t => t.taskType === "dismantle").length,
                0
              )}
            </span>
          </div>
        </div>
      )}

      {/* Route Optimizer Modal */}
      <Dialog open={showRouteOptimizerModal} onOpenChange={setShowRouteOptimizerModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              🚀 Daily Route Optimizer
            </DialogTitle>
            <DialogDescription>
              Optimize the route for a team on this date by reordering flexible stops to minimize travel distance
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Select parameters */}
          {routeOptimizerStep === "select" && (
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input type="text" value={formatDateForDisplay(selectedDate)} disabled className="bg-muted" />
                </div>

                <div className="grid gap-2">
                  <Label>Team</Label>
                  <Select value={routeOptimizerTeam} onValueChange={(value) => setRouteOptimizerTeam(value as TeamName)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allTeams.map((team) => (
                        <SelectItem key={team} value={team}>
                          {getTeamDisplayName(team)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Starting Point</Label>
                  <Select
                    value={routeOptimizerStartingPoint}
                    onValueChange={(value) => setRouteOptimizerStartingPoint(value as "hub" | "other")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hub">🏢 Hub ({getHubAddress()})</SelectItem>
                      <SelectItem value="other">📍 Custom Address</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {routeOptimizerStartingPoint === "other" && (
                  <div className="grid gap-2">
                    <Label>Custom Starting Address</Label>
                    <Input
                      type="text"
                      value={routeOptimizerCustomAddress}
                      onChange={(e) => setRouteOptimizerCustomAddress(e.target.value)}
                      placeholder="Enter starting address"
                    />
                  </div>
                )}
              </div>

              {routeOptimizerError && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-sm text-destructive">{routeOptimizerError}</p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRouteOptimizerModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRunRouteOptimization}
                  disabled={routeOptimizerStartingPoint === "other" && !routeOptimizerCustomAddress.trim()}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Optimize Route
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Loading */}
          {routeOptimizerStep === "loading" && (
            <div className="py-12 flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Optimizing route...</p>
            </div>
          )}

          {/* Step 3: Result comparison */}
          {routeOptimizerStep === "result" && routeOptimization && (
            <div className="space-y-4 py-4">
              {/* Savings Summary */}
              <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                  💰 Potential Savings
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-green-700 dark:text-green-300 font-medium">
                      {routeOptimization.distanceSaved.toFixed(1)} km
                    </div>
                    <div className="text-green-600 dark:text-green-400 text-xs">Distance saved</div>
                  </div>
                  <div>
                    <div className="text-green-700 dark:text-green-300 font-medium">
                      {Math.round(routeOptimization.timeSaved)} mins
                    </div>
                    <div className="text-green-600 dark:text-green-400 text-xs">Time saved</div>
                  </div>
                  <div>
                    <div className="text-green-700 dark:text-green-300 font-medium">
                      {routeOptimization.percentSaved.toFixed(1)}%
                    </div>
                    <div className="text-green-600 dark:text-green-400 text-xs">Efficiency gain</div>
                  </div>
                </div>
              </div>

              {/* Side-by-side comparison */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Original Route */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    ❌ Original Route
                    <span className="text-xs text-muted-foreground font-normal">
                      ({routeOptimization.originalTotalDistance.toFixed(1)} km, {Math.round(routeOptimization.originalTotalTime)} mins)
                    </span>
                  </h3>
                  <div className="space-y-1 text-sm max-h-[300px] overflow-y-auto border rounded-md p-2">
                    {routeOptimization.originalRoute.map((stop, idx) => (
                      <div
                        key={`original-${idx}`}
                        className="p-2 bg-muted/50 rounded border border-border"
                      >
                        <div className="font-medium">
                          {idx + 1}. {stop.orderNumber}
                        </div>
                        <div className="text-xs text-muted-foreground">{stop.address}</div>
                        <div className="text-xs text-muted-foreground">
                          {stop.arrivalTime} - {stop.departureTime}
                          {stop.isRigid && <span className="ml-2 text-red-600">🔒 Rigid</span>}
                          {stop.isCoJoin && <span className="ml-2 text-blue-600">🔗 Co-join</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optimized Route */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    ✅ Optimized Route
                    <span className="text-xs text-muted-foreground font-normal">
                      ({routeOptimization.optimizedTotalDistance.toFixed(1)} km, {Math.round(routeOptimization.optimizedTotalTime)} mins)
                    </span>
                  </h3>
                  <div className="space-y-1 text-sm max-h-[300px] overflow-y-auto border rounded-md p-2">
                    {routeOptimization.optimizedRoute.map((stop, idx) => (
                      <div
                        key={`optimized-${idx}`}
                        className="p-2 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800"
                      >
                        <div className="font-medium">
                          {idx + 1}. {stop.orderNumber}
                        </div>
                        <div className="text-xs text-muted-foreground">{stop.address}</div>
                        <div className="text-xs text-muted-foreground">
                          {stop.arrivalTime} - {stop.departureTime}
                          {stop.isRigid && <span className="ml-2 text-red-600">🔒 Rigid</span>}
                          {stop.isCoJoin && <span className="ml-2 text-blue-600">🔗 Co-join</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRouteOptimizerModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleApplyOptimization} className="bg-green-600 hover:bg-green-700">
                  ✅ Apply Optimization
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
