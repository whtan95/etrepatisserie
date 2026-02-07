// Utilities for the Team Mapping feature

import type { SalesOrder } from "@/lib/types"
import type {
  ScheduledTask,
  TeamName,
  TeamJourney,
  Waypoint,
  TimelineEvent,
  Coordinates,
  TeamDaySchedule,
} from "@/lib/mapping-types"
import { getTeamColor } from "@/lib/mapping-types"

const AI_SETTINGS_KEY = "etre_ai_settings"

// Get hub address from AI settings or use default
export function getHubAddress(): string {
  if (typeof window === "undefined") {
    return "2A, PERSIARAN KILANG PENGKALAN 28, KAWASAN PERINDUSTRIAN PENGKALAN MAJU LAHAT, 31500 Ipoh, Perak"
  }
  try {
    const settings = localStorage.getItem(AI_SETTINGS_KEY)
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.hubAddress) return parsed.hubAddress
    }
  } catch {
    // Ignore parse errors
  }
  return "2A, PERSIARAN KILANG PENGKALAN 28, KAWASAN PERINDUSTRIAN PENGKALAN MAJU LAHAT, 31500 Ipoh, Perak"
}

// Calculate arrival time given departure time and travel duration
function calculateArrivalTime(departureTime: string, travelHours: number, travelMinutes: number): string {
  if (!departureTime) return ""
  const [hours, mins] = departureTime.split(":").map(Number)
  if (isNaN(hours) || isNaN(mins)) return ""

  const totalMinutes = hours * 60 + mins + travelHours * 60 + travelMinutes
  const newHours = Math.floor(totalMinutes / 60) % 24
  const newMins = totalMinutes % 60
  return `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`
}

// Extract setup task from an order for a specific date
function extractSetupTask(order: SalesOrder, date: string): ScheduledTask | null {
  const ai = order.additionalInfo
  if (!ai) return null

  // Check if this order has a setup scheduled for the given date
  const setupDate = ai.confirmedSetupDate || order.eventData?.customerPreferredSetupDate || ""
  if (setupDate !== date) return null
  if (!ai.setupLorry) return null

  const team = ai.setupLorry as TeamName
  const hubAddress = getHubAddress()
  const departureFromType = ai.setupDepartureFromType === "other" ? "other" : "hub"
  const departureFromAddress = departureFromType === "other" ? (ai.setupDepartureAddress || "") : hubAddress
  const departureTime = ai.departureFromHub || ""
  const travelHours = ai.travelDurationHours || 0
  const travelMinutes = ai.travelDurationMinutes || 0
  const arrivalTime = calculateArrivalTime(departureTime, travelHours, travelMinutes)
  const outboundTravelMins = travelHours * 60 + travelMinutes

  return {
    orderNumber: order.orderNumber,
    customerName: order.customerData?.customerName || order.customerData?.companyName || "Unknown",
    taskType: "setup",
    team,
    siteAddress: ai.setupDestinationAddress || order.customerData?.deliveryAddress || "",
    coordinates: null, // Will be geocoded later
    departureFromType,
    departureFromAddress,
    departureTime,
    arrivalTime,
    taskStartTime: ai.scheduleStartTime || arrivalTime,
    taskEndTime: ai.estimatedEndTime || "",
    outboundDistanceKm: ai.setupDistanceKm || 0,
    outboundTravelMins,
    returnDepartureTime: ai.estimatedEndTime || "",
    hubArrivalTime: ai.setupReturnArrivalTime || "",
    returnDistanceKm: ai.setupReturnDistanceKm || 0,
    returnTravelMins: ai.setupReturnTravelMins || 0,
  }
}

