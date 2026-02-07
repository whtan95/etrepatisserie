/**
 * AI Scheduler - Être Patisserie Order Management
 *
 * All AI scheduling logic is centralized in this file.
 * Developers can read this single file to understand how scheduling decisions are made.
 *
 * OPTIMIZATION PRIORITIES (in order):
 * 1. No Overtime (OT) - Company policy: avoid OT when possible
 * 2. Travel Efficiency (Co-Join) - Chain nearby jobs to reduce travel / avoid new team
 * 3. Customer Time Windows - Meet customer's preferred arrival time (with flexibility)
 * 4. Workload Balance - Distribute jobs evenly across teams
 *
 * WARNINGS:
 * - Capacity Overflow: All teams fully booked, OT required
 * - Overloaded Team: Team has >4 tasks in one day
 * - Long Travel: Distance >30km
 */

import type { SalesOrder, AdditionalInfo, OrderItem } from "./types"
import { updateOrderByNumber } from "./order-storage"
import { getBestCustomerAddress } from "./address-utils"

// ============================================================================
// TYPES
// ============================================================================

export type TeamName = "Team A" | "Team B" | "Team C" | "Team D" | "Team E"

export const TEAMS: TeamName[] = ["Team A", "Team B", "Team C", "Team D", "Team E"]

export interface AISettings {
  hubAddress: string
  bufferTimeMinutes: number
  minutesPerKm: number
  radiusKm: number        // Default 10km for co-join
  waitingHours: number    // Default 1.5 hours max wait for co-join
}

export interface AppSettings {
  tent10x10Minutes?: number
  tent20x20Minutes?: number
  tent20x30Minutes?: number
  inventoryTaskTimesById?: Record<string, { setupMins: number; dismantleMins: number }>
  workStartTime: string   // Default "08:00"
  workEndTime: string     // Default "16:30"
  lunchStartTime: string  // Default "13:00"
  lunchEndTime: string    // Default "14:00"
}

export interface AIScheduleInput {
  order: SalesOrder
  allOrders: SalesOrder[]
  aiSettings: AISettings
  appSettings: AppSettings
  distanceKm: number
  preferredSetupTeam?: TeamName
  preferredDismantleTeam?: TeamName
  allowCoJoin?: boolean
  coJoinStrategy?: "tail-first" | "head-first" | "auto-avoid-ot"
  excludedTeams?: TeamName[]
  /**
   * Time window mode for preferred time handling:
   * - "strict": Must arrive within customer's exact time slot (no flexibility)
   * - "flexible": Customer is willing to adjust time if it helps with Co-Join or avoiding OT
   * Default: "flexible"
   */
  timeWindowMode?: "strict" | "flexible"
}

export interface CoJoinInfo {
  applied: boolean
  type: "tail" | "head" | null
  linkedOrderNumber: string | null
  linkedOrderSite: string | null
  team: TeamName | null
  distanceKm: number | null
  travelMins?: number | null
  waitingMins: number | null
  reason: string
  adjustedArrivalTime?: string
  adjustedDepartureTime?: string
  // For updating the linked order
  linkedOrderUpdate?: {
    orderNumber: string
    field: "setupReturnChoice" | "dismantleReturnChoice"
    oldValue: string
    newValue: "remain-on-site"
    // Store which order this co-join proceeds to (for display)
    nextTaskOrderNumber: string
  }
}

export interface LunchSuggestion {
  start: string
  end: string
  reason: string
}

export interface TeamJobCounts {
  [key: string]: number
}

export interface CapacityOverflowInfo {
  isOverflow: boolean
  suggestedOTTeam: TeamName | null
  suggestedOTFinishTime: string | null
  message: string
}

export interface OvertimeDecisionInfo {
  required: boolean
  recommendation: "deploy-new-team" | "allow-ot"
  message: string
  setup: { overtime: boolean; canAvoidByDisablingCoJoin: boolean } | null
  dismantle: { overtime: boolean; canAvoidByDisablingCoJoin: boolean } | null
}

export interface AIScheduleResult {
  // Setup schedule
  setupDate: string
  setupTeam: TeamName
  setupArrivalTime: string
  setupDepartureTime: string
  setupTravelTimeHours: number
  setupTravelTimeMins: number
  setupDurationMins: number
  setupBufferMins: number
  setupEndTime: string
  setupHubArrivalTime: string
  setupDestination: string
  setupOvertime: boolean
  setupLunchSuggestion: LunchSuggestion | null
  setupCoJoin: CoJoinInfo

  // Dismantle schedule
  dismantleDate: string
  dismantleTeam: TeamName
  dismantleArrivalTime: string
  dismantleDepartureTime: string
  dismantleTravelTimeHours: number
  dismantleTravelTimeMins: number
  dismantleDurationMins: number
  dismantleBufferMins: number
  dismantleEndTime: string
  dismantleHubArrivalTime: string
  dismantleDestination: string
  dismantleOvertime: boolean
  dismantleLunchSuggestion: LunchSuggestion | null
  dismantleCoJoin: CoJoinInfo

  // Distance info
  distanceKm: number
  hubAddress: string

  // Validation
  noOverlap: boolean
  withinPreferred: boolean
  setupConflictWith: string | null
  dismantleConflictWith: string | null

  // Workload info
  setupTeamJobCount: number
  dismantleTeamJobCount: number

  // Warnings
  capacityOverflow: CapacityOverflowInfo
  overtimeDecision: OvertimeDecisionInfo
  setupTeamOverloaded: boolean
  dismantleTeamOverloaded: boolean
  longTravelWarning: boolean

  // Settings used
  workEndTime: string
  lunchStartTime: string
  lunchEndTime: string

