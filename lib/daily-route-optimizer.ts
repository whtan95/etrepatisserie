// Daily Route Optimizer
// Optimizes routes for a team on a specific date by reordering flexible stops

import type { SalesOrder } from "./types"
import { getAllOrders } from "./order-storage"

const DEFAULT_HUB_ADDRESS = "2A, PERSIARAN KILANG PENGKALAN 28, 31500 Ipoh, Perak"

// Get AI settings from localStorage (client-side only)
function getAISettingsFromLocalStorage() {
  if (typeof window === "undefined") {
    return { hubAddress: DEFAULT_HUB_ADDRESS }
  }

  try {
    const saved = localStorage.getItem("etre_ai_settings")
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        hubAddress: parsed.hubAddress ?? DEFAULT_HUB_ADDRESS,
      }
    }
  } catch (error) {
    console.error("Failed to parse AI settings:", error)
  }

  return { hubAddress: DEFAULT_HUB_ADDRESS }
}

export type TeamName = "Team A" | "Team B" | "Team C" | "Team D" | "Team E"

export interface RouteStop {
  orderNumber: string
  order: SalesOrder
  taskType: "setup" | "dismantle" | "other-adhoc"
  address: string
  arrivalTime: string
  departureTime: string
  workDurationMins: number
  isRigid: boolean // Cannot change time (strict time window mode)
  isCoJoin: boolean // Part of co-join chain
  coJoinChainId?: string // Identifier for co-join chain
  canOptimize: boolean // = !isRigid && !isCoJoin
}

export interface DailyRouteOptimization {
  date: string
  team: TeamName
  startingPoint: "hub" | "other"
  startingAddress: string

  // Before optimization
  originalRoute: RouteStop[]
  originalTotalDistance: number
  originalTotalTime: number

  // After optimization
  optimizedRoute: RouteStop[]
  optimizedTotalDistance: number
  optimizedTotalTime: number

  // Savings
  distanceSaved: number
  timeSaved: number
  percentSaved: number
}

/**
 * Get all tasks (setup/dismantle/adhoc) for a team on a specific date
 */
function getTeamTasksForDate(team: TeamName, date: string): RouteStop[] {
  const allOrders = getAllOrders()
  const tasks: RouteStop[] = []

  for (const order of allOrders) {
    const additionalInfo = order.additionalInfo

    // Check setup
    if (additionalInfo?.confirmedSetupDate === date && additionalInfo?.setupLorry === team) {
      const setupAddress = order.customerData.deliveryAddress || order.customerData.billingAddress
      const isRigid = order.customerData.setupTimeWindowMode === "strict"
      const isCoJoin = additionalInfo.setupReturnChoice === "remain-on-site"

      tasks.push({
        orderNumber: order.orderMeta.orderNumber,
        order,
        taskType: "setup",
        address: setupAddress,
        arrivalTime: additionalInfo.setupArrivalTime || "09:00",
        departureTime: additionalInfo.setupDepartureTime || "10:00",
        workDurationMins: additionalInfo.setupWorkMins || 60,
        isRigid,
        isCoJoin,
        canOptimize: !isRigid && !isCoJoin,
      })
    }

    // Check dismantle
    if (additionalInfo?.confirmedDismantleDate === date && additionalInfo?.dismantleLorry === team) {
      const dismantleAddress = order.customerData.deliveryAddress || order.customerData.billingAddress
      const isRigid = order.customerData.dismantleTimeWindowMode === "strict"
      const isCoJoin = additionalInfo.dismantleReturnChoice === "remain-on-site"

      tasks.push({
        orderNumber: order.orderMeta.orderNumber,
        order,
        taskType: "dismantle",
        address: dismantleAddress,
        arrivalTime: additionalInfo.dismantleArrivalTime || "14:00",
        departureTime: additionalInfo.dismantleDepartureTime || "15:00",
        workDurationMins: additionalInfo.dismantleWorkMins || 60,
        isRigid,
        isCoJoin,
        canOptimize: !isRigid && !isCoJoin,
      })
    }

    // Check other adhoc
    if (additionalInfo?.confirmedOtherAdhocDate === date && additionalInfo?.otherAdhocLorry === team) {
      const adhocAddress = order.customerData.deliveryAddress || order.customerData.billingAddress

      tasks.push({
        orderNumber: order.orderMeta.orderNumber,
        order,
        taskType: "other-adhoc",
        address: adhocAddress,
        arrivalTime: additionalInfo.otherAdhocArrivalTime || "10:00",
        departureTime: additionalInfo.otherAdhocDepartureTime || "11:00",
        workDurationMins: additionalInfo.otherAdhocWorkMins || 60,
        isRigid: false, // Adhoc tasks are always flexible
        isCoJoin: false,
        canOptimize: true,
      })
    }
  }

  return tasks
}

/**
 * Calculate distance between two addresses using Geoapify
 */