// Extract dismantle task from an order for a specific date
function extractDismantleTask(order: SalesOrder, date: string): ScheduledTask | null {
  const ai = order.additionalInfo
  if (!ai) return null

  // Check if this order has a dismantle scheduled for the given date
  const dismantleDate = ai.confirmedDismantleDate || order.eventData?.customerPreferredDismantleDate || ""
  if (dismantleDate !== date) return null
  if (!ai.dismantleLorry) return null

  const team = ai.dismantleLorry as TeamName
  const hubAddress = getHubAddress()
  const departureFromType = ai.dismantleDepartureFromType === "other" ? "other" : "hub"
  const departureFromAddress = departureFromType === "other" ? (ai.dismantleDepartureAddress || "") : hubAddress
  const departureTime = ai.dismantleDepartureTime || ""
  const travelHours = ai.dismantleTravelHours || 0
  const travelMinutes = ai.dismantleTravelMinutes || 0
  const arrivalTime = calculateArrivalTime(departureTime, travelHours, travelMinutes)
  const outboundTravelMins = travelHours * 60 + travelMinutes

  return {
    orderNumber: order.orderNumber,
    customerName: order.customerData?.customerName || order.customerData?.companyName || "Unknown",
    taskType: "dismantle",
    team,
    siteAddress: ai.dismantleDestinationAddress || order.customerData?.deliveryAddress || "",
    coordinates: null,
    departureFromType,
    departureFromAddress,
    departureTime,
    arrivalTime,
    taskStartTime: ai.dismantleScheduleStartTime || arrivalTime,
    taskEndTime: ai.dismantleEstimatedEndTime || "",
    outboundDistanceKm: ai.dismantleDistanceKm || 0,
    outboundTravelMins,
    returnDepartureTime: ai.dismantleEstimatedEndTime || "",
    hubArrivalTime: ai.dismantleReturnArrivalTime || "",
    returnDistanceKm: ai.dismantleReturnDistanceKm || 0,
    returnTravelMins: ai.dismantleReturnTravelMins || 0,
  }
}

// Extract other adhoc task from an order for a specific date
function extractOtherAdhocTask(order: SalesOrder, date: string): ScheduledTask | null {
  const ai = order.additionalInfo
  if (!ai) return null

  // Check if this order has an other adhoc task scheduled for the given date
  if (ai.confirmedOtherAdhocDate !== date) return null
  if (!ai.otherAdhocLorry) return null

  const team = ai.otherAdhocLorry as TeamName

  return {
    orderNumber: order.orderNumber,
    customerName: order.customerData?.customerName || order.customerData?.companyName || "Unknown",
    taskType: "other-adhoc",
    team,
    siteAddress: order.customerData?.deliveryAddress || "",
    coordinates: null,
    departureFromType: "hub",
    departureFromAddress: getHubAddress(),
    departureTime: "", // Other adhoc may not have departure time
    arrivalTime: "",
    taskStartTime: ai.otherAdhocScheduleStartTime || "",
    taskEndTime: ai.otherAdhocEstimatedEndTime || "",
    outboundDistanceKm: 0,
    outboundTravelMins: 0,
    returnDepartureTime: ai.otherAdhocEstimatedEndTime || "",
    hubArrivalTime: "",
    returnDistanceKm: 0,
    returnTravelMins: 0,
  }
}

// Get all tasks for a specific date from all orders
export function getTasksForDate(orders: SalesOrder[], date: string): ScheduledTask[] {
  const tasks: ScheduledTask[] = []

  for (const order of orders) {
    const setupTask = extractSetupTask(order, date)
    if (setupTask) tasks.push(setupTask)

    const dismantleTask = extractDismantleTask(order, date)
    if (dismantleTask) tasks.push(dismantleTask)

    const otherAdhocTask = extractOtherAdhocTask(order, date)
    if (otherAdhocTask) tasks.push(otherAdhocTask)
  }

  return tasks
}

// Group tasks by team
export function groupTasksByTeam(tasks: ScheduledTask[]): Map<TeamName, ScheduledTask[]> {
  const grouped = new Map<TeamName, ScheduledTask[]>()

  for (const task of tasks) {
    const existing = grouped.get(task.team) || []
    existing.push(task)
    grouped.set(task.team, existing)
  }

  return grouped
}

// Sort tasks chronologically by departure time
export function sortTasksByTime(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((a, b) => {
    const timeA = a.departureTime || a.taskStartTime || "23:59"
    const timeB = b.departureTime || b.taskStartTime || "23:59"
    return timeA.localeCompare(timeB)
  })
}