  // Reasoning for AI report
  setupReasoning: string[]
  dismantleReasoning: string[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseQty(value: number | string | undefined): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function getPerUnitMinsFromSettings(
  item: OrderItem,
  kind: "setup" | "dismantle",
  map: Record<string, { setupMins: number; dismantleMins: number }> | undefined
): number {
  const invId = (item as any).inventoryId as string | undefined
  const fromMap = invId && map ? map[invId] : undefined
  if (fromMap) return kind === "setup" ? fromMap.setupMins : fromMap.dismantleMins

  // Legacy per-item fields (older orders)
  const legacySetup = (item as any).setupMinsPerUnit
  const legacyDismantle = (item as any).dismantleMinsPerUnit
  if (kind === "setup" && typeof legacySetup === "number" && Number.isFinite(legacySetup)) return Math.max(0, legacySetup)
  if (kind === "dismantle") {
    if (typeof legacyDismantle === "number" && Number.isFinite(legacyDismantle)) return Math.max(0, legacyDismantle)
    if (typeof legacySetup === "number" && Number.isFinite(legacySetup)) return Math.max(0, legacySetup)
  }
  return 0
}

function calculateWorkMinutesFromItemsWithSettings(
  items: OrderItem[] | undefined,
  kind: "setup" | "dismantle",
  map: Record<string, { setupMins: number; dismantleMins: number }> | undefined
): number {
  if (!items || !Array.isArray(items) || items.length === 0) return 0
  return items.reduce((sum, item) => {
    const qty = parseQty(item.quantity as any)
    if (qty <= 0) return sum
    const perUnit = getPerUnitMinsFromSettings(item, kind, map)
    return sum + qty * perUnit
  }, 0)
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 */
export function timeToMinutes(time: string): number | null {
  if (!time) return null

  // Try multiple formats
  // Format 1: "HH:MM" (e.g., "11:00", "9:30")
  let match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    if (!isNaN(hours) && !isNaN(mins)) return hours * 60 + mins
  }

  // Format 2: "HH:MM AM/PM" (e.g., "11:00 AM", "2:30 PM")
  match = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (match) {
    let hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    const period = match[3].toLowerCase()
    if (period === "pm" && hours !== 12) hours += 12
    if (period === "am" && hours === 12) hours = 0
    if (!isNaN(hours) && !isNaN(mins)) return hours * 60 + mins
  }

  // Format 3: "HH.MM" (e.g., "11.00")
  match = time.match(/^(\d{1,2})\.(\d{2})$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    if (!isNaN(hours) && !isNaN(mins)) return hours * 60 + mins
  }

  // Format 4: Just extract first HH:MM pattern from string
  match = time.match(/(\d{1,2}):(\d{2})/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    if (!isNaN(hours) && !isNaN(mins)) return hours * 60 + mins
  }

  return null
}

/**
 * Convert minutes since midnight to HH:MM format
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

function localDateToISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function localTimeToHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

function getSalesOrderPlacedLocal(order: SalesOrder): { dateISO: string; mins: number; label: string } | null {
  const parse = (raw: string | undefined) => {
    if (!raw) return null
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return null
    return {
      dateISO: localDateToISO(d),
      mins: d.getHours() * 60 + d.getMinutes(),
      label: `${localDateToISO(d)} ${localTimeToHHMM(d)}`,
    }
  }

  const created = parse(order.createdAt)
  if (created) return created

  const od = (order.orderMeta?.orderDate || "").trim()
  const ot = (order.orderMeta?.orderTime || "").trim()
  if (!od || !ot) return null
  const d = new Date(`${od}T${ot}:00`)
  if (Number.isNaN(d.getTime())) return null
  return {
    dateISO: localDateToISO(d),
    mins: d.getHours() * 60 + d.getMinutes(),
    label: `${localDateToISO(d)} ${localTimeToHHMM(d)}`,
  }
}

function formatTimeHHMMToAmPm(time: string): string {
  const mins = timeToMinutes(time)
  if (mins === null) return time
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? "pm" : "am"
  let h12 = h24 % 12
  if (h12 === 0) h12 = 12
  return `${h12}:${m.toString().padStart(2, "0")}${period}`
}

/**
 * Parse time slot to get start time in minutes
 * e.g., "11:30am - 1:00pm" → 690 (11:30 = 11*60+30)
 */
export function parseTimeSlotStart(slot: string): number | null {
  if (!slot) return null
  if (slot.trim().toLowerCase() === "none") return null
  const match = slot.match(/^(\d{1,2}):(\d{2})(am|pm)/i)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const mins = parseInt(match[2], 10)
  const period = match[3].toLowerCase()
  if (period === "pm" && hours !== 12) hours += 12
  if (period === "am" && hours === 12) hours = 0
  return hours * 60 + mins
}

/**
 * Parse time slot to get end time in minutes
 */
export function parseTimeSlotEnd(slot: string): number | null {
  if (!slot) return null
  if (slot.trim().toLowerCase() === "none") return null
  const match = slot.match(/-\s*(\d{1,2}):(\d{2})(am|pm)/i)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const mins = parseInt(match[2], 10)
  const period = match[3].toLowerCase()
  if (period === "pm" && hours !== 12) hours += 12
  if (period === "am" && hours === 12) hours = 0
  return hours * 60 + mins
}

/**
 * Convert Date object to HH:MM string
 */
export function dateToTimeString(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

/**
 * Create Date from date string and time string
 */
export function toDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null
  const mins = timeToMinutes(timeStr)
  if (mins === null) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  date.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return date
}

/**
 * Ensure end date is after start date (handles crossing midnight)
 */
export function ensureEndAfterStart(start: Date, end: Date): Date {
  if (end <= start) {
    const newEnd = new Date(end)
    newEnd.setDate(newEnd.getDate() + 1)
    return newEnd
  }
  return end
}

/**
 * Add minutes to time string, return new time string
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const totalMins = timeToMinutes(time)
  if (totalMins === null) return time
  return minutesToTime(totalMins + minutes)
}

/**
 * Subtract minutes from time string, return new time string
 */
export function subtractMinutesFromTime(time: string, minutes: number): string {
  const totalMins = timeToMinutes(time)
  if (totalMins === null) return time
  return minutesToTime(Math.max(0, totalMins - minutes))
}

// ============================================================================
// TASK COUNTING - Setup = 1 task, Dismantle = 1 task, Adhoc = 1 task
// ============================================================================

interface TaskInfo {
  orderNumber: string
  type: "setup" | "dismantle" | "other-adhoc"
  team: TeamName
  date: string
  startTime: Date // When team departs (for conflict detection)
  endTime: Date // When team is fully available (includes return to hub if applicable)
  siteArrivalTime: Date // When task arrives AT THE SITE (for head co-join detection)
  siteEndTime: Date // When task completes AT THE SITE (for tail co-join detection)
  destination: string
}

/**
 * Get all tasks for a specific date from all orders
 * Each setup, dismantle, and adhoc counts as 1 task
 */
export function getTasksForDate(date: string, allOrders: SalesOrder[]): TaskInfo[] {
  const tasks: TaskInfo[] = []

  for (const order of allOrders) {
    const ai = order.additionalInfo
    if (!ai) continue

    // Setup task
    if (ai.confirmedSetupDate === date && ai.setupLorry) {
      // Try multiple sources for each time field with fallbacks
      const startTimeStr = ai.departureFromHub || ai.scheduleStartTime || ai.confirmedSetupTime
      const siteArrivalTimeStr = ai.scheduleStartTime || ai.confirmedSetupTime || ai.departureFromHub
      const endTimeStr = ai.setupReturnArrivalTime || ai.estimatedEndTime
      const siteEndTimeStr = ai.estimatedEndTime || ai.setupReturnArrivalTime

      const startTime = toDateTime(date, startTimeStr)
      const siteArrivalTime = toDateTime(date, siteArrivalTimeStr)
      const endTime = toDateTime(date, endTimeStr)
      const siteEndTime = toDateTime(date, siteEndTimeStr)

      // Only require startTime and siteEndTime as minimum (for co-join detection)
      if (startTime && siteEndTime) {
        tasks.push({
          orderNumber: order.orderNumber,
          type: "setup",
          team: ai.setupLorry as TeamName,
          date,
          startTime,
          endTime: endTime ? ensureEndAfterStart(startTime, endTime) : siteEndTime,
          siteArrivalTime: siteArrivalTime ? ensureEndAfterStart(startTime, siteArrivalTime) : startTime,
          siteEndTime: ensureEndAfterStart(startTime, siteEndTime),
          destination: ai.setupDestinationAddress || order.customerData.deliveryAddress || "",
        })
      }
    }

    // Dismantle task
    if (ai.confirmedDismantleDate === date && ai.dismantleLorry) {
      const startTimeStr = ai.dismantleDepartureTime || ai.dismantleScheduleStartTime || ai.confirmedDismantleTime
      const siteArrivalTimeStr = ai.dismantleScheduleStartTime || ai.confirmedDismantleTime || ai.dismantleDepartureTime
      const endTimeStr = ai.dismantleReturnArrivalTime || ai.dismantleEstimatedEndTime
      const siteEndTimeStr = ai.dismantleEstimatedEndTime || ai.dismantleReturnArrivalTime

      const startTime = toDateTime(date, startTimeStr)
      const siteArrivalTime = toDateTime(date, siteArrivalTimeStr)
      const endTime = toDateTime(date, endTimeStr)
      const siteEndTime = toDateTime(date, siteEndTimeStr)

      if (startTime && siteEndTime) {
        tasks.push({
          orderNumber: order.orderNumber,
          type: "dismantle",
          team: ai.dismantleLorry as TeamName,
          date,
          startTime,
          endTime: endTime ? ensureEndAfterStart(startTime, endTime) : siteEndTime,
          siteArrivalTime: siteArrivalTime ? ensureEndAfterStart(startTime, siteArrivalTime) : startTime,
          siteEndTime: ensureEndAfterStart(startTime, siteEndTime),
          destination: ai.dismantleDestinationAddress || order.customerData.deliveryAddress || "",
        })
      }
    }

    // Other adhoc task
    if (ai.confirmedOtherAdhocDate === date && ai.otherAdhocLorry) {
      const startTime = toDateTime(date, ai.otherAdhocScheduleStartTime)
      const endTime = toDateTime(date, ai.otherAdhocEstimatedEndTime)
      // For adhoc, site arrival/end time is same as start/end time
      if (startTime && endTime) {
        tasks.push({
          orderNumber: order.orderNumber,
          type: "other-adhoc",
          team: ai.otherAdhocLorry as TeamName,
          date,
          startTime,
          endTime: ensureEndAfterStart(startTime, endTime),
          siteArrivalTime: startTime, // Same as startTime for adhoc
          siteEndTime: ensureEndAfterStart(startTime, endTime), // Same as endTime for adhoc
          destination: order.customerData.deliveryAddress,
        })
      }
    }
  }

  return tasks
}

/**
 * Count tasks per team for a specific date
 */
export function getTeamJobCounts(date: string, allOrders: SalesOrder[]): TeamJobCounts {
  const counts: TeamJobCounts = {
    "Team A": 0,
    "Team B": 0,
    "Team C": 0,
    "Team D": 0,
    "Team E": 0,
  }

  const tasks = getTasksForDate(date, allOrders)
  for (const task of tasks) {
    if (counts[task.team] !== undefined) {
      counts[task.team]++
    }
  }

  return counts
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Check if a candidate time slot conflicts with existing tasks for a team
 * Returns the conflicting order number, or null if no conflict
 */
export function findConflict(
  candidateStart: Date,
  candidateEnd: Date,
  team: TeamName,
  date: string,
  taskType: "setup" | "dismantle" | "other-adhoc",
  currentOrderNumber: string,
  allOrders: SalesOrder[]
): string | null {
  const tasks = getTasksForDate(date, allOrders)

  for (const task of tasks) {
    // Skip if different team
    if (task.team !== team) continue
    // Skip if same order (we're scheduling this order)
    if (task.orderNumber === currentOrderNumber) continue

    // Check overlap: [A, B] overlaps [C, D] if A < D && B > C
    if (candidateStart < task.endTime && candidateEnd > task.startTime) {
      return task.orderNumber
    }
  }

  return null
}

// ============================================================================
// PRIORITY 1: CO-JOIN LOGIC
// ============================================================================

type DistanceEstimate = { distanceKm: number; travelMins?: number }

const distanceCache = new Map<string, DistanceEstimate>()

async function getGeoDistanceBetweenSites(fromAddress: string, toAddress: string): Promise<DistanceEstimate | null> {
  // This scheduler is called from a client component (scheduling page).
  // If this file is ever executed on the server, fall back to heuristic logic.
  if (typeof window === "undefined") return null

  const from = (fromAddress || "").trim()
  const to = (toAddress || "").trim()
  if (!from || !to) return null

  const key = `${from}__${to}`
  const cached = distanceCache.get(key)
  if (cached) return cached

  try {
    const res = await fetch("/api/calculate-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress: from, toAddress: to }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.success) return null

    const distanceKm = typeof data?.distance?.km === "number" ? data.distance.km : null
    const travelMins = typeof data?.duration?.minutes === "number" ? data.duration.minutes : undefined
    if (distanceKm === null) return null

    const estimate: DistanceEstimate = { distanceKm, travelMins }
    distanceCache.set(key, estimate)
    return estimate
  } catch {
    return null
  }
}

function getAcceptableArrivalRange(
  customerTimeSlot: string,
  timeWindowMode: "strict" | "flexible" = "flexible"
): { slotStart: number | null; slotEnd: number | null; minAcceptable: number | null; maxAcceptable: number | null } {
  const slotStart = parseTimeSlotStart(customerTimeSlot)
  const slotEnd = parseTimeSlotEnd(customerTimeSlot)

  if (slotStart === null || slotEnd === null) {
    return { slotStart, slotEnd, minAcceptable: null, maxAcceptable: null }
  }

  if (timeWindowMode === "strict") {
    // Strict mode: must arrive within exact customer time slot
    return {
      slotStart,
      slotEnd,
      minAcceptable: slotStart,
      maxAcceptable: slotEnd,
    }
  }

  // Flexible mode: customer is willing to adjust time for Co-Join/OT optimization
  // No time window restriction - AI can schedule any time
  return {
    slotStart,
    slotEnd,
    minAcceptable: null,  // No min limit
    maxAcceptable: null,  // No max limit
  }
}

function getCustomerTimeSlotForTask(
  order: SalesOrder | undefined,
  taskType: "setup" | "dismantle" | "other-adhoc"
): string | undefined {
  if (!order) return undefined
  if (taskType === "other-adhoc") return undefined

  const normalize = (value: string | undefined): string | undefined => {
    const v = (value || "").trim()
    if (!v) return undefined
    if (v.toLowerCase() === "none") return undefined
    return v
  }

  const pick = (a?: string, b?: string) => normalize(a) || normalize(b) || undefined

  return taskType === "setup"
    ? pick(order.customerData.setupTimeSlot, order.eventData.desiredSetupTime)
    : pick(order.customerData.dismantleTimeSlot, order.eventData.desiredDismantleTime)
}

function isWithinFlexWindowMins(valueMins: number, customerTimeSlot: string, timeWindowMode: "strict" | "flexible" = "flexible"): boolean {
  const r = getAcceptableArrivalRange(customerTimeSlot, timeWindowMode)
  if (r.minAcceptable == null || r.maxAcceptable == null) return true
  return valueMins >= r.minAcceptable && valueMins <= r.maxAcceptable
}

/**
 * Find the best co-join candidate for TAIL co-join
 * (Look BACK for a job ending before this one that we can chain with)
 */
export async function findTailCoJoinCandidate(
  date: string,
  arrivalTime: string,
  destination: string,
  taskType: "setup" | "dismantle",
  currentOrderNumber: string,
  allOrders: SalesOrder[],
  settings: AISettings,
  customerTimeSlot?: string,
  minArrivalMins?: number,
  timeWindowMode: "strict" | "flexible" = "flexible"
): Promise<CoJoinInfo> {
  const noCoJoin: CoJoinInfo = {
    applied: false,
    type: null,
    linkedOrderNumber: null,
    linkedOrderSite: null,
    team: null,
    distanceKm: null,
    waitingMins: null,
    reason: "No eligible co-join found",
  }

  const arrivalMins = timeToMinutes(arrivalTime)
  if (arrivalMins === null) return { ...noCoJoin, reason: `Invalid arrival time: "${arrivalTime}"` }

  const acceptable =
    customerTimeSlot
      ? getAcceptableArrivalRange(customerTimeSlot, timeWindowMode)
      : { slotStart: null, slotEnd: null, minAcceptable: null, maxAcceptable: null }

  const minAcceptable = acceptable.minAcceptable ?? arrivalMins
  const maxAcceptable = acceptable.maxAcceptable ?? arrivalMins
  const minAcceptableAdjusted = minArrivalMins != null ? Math.max(minAcceptable, minArrivalMins) : minAcceptable

  const tasks = getTasksForDate(date, allOrders)

  // Debug: show how many tasks found for this date
  const taskCount = tasks.length
  const tasksSummary = tasks.map(t => `${t.orderNumber}(${t.type},ends:${t.siteEndTime.getHours()}:${t.siteEndTime.getMinutes().toString().padStart(2,'0')})`).join(", ")

  // Find tasks that end before our latest acceptable arrival time.
  // Use siteEndTime for co-join detection (when task finishes AT THE SITE, not hub arrival)
  const candidateTasks = tasks.filter(task => {
    if (task.orderNumber === currentOrderNumber) return false
    // Use siteEndTime - when task finishes at the site (not when team returns to hub)
    const taskSiteEndMins = task.siteEndTime.getHours() * 60 + task.siteEndTime.getMinutes()
    return taskSiteEndMins <= maxAcceptable
  })

  if (candidateTasks.length === 0) {
    if (taskCount === 0) {
      return { ...noCoJoin, reason: `No scheduled tasks found on ${date}` }
    }
    return { ...noCoJoin, reason: `Found ${taskCount} task(s) on ${date} [${tasksSummary}] but none end before ${arrivalTime}` }
  }

  // Sort by site end time descending (latest ending first = best candidate)
  candidateTasks.sort((a, b) => b.siteEndTime.getTime() - a.siteEndTime.getTime())

  // For now, we'll use a simple distance estimation
  // In a real implementation, you would call an API to get actual distance
  // For co-join, we check if destination addresses seem close (same area)
  // This is a placeholder - the actual distance should come from the scheduling page

  // Track rejection reasons for debug
  const rejectionReasons: string[] = []

  // Limit API calls on busy days
  const maxCandidatesToTry = 10

  for (const candidate of candidateTasks.slice(0, maxCandidatesToTry)) {
    const candidateOrder = allOrders.find(o => o.orderNumber === candidate.orderNumber)
    const candidateSlot = getCustomerTimeSlotForTask(candidateOrder, candidate.type)
    if (candidateSlot) {
      const candidateArrMins = candidate.siteArrivalTime.getHours() * 60 + candidate.siteArrivalTime.getMinutes()
      const candidateEndMins = candidate.siteEndTime.getHours() * 60 + candidate.siteEndTime.getMinutes()
      if (
        !isWithinFlexWindowMins(candidateArrMins, candidateSlot, timeWindowMode) ||
        !isWithinFlexWindowMins(candidateEndMins, candidateSlot, timeWindowMode)
      ) {
        rejectionReasons.push(`${candidate.orderNumber}: outside linked order time window (mode: ${timeWindowMode})`)
        continue
      }
    }

    const geo = await getGeoDistanceBetweenSites(candidate.destination, destination)
    const estimatedDistance = geo?.distanceKm ?? estimateDistanceBetweenSites(candidate.destination, destination)

    if (estimatedDistance > settings.radiusKm) {
      rejectionReasons.push(`${candidate.orderNumber}: dist=${estimatedDistance.toFixed(1)}km > ${settings.radiusKm}km`)
      continue // Distance too far
    }

    // Calculate travel time from candidate to this job
    const travelMins =
      typeof geo?.travelMins === "number"
        ? geo.travelMins
        : Math.round(estimatedDistance * settings.minutesPerKm)

    // Calculate waiting time at candidate site (use siteEndTime!)
    const candidateSiteEndMins = candidate.siteEndTime.getHours() * 60 + candidate.siteEndTime.getMinutes()

    // We can shift arrival time (earlier/later) within customer's acceptable window to enable co-join.
    // Choose the earliest arrival that is both achievable and acceptable (minAcceptable..maxAcceptable).
    const earliestPossibleArrival = candidateSiteEndMins + travelMins
    if (earliestPossibleArrival > maxAcceptable) {
      rejectionReasons.push(`${candidate.orderNumber}: ends too late (earliest arrive ${minutesToTime(earliestPossibleArrival)} > max ${minutesToTime(maxAcceptable)})`)
      continue
    }

    const chosenArrivalMins = Math.max(earliestPossibleArrival, minAcceptableAdjusted)
    const departFromCandidateMins = chosenArrivalMins - travelMins
    const waitingMins = departFromCandidateMins - candidateSiteEndMins

    if (waitingMins < 0) {
      rejectionReasons.push(`${candidate.orderNumber}: ends too late (wait=${waitingMins}min)`)
      continue // Impossible - candidate doesn't finish in time
    }

    if (waitingMins > settings.waitingHours * 60) {
      rejectionReasons.push(`${candidate.orderNumber}: wait=${waitingMins}min > ${settings.waitingHours * 60}min`)
      continue // Waiting too long
    }

    // Check if the candidate's team is available (no other job between).
    // IMPORTANT: exclude the candidate task itself; otherwise endTime (hub return) causes a false conflict.
    const checkStart = candidate.siteEndTime
    const checkEnd = toDateTime(date, minutesToTime(chosenArrivalMins))
    if (checkEnd) {
      const teamTasks = getTasksForDate(date, allOrders).filter(t => t.team === candidate.team)
      const conflict = teamTasks.find(t => {
        if (t.orderNumber === currentOrderNumber) return false
        if (t.orderNumber === candidate.orderNumber) return false
        return checkStart < t.endTime && checkEnd > t.startTime
      })
      if (conflict) {
        rejectionReasons.push(`${candidate.orderNumber}: team ${candidate.team} busy due to ${conflict.orderNumber}`)
        continue
      }
    }

    // Found a valid co-join candidate!
    const linkedOrder = allOrders.find(o => o.orderNumber === candidate.orderNumber)
    const updateField = candidate.type === "setup" ? "setupReturnChoice" : "dismantleReturnChoice"
    const oldValue = linkedOrder?.additionalInfo?.[updateField] || "return-to-hub"

    const chosenArrivalTime = minutesToTime(chosenArrivalMins)
    const chosenDepartureTime = minutesToTime(departFromCandidateMins)

    return {
      applied: true,
      type: "tail",
      linkedOrderNumber: candidate.orderNumber,
      linkedOrderSite: candidate.destination,
      team: candidate.team,
      distanceKm: estimatedDistance,
      travelMins,
      waitingMins,
      adjustedArrivalTime: chosenArrivalTime === arrivalTime ? undefined : chosenArrivalTime,
      adjustedDepartureTime: chosenDepartureTime,
      reason: `Tail co-join: link to ${candidate.orderNumber} (${candidate.team}), ${estimatedDistance.toFixed(1)}km, wait ${waitingMins}min, arrive ${chosenArrivalTime}`,
      linkedOrderUpdate: {
        orderNumber: candidate.orderNumber,
        field: updateField,
        oldValue,
        newValue: "remain-on-site",
        nextTaskOrderNumber: currentOrderNumber,
      },
    }
  }

  // Return with detailed rejection reasons
  if (rejectionReasons.length > 0) {
    return { ...noCoJoin, reason: `Checked ${candidateTasks.length} candidate(s): ${rejectionReasons.join("; ")}` }
  }
  return { ...noCoJoin, reason: `No eligible co-join: nearest task is outside ${settings.radiusKm}km or wait exceeds ${settings.waitingHours}h` }
}

/**
 * Find the best co-join candidate for HEAD co-join
 * (Look FORWARD for a job starting after this one that we can chain to)
 */
export async function findHeadCoJoinCandidate(
  date: string,
  arrivalTime: string,
  taskDurationMins: number,
  destination: string,
  taskType: "setup" | "dismantle",
  currentOrderNumber: string,
  allOrders: SalesOrder[],
  settings: AISettings,
  customerTimeSlot?: string,
  minArrivalMins?: number,
  timeWindowMode: "strict" | "flexible" = "flexible"
): Promise<CoJoinInfo> {
  const noCoJoin: CoJoinInfo = {
    applied: false,
    type: null,
    linkedOrderNumber: null,
    linkedOrderSite: null,
    team: null,
    distanceKm: null,
    waitingMins: null,
    reason: "No eligible head co-join found",
  }

  const baseArrivalMins = timeToMinutes(arrivalTime)
  if (baseArrivalMins === null) return { ...noCoJoin, reason: `Invalid arrival time: "${arrivalTime}"` }

  const acceptable =
    customerTimeSlot
      ? getAcceptableArrivalRange(customerTimeSlot, timeWindowMode)
      : { slotStart: null, slotEnd: null, minAcceptable: null, maxAcceptable: null }

  const slotStartMins = acceptable.slotStart ?? baseArrivalMins
  const minAcceptable = acceptable.minAcceptable ?? baseArrivalMins
  const maxAcceptable = acceptable.maxAcceptable ?? baseArrivalMins
  const minAcceptableAdjusted = minArrivalMins != null ? Math.max(minAcceptable, minArrivalMins) : minAcceptable

  const tasks = getTasksForDate(date, allOrders)

  // Find tasks that arrive at site after our earliest possible end time (use siteArrivalTime for head co-join)
  const earliestPossibleEnd = minAcceptableAdjusted + taskDurationMins
  const candidateTasks = tasks.filter(task => {
    if (task.orderNumber === currentOrderNumber) return false
    // Use siteArrivalTime - when they arrive at their site (not when they depart hub)
    const taskArrivalMins = task.siteArrivalTime.getHours() * 60 + task.siteArrivalTime.getMinutes()
    // Allow "butt-joint" chaining with 0-min wait (arrival == earliest end).
    return taskArrivalMins >= earliestPossibleEnd
  })

  if (candidateTasks.length === 0) {
    return { ...noCoJoin, reason: "No later tasks found on this date" }
  }

  // Sort by site arrival time ascending (earliest arriving first = best candidate)
  candidateTasks.sort((a, b) => a.siteArrivalTime.getTime() - b.siteArrivalTime.getTime())

  for (const candidate of candidateTasks) {
    const candidateOrder = allOrders.find(o => o.orderNumber === candidate.orderNumber)
    const candidateSlot = getCustomerTimeSlotForTask(candidateOrder, candidate.type)
    if (candidateSlot) {
      const candidateArrMins = candidate.siteArrivalTime.getHours() * 60 + candidate.siteArrivalTime.getMinutes()
      const candidateEndMins = candidate.siteEndTime.getHours() * 60 + candidate.siteEndTime.getMinutes()
      if (
        !isWithinFlexWindowMins(candidateArrMins, candidateSlot, timeWindowMode) ||
        !isWithinFlexWindowMins(candidateEndMins, candidateSlot, timeWindowMode)
      ) {
        continue
      }
    }

    const geo = await getGeoDistanceBetweenSites(destination, candidate.destination)
    const estimatedDistance = geo?.distanceKm ?? estimateDistanceBetweenSites(destination, candidate.destination)

    if (estimatedDistance > settings.radiusKm) {
      continue
    }

    const travelMins =
      typeof geo?.travelMins === "number"
        ? geo.travelMins
        : Math.round(estimatedDistance * settings.minutesPerKm)
    // Use siteArrivalTime - when they need to arrive at their site
    const candidateArrivalMins = candidate.siteArrivalTime.getHours() * 60 + candidate.siteArrivalTime.getMinutes()

    const maxWaitMins = settings.waitingHours * 60

    // We can shift our arrival time within customer's acceptable window to make head co-join possible.
    // Constraint: endTime = arrival + taskDurationMins
    // Must satisfy: 0 <= (candidateArrival - travel) - endTime <= maxWaitMins
    const latestEndAllowed = candidateArrivalMins - travelMins
    const earliestEndAllowed = latestEndAllowed - maxWaitMins

    const minArrivalForCandidate = earliestEndAllowed - taskDurationMins
    const maxArrivalForCandidate = latestEndAllowed - taskDurationMins

    const arrivalLowerBound = Math.max(minAcceptableAdjusted, minArrivalForCandidate)
    const arrivalUpperBound = Math.min(maxAcceptable, maxArrivalForCandidate)

    if (arrivalLowerBound > arrivalUpperBound) {
      continue
    }

    // Pick an arrival closest to slot start (but within feasible range)
    const chosenArrivalMins = Math.min(Math.max(slotStartMins, arrivalLowerBound), arrivalUpperBound)
    const chosenEndMins = chosenArrivalMins + taskDurationMins
    const departForCandidateMins = candidateArrivalMins - travelMins
    const waitingMins = departForCandidateMins - chosenEndMins

    if (waitingMins < 0 || waitingMins > maxWaitMins) {
      continue
    }

    // Conflict check: ensure the linked team is not busy with another order in the window.
    // We check the on-site window from our chosen arrival until we must depart for the linked task.
    const checkStart = toDateTime(date, minutesToTime(chosenArrivalMins))
    const checkEnd = toDateTime(date, minutesToTime(departForCandidateMins))
    if (checkStart && checkEnd) {
      const teamTasks = getTasksForDate(date, allOrders).filter(t => t.team === candidate.team)
      const conflict = teamTasks.find(t => {
        if (t.orderNumber === currentOrderNumber) return false
        if (t.orderNumber === candidate.orderNumber) return false
        return checkStart < t.endTime && checkEnd > t.startTime
      })
      if (conflict) {
        continue
      }
    }

    // Found a valid head co-join candidate!
    const chosenArrivalTime = minutesToTime(chosenArrivalMins)
    const chosenDepartureTime = minutesToTime(departForCandidateMins)
    return {
      applied: true,
      type: "head",
      linkedOrderNumber: candidate.orderNumber,
      linkedOrderSite: candidate.destination,
      team: candidate.team,
      distanceKm: estimatedDistance,
      travelMins,
      waitingMins,
      adjustedArrivalTime: chosenArrivalTime === arrivalTime ? undefined : chosenArrivalTime,
      adjustedDepartureTime: chosenDepartureTime,
      reason: `Head co-join: proceed to ${candidate.orderNumber} (${estimatedDistance.toFixed(1)}km, wait ${waitingMins}min)`,
    }
  }

  return noCoJoin
}

/**
 * Estimate distance between two sites based on address similarity
 * This is a placeholder - real implementation should use Google Maps API
 */
function estimateDistanceBetweenSites(address1: string, address2: string): number {
  // Improved heuristic for Ipoh area addresses
  // In production, you would call Google Maps Distance Matrix API
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()
  const a1 = normalize(address1)
  const a2 = normalize(address2)

  // Extract postcode (5 digits like 30250, 31500, etc.)
  const postcode1 = address1.match(/\b(\d{5})\b/)?.[1]
  const postcode2 = address2.match(/\b(\d{5})\b/)?.[1]

  // Extract taman/area names
  const tamanPattern = /taman\s+\w+/gi
  const taman1 = address1.match(tamanPattern)?.[0]?.toLowerCase()
  const taman2 = address2.match(tamanPattern)?.[0]?.toLowerCase()

  // Check for common street indicators
  const jalanPattern = /jalan\s+[\w\s]+/gi
  const jalan1 = address1.match(jalanPattern)?.[0]?.toLowerCase()
  const jalan2 = address2.match(jalanPattern)?.[0]?.toLowerCase()

  // Same postcode = very likely within 5km (Ipoh postcodes cover small areas)
  if (postcode1 && postcode2 && postcode1 === postcode2) {
    // Same postcode - estimate 2-4km based on other factors
    if (taman1 && taman2 && taman1 === taman2) {
      return 1.0 // Same taman = very close
    }
    if (jalan1 && jalan2 && jalan1.includes("permaisuri") && jalan2.includes("permaisuri")) {
      return 2.0 // Same main road area
    }
    return 3.5 // Same postcode, different areas - still close
  }

  // Adjacent postcodes in Ipoh (30xxx, 31xxx) are usually within 10km
  if (postcode1 && postcode2) {
    const p1 = parseInt(postcode1)
    const p2 = parseInt(postcode2)
    if (Math.abs(p1 - p2) <= 50) {
      return 5.0 // Adjacent postcodes
    }
    if (Math.abs(p1 - p2) <= 200) {
      return 8.0 // Nearby postcodes
    }
  }

  // Both in Ipoh city
  const isIpoh1 = a1.includes("ipoh")
  const isIpoh2 = a2.includes("ipoh")
  if (isIpoh1 && isIpoh2) {
    return 6.0 // Both in Ipoh - assume reasonably close
  }

  // Fallback - if they share significant text, might be close
  if (a1.includes(a2.slice(0, 15)) || a2.includes(a1.slice(0, 15))) {
    return 4.0
  }

  return 12.0 // Default - probably too far for co-join
}

// ============================================================================
// PRIORITY 2: CUSTOMER TIME WINDOWS
// ============================================================================

/**
 * Check if the arrival time is within acceptable range of customer's time slot
 * Allows flexibility up to ±waitingHours from the time slot
 */
export function isWithinCustomerTimeWindow(
  arrivalTime: string,
  customerTimeSlot: string,
  waitingHours: number
): { withinWindow: boolean; deviation: number; reason: string } {
  if (!customerTimeSlot || customerTimeSlot.trim().toLowerCase() === "none") {
    return { withinWindow: true, deviation: 0, reason: "No preferred time (NONE)" }
  }
  const arrivalMins = timeToMinutes(arrivalTime)
  const slotStart = parseTimeSlotStart(customerTimeSlot)
  const slotEnd = parseTimeSlotEnd(customerTimeSlot)

  if (arrivalMins === null || slotStart === null || slotEnd === null) {
    return { withinWindow: true, deviation: 0, reason: "Could not parse times" }
  }

  const flexMins = waitingHours * 60
  const minAcceptable = slotStart - flexMins
  const maxAcceptable = slotEnd + flexMins

  if (arrivalMins >= slotStart && arrivalMins <= slotEnd) {
    return { withinWindow: true, deviation: 0, reason: "Within customer's preferred time slot" }
  }

  if (arrivalMins >= minAcceptable && arrivalMins < slotStart) {
    const deviation = slotStart - arrivalMins
    return { withinWindow: true, deviation: -deviation, reason: `${deviation} mins earlier than slot start (within ${waitingHours}h flexibility)` }
  }

  if (arrivalMins > slotEnd && arrivalMins <= maxAcceptable) {
    const deviation = arrivalMins - slotEnd
    return { withinWindow: true, deviation, reason: `${deviation} mins later than slot end (within ${waitingHours}h flexibility)` }
  }

  const deviation = arrivalMins < slotStart ? slotStart - arrivalMins : arrivalMins - slotEnd
  return { withinWindow: false, deviation, reason: `Outside acceptable range (${deviation} mins beyond ${waitingHours}h flexibility)` }
}

// ============================================================================
// PRIORITY 3: WORKLOAD BALANCE
// ============================================================================

/**
 * Pick optimal team based on workload balance
 * Returns team with fewest jobs that is available at the required time
 */
export function pickOptimalTeam(
  date: string,
  candidateStart: Date,
  candidateEnd: Date,
  taskType: "setup" | "dismantle" | "other-adhoc",
  currentOrderNumber: string,
  allOrders: SalesOrder[],
  preferredTeam?: TeamName,
  excludedTeams: TeamName[] = []
): { team: TeamName; jobCount: number; conflictWith: string | null; reason: string } {
  const jobCounts = getTeamJobCounts(date, allOrders)

  // Sort teams by job count (ascending)
  const sortedTeams = [...TEAMS].filter(t => !excludedTeams.includes(t)).sort((a, b) => jobCounts[a] - jobCounts[b])

  // If user has preference and that team is available, use it
  if (preferredTeam && !excludedTeams.includes(preferredTeam)) {
    const conflict = findConflict(
      candidateStart,
      candidateEnd,
      preferredTeam,
      date,
      taskType,
      currentOrderNumber,
      allOrders
    )
    if (!conflict) {
      return {
        team: preferredTeam,
        jobCount: jobCounts[preferredTeam],
        conflictWith: null,
        reason: `User preferred ${preferredTeam} (${jobCounts[preferredTeam]} tasks today)`,
      }
    }
  }

  // Try each team starting with fewest jobs
  for (const team of sortedTeams) {
    const conflict = findConflict(
      candidateStart,
      candidateEnd,
      team,
      date,
      taskType,
      currentOrderNumber,
      allOrders
    )
    if (!conflict) {
      return {
        team,
        jobCount: jobCounts[team],
        conflictWith: null,
        reason: `${team} selected (fewest tasks: ${jobCounts[team]})`,
      }
    }
  }

  // No team available - return preferred (if not excluded) or first available team
  const fallbackTeam = (preferredTeam && !excludedTeams.includes(preferredTeam) ? preferredTeam : null) || sortedTeams[0] || "Team A"
  const conflict = findConflict(
    candidateStart,
    candidateEnd,
    fallbackTeam,
    date,
    taskType,
    currentOrderNumber,
    allOrders
  )

  return {
    team: fallbackTeam,
    jobCount: jobCounts[fallbackTeam],
    conflictWith: conflict,
    reason: `All teams busy - ${fallbackTeam} assigned with conflict (${conflict})`,
  }
}

// ============================================================================
// PRIORITY 4: TEAM CONSISTENCY
// ============================================================================

/**
 * Check if same team can be used for both setup and dismantle
 */
export function checkTeamConsistency(
  setupTeam: TeamName,
  dismantleDate: string,
  dismantleCandidateStart: Date,
  dismantleCandidateEnd: Date,
  currentOrderNumber: string,
  allOrders: SalesOrder[]
): { canUseSameTeam: boolean; reason: string } {
  const conflict = findConflict(
    dismantleCandidateStart,
    dismantleCandidateEnd,
    setupTeam,
    dismantleDate,
    "dismantle",
    currentOrderNumber,
    allOrders
  )

  if (!conflict) {
    return { canUseSameTeam: true, reason: `Same team (${setupTeam}) available for both setup and dismantle` }
  }

  return { canUseSameTeam: false, reason: `${setupTeam} has conflict at dismantle time (${conflict})` }
}

// ============================================================================
// WARNINGS
// ============================================================================

/**
 * Check if all teams are fully booked (capacity overflow)
 */
export function checkCapacityOverflow(
  date: string,
  candidateStart: Date,
  candidateEnd: Date,
  taskType: "setup" | "dismantle" | "other-adhoc",
  currentOrderNumber: string,
  allOrders: SalesOrder[],
  appSettings: AppSettings
): CapacityOverflowInfo {
  const workEndMins = timeToMinutes(appSettings.workEndTime) || (16 * 60 + 30)

  // Check if ALL teams have conflicts
  let allTeamsBusy = true
  let earliestFinishTeam: TeamName | null = null
  let earliestFinishTime: string | null = null
  let earliestFinishMins = Infinity

  for (const team of TEAMS) {
    const conflict = findConflict(
      candidateStart,
      candidateEnd,
      team,
      date,
      taskType,
      currentOrderNumber,
      allOrders
    )

    if (!conflict) {
      allTeamsBusy = false
      break
    }

    // Find when this team finishes their last task
    const tasks = getTasksForDate(date, allOrders).filter(t => t.team === team)
    if (tasks.length > 0) {
      const lastTask = tasks.sort((a, b) => b.endTime.getTime() - a.endTime.getTime())[0]
      const finishMins = lastTask.endTime.getHours() * 60 + lastTask.endTime.getMinutes()
      if (finishMins < earliestFinishMins) {
        earliestFinishMins = finishMins
        earliestFinishTeam = team
        earliestFinishTime = dateToTimeString(lastTask.endTime)
      }
    }
  }

  if (!allTeamsBusy) {
    return {
      isOverflow: false,
      suggestedOTTeam: null,
      suggestedOTFinishTime: null,
      message: "",
    }
  }

  return {
    isOverflow: true,
    suggestedOTTeam: earliestFinishTeam,
    suggestedOTFinishTime: earliestFinishTime,
    message: `⚠️ CAPACITY OVERFLOW - OVERTIME REQUIRED\nAll teams are fully booked from ${formatTimeHHMMToAmPm(appSettings.workStartTime)} to ${formatTimeHHMMToAmPm(appSettings.workEndTime)}.\nManual action required: Please assign overtime (OT).\nSuggested OT: ${earliestFinishTeam} finishes earliest at ${earliestFinishTime}`,
  }
}

/**
 * Check if task ends after work end time (overtime)
 */
export function checkOvertime(endTime: string, workEndTime: string): boolean {
  const endMins = timeToMinutes(endTime)
  const workEndMins = timeToMinutes(workEndTime)
  if (endMins === null || workEndMins === null) return false
  return endMins > workEndMins
}

/**
 * Get lunch suggestion if task overlaps lunch window
 */
export function getLunchSuggestion(
  taskStartTime: string,
  taskEndTime: string,
  lunchStartTime: string,
  lunchEndTime: string
): LunchSuggestion | null {
  const taskStartMins = timeToMinutes(taskStartTime)
  const taskEndMins = timeToMinutes(taskEndTime)
  const lunchStartMins = timeToMinutes(lunchStartTime)
  const lunchEndMins = timeToMinutes(lunchEndTime)

  if (taskStartMins === null || taskEndMins === null || lunchStartMins === null || lunchEndMins === null) {
    return null
  }

  // Check if task overlaps lunch
  const overlaps = taskStartMins < lunchEndMins && taskEndMins > lunchStartMins
  if (!overlaps) return null

  const lunchDuration = lunchEndMins - lunchStartMins // Usually 60 mins
  const windowMid = (lunchStartMins + lunchEndMins) / 2

  // Option 1: Lunch before task
  const beforeStart = taskStartMins - lunchDuration
  const beforeEnd = taskStartMins

  // Option 2: Lunch after task
  const afterStart = taskEndMins
  const afterEnd = taskEndMins + lunchDuration

  // Pick the option closest to normal lunch time
  const beforeMid = (beforeStart + beforeEnd) / 2
  const afterMid = (afterStart + afterEnd) / 2

  if (Math.abs(beforeMid - windowMid) <= Math.abs(afterMid - windowMid)) {
    return {
      start: minutesToTime(beforeStart),
      end: minutesToTime(beforeEnd),
      reason: `Task overlaps lunch window (${lunchStartTime}-${lunchEndTime}), lunch moved before task`,
    }
  } else {
    return {
      start: minutesToTime(afterStart),
      end: minutesToTime(afterEnd),
      reason: `Task overlaps lunch window (${lunchStartTime}-${lunchEndTime}), lunch moved after task`,
    }
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run AI Schedule - Main function that applies all optimization priorities
 */
export async function runAISchedule(input: AIScheduleInput): Promise<AIScheduleResult> {
  const {
    order,
    allOrders,
    aiSettings,
    appSettings,
    distanceKm,
    preferredSetupTeam,
    preferredDismantleTeam,
    allowCoJoin = true,
    coJoinStrategy = "auto-avoid-ot",
    excludedTeams = [],
    timeWindowMode = "flexible",
  } = input

  const setupReasoning: string[] = []
  const dismantleReasoning: string[] = []

  // Get basic info from order
  const setupDate = order.eventData.customerPreferredSetupDate
  const dismantleDate = order.eventData.customerPreferredDismantleDate
  const normalizePreferred = (value: string | undefined): string => {
    const v = (value || "").trim()
    if (!v) return ""
    if (v.toLowerCase() === "none") return ""
    return v
  }

  const setupTimeSlot = normalizePreferred(order.customerData.setupTimeSlot) || normalizePreferred(order.eventData.desiredSetupTime)
  const dismantleTimeSlot = normalizePreferred(order.customerData.dismantleTimeSlot) || normalizePreferred(order.eventData.desiredDismantleTime)
  const noPreferredTimes = !setupTimeSlot && !dismantleTimeSlot
  const customerAddress =
    getBestCustomerAddress(order.customerData) ||
    order.customerData?.deliveryAddress ||
    order.customerData?.billingAddress ||
    ""

  // Calculate travel time
  const travelTimeMins = Math.round(distanceKm * aiSettings.minutesPerKm)
  const travelTimeHours = Math.floor(travelTimeMins / 60)
  const travelTimeMinsRemainder = travelTimeMins % 60

  // Calculate task duration (from order items; setup vs dismantle can differ)
  const bufferMins = aiSettings.bufferTimeMinutes
  const setupFromItemsMins = calculateWorkMinutesFromItemsWithSettings(order.items, "setup", appSettings.inventoryTaskTimesById)
  const dismantleFromItemsMins = calculateWorkMinutesFromItemsWithSettings(order.items, "dismantle", appSettings.inventoryTaskTimesById)

  // Fallback for older orders without item ids/times (use tent quantities + settings defaults)
  const getFallbackFromMap = (id: string, kind: "setup" | "dismantle") => {
    const v = appSettings.inventoryTaskTimesById?.[id]
    if (!v) return 0
    const n = kind === "setup" ? v.setupMins : v.dismantleMins
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }

  const fallbackTentSetupMins =
    (order.pricingData?.tent10x10?.quantity || 0) * (getFallbackFromMap("tent-10x10", "setup") || (appSettings.tent10x10Minutes || 0)) +
    (order.pricingData?.tent20x20?.quantity || 0) * (getFallbackFromMap("tent-20x20", "setup") || (appSettings.tent20x20Minutes || 0)) +
    (order.pricingData?.tent20x30?.quantity || 0) * (getFallbackFromMap("tent-20x30", "setup") || (appSettings.tent20x30Minutes || 0))

  const fallbackTentDismantleMins =
    (order.pricingData?.tent10x10?.quantity || 0) * (getFallbackFromMap("tent-10x10", "dismantle") || (appSettings.tent10x10Minutes || 0)) +
    (order.pricingData?.tent20x20?.quantity || 0) * (getFallbackFromMap("tent-20x20", "dismantle") || (appSettings.tent20x20Minutes || 0)) +
    (order.pricingData?.tent20x30?.quantity || 0) * (getFallbackFromMap("tent-20x30", "dismantle") || (appSettings.tent20x30Minutes || 0))

  const setupWorkMins = setupFromItemsMins > 0 ? setupFromItemsMins : fallbackTentSetupMins
  const dismantleWorkMins = dismantleFromItemsMins > 0 ? dismantleFromItemsMins : fallbackTentDismantleMins

  const setupTaskDurationMins = setupWorkMins + bufferMins
  const dismantleTaskDurationMins = dismantleWorkMins + bufferMins

  const workStartMins = timeToMinutes(appSettings.workStartTime) ?? 8 * 60
  const salesOrderPlaced = getSalesOrderPlacedLocal(order)
  const isOrderPlacedOnSetupDate = salesOrderPlaced?.dateISO === setupDate
  const minSetupDepartureMins =
    isOrderPlacedOnSetupDate && salesOrderPlaced
      ? Math.max(workStartMins, salesOrderPlaced.mins)
      : workStartMins
  const minSetupArrivalMins = isOrderPlacedOnSetupDate ? minSetupDepartureMins + travelTimeMins : undefined

  if (isOrderPlacedOnSetupDate && salesOrderPlaced && salesOrderPlaced.mins > workStartMins) {
    setupReasoning.push(`Sales order time: ${salesOrderPlaced.label} (same-day). Earliest departure is ${minutesToTime(minSetupDepartureMins)}.`)
  }

  const computeHubDepartureAndArrival = (
    preferredArrivalMins: number,
    label: "setup" | "dismantle",
    reasoning: string[],
    minDepartureMins: number = workStartMins
  ): { departureMins: number; arrivalMins: number } => {
    const idealDepartureMins = preferredArrivalMins - travelTimeMins
    const departureMins = Math.max(idealDepartureMins, minDepartureMins)
    const arrivalMins = departureMins + travelTimeMins

    if (departureMins !== idealDepartureMins) {
      const clampLabel =
        minDepartureMins > workStartMins
          ? `Sales order time: cannot depart before ${minutesToTime(minDepartureMins)}`
          : `Work start: cannot depart before ${appSettings.workStartTime}`
      reasoning.push(
        `${clampLabel}; ${label} departs ${minutesToTime(departureMins)} → ETA ${minutesToTime(arrivalMins)} (preferred slot start ${minutesToTime(preferredArrivalMins)})`
      )
    }

    return { departureMins, arrivalMins }
  }

  // Get arrival time from time slot (use start of slot). If travel is long and work starts at 08:00,
  // clamp departure to workStartTime and allow ETA to drift later than the slot start.
  const preferredSetupArrivalMins =
    parseTimeSlotStart(setupTimeSlot) ?? (setupTimeSlot ? (10 * 60) : workStartMins)
  const preferredDismantleArrivalMins =
    parseTimeSlotStart(dismantleTimeSlot) ?? (dismantleTimeSlot ? (18 * 60) : workStartMins)

  const setupJourney = computeHubDepartureAndArrival(preferredSetupArrivalMins, "setup", setupReasoning, minSetupDepartureMins)
  const dismantleJourney = computeHubDepartureAndArrival(preferredDismantleArrivalMins, "dismantle", dismantleReasoning)

  let setupArrivalMins = setupJourney.arrivalMins
  let dismantleArrivalMins = dismantleJourney.arrivalMins

  let setupArrivalTime = minutesToTime(setupArrivalMins)
  let dismantleArrivalTime = minutesToTime(dismantleArrivalMins)

  let setupDepartureTime = minutesToTime(setupJourney.departureMins)
  let dismantleDepartureTime = minutesToTime(dismantleJourney.departureMins)

  // Calculate end times
  let setupEndMins = setupArrivalMins + setupWorkMins + bufferMins
  let dismantleEndMins = dismantleArrivalMins + dismantleWorkMins + bufferMins

  let setupEndTime = minutesToTime(setupEndMins)
  let dismantleEndTime = minutesToTime(dismantleEndMins)

  // Calculate hub arrival times (return journey)
  let setupHubArrivalTime = addMinutesToTime(setupEndTime, travelTimeMins)
  let dismantleHubArrivalTime = addMinutesToTime(dismantleEndTime, travelTimeMins)

  setupReasoning.push(`Distance hub→site: ${distanceKm} km`)
  setupReasoning.push(`Travel model: ${aiSettings.minutesPerKm} mins/km → ${travelTimeMins} mins`)

  dismantleReasoning.push(`Distance hub→site: ${distanceKm} km`)
  dismantleReasoning.push(`Travel model: ${aiSettings.minutesPerKm} mins/km → ${travelTimeMins} mins`)

  if (noPreferredTimes) {
    setupReasoning.push("Preferred time: NONE (no time window). Priority: avoid OT by deploying any free team first; co-join is secondary.")
    dismantleReasoning.push("Preferred time: NONE (no time window). Priority: avoid OT by deploying any free team first; co-join is secondary.")
  }

  // =========================================================================
  // PRIORITY 1: CO-JOIN
  // =========================================================================

  const noCoJoin: CoJoinInfo = {
    applied: false,
    type: null,
    linkedOrderNumber: null,
    linkedOrderSite: null,
    team: null,
    distanceKm: null,
    waitingMins: null,
    reason: allowCoJoin ? "No co-join found" : "Co-join disabled by user",
  }

  let setupCoJoin: CoJoinInfo = noCoJoin
  let dismantleCoJoin: CoJoinInfo = noCoJoin

  if (allowCoJoin) {
    const setupTailCoJoin = await findTailCoJoinCandidate(
      setupDate,
      setupArrivalTime,
      customerAddress,
      "setup",
      order.orderNumber,
      allOrders,
      aiSettings,
      setupTimeSlot,
      minSetupArrivalMins,
      timeWindowMode
    )

    const setupHeadCoJoin = await findHeadCoJoinCandidate(
      setupDate,
      setupArrivalTime,
      setupTaskDurationMins,
      customerAddress,
      "setup",
      order.orderNumber,
      allOrders,
      aiSettings,
      setupTimeSlot,
      minSetupArrivalMins,
      timeWindowMode
    )

    const workEndMins = timeToMinutes(appSettings.workEndTime)

    const chooseCoJoin = (
      baseArrivalTime: string,
      baseArrivalMins: number,
      base: CoJoinInfo,
      tail: CoJoinInfo,
      head: CoJoinInfo,
      workMins: number,
      preferNoCoJoinWhenPossible: boolean
    ): CoJoinInfo => {
      const evalOption = (opt: CoJoinInfo): { applied: boolean; endMins: number; overtime: boolean } => {
        const arrivalTime = opt.applied && opt.adjustedArrivalTime ? opt.adjustedArrivalTime : baseArrivalTime
        const arrivalMins = timeToMinutes(arrivalTime) ?? baseArrivalMins
        const endMins = arrivalMins + workMins + bufferMins
        const overtime = workEndMins != null ? endMins > workEndMins : false
        return { applied: opt.applied, endMins, overtime }
      }

      const b = evalOption(base)
      const t = evalOption(tail)
      const h = evalOption(head)

      // NONE (no preferred time): prioritize avoiding OT, then Co-Join for travel efficiency
      if (preferNoCoJoinWhenPossible) {
        // Collect all options with their OT status
        const options: { choice: CoJoinInfo; endMins: number; overtime: boolean; isCoJoin: boolean }[] = [
          { choice: base, endMins: b.endMins, overtime: b.overtime, isCoJoin: false },
          ...(t.applied ? [{ choice: tail, endMins: t.endMins, overtime: t.overtime, isCoJoin: true }] : []),
          ...(h.applied ? [{ choice: head, endMins: h.endMins, overtime: h.overtime, isCoJoin: true }] : []),
        ]

        // Priority 1: Find options that don't cause OT
        const noOTOptions = options.filter(o => !o.overtime)

        if (noOTOptions.length > 0) {
          // Priority 2: Among no-OT options, prefer Co-Join (saves travel from hub)
          const noOTCoJoin = noOTOptions.filter(o => o.isCoJoin)
          if (noOTCoJoin.length > 0) {
            // If multiple Co-Join options, pick earlier finish
            noOTCoJoin.sort((a, b) => a.endMins - b.endMins)
            return noOTCoJoin[0].choice
          }
          // No Co-Join available without OT, use base
          return base
        }

        // All options cause OT - pick the one with least OT (earliest finish)
        options.sort((a, b) => a.endMins - b.endMins)
        return options[0].choice
      }

      // Has preferred time: prioritize Co-Join within customer time window
      if (coJoinStrategy === "auto-avoid-ot" && t.applied && h.applied) {
        if (t.overtime && !h.overtime) return head
        if (h.overtime && !t.overtime) return tail
        // Both OT or both not OT: prefer earlier finish (tie-break), then default tail-first.
        if (t.endMins !== h.endMins) return t.endMins < h.endMins ? tail : head
        return tail
      }

      if (coJoinStrategy === "head-first") {
        return head.applied ? head : tail.applied ? tail : base
      }

      // tail-first (default) and also the fallback for auto when only one is applied
      return tail.applied ? tail : head.applied ? head : base
    }

    setupCoJoin = chooseCoJoin(setupArrivalTime, setupArrivalMins, noCoJoin, setupTailCoJoin, setupHeadCoJoin, setupWorkMins, noPreferredTimes)

    if (setupCoJoin.applied && setupCoJoin.adjustedArrivalTime) {
      const adjustedMins = timeToMinutes(setupCoJoin.adjustedArrivalTime)
      if (adjustedMins !== null && adjustedMins !== setupArrivalMins) {
        const adjustedJourney = computeHubDepartureAndArrival(adjustedMins, "setup", setupReasoning, minSetupDepartureMins)
        setupArrivalMins = adjustedJourney.arrivalMins
        setupArrivalTime = minutesToTime(setupArrivalMins)
        setupDepartureTime = minutesToTime(adjustedJourney.departureMins)
        setupEndMins = setupArrivalMins + setupWorkMins + bufferMins
        setupEndTime = minutesToTime(setupEndMins)
        setupHubArrivalTime = addMinutesToTime(setupEndTime, travelTimeMins)
        setupReasoning.push(`Co-join priority: arrival shifted to ${setupCoJoin.adjustedArrivalTime} (within customer flexibility)`)
      }
    }

    const dismantleTailCoJoin = await findTailCoJoinCandidate(
      dismantleDate,
      dismantleArrivalTime,
      customerAddress,
      "dismantle",
      order.orderNumber,
      allOrders,
      aiSettings,
      dismantleTimeSlot,
      undefined, // minArrivalMins
      timeWindowMode
    )

    const dismantleHeadCoJoin = await findHeadCoJoinCandidate(
      dismantleDate,
      dismantleArrivalTime,
      dismantleTaskDurationMins,
      customerAddress,
      "dismantle",
      order.orderNumber,
      allOrders,
      aiSettings,
      dismantleTimeSlot,
      undefined, // minArrivalMins
      timeWindowMode
    )

    dismantleCoJoin = chooseCoJoin(dismantleArrivalTime, dismantleArrivalMins, noCoJoin, dismantleTailCoJoin, dismantleHeadCoJoin, dismantleWorkMins, noPreferredTimes)

    if (dismantleCoJoin.applied && dismantleCoJoin.adjustedArrivalTime) {
      const adjustedMins = timeToMinutes(dismantleCoJoin.adjustedArrivalTime)
      if (adjustedMins !== null && adjustedMins !== dismantleArrivalMins) {
        const adjustedJourney = computeHubDepartureAndArrival(adjustedMins, "dismantle", dismantleReasoning)
        dismantleArrivalMins = adjustedJourney.arrivalMins
        dismantleArrivalTime = minutesToTime(dismantleArrivalMins)
        dismantleDepartureTime = minutesToTime(adjustedJourney.departureMins)
        dismantleEndMins = dismantleArrivalMins + dismantleWorkMins + bufferMins
        dismantleEndTime = minutesToTime(dismantleEndMins)
        dismantleHubArrivalTime = addMinutesToTime(dismantleEndTime, travelTimeMins)
        dismantleReasoning.push(`Co-join priority: arrival shifted to ${dismantleCoJoin.adjustedArrivalTime} (within customer flexibility)`)
      }
    }
  }

  setupReasoning.push(`Co-join check: ${setupCoJoin.reason}`)
  dismantleReasoning.push(`Co-join check: ${dismantleCoJoin.reason}`)

  // =========================================================================
  // PRIORITY 2: CUSTOMER TIME WINDOWS
  // =========================================================================

  const setupTimeCheck = isWithinCustomerTimeWindow(setupArrivalTime, setupTimeSlot, aiSettings.waitingHours)
  const dismantleTimeCheck = isWithinCustomerTimeWindow(dismantleArrivalTime, dismantleTimeSlot, aiSettings.waitingHours)

  setupReasoning.push(`Customer time: ${setupTimeCheck.reason}`)
  dismantleReasoning.push(`Customer time: ${dismantleTimeCheck.reason}`)

  // =========================================================================
  // PRIORITY 3: WORKLOAD BALANCE + TEAM SELECTION
  // =========================================================================

  // Create candidate time windows
  const setupCandidateStart = toDateTime(setupDate, setupDepartureTime)!
  const setupCandidateEnd = toDateTime(setupDate, setupHubArrivalTime)!
  const dismantleCandidateStart = toDateTime(dismantleDate, dismantleDepartureTime)!
  const dismantleCandidateEnd = toDateTime(dismantleDate, dismantleHubArrivalTime)!

  // Select setup team
  let setupTeamResult: { team: TeamName; jobCount: number; conflictWith: string | null; reason: string }

  if (setupCoJoin.applied && setupCoJoin.team) {
    // Co-join dictates the team
    setupTeamResult = {
      team: setupCoJoin.team,
      jobCount: getTeamJobCounts(setupDate, allOrders)[setupCoJoin.team],
      conflictWith: null,
      reason: `Team locked by co-join with ${setupCoJoin.linkedOrderNumber}`,
    }
  } else {
    // Use workload balance to pick team
    setupTeamResult = pickOptimalTeam(
      setupDate,
      setupCandidateStart,
      setupCandidateEnd,
      "setup",
      order.orderNumber,
      allOrders,
      preferredSetupTeam,
      excludedTeams
    )
  }

  setupReasoning.push(`Team selection: ${setupTeamResult.reason}`)
  if (setupTeamResult.conflictWith) {
    setupReasoning.push(`⚠️ Overlap conflict with ${setupTeamResult.conflictWith}`)
  }

  // =========================================================================
  // PRIORITY 4: TEAM CONSISTENCY (same team for dismantle if possible)
  // =========================================================================

  const consistencyCheck = checkTeamConsistency(
    setupTeamResult.team,
    dismantleDate,
    dismantleCandidateStart,
    dismantleCandidateEnd,
    order.orderNumber,
    allOrders
  )

  let dismantleTeamResult: { team: TeamName; jobCount: number; conflictWith: string | null; reason: string }

  if (dismantleCoJoin.applied && dismantleCoJoin.team) {
    // Co-join dictates the team
    dismantleTeamResult = {
      team: dismantleCoJoin.team,
      jobCount: getTeamJobCounts(dismantleDate, allOrders)[dismantleCoJoin.team],
      conflictWith: null,
      reason: `Team locked by co-join with ${dismantleCoJoin.linkedOrderNumber}`,
    }
  } else if (consistencyCheck.canUseSameTeam) {
    // Use same team as setup
    dismantleTeamResult = {
      team: setupTeamResult.team,
      jobCount: getTeamJobCounts(dismantleDate, allOrders)[setupTeamResult.team],
      conflictWith: null,
      reason: consistencyCheck.reason,
    }
  } else {
    // Use workload balance to pick different team
    dismantleTeamResult = pickOptimalTeam(
      dismantleDate,
      dismantleCandidateStart,
      dismantleCandidateEnd,
      "dismantle",
      order.orderNumber,
      allOrders,
      preferredDismantleTeam,
      excludedTeams
    )
    dismantleReasoning.push(`Team consistency: ${consistencyCheck.reason}`)
  }

  dismantleReasoning.push(`Team selection: ${dismantleTeamResult.reason}`)
  if (dismantleTeamResult.conflictWith) {
    dismantleReasoning.push(`⚠️ Overlap conflict with ${dismantleTeamResult.conflictWith}`)
  }

  // =========================================================================
  // WARNINGS
  // =========================================================================

  // Capacity overflow check
  const setupCapacityOverflow = checkCapacityOverflow(
    setupDate,
    setupCandidateStart,
    setupCandidateEnd,
    "setup",
    order.orderNumber,
    allOrders,
    appSettings
  )

  // Overtime check (OT)
  const setupOvertime = checkOvertime(setupEndTime, appSettings.workEndTime)
  const dismantleOvertime = checkOvertime(dismantleEndTime, appSettings.workEndTime)

  // OT decision prompt (company policy: avoid OT where possible)
  const workEndMins = timeToMinutes(appSettings.workEndTime)
  const baseSetupEndMins = setupArrivalMins + setupWorkMins + bufferMins
  const baseDismantleEndMins = dismantleArrivalMins + dismantleWorkMins + bufferMins

  const setupArrivalAdjustedMins =
    setupCoJoin.applied && setupCoJoin.adjustedArrivalTime
      ? (timeToMinutes(setupCoJoin.adjustedArrivalTime) ?? setupArrivalMins)
      : setupArrivalMins

  const dismantleArrivalAdjustedMins =
    dismantleCoJoin.applied && dismantleCoJoin.adjustedArrivalTime
      ? (timeToMinutes(dismantleCoJoin.adjustedArrivalTime) ?? dismantleArrivalMins)
      : dismantleArrivalMins

  const setupOvertimeDueToCoJoin =
    setupOvertime &&
    setupCoJoin.applied &&
    !!setupCoJoin.adjustedArrivalTime &&
    setupArrivalAdjustedMins > setupArrivalMins

  const dismantleOvertimeDueToCoJoin =
    dismantleOvertime &&
    dismantleCoJoin.applied &&
    !!dismantleCoJoin.adjustedArrivalTime &&
    dismantleArrivalAdjustedMins > dismantleArrivalMins

  const setupCanAvoidByDisablingCoJoin =
    setupOvertimeDueToCoJoin && workEndMins != null ? baseSetupEndMins <= workEndMins : false

  const dismantleCanAvoidByDisablingCoJoin =
    dismantleOvertimeDueToCoJoin && workEndMins != null ? baseDismantleEndMins <= workEndMins : false

  const overtimeDecision: OvertimeDecisionInfo = {
    required: setupOvertime || dismantleOvertime,
    recommendation: (setupCanAvoidByDisablingCoJoin || dismantleCanAvoidByDisablingCoJoin) ? "deploy-new-team" : "allow-ot",
    message: (setupOvertime || dismantleOvertime)
      ? `OT detected: one or more tasks end after ${appSettings.workEndTime}. Choose to allow OT, or deploy another team (disable co-join) to avoid OT where possible.`
      : "",
    setup: setupOvertime ? { overtime: true, canAvoidByDisablingCoJoin: setupCanAvoidByDisablingCoJoin } : null,
    dismantle: dismantleOvertime ? { overtime: true, canAvoidByDisablingCoJoin: dismantleCanAvoidByDisablingCoJoin } : null,
  }

  if (setupOvertime) {
    setupReasoning.push(`Work end: Task ends after ${appSettings.workEndTime} (treat as last task → return to hub)`)
  } else {
    setupReasoning.push(`Work end: Within ${appSettings.workEndTime}`)
  }

  if (dismantleOvertime) {
    dismantleReasoning.push(`Work end: Task ends after ${appSettings.workEndTime} (treat as last task → return to hub)`)
  } else {
    dismantleReasoning.push(`Work end: Within ${appSettings.workEndTime}`)
  }

  // Lunch suggestion
  const setupLunchSuggestion = getLunchSuggestion(
    setupArrivalTime,
    setupEndTime,
    appSettings.lunchStartTime,
    appSettings.lunchEndTime
  )

  const dismantleLunchSuggestion = getLunchSuggestion(
    dismantleArrivalTime,
    dismantleEndTime,
    appSettings.lunchStartTime,
    appSettings.lunchEndTime
  )

  if (setupLunchSuggestion) {
    setupReasoning.push(`Lunch: ${setupLunchSuggestion.reason}`)
  } else {
    setupReasoning.push(`Lunch: No clash with lunch window`)
  }

  if (dismantleLunchSuggestion) {
    dismantleReasoning.push(`Lunch: ${dismantleLunchSuggestion.reason}`)
  } else {
    dismantleReasoning.push(`Lunch: No clash with lunch window`)
  }

  // Overloaded team warning (>4 tasks)
  const setupTeamOverloaded = setupTeamResult.jobCount >= 4
  const dismantleTeamOverloaded = dismantleTeamResult.jobCount >= 4

  if (setupTeamOverloaded) {
    setupReasoning.push(`⚠️ Workload warning: ${setupTeamResult.team} has ${setupTeamResult.jobCount} tasks today (>4)`)
  }

  if (dismantleTeamOverloaded) {
    dismantleReasoning.push(`⚠️ Workload warning: ${dismantleTeamResult.team} has ${dismantleTeamResult.jobCount} tasks today (>4)`)
  }

  // Long travel warning (>30km)
  const longTravelWarning = distanceKm > 30
  if (longTravelWarning) {
    setupReasoning.push(`⚠️ Long travel: ${distanceKm}km exceeds 30km - consider reassignment`)
    dismantleReasoning.push(`⚠️ Long travel: ${distanceKm}km exceeds 30km - consider reassignment`)
  }

  // =========================================================================
  // RETURN RESULT
  // =========================================================================

  return {
    // Setup
    setupDate,
    setupTeam: setupTeamResult.team,
    setupArrivalTime,
    setupDepartureTime,
    setupTravelTimeHours: travelTimeHours,
    setupTravelTimeMins: travelTimeMinsRemainder,
    setupDurationMins: setupWorkMins,
    setupBufferMins: bufferMins,
    setupEndTime,
    setupHubArrivalTime,
    setupDestination: customerAddress,
    setupOvertime,
    setupLunchSuggestion,
    setupCoJoin,

    // Dismantle
    dismantleDate,
    dismantleTeam: dismantleTeamResult.team,
    dismantleArrivalTime,
    dismantleDepartureTime,
    dismantleTravelTimeHours: travelTimeHours,
    dismantleTravelTimeMins: travelTimeMinsRemainder,
    dismantleDurationMins: dismantleWorkMins,
    dismantleBufferMins: bufferMins,
    dismantleEndTime,
    dismantleHubArrivalTime,
    dismantleDestination: customerAddress,
    dismantleOvertime,
    dismantleLunchSuggestion,
    dismantleCoJoin,

    // Distance
    distanceKm,
    hubAddress: aiSettings.hubAddress,

    // Validation
    noOverlap: !setupTeamResult.conflictWith && !dismantleTeamResult.conflictWith,
    withinPreferred: setupTimeCheck.withinWindow && dismantleTimeCheck.withinWindow,
    setupConflictWith: setupTeamResult.conflictWith,
    dismantleConflictWith: dismantleTeamResult.conflictWith,

    // Workload
    setupTeamJobCount: setupTeamResult.jobCount,
    dismantleTeamJobCount: dismantleTeamResult.jobCount,

    // Warnings
    capacityOverflow: setupCapacityOverflow,
    overtimeDecision,
    setupTeamOverloaded,
    dismantleTeamOverloaded,
    longTravelWarning,

    // Settings
    workEndTime: appSettings.workEndTime,
    lunchStartTime: appSettings.lunchStartTime,
    lunchEndTime: appSettings.lunchEndTime,

    // Reasoning
    setupReasoning,
    dismantleReasoning,
  }
}

/**
 * Apply co-join update to linked order
 * This updates the previous order's return choice from "return-to-hub" to "remain-on-site"
 */
export function applyCoJoinUpdate(coJoinInfo: CoJoinInfo): void {
  if (!coJoinInfo.applied || !coJoinInfo.linkedOrderUpdate) return

  const { orderNumber, field, newValue, nextTaskOrderNumber } = coJoinInfo.linkedOrderUpdate
  const nextField = field === "setupReturnChoice" ? "setupNextTaskOrderNumber" : "dismantleNextTaskOrderNumber"

  updateOrderByNumber(orderNumber, (order) => ({
    ...order,
    additionalInfo: {
      ...order.additionalInfo,
      [field]: newValue,
      [nextField]: nextTaskOrderNumber,
    } as AdditionalInfo,
    updatedAt: new Date().toISOString(),
  }))
}