async function calculateDistance(from: string, to: string): Promise<{ distanceKm: number; timeMins: number }> {
  try {
    const response = await fetch(
      `/api/calculate-route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
    const data = await response.json()

    if (data.success && data.distance && data.time) {
      return {
        distanceKm: data.distance,
        timeMins: data.time,
      }
    }
  } catch (error) {
    console.error("Error calculating distance:", error)
  }

  // Fallback: estimate based on simple heuristic (3 mins per km)
  return {
    distanceKm: 10,
    timeMins: 30,
  }
}

/**
 * Calculate total route distance and time
 */
async function calculateRouteMetrics(
  stops: RouteStop[],
  startingAddress: string
): Promise<{ totalDistance: number; totalTime: number }> {
  let totalDistance = 0
  let totalTime = 0
  let currentLocation = startingAddress

  for (const stop of stops) {
    // Travel to this stop
    const { distanceKm, timeMins } = await calculateDistance(currentLocation, stop.address)
    totalDistance += distanceKm
    totalTime += timeMins

    // Work time at this stop
    totalTime += stop.workDurationMins

    // Update current location
    currentLocation = stop.address
  }

  // Return to hub
  const { distanceKm, timeMins } = await calculateDistance(currentLocation, startingAddress)
  totalDistance += distanceKm
  totalTime += timeMins

  return { totalDistance, totalTime }
}

/**
 * Optimize route using greedy nearest neighbor algorithm
 */
async function optimizeRouteGreedy(
  stops: RouteStop[],
  startingAddress: string
): Promise<RouteStop[]> {
  const optimized: RouteStop[] = []
  const remaining = [...stops]

  let currentLocation = startingAddress
  let currentTime = 9 * 60 // Start at 9:00 AM (in minutes)

  while (remaining.length > 0) {
    // Find nearest flexible stop
    let nearestIndex = -1
    let nearestDistance = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const stop = remaining[i]

      // If rigid or co-join, check if it's time for this stop
      if (!stop.canOptimize) {
        const stopTimeMins = timeToMinutes(stop.arrivalTime)
        if (stopTimeMins <= currentTime + 30) {
          // Must do this stop now (within 30 min window)
          nearestIndex = i
          break
        }
        continue
      }

      // Calculate distance for flexible stops
      const { distanceKm } = await calculateDistance(currentLocation, stop.address)
      if (distanceKm < nearestDistance) {
        nearestDistance = distanceKm
        nearestIndex = i
      }
    }

    if (nearestIndex === -1) {
      // No more stops reachable, just take the first remaining
      nearestIndex = 0
    }

    const nextStop = remaining[nearestIndex]
    remaining.splice(nearestIndex, 1)

    // Calculate travel time to this stop
    const { timeMins: travelMins } = await calculateDistance(currentLocation, nextStop.address)
    currentTime += travelMins

    // Update stop times if it's flexible
    if (nextStop.canOptimize) {
      nextStop.arrivalTime = minutesToTime(currentTime)
      nextStop.departureTime = minutesToTime(currentTime + nextStop.workDurationMins)
    }

    // Add work time
    currentTime += nextStop.workDurationMins

    optimized.push(nextStop)
    currentLocation = nextStop.address
  }

  return optimized
}

/**
 * Main optimization function
 */
export async function optimizeDailyRoute(
  team: TeamName,
  date: string,
  startingPoint: "hub" | "other" = "hub",
  customStartingAddress?: string
): Promise<DailyRouteOptimization> {
  const aiSettings = getAISettingsFromLocalStorage()
  const hubAddress = aiSettings.hubAddress
  const startingAddress = startingPoint === "hub" ? hubAddress : (customStartingAddress || hubAddress)

  // Get all tasks for this team on this date
  const originalRoute = getTeamTasksForDate(team, date)

  if (originalRoute.length === 0) {
    throw new Error(`No tasks found for ${team} on ${date}`)
  }

  // Calculate original metrics
  const originalMetrics = await calculateRouteMetrics(originalRoute, startingAddress)

  // Optimize route
  const optimizedRoute = await optimizeRouteGreedy(originalRoute, startingAddress)

  // Calculate optimized metrics
  const optimizedMetrics = await calculateRouteMetrics(optimizedRoute, startingAddress)

  // Calculate savings
  const distanceSaved = originalMetrics.totalDistance - optimizedMetrics.totalDistance
  const timeSaved = originalMetrics.totalTime - optimizedMetrics.totalTime
  const percentSaved = (distanceSaved / originalMetrics.totalDistance) * 100

  return {
    date,
    team,
    startingPoint,
    startingAddress,
    originalRoute,
    originalTotalDistance: originalMetrics.totalDistance,
    originalTotalTime: originalMetrics.totalTime,
    optimizedRoute,
    optimizedTotalDistance: optimizedMetrics.totalDistance,
    optimizedTotalTime: optimizedMetrics.totalTime,
    distanceSaved,
    timeSaved,
    percentSaved,
  }
}

/**
 * Apply optimized route by updating all affected orders
 */
export async function applyOptimizedRoute(optimization: DailyRouteOptimization): Promise<void> {
  const { updateOrderByNumber } = await import("./order-storage")

  for (const stop of optimization.optimizedRoute) {
    const order = stop.order

    if (!order.additionalInfo) continue

    // Update the arrival and departure times based on task type
    if (stop.taskType === "setup") {
      order.additionalInfo.setupArrivalTime = stop.arrivalTime
      order.additionalInfo.setupDepartureTime = stop.departureTime
    } else if (stop.taskType === "dismantle") {
      order.additionalInfo.dismantleArrivalTime = stop.arrivalTime
      order.additionalInfo.dismantleDepartureTime = stop.departureTime
    } else if (stop.taskType === "other-adhoc") {
      order.additionalInfo.otherAdhocArrivalTime = stop.arrivalTime
      order.additionalInfo.otherAdhocDepartureTime = stop.departureTime
    }

    // Save the updated order
    updateOrderByNumber(order.orderNumber, () => ({ ...order }))
  }
}

// Helper functions
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number)
  return hours * 60 + minutes
}

function minutesToTime(mins: number): string {
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}