// Build team journey from tasks (HUB -> Site A -> HUB -> Site B -> HUB...)
export function buildTeamJourney(
  team: TeamName,
  tasks: ScheduledTask[],
  date: string,
  hubAddress: string
): TeamJourney {
  const sortedTasks = sortTasksByTime(tasks)
  const waypoints: Waypoint[] = []
  let totalDistanceKm = 0
  let totalDurationMins = 0

  for (let i = 0; i < sortedTasks.length; i++) {
    const task = sortedTasks[i]

    // Add outbound origin (hub or other) as a waypoint
    if (task.departureFromType === "other") {
      waypoints.push({
        type: "site",
        address: task.departureFromAddress || "",
        coordinates: null,
        arrivalTime: "",
        departureTime: task.departureTime,
      })
    } else if (i === 0 || waypoints[waypoints.length - 1]?.type === "hub") {
      waypoints.push({
        type: "hub",
        address: hubAddress,
        coordinates: null,
        arrivalTime: i === 0 ? "" : waypoints[waypoints.length - 1]?.arrivalTime || "",
        departureTime: task.departureTime,
      })
    }

    // Add site waypoint
    waypoints.push({
      type: "site",
      address: task.siteAddress,
      coordinates: task.coordinates,
      arrivalTime: task.arrivalTime,
      departureTime: task.returnDepartureTime,
      task,
    })

    // Add return to HUB
    if (task.hubArrivalTime) {
      waypoints.push({
        type: "hub",
        address: hubAddress,
        coordinates: null,
        arrivalTime: task.hubArrivalTime,
        departureTime: "", // Will be set by next task's departure
      })
    }

    totalDistanceKm += (task.outboundDistanceKm || 0) + (task.returnDistanceKm || 0)
    totalDurationMins += (task.outboundTravelMins || 0) + (task.returnTravelMins || 0)
  }

  return {
    team,
    color: getTeamColor(team),
    date,
    waypoints,
    tasks: sortedTasks,
    totalDistanceKm,
    totalDurationMins,
  }
}

// Build team day schedules from orders
export function buildTeamDaySchedules(orders: SalesOrder[], date: string): TeamDaySchedule[] {
  const hubAddress = getHubAddress()
  const tasks = getTasksForDate(orders, date)
  const groupedTasks = groupTasksByTeam(tasks)

  const schedules: TeamDaySchedule[] = []
  const teams: TeamName[] = ["Team A", "Team B", "Team C", "Team D", "Team E"]

  for (const team of teams) {
    const teamTasks = groupedTasks.get(team) || []
    if (teamTasks.length === 0) continue

    const journey = buildTeamJourney(team, teamTasks, date, hubAddress)

    schedules.push({
      team,
      color: getTeamColor(team),
      date,
      tasks: journey.tasks,
      journey,
      routeGeometry: null,
      isLoading: false,
    })
  }

  return schedules
}

// Convert team schedule to timeline events for display
export function buildTimelineEvents(schedule: TeamDaySchedule): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const { team, color, tasks } = schedule

  for (const task of tasks) {
    const startLabel =
      task.taskType === "setup"
        ? "Setup begins"
        : task.taskType === "dismantle"
          ? "Dismantle begins"
          : "Task begins"
    const endLabel =
      task.taskType === "setup"
        ? "Setup complete"
        : task.taskType === "dismantle"
          ? "Dismantle complete"
          : "Task complete"

    // Depart from HUB
    if (task.departureTime) {
      const isFromHub = task.departureFromType === "hub"
      events.push({
        id: `${task.orderNumber}-${task.taskType}-depart-hub`,
        time: task.departureTime,
        type: "depart-hub",
        label: isFromHub ? "Depart from HUB" : "Depart from site",
        orderNumber: task.orderNumber,
        customerName: task.customerName,
        address: task.departureFromAddress || undefined,
        team,
        color,
      })
    }

    // Arrive at site (merge with task start if same time)
    if (task.arrivalTime && task.taskStartTime && task.arrivalTime === task.taskStartTime) {
      events.push({
        id: `${task.orderNumber}-${task.taskType}-arrive-site-start`,
        time: task.arrivalTime,
        type: "arrive-site",
        label: `Arrive at site & ${startLabel}`,
        orderNumber: task.orderNumber,
        customerName: task.customerName,
        address: task.siteAddress,
        team,
        color,
      })
    } else if (task.arrivalTime) {
      events.push({
        id: `${task.orderNumber}-${task.taskType}-arrive-site`,
        time: task.arrivalTime,
        type: "arrive-site",
        label: "Arrive at site",
        orderNumber: task.orderNumber,
        customerName: task.customerName,
        address: task.siteAddress,
        team,
        color,
      })
    }

    // Task start (only if not merged with arrival)
    if (task.taskStartTime && (!task.arrivalTime || task.arrivalTime !== task.taskStartTime)) {
      events.push({
        id: `${task.orderNumber}-${task.taskType}-task-start`,
        time: task.taskStartTime,
        type: "task-start",
        label: startLabel,
        orderNumber: task.orderNumber,
        customerName: task.customerName,
        team,
        color,
      })
    }

    // Task end (merge with depart site if same time)
    if (task.taskEndTime && task.returnDepartureTime && task.taskEndTime === task.returnDepartureTime) {
      events.push({
        id: `${task.orderNumber}-${task.taskType}-task-end-depart-site`,
        time: task.taskEndTime,
        type: "task-end",
        label: `${endLabel} / Depart from site`,
        orderNumber: task.orderNumber,
        team,
        color,
      })
    } else {
      // Task end
      if (task.taskEndTime) {
        events.push({
          id: `${task.orderNumber}-${task.taskType}-task-end`,
          time: task.taskEndTime,
          type: "task-end",
          label: endLabel,
          orderNumber: task.orderNumber,
          team,
          color,
        })
      }

      // Depart from site
      if (task.returnDepartureTime) {
        events.push({
          id: `${task.orderNumber}-${task.taskType}-depart-site`,
          time: task.returnDepartureTime,
          type: "depart-site",
          label: "Depart from site",
          team,
          color,
        })
      }
    }

    // Arrive at HUB
    if (task.hubArrivalTime) {
      events.push({
        id: `${task.orderNumber}-${task.taskType}-arrive-hub`,
        time: task.hubArrivalTime,
        type: "arrive-hub",
        label: "Return to HUB",
        team,
        color,
      })
    }
  }

  // Sort events by time
  return events.sort((a, b) => a.time.localeCompare(b.time))
}

// Get unique addresses from team schedules for geocoding
export function getUniqueAddresses(schedules: TeamDaySchedule[]): string[] {
  const addresses = new Set<string>()
  const hubAddress = getHubAddress()
  addresses.add(hubAddress)

  for (const schedule of schedules) {
    for (const task of schedule.tasks) {
      if (task.siteAddress) {
        addresses.add(task.siteAddress)
      }
    }
  }

  return Array.from(addresses)
}

// Format date for display (e.g., "Friday, 7 Feb 2026")
export function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-MY", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return dateStr
  }
}

// Format time for display (e.g., "09:30" -> "9:30 AM")
export function formatTimeForDisplay(timeStr: string): string {
  if (!timeStr) return ""
  const [hours, mins] = timeStr.split(":").map(Number)
  if (isNaN(hours) || isNaN(mins)) return timeStr

  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`
}

// Check if a date has any scheduled tasks
export function hasTasksOnDate(orders: SalesOrder[], date: string): boolean {
  return getTasksForDate(orders, date).length > 0
}

// Get all dates that have scheduled tasks (for highlighting in date picker)
export function getDatesWithTasks(orders: SalesOrder[]): Set<string> {
  const dates = new Set<string>()

  for (const order of orders) {
    const ai = order.additionalInfo
    if (!ai) continue

    if (ai.confirmedSetupDate && ai.setupLorry) {
      dates.add(ai.confirmedSetupDate)
    }
    if (ai.confirmedDismantleDate && ai.dismantleLorry) {
      dates.add(ai.confirmedDismantleDate)
    }
    if (ai.confirmedOtherAdhocDate && ai.otherAdhocLorry) {
      dates.add(ai.confirmedOtherAdhocDate)
    }
  }

  return dates
}
