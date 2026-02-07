"use client"

import React, { useState, useEffect, use, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Printer,
  Trash2,
  MapPin,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Edit,
  Package,
  Clock,
  Truck,
  Info,
  ChevronDown,
  ChevronUp,
  Save,
  FileText,
  Undo2,
  X,
  Sparkles,
  Check,
  Loader2,
  ExternalLink,
  Link2,
} from "lucide-react"
import type { SalesOrder, AdditionalInfo, PricingData, IssueData } from "@/lib/types"
import { BUFFER_TIME_OPTIONS, DEFAULT_BUFFER_TIME, getPhaseIndex } from "@/lib/types"
import { DEFAULT_APP_SETTINGS_DB } from "@/lib/settings-model"
import { OrderProgress } from "@/components/portal/order-progress"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { getAllOrders, updateOrderByNumber, deleteOrderByNumber } from "@/lib/order-storage"
import { getNextStatus, isPhaseRequired, isAdHocOrder } from "@/lib/order-flow"
import { getTeamDisplayName } from "@/lib/team-settings"
import { getBestCustomerAddress } from "@/lib/address-utils"
import { getWorkWindowFromLocalStorage, parseHHMMToMinutes } from "@/lib/time-window"
// NEW: AI Scheduler - all scheduling logic is now in this file
import {
  runAISchedule,
  applyCoJoinUpdate,
  type AIScheduleResult as NewAIScheduleResult,
  type AISettings,
  type AppSettings,
  type TeamName,
} from "@/lib/ai-scheduler"

const LORRY_OPTIONS = ["Team A", "Team B", "Team C", "Team D", "Team E"] as const

// Default AI settings (fallback values)
const DEFAULT_HUB_ADDRESS = "2A, PERSIARAN KILANG PENGKALAN 28, KAWASAN PERINDUSTRIAN PENGKALAN MAJU LAHAT, 31500 Ipoh, Perak"
const DEFAULT_BUFFER_TIME_MINUTES = 30
const DEFAULT_MINUTES_PER_KM = 3
const DEFAULT_RADIUS_KM = 5
const DEFAULT_WAITING_HOURS = 1.5
const DEFAULT_TRAVEL_TIME_MINUTES = 45 // Fallback if no distance available

// Default working hours (fallback values)
const DEFAULT_WORK_START_TIME = "08:00"
const DEFAULT_WORK_END_TIME = "16:30"
const DEFAULT_LUNCH_START_TIME = "13:00"
const DEFAULT_LUNCH_END_TIME = "14:00"

const timeToMinutes = (timeStr: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr?.trim?.() ?? "")
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23) return null
  if (minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

const minutesToTime = (mins: number): string => {
  const normalized = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

const addMinutesToTime = (timeStr: string, mins: number): string => {
  const base = timeToMinutes(timeStr)
  if (base === null) return timeStr
  return minutesToTime(base + mins)
}

const subtractMinutesFromTime = (timeStr: string, mins: number): string => {
  return addMinutesToTime(timeStr, -mins)
}

const toDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr || !timeStr) return null
  const d = new Date(`${dateStr}T${timeStr}`)
  if (Number.isNaN(d.getTime())) return null
  return d
}

const ensureEndAfterStart = (start: Date, end: Date): Date => {
  if (end.getTime() >= start.getTime()) return end
  return new Date(end.getTime() + 24 * 60 * 60 * 1000)
}

// Helper to get application settings from localStorage
const getAppSettings = () => {
  if (typeof window === "undefined") {
    return { ...DEFAULT_APP_SETTINGS_DB }
  }
  try {
    const saved = localStorage.getItem("etre_app_settings")
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        ...DEFAULT_APP_SETTINGS_DB,
        ...parsed,
        inventoryTaskTimesById: {
          ...DEFAULT_APP_SETTINGS_DB.inventoryTaskTimesById,
          ...(parsed.inventoryTaskTimesById || {}),
        },
      }
    }
  } catch (e) {
    console.error("Failed to load application settings:", e)
  }
  return { ...DEFAULT_APP_SETTINGS_DB }
}

// Helper to get AI settings from localStorage
const getAISettings = () => {
  if (typeof window === "undefined") {
    return {
      hubAddress: DEFAULT_HUB_ADDRESS,
      bufferTimeMinutes: DEFAULT_BUFFER_TIME_MINUTES,
      minutesPerKm: DEFAULT_MINUTES_PER_KM,
      radiusKm: DEFAULT_RADIUS_KM,
      waitingHours: DEFAULT_WAITING_HOURS,
    }
  }
  try {
    const saved = localStorage.getItem("etre_ai_settings")
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        hubAddress: parsed.hubAddress ?? DEFAULT_HUB_ADDRESS,
        bufferTimeMinutes: parsed.bufferTimeMinutes ?? DEFAULT_BUFFER_TIME_MINUTES,
        minutesPerKm: parsed.minutesPerKm ?? DEFAULT_MINUTES_PER_KM,
        radiusKm: parsed.radiusKm ?? DEFAULT_RADIUS_KM,
        waitingHours: parsed.waitingHours ?? DEFAULT_WAITING_HOURS,
      }
    }
  } catch (e) {
    console.error("Failed to load AI settings:", e)
  }
  return {
    hubAddress: DEFAULT_HUB_ADDRESS,
    bufferTimeMinutes: DEFAULT_BUFFER_TIME_MINUTES,
    minutesPerKm: DEFAULT_MINUTES_PER_KM,
    radiusKm: DEFAULT_RADIUS_KM,
    waitingHours: DEFAULT_WAITING_HOURS,
  }
}

const getLorryCode = (lorry?: string) => {
  if (!lorry) return ""
  const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
  return match ? match[1].toUpperCase() : ""
}

const normalizeTeamLabel = (lorry?: string) => {
  if (!lorry) return ""
  const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
  return match ? `Team ${match[1].toUpperCase()}` : lorry
}

const getLorryClass = (lorry?: string) => {
  const code = getLorryCode(lorry)
  return code ? `lorry-${code.toLowerCase()}` : ""
}

const getInventoryTaskMins = (app: any, id: string, kind: "setup" | "dismantle"): number => {
  const v = app?.inventoryTaskTimesById?.[id]
  const n = kind === "setup" ? v?.setupMins : v?.dismantleMins
  return Number.isFinite(n) ? Math.max(0, Number(n)) : 0
}

const parseQty = (value: number | string | undefined) => {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value ?? 0)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

const calculateWorkMinutesFromOrder = (order: SalesOrder, kind: "setup" | "dismantle", app: any): number => {
  const items = (order as any).items as Array<any> | undefined
  if (Array.isArray(items) && items.length) {
    const fromItems = items.reduce((sum, item) => {
      const qty = parseQty(item?.quantity)
      if (qty <= 0) return sum
      const invId = item?.inventoryId as string | undefined
      const perUnitFromMap = invId ? getInventoryTaskMins(app, invId, kind) : 0
      if (perUnitFromMap > 0) return sum + qty * perUnitFromMap
      const legacySetup = item?.setupMinsPerUnit
      const legacyDismantle = item?.dismantleMinsPerUnit
      const legacyPerUnit =
        kind === "setup"
          ? (typeof legacySetup === "number" && Number.isFinite(legacySetup) ? Math.max(0, legacySetup) : 0)
          : (typeof legacyDismantle === "number" && Number.isFinite(legacyDismantle)
              ? Math.max(0, legacyDismantle)
              : (typeof legacySetup === "number" && Number.isFinite(legacySetup) ? Math.max(0, legacySetup) : 0))
      return sum + qty * legacyPerUnit
    }, 0)
    if (fromItems > 0) return fromItems
  }

  // Fallback: use pricingData for standard items
  const p = order.pricingData as any
  if (!p) return 0
  const rows = [
    { id: "tent-10x10", qty: p?.tent10x10?.quantity || 0 },
    { id: "tent-20x20", qty: p?.tent20x20?.quantity || 0 },
    { id: "tent-20x30", qty: p?.tent20x30?.quantity || 0 },
    { id: "table-set", qty: p?.tableSet || 0 },
    { id: "long-table", qty: p?.longTable?.quantity || 0 },
    { id: "long-table-skirting", qty: p?.longTable?.withSkirting ? (p?.longTable?.quantity || 0) : 0 },
    { id: "extra-chair", qty: p?.extraChairs || 0 },
    { id: "cooler-fan", qty: p?.coolerFan || 0 },
  ]
  return rows.reduce((sum, row) => sum + (row.qty * getInventoryTaskMins(app, row.id, kind)), 0)
}

// Calculate tent setup time with breakdown
function getTentSetupBreakdown(pricingData: PricingData, app: any) {
  const items = []
  if (pricingData.tent10x10.quantity > 0) {
    items.push({
      name: "Arabian 10x10",
      qty: pricingData.tent10x10.quantity,
      timeEach: getInventoryTaskMins(app, "tent-10x10", "setup"),
      total: pricingData.tent10x10.quantity * getInventoryTaskMins(app, "tent-10x10", "setup"),
    })
  }
  if (pricingData.tent20x20.quantity > 0) {
    items.push({
      name: "Arabian 20x20",
      qty: pricingData.tent20x20.quantity,
      timeEach: getInventoryTaskMins(app, "tent-20x20", "setup"),
      total: pricingData.tent20x20.quantity * getInventoryTaskMins(app, "tent-20x20", "setup"),
    })
  }
  if (pricingData.tent20x30.quantity > 0) {
    items.push({
      name: "Arabian 20x30",
      qty: pricingData.tent20x30.quantity,
      timeEach: getInventoryTaskMins(app, "tent-20x30", "setup"),
      total: pricingData.tent20x30.quantity * getInventoryTaskMins(app, "tent-20x30", "setup"),
    })
  }
  return items
}

function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return `${hours}h ${mins}m`
}

function formatBufferLabel(value: string) {
  if (!value) return "-"
  const match = BUFFER_TIME_OPTIONS.find((option) => option.value === value)
  if (match) return match.label
  const minutes = parseInt(value, 10)
  if (Number.isNaN(minutes)) return value
  return `${minutes} mins`
}

function formatDateToDMY(dateString: string) {
  if (!dateString) return ""
  const [year, month, day] = dateString.split("-")
  if (!year || !month || !day) return ""
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`
}

function parseDMYToISO(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return iso
}

function formatDateToISO(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTimeToHHMM(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function parseLocalDateTime(dateISO: string, timeHHMM: string): Date | null {
  const d = (dateISO || "").trim()
  const t = (timeHHMM || "").trim()
  if (!d || !t) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  if (!/^\d{2}:\d{2}$/.test(t)) return null
  const dt = new Date(`${d}T${t}:00`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function getSalesOrderPlacedAt(order: SalesOrder): Date | null {
  const created = (order.createdAt || "").trim()
  if (created) {
    const d = new Date(created)
    if (!Number.isNaN(d.getTime())) return d
  }

  const od = (order.orderMeta?.orderDate || "").trim()
  const ot = (order.orderMeta?.orderTime || "").trim()
  const fallback = parseLocalDateTime(od, ot)
  return fallback
}

function getSetupBeforeSalesOrderError(order: SalesOrder, info: AdditionalInfo): string | null {
  const salesAt = getSalesOrderPlacedAt(order)
  if (!salesAt) return null

  const setupDate = info.confirmedSetupDate || order.eventData.customerPreferredSetupDate || ""
  if (!setupDate) return null

  const salesLabel = `${formatDateToDMY(formatDateToISO(salesAt))} ${formatTimeToHHMM(salesAt)}`

  const departureTime = info.departureFromHub || ""
  const departureAt = departureTime ? parseLocalDateTime(setupDate, departureTime) : null
  if (departureAt && departureAt < salesAt) {
    return `Cannot save: Setup departure cannot be earlier than Sales Order time.\n\nSales Order time: ${salesLabel}\nSetup departure: ${formatDateToDMY(setupDate)} ${departureTime}\n\nPlease schedule departure from the Sales Order time onwards.`
  }

  const arrivalTime = info.confirmedSetupTime || info.scheduleStartTime || ""
  const arrivalAt = arrivalTime ? parseLocalDateTime(setupDate, arrivalTime) : null
  if (arrivalAt && arrivalAt < salesAt) {
    return `Cannot save: AI Setup date/time cannot be earlier than Sales Order time.\n\nSales Order time: ${salesLabel}\nSetup time: ${formatDateToDMY(setupDate)} ${arrivalTime}\n\nPlease schedule from the Sales Order time onwards.`
  }

  return null
}

function formatTimeRange(start: Date, end: Date) {
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
  return `${hhmm(start)}-${hhmm(end)}`
}

function displayHHmm(value: string) {
  const v = (value || "").trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return v
  return `${m[1].padStart(2, "0")}${m[2]}`
}

function isNonWorkingSlot(date: Date) {
  const { workStartTime, workEndTime } = getWorkWindowFromLocalStorage()
  const workStartMins = parseHHMMToMinutes(workStartTime)
  const workEndMins = parseHHMMToMinutes(workEndTime)
  if (workStartMins === null || workEndMins === null || workEndMins <= workStartMins) return false
  const mins = date.getHours() * 60 + date.getMinutes()
  return mins < workStartMins || mins >= workEndMins
}

export default function SchedulingDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>
}) {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [orderNumber, setOrderNumber] = useState<string>("")
  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(true)
  const [showScheduleDocument, setShowScheduleDocument] = useState(false)
  const [confirmedSetupDateInput, setConfirmedSetupDateInput] = useState("")
  const [confirmedDismantleDateInput, setConfirmedDismantleDateInput] = useState("")
  const [confirmedOtherAdhocDateInput, setConfirmedOtherAdhocDateInput] = useState("")
  const [jumpToDate, setJumpToDate] = useState("")
  const [arrivalTime, setArrivalTime] = useState("")
  const [dismantleArrivalTime, setDismantleArrivalTime] = useState("")
  const [setupLocked, setSetupLocked] = useState(false)
  const [dismantleLocked, setDismantleLocked] = useState(false)
  const [otherAdhocLocked, setOtherAdhocLocked] = useState(false)
  const [isSchedulingReadOnly, setIsSchedulingReadOnly] = useState(false)
  const [showSetupConfirm, setShowSetupConfirm] = useState(false)
  const [showDismantleConfirm, setShowDismantleConfirm] = useState(false)
  const [showOtherAdhocConfirm, setShowOtherAdhocConfirm] = useState(false)
  const [showEditSchedulingConfirm, setShowEditSchedulingConfirm] = useState(false)
  const [showEditOrderConfirm, setShowEditOrderConfirm] = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const calendarRef = useRef<FullCalendar>(null)
  const [flagData, setFlagData] = useState({
    personnel: "",
    issue: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })

  // AI Schedule state
  const [showAIScheduleModal, setShowAIScheduleModal] = useState(false)
  const [aiScheduleStep, setAIScheduleStep] = useState<"ask" | "distance" | "loading" | "ot-prompt" | "co-join-prompt" | "result">("ask")
  const [aiCoJoinApproved, setAiCoJoinApproved] = useState(false)
  const [aiOvertimeApproved, setAiOvertimeApproved] = useState(false)
  const [aiTeamPreference, setAITeamPreference] = useState<{ hasPreference: boolean; setupTeam: string; dismantleTeam: string }>({
    hasPreference: false,
    setupTeam: "",
    dismantleTeam: "",
  })
  const [aiDistanceKm, setAIDistanceKm] = useState<number>(15) // Default 15km
  const aiTimeWindowMode = "flexible" as const
  const [aiDistanceLoading, setAIDistanceLoading] = useState(false)
  const [aiDistanceMapUrl, setAIDistanceMapUrl] = useState<string>("")
  const [aiDistanceAutoCalculated, setAIDistanceAutoCalculated] = useState(false)
  const [aiScheduleResult, setAIScheduleResult] = useState<NewAIScheduleResult | null>(null)
  const [aiScheduleNoCoJoinResult, setAIScheduleNoCoJoinResult] = useState<NewAIScheduleResult | null>(null)
  const [aiScheduleNoCoJoinLoading, setAIScheduleNoCoJoinLoading] = useState(false)
  const [aiScheduleNoCoJoinError, setAIScheduleNoCoJoinError] = useState("")
  const [aiScheduleApplied, setAIScheduleApplied] = useState(false)
  const [showAIReport, setShowAIReport] = useState(false)

  // Route Optimizer state
  const [showRouteOptimizerModal, setShowRouteOptimizerModal] = useState(false)
  const [routeOptimizerStep, setRouteOptimizerStep] = useState<"select" | "loading" | "result">("select")
  const [routeOptimizerDate, setRouteOptimizerDate] = useState("")
  const [routeOptimizerTeam, setRouteOptimizerTeam] = useState<string>("")
  const [routeOptimizerStartingPoint, setRouteOptimizerStartingPoint] = useState<"hub" | "other">("hub")
  const [routeOptimizerCustomAddress, setRouteOptimizerCustomAddress] = useState("")
  const [routeOptimizerResult, setRouteOptimizerResult] = useState<any>(null)
  const [routeOptimizerSearching, setRouteOptimizerSearching] = useState(false)
  const [routeOptimizerLocation, setRouteOptimizerLocation] = useState<{ lat: number; lon: number; address: string } | null>(null)

  // Distance estimation state (for manual Estimate button)
  const [setupDistanceLoading, setSetupDistanceLoading] = useState(false)
  const [setupDistanceResult, setSetupDistanceResult] = useState<{
    distanceKm: number
    mapUrl: string
    fromAddress: string
    toAddress: string
  } | null>(null)
  const [dismantleDistanceLoading, setDismantleDistanceLoading] = useState(false)
  const [dismantleDistanceResult, setDismantleDistanceResult] = useState<{
    distanceKm: number
    mapUrl: string
    fromAddress: string
    toAddress: string
  } | null>(null)

  // Return-to-hub estimation state (setup/dismantle completion panels)
  const [setupReturnDistanceLoading, setSetupReturnDistanceLoading] = useState(false)
  const [setupReturnDistanceResult, setSetupReturnDistanceResult] = useState<{
    distanceKm: number
    mapUrl: string
    fromAddress: string
    toAddress: string
  } | null>(null)
  const [dismantleReturnDistanceLoading, setDismantleReturnDistanceLoading] = useState(false)
  const [dismantleReturnDistanceResult, setDismantleReturnDistanceResult] = useState<{
    distanceKm: number
    mapUrl: string
    fromAddress: string
    toAddress: string
  } | null>(null)

  // Enlarged map modal state
  const [enlargedMapUrl, setEnlargedMapUrl] = useState<string | null>(null)
  const [enlargedMapInfo, setEnlargedMapInfo] = useState<{
    from: string
    to: string
    distance: number
  } | null>(null)

  const getGoogleMapsEmbedDirectionsUrl = (from: string, to: string) => {
    const origin = encodeURIComponent(from)
    const destination = encodeURIComponent(to)
    return `https://www.google.com/maps?output=embed&saddr=${origin}&daddr=${destination}`
  }

  const getOrderCustomerAddress = (o: SalesOrder | null) => {
    if (!o) return ""
    return (
      getBestCustomerAddress(o.customerData) ||
      o.customerData?.deliveryAddress ||
      o.customerData?.billingAddress ||
      ""
    )
  }

  const getSetupSiteAddress = () => {
    return additionalInfo.setupDestinationAddress || getOrderCustomerAddress(order)
  }

  const getDismantleSiteAddress = () => {
    return additionalInfo.dismantleDestinationAddress || getOrderCustomerAddress(order)
  }

  useEffect(() => {
    let cancelled = false

    const computeNoCoJoinSchedule = async () => {
      if (!order || !aiScheduleResult) return

      setAIScheduleNoCoJoinLoading(true)
      setAIScheduleNoCoJoinError("")
      setAIScheduleNoCoJoinResult(null)

      const excluded: TeamName[] = []
      if (aiScheduleResult.setupCoJoin?.applied && aiScheduleResult.setupCoJoin?.team) excluded.push(aiScheduleResult.setupCoJoin.team)
      if (aiScheduleResult.dismantleCoJoin?.applied && aiScheduleResult.dismantleCoJoin?.team) excluded.push(aiScheduleResult.dismantleCoJoin.team)

      try {
        const aiSettingsConfig = getAISettings()
        const appSettingsConfig = getAppSettings()
        const allOrders = getAllOrders()
        const result = await runAISchedule({
          order,
          allOrders,
          aiSettings: aiSettingsConfig as AISettings,
          appSettings: appSettingsConfig as AppSettings,
          distanceKm: aiDistanceKm,
          allowCoJoin: false,
          excludedTeams: excluded,
          preferredSetupTeam: aiTeamPreference.hasPreference && aiTeamPreference.setupTeam
            ? aiTeamPreference.setupTeam as TeamName
            : undefined,
          preferredDismantleTeam: aiTeamPreference.hasPreference && aiTeamPreference.dismantleTeam
            ? aiTeamPreference.dismantleTeam as TeamName
            : undefined,
          timeWindowMode: aiTimeWindowMode || "flexible",
        })

        if (!cancelled) {
          setAIScheduleNoCoJoinResult(result)
        }
      } catch {
        if (!cancelled) {
          setAIScheduleNoCoJoinError("Unable to compute the no co-join comparison.")
        }
      } finally {
        if (!cancelled) {
          setAIScheduleNoCoJoinLoading(false)
        }
      }
    }

    if (aiScheduleStep === "ot-prompt" && aiScheduleResult?.overtimeDecision?.required) {
      computeNoCoJoinSchedule()
    } else {
      setAIScheduleNoCoJoinLoading(false)
      setAIScheduleNoCoJoinResult(null)
      setAIScheduleNoCoJoinError("")
    }

    return () => {
      cancelled = true
    }
  }, [aiScheduleStep, aiScheduleResult, order, aiDistanceKm, aiTeamPreference])

  // Additional Info state with proper structure
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>({
    setupDepartureFromType: "hub",
    setupDepartureAddress: "",
    setupDestinationAddress: "",
    setupDistanceKm: 0,
    departureFromHub: "",
    travelDurationHours: 0,
    travelDurationMinutes: 0,
    setupDurationHours: 0,
    setupDurationMinutes: 0,
    scheduleStartTime: "",
    setupLorry: "",
    tentSetupTimeCalculated: 0,
    dismantleWorkTimeCalculated: 0,
    bufferTime: DEFAULT_BUFFER_TIME,
    bufferReason: "",
    totalTaskTimeHours: 0,
    totalTaskTimeMinutes: 0,
    estimatedEndTime: "",
    // Journey after setup (Traffic Return)
    setupNextAction: "warehouse", // Legacy
    setupReturnChoice: "return-to-hub",
    setupReturnFromType: "site",
    setupReturnFromAddress: "",
    setupReturnDepartureTime: "",
    setupReturnTravelHours: 0,
    setupReturnTravelMinutes: 0,
    setupReturnDistanceKm: 0,
    setupReturnToType: "hub",
    setupReturnToAddress: "",
    setupReturnTravelMins: 0, // Legacy
    setupReturnArrivalTime: "",
    setupNextTaskOrderNumber: "",
    confirmedSetupDate: "",
    confirmedSetupTime: "",
    confirmedDismantleDate: "",
    confirmedDismantleTime: "",
    dismantleDepartureFromType: "hub",
    dismantleDepartureAddress: "",
    dismantleDestinationAddress: "",
    dismantleDistanceKm: 0,
    dismantleDepartureTime: "",
    dismantleTravelHours: 0,
    dismantleTravelMinutes: 0,
    dismantleDurationHours: 0,
    dismantleDurationMinutes: 0,
    dismantleScheduleStartTime: "",
    dismantleLorry: "",
    dismantleBufferTime: DEFAULT_BUFFER_TIME,
    dismantleBufferReason: "",
    dismantleTotalTimeHours: 0,
    dismantleTotalTimeMinutes: 0,
    dismantleEstimatedEndTime: "",
    // Journey after dismantle (Traffic Return)
    dismantleNextAction: "warehouse", // Legacy
    dismantleReturnChoice: "return-to-hub",
    dismantleReturnFromType: "site",
    dismantleReturnFromAddress: "",
    dismantleReturnDepartureTime: "",
    dismantleReturnTravelHours: 0,
    dismantleReturnTravelMinutes: 0,
    dismantleReturnDistanceKm: 0,
    dismantleReturnToType: "hub",
    dismantleReturnToAddress: "",
    dismantleReturnTravelMins: 0, // Legacy
    dismantleReturnArrivalTime: "",
    dismantleNextTaskOrderNumber: "",
    confirmedOtherAdhocDate: "",
    confirmedOtherAdhocTime: "",
    otherAdhocDurationHours: 0,
    otherAdhocDurationMinutes: 0,
    otherAdhocScheduleStartTime: "",
    otherAdhocLorry: "",
    otherAdhocBufferTime: DEFAULT_BUFFER_TIME,
    otherAdhocBufferReason: "",
    otherAdhocTotalTimeHours: 0,
    otherAdhocTotalTimeMinutes: 0,
    otherAdhocEstimatedEndTime: "",
    schedulingPersonnel: "",
    schedulingDate: new Date().toISOString().split("T")[0],
    schedulingTime: new Date().toTimeString().slice(0, 5),
  })

  // Track client-side mounting to prevent hydration errors
  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const loadOrder = async () => {
      const { orderNumber } = await params
      setOrderNumber(orderNumber)
      const parsedOrders = getAllOrders()
      const foundOrder = parsedOrders.find((o) => o.orderNumber === orderNumber)
      if (foundOrder) {
          const normalizedOrder = {
            ...foundOrder,
            orderSource: foundOrder.orderSource || "sales",
          }
          setOrder(normalizedOrder)
          const ai = foundOrder.additionalInfo
          const hasAnySchedule =
            !!ai?.scheduleStartTime ||
            !!ai?.dismantleScheduleStartTime ||
            !!ai?.otherAdhocScheduleStartTime
          const shouldReadOnlyOnLoad = foundOrder.status === "packing" || hasAnySchedule
          setIsSchedulingReadOnly(shouldReadOnlyOnLoad)
          setSetupLocked(shouldReadOnlyOnLoad)
          setDismantleLocked(shouldReadOnlyOnLoad)
          setOtherAdhocLocked(shouldReadOnlyOnLoad)
          // Calculate work minutes (uses Settings > Inventory Setup & Dismantle Times)
          const appSettingsConfig = getAppSettings()
          const setupWorkMins = calculateWorkMinutesFromOrder(foundOrder, "setup", appSettingsConfig)
          const dismantleWorkMins = calculateWorkMinutesFromOrder(foundOrder, "dismantle", appSettingsConfig) || setupWorkMins
          if (foundOrder.additionalInfo) {
            setAdditionalInfo({
              ...foundOrder.additionalInfo,
              setupDepartureFromType: foundOrder.additionalInfo.setupDepartureFromType || "hub",
              setupDepartureAddress: foundOrder.additionalInfo.setupDepartureAddress || "",
              setupDestinationAddress: foundOrder.additionalInfo.setupDestinationAddress || getOrderCustomerAddress(normalizedOrder),
              setupDistanceKm: foundOrder.additionalInfo.setupDistanceKm || 0,
              dismantleDepartureFromType: foundOrder.additionalInfo.dismantleDepartureFromType || "hub",
              dismantleDepartureAddress: foundOrder.additionalInfo.dismantleDepartureAddress || "",
              dismantleDestinationAddress: foundOrder.additionalInfo.dismantleDestinationAddress || getOrderCustomerAddress(normalizedOrder),
              dismantleDistanceKm: foundOrder.additionalInfo.dismantleDistanceKm || 0,
              scheduleStartTime: foundOrder.additionalInfo.scheduleStartTime || "",
              dismantleScheduleStartTime: foundOrder.additionalInfo.dismantleScheduleStartTime || "",
              setupLorry: foundOrder.additionalInfo.setupLorry || "",
              dismantleLorry: foundOrder.additionalInfo.dismantleLorry || "",
              // Legacy fields
              setupNextAction: (foundOrder.additionalInfo.setupNextAction || "warehouse") as any,
              dismantleNextAction: (foundOrder.additionalInfo.dismantleNextAction || "warehouse") as any,
              // Setup Return Traffic (migrate from legacy if needed)
              setupReturnChoice: foundOrder.additionalInfo.setupReturnChoice
                || (foundOrder.additionalInfo.setupNextAction === "warehouse" ? "return-to-hub"
                  : foundOrder.additionalInfo.setupNextAction === "next-task" ? "remain-on-site"
                  : "return-to-hub") as any,
              setupReturnFromType: foundOrder.additionalInfo.setupReturnFromType || "site",
              setupReturnFromAddress: foundOrder.additionalInfo.setupReturnFromAddress || "",
              setupReturnDepartureTime: foundOrder.additionalInfo.setupReturnDepartureTime || "",
              setupReturnTravelHours: foundOrder.additionalInfo.setupReturnTravelHours
                ?? Math.floor((foundOrder.additionalInfo.setupReturnTravelMins || 0) / 60),
              setupReturnTravelMinutes: foundOrder.additionalInfo.setupReturnTravelMinutes
                ?? ((foundOrder.additionalInfo.setupReturnTravelMins || 0) % 60),
              setupReturnToType: foundOrder.additionalInfo.setupReturnToType || "hub",
              setupReturnToAddress: foundOrder.additionalInfo.setupReturnToAddress || "",
              // Dismantle Return Traffic (migrate from legacy if needed)
              dismantleReturnChoice: foundOrder.additionalInfo.dismantleReturnChoice
                || (foundOrder.additionalInfo.dismantleNextAction === "warehouse" ? "return-to-hub"
                  : foundOrder.additionalInfo.dismantleNextAction === "next-task" ? "remain-on-site"
                  : "return-to-hub") as any,
              dismantleReturnFromType: foundOrder.additionalInfo.dismantleReturnFromType || "site",
              dismantleReturnFromAddress: foundOrder.additionalInfo.dismantleReturnFromAddress || "",
              dismantleReturnDepartureTime: foundOrder.additionalInfo.dismantleReturnDepartureTime || "",
              dismantleReturnTravelHours: foundOrder.additionalInfo.dismantleReturnTravelHours
                ?? Math.floor((foundOrder.additionalInfo.dismantleReturnTravelMins || 0) / 60),
              dismantleReturnTravelMinutes: foundOrder.additionalInfo.dismantleReturnTravelMinutes
                ?? ((foundOrder.additionalInfo.dismantleReturnTravelMins || 0) % 60),
              dismantleReturnToType: foundOrder.additionalInfo.dismantleReturnToType || "hub",
              dismantleReturnToAddress: foundOrder.additionalInfo.dismantleReturnToAddress || "",
              confirmedOtherAdhocDate: foundOrder.additionalInfo.confirmedOtherAdhocDate || "",
              confirmedOtherAdhocTime: foundOrder.additionalInfo.confirmedOtherAdhocTime || "",
              otherAdhocDurationHours: foundOrder.additionalInfo.otherAdhocDurationHours || 0,
              otherAdhocDurationMinutes: foundOrder.additionalInfo.otherAdhocDurationMinutes || 0,
              otherAdhocScheduleStartTime: foundOrder.additionalInfo.otherAdhocScheduleStartTime || "",
              otherAdhocLorry: foundOrder.additionalInfo.otherAdhocLorry || "",
              otherAdhocBufferTime: foundOrder.additionalInfo.otherAdhocBufferTime || DEFAULT_BUFFER_TIME,
              otherAdhocBufferReason: foundOrder.additionalInfo.otherAdhocBufferReason || "",
              tentSetupTimeCalculated: setupWorkMins,
              dismantleWorkTimeCalculated: foundOrder.additionalInfo.dismantleWorkTimeCalculated ?? dismantleWorkMins,
            })
          } else {
            setAdditionalInfo(prev => ({
              ...prev,
              tentSetupTimeCalculated: setupWorkMins,
              dismantleWorkTimeCalculated: dismantleWorkMins,
            }))
          }
      }
      setIsLoading(false)
    }

    loadOrder()
  }, [params])

  const lastSetupReturnEstimateKeyRef = useRef<string>("")
  const lastDismantleReturnEstimateKeyRef = useRef<string>("")

  const estimateReturnToHub = async (fromAddress: string, toAddress: string) => {
    const response = await fetch("/api/calculate-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAddress, toAddress }),
    })
    const data = await response.json()
    if (!data.success) {
      throw new Error(data.error || "Could not calculate distance")
    }
    const aiSettings = getAISettings()
    const travelMins = Math.round(data.distance.km * aiSettings.minutesPerKm)
    return {
      distanceKm: data.distance.km as number,
      travelMins,
      mapUrl: data.mapUrl as string,
      fromAddress: data.from.address as string,
      toAddress: data.to.address as string,
    }
  }

  // Auto-estimate return to hub (setup) when "Return to Hub" is selected and values are empty
  useEffect(() => {
    if (additionalInfo.setupReturnChoice !== "return-to-hub") return
    // Determine from/to addresses based on new fields
    const from = additionalInfo.setupReturnFromType === "site"
      ? getSetupSiteAddress()
      : additionalInfo.setupReturnFromAddress
    const to = additionalInfo.setupReturnToType === "hub"
      ? getAISettings().hubAddress
      : additionalInfo.setupReturnToAddress
    if (!from || !to) return
    // Skip if already has values
    const travelMins = additionalInfo.setupReturnTravelHours * 60 + additionalInfo.setupReturnTravelMinutes
    if (additionalInfo.setupReturnDistanceKm > 0 && travelMins > 0) return
    const key = `${from}__${to}`
    if (lastSetupReturnEstimateKeyRef.current === key) return
    lastSetupReturnEstimateKeyRef.current = key

    ;(async () => {
      try {
        setSetupReturnDistanceLoading(true)
        const res = await estimateReturnToHub(from, to)
        setSetupReturnDistanceResult({
          distanceKm: res.distanceKm,
          mapUrl: res.mapUrl,
          fromAddress: res.fromAddress,
          toAddress: res.toAddress,
        })
        setAdditionalInfo((prev) => ({
          ...prev,
          setupReturnDistanceKm: res.distanceKm,
          setupReturnTravelHours: Math.floor(res.travelMins / 60),
          setupReturnTravelMinutes: res.travelMins % 60,
          setupReturnTravelMins: res.travelMins,
        }))
      } catch {
        // Silent fail (API key may not be configured); user can still enter manually
      } finally {
        setSetupReturnDistanceLoading(false)
      }
    })()
  }, [
    additionalInfo.setupReturnChoice,
    additionalInfo.setupReturnFromType,
    additionalInfo.setupReturnFromAddress,
    additionalInfo.setupReturnToType,
    additionalInfo.setupReturnToAddress,
    additionalInfo.setupReturnDistanceKm,
    additionalInfo.setupReturnTravelHours,
    additionalInfo.setupReturnTravelMinutes,
    additionalInfo.setupDestinationAddress,
    order,
  ])

  // Auto-estimate return to hub (dismantle) when "Return to Hub" is selected and values are empty
  useEffect(() => {
    if (additionalInfo.dismantleReturnChoice !== "return-to-hub") return
    // Determine from/to addresses based on new fields
    const from = additionalInfo.dismantleReturnFromType === "site"
      ? getDismantleSiteAddress()
      : additionalInfo.dismantleReturnFromAddress
    const to = additionalInfo.dismantleReturnToType === "hub"
      ? getAISettings().hubAddress
      : additionalInfo.dismantleReturnToAddress
    if (!from || !to) return
    // Skip if already has values
    const travelMins = additionalInfo.dismantleReturnTravelHours * 60 + additionalInfo.dismantleReturnTravelMinutes
    if (additionalInfo.dismantleReturnDistanceKm > 0 && travelMins > 0) return
    const key = `${from}__${to}`
    if (lastDismantleReturnEstimateKeyRef.current === key) return
    lastDismantleReturnEstimateKeyRef.current = key

    ;(async () => {
      try {
        setDismantleReturnDistanceLoading(true)
        const res = await estimateReturnToHub(from, to)
        setDismantleReturnDistanceResult({
          distanceKm: res.distanceKm,
          mapUrl: res.mapUrl,
          fromAddress: res.fromAddress,
          toAddress: res.toAddress,
        })
        setAdditionalInfo((prev) => ({
          ...prev,
          dismantleReturnDistanceKm: res.distanceKm,
          dismantleReturnTravelHours: Math.floor(res.travelMins / 60),
          dismantleReturnTravelMinutes: res.travelMins % 60,
          dismantleReturnTravelMins: res.travelMins,
        }))
      } catch {
        // Silent fail; user can still enter manually
      } finally {
        setDismantleReturnDistanceLoading(false)
      }
    })()
  }, [
    additionalInfo.dismantleReturnChoice,
    additionalInfo.dismantleReturnFromType,
    additionalInfo.dismantleReturnFromAddress,
    additionalInfo.dismantleReturnToType,
    additionalInfo.dismantleReturnToAddress,
    additionalInfo.dismantleReturnDistanceKm,
    additionalInfo.dismantleReturnTravelHours,
    additionalInfo.dismantleReturnTravelMinutes,
    additionalInfo.dismantleDestinationAddress,
    order,
  ])

  useEffect(() => {
    setConfirmedSetupDateInput(formatDateToDMY(additionalInfo.confirmedSetupDate))
  }, [additionalInfo.confirmedSetupDate])

  useEffect(() => {
    setConfirmedDismantleDateInput(formatDateToDMY(additionalInfo.confirmedDismantleDate))
  }, [additionalInfo.confirmedDismantleDate])

  useEffect(() => {
    setConfirmedOtherAdhocDateInput(formatDateToDMY(additionalInfo.confirmedOtherAdhocDate))
  }, [additionalInfo.confirmedOtherAdhocDate])

  // Keep "Confirmed" + departure times chained to the schedule start time (manual drag/click edits).
  // If user pulls the task earlier to avoid OT, departure time and confirmed time should follow automatically.
  useEffect(() => {
    if (!order) return
    if (!additionalInfo.scheduleStartTime) return

    setAdditionalInfo((prev) => {
      if (!prev.scheduleStartTime) return prev

      const travelMins = (prev.travelDurationHours || 0) * 60 + (prev.travelDurationMinutes || 0)
      const shouldDeriveDeparture = prev.setupDepartureFromType === "hub"
      const derivedDeparture = shouldDeriveDeparture
        ? subtractMinutesFromTime(prev.scheduleStartTime, travelMins)
        : prev.departureFromHub

      let next: any = prev
      if (prev.confirmedSetupTime !== prev.scheduleStartTime) {
        next = { ...next, confirmedSetupTime: prev.scheduleStartTime }
      }
      if (shouldDeriveDeparture && prev.departureFromHub !== derivedDeparture) {
        next = { ...next, departureFromHub: derivedDeparture }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order,
    additionalInfo.scheduleStartTime,
    additionalInfo.setupDepartureFromType,
    additionalInfo.travelDurationHours,
    additionalInfo.travelDurationMinutes,
  ])

  useEffect(() => {
    if (!order) return
    if (!additionalInfo.dismantleScheduleStartTime) return

    setAdditionalInfo((prev) => {
      if (!prev.dismantleScheduleStartTime) return prev

      const travelMins = (prev.dismantleTravelHours || 0) * 60 + (prev.dismantleTravelMinutes || 0)
      const shouldDeriveDeparture = prev.dismantleDepartureFromType === "hub"
      const derivedDeparture = shouldDeriveDeparture
        ? subtractMinutesFromTime(prev.dismantleScheduleStartTime, travelMins)
        : prev.dismantleDepartureTime

      let next: any = prev
      if (prev.confirmedDismantleTime !== prev.dismantleScheduleStartTime) {
        next = { ...next, confirmedDismantleTime: prev.dismantleScheduleStartTime }
      }
      if (shouldDeriveDeparture && prev.dismantleDepartureTime !== derivedDeparture) {
        next = { ...next, dismantleDepartureTime: derivedDeparture }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order,
    additionalInfo.dismantleScheduleStartTime,
    additionalInfo.dismantleDepartureFromType,
    additionalInfo.dismantleTravelHours,
    additionalInfo.dismantleTravelMinutes,
  ])

  const handleJumpToDate = (value: string) => {
    setJumpToDate(value)
    if (!value) return
    calendarRef.current?.getApi().gotoDate(value)
  }

  // Calculate total task time, arrival time, and estimated end time
  useEffect(() => {
    if (!order) return

    // Travel time in minutes
    const travelMins = additionalInfo.travelDurationHours * 60 + additionalInfo.travelDurationMinutes
    // Setup duration in minutes
    const setupMins = additionalInfo.setupDurationHours * 60 + additionalInfo.setupDurationMinutes
    // Buffer time in minutes
    const bufferMins = parseInt(additionalInfo.bufferTime) || 0

    const totalMins = setupMins + bufferMins
    const totalHours = Math.floor(totalMins / 60)
    const remainingMins = totalMins % 60

    // Calculate arrival time based on departure time (setup driver panel)
    let arrival = ""
    if (additionalInfo.departureFromHub) {
      const [depHours, depMins] = additionalInfo.departureFromHub.split(":").map(Number)
      const depTotalMins = depHours * 60 + depMins
      const arrivalTotalMins = depTotalMins + travelMins
      const arrivalHours = Math.floor(arrivalTotalMins / 60) % 24
      const arrivalMins = arrivalTotalMins % 60
      arrival = `${arrivalHours.toString().padStart(2, "0")}:${arrivalMins.toString().padStart(2, "0")}`
    }
    setArrivalTime(arrival)

    // Dismantle arrival time based on departure time (dismantle driver panel)
    let dismantleArrival = ""
    if (additionalInfo.dismantleDepartureTime) {
      const dismantleTravelMins = additionalInfo.dismantleTravelHours * 60 + additionalInfo.dismantleTravelMinutes
      const [depHours, depMins] = additionalInfo.dismantleDepartureTime.split(":").map(Number)
      const depTotalMins = depHours * 60 + depMins
      const arrivalTotalMins = depTotalMins + dismantleTravelMins
      const arrivalHours = Math.floor(arrivalTotalMins / 60) % 24
      const arrivalMins = arrivalTotalMins % 60
      dismantleArrival = `${arrivalHours.toString().padStart(2, "0")}:${arrivalMins.toString().padStart(2, "0")}`
    }
    setDismantleArrivalTime(dismantleArrival)

    // Calculate estimated end time from Setup Path start time only
    let estimatedEndTime = ""
    if (additionalInfo.scheduleStartTime) {
      const [startHours, startMins] = additionalInfo.scheduleStartTime.split(":").map(Number)
      const startTotalMins = startHours * 60 + startMins
      const endTotalMins = startTotalMins + setupMins + bufferMins
      const endHours = Math.floor(endTotalMins / 60) % 24
      const endMins = endTotalMins % 60
      estimatedEndTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
    }

    // Dismantle calculations
    const dismantleDurationMins = additionalInfo.dismantleDurationHours * 60 + additionalInfo.dismantleDurationMinutes
    const dismantleBufferMins = parseInt(additionalInfo.dismantleBufferTime) || 0
    const dismantleTotalMins = dismantleDurationMins + dismantleBufferMins
    const dismantleTotalHours = Math.floor(dismantleTotalMins / 60)
    const dismantleRemainingMins = dismantleTotalMins % 60

    let dismantleEstimatedEndTime = ""
    if (additionalInfo.dismantleScheduleStartTime) {
      const [startHours, startMins] = additionalInfo.dismantleScheduleStartTime.split(":").map(Number)
      const startTotalMins = startHours * 60 + startMins
      const endTotalMins = startTotalMins + dismantleTotalMins
      const endHours = Math.floor(endTotalMins / 60) % 24
      const endMins = endTotalMins % 60
      dismantleEstimatedEndTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
    }

    // Other adhoc calculations
    const otherAdhocDurationMins = additionalInfo.otherAdhocDurationHours * 60 + additionalInfo.otherAdhocDurationMinutes
    const otherAdhocBufferMins = parseInt(additionalInfo.otherAdhocBufferTime) || 0
    const otherAdhocTotalMins = otherAdhocDurationMins + otherAdhocBufferMins
    const otherAdhocTotalHours = Math.floor(otherAdhocTotalMins / 60)
    const otherAdhocRemainingMins = otherAdhocTotalMins % 60

    let otherAdhocEstimatedEndTime = ""
    if (additionalInfo.otherAdhocScheduleStartTime) {
      const [startHours, startMins] = additionalInfo.otherAdhocScheduleStartTime.split(":").map(Number)
      const startTotalMins = startHours * 60 + startMins
      const endTotalMins = startTotalMins + otherAdhocTotalMins
      const endHours = Math.floor(endTotalMins / 60) % 24
      const endMins = endTotalMins % 60
      otherAdhocEstimatedEndTime = `${endHours.toString().padStart(2, "0")}:${endMins.toString().padStart(2, "0")}`
    }

    setAdditionalInfo((prev) => ({
      ...prev,
      totalTaskTimeHours: totalHours,
      totalTaskTimeMinutes: remainingMins,
      estimatedEndTime,
      dismantleTotalTimeHours: dismantleTotalHours,
      dismantleTotalTimeMinutes: dismantleRemainingMins,
      dismantleEstimatedEndTime,
      otherAdhocTotalTimeHours: otherAdhocTotalHours,
      otherAdhocTotalTimeMinutes: otherAdhocRemainingMins,
      otherAdhocEstimatedEndTime,
    }))
  }, [
    order,
    additionalInfo.departureFromHub,
    additionalInfo.travelDurationHours,
    additionalInfo.travelDurationMinutes,
    additionalInfo.setupDurationHours,
    additionalInfo.setupDurationMinutes,
    additionalInfo.scheduleStartTime,
    additionalInfo.bufferTime,
    additionalInfo.dismantleDurationHours,
    additionalInfo.dismantleDurationMinutes,
    additionalInfo.dismantleBufferTime,
    additionalInfo.dismantleScheduleStartTime,
    additionalInfo.dismantleDepartureTime,
    additionalInfo.dismantleTravelHours,
    additionalInfo.dismantleTravelMinutes,
    additionalInfo.otherAdhocDurationHours,
    additionalInfo.otherAdhocDurationMinutes,
    additionalInfo.otherAdhocBufferTime,
    additionalInfo.otherAdhocScheduleStartTime,
  ])

  // Calculate setup return arrival time based on departure time + travel time
  useEffect(() => {
    if (additionalInfo.setupReturnChoice !== "return-to-hub") {
      if (additionalInfo.setupReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, setupReturnArrivalTime: "" }))
      return
    }
    // Use custom departure time or fall back to estimated end time
    const departureTime = additionalInfo.setupReturnDepartureTime || additionalInfo.estimatedEndTime
    if (!departureTime) {
      if (additionalInfo.setupReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, setupReturnArrivalTime: "" }))
      return
    }
    // Calculate travel time from hours and minutes
    const travelMins = additionalInfo.setupReturnTravelHours * 60 + additionalInfo.setupReturnTravelMinutes
    if (!travelMins) {
      if (additionalInfo.setupReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, setupReturnArrivalTime: "" }))
      return
    }
    const [h, m] = departureTime.split(":").map(Number)
    const arrivalMins = h * 60 + m + travelMins
    const arrH = Math.floor(arrivalMins / 60) % 24
    const arrM = arrivalMins % 60
    const nextArrival = `${arrH.toString().padStart(2, "0")}:${arrM.toString().padStart(2, "0")}`
    if (additionalInfo.setupReturnArrivalTime === nextArrival) return
    setAdditionalInfo(prev => ({ ...prev, setupReturnArrivalTime: nextArrival }))
  }, [
    additionalInfo.setupReturnChoice,
    additionalInfo.setupReturnDepartureTime,
    additionalInfo.estimatedEndTime,
    additionalInfo.setupReturnTravelHours,
    additionalInfo.setupReturnTravelMinutes,
    additionalInfo.setupReturnArrivalTime,
  ])

  // Calculate dismantle return arrival time based on departure time + travel time
  useEffect(() => {
    if (additionalInfo.dismantleReturnChoice !== "return-to-hub") {
      if (additionalInfo.dismantleReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, dismantleReturnArrivalTime: "" }))
      return
    }
    // Use custom departure time or fall back to estimated end time
    const departureTime = additionalInfo.dismantleReturnDepartureTime || additionalInfo.dismantleEstimatedEndTime
    if (!departureTime) {
      if (additionalInfo.dismantleReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, dismantleReturnArrivalTime: "" }))
      return
    }
    // Calculate travel time from hours and minutes
    const travelMins = additionalInfo.dismantleReturnTravelHours * 60 + additionalInfo.dismantleReturnTravelMinutes
    if (!travelMins) {
      if (additionalInfo.dismantleReturnArrivalTime) setAdditionalInfo(prev => ({ ...prev, dismantleReturnArrivalTime: "" }))
      return
    }
    const [h, m] = departureTime.split(":").map(Number)
    const arrivalMins = h * 60 + m + travelMins
    const arrH = Math.floor(arrivalMins / 60) % 24
    const arrM = arrivalMins % 60
    const nextArrival = `${arrH.toString().padStart(2, "0")}:${arrM.toString().padStart(2, "0")}`
    if (additionalInfo.dismantleReturnArrivalTime === nextArrival) return
    setAdditionalInfo(prev => ({ ...prev, dismantleReturnArrivalTime: nextArrival }))
  }, [
    additionalInfo.dismantleReturnChoice,
    additionalInfo.dismantleReturnDepartureTime,
    additionalInfo.dismantleEstimatedEndTime,
    additionalInfo.dismantleReturnTravelHours,
    additionalInfo.dismantleReturnTravelMinutes,
    additionalInfo.dismantleReturnArrivalTime,
  ])

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    return date.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this order?")) {
    deleteOrderByNumber(orderNumber)
    router.push("/portal/scheduling")
  }
  }

  const handleEdit = () => {
    if (order?.orderSource === "ad-hoc") {
      router.push(`/portal/ad-hoc?edit=${orderNumber}`)
      return
    }
    router.push(`/portal/sales-order?edit=${orderNumber}`)
  }

  const handleFlagIssue = () => {
    if (!order) return
    if (!flagData.personnel || !flagData.issue) {
      showAlert("Please fill in all required fields")
      return
    }

    const issueData: IssueData = {
      flaggedPersonnel: flagData.personnel,
      flaggedIssue: flagData.issue,
      flaggedDate: flagData.date,
      flaggedTime: flagData.time,
      flaggedAtStage: "scheduling",
      isResolved: false,
    }
    const updated = updateOrderByNumber(orderNumber, (current) => ({
      ...current,
      hasIssue: true,
      issueData,
      updatedAt: new Date().toISOString(),
    }))
    const refreshed = updated.find((o) => o.orderNumber === orderNumber)
    if (refreshed) setOrder(refreshed)
    setShowFlagModal(false)
  }

  const openFlagModal = () => {
    if (!order) return
    setFlagData({
      personnel: "",
      issue: "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })
    setShowFlagModal(true)
  }

  const createEmptyAdditionalInfo = (o: SalesOrder | null): AdditionalInfo => ({
    setupDepartureFromType: "hub",
    setupDepartureAddress: "",
    setupDestinationAddress: getOrderCustomerAddress(o),
    setupDistanceKm: 0,
    departureFromHub: "",
    travelDurationHours: 0,
    travelDurationMinutes: 0,
    setupDurationHours: 0,
    setupDurationMinutes: 0,
    scheduleStartTime: "",
    setupLorry: "",
    tentSetupTimeCalculated: 0,
    dismantleWorkTimeCalculated: 0,
    bufferTime: DEFAULT_BUFFER_TIME,
    bufferReason: "",
    totalTaskTimeHours: 0,
    totalTaskTimeMinutes: 0,
    estimatedEndTime: "",
    setupNextAction: "warehouse",
    setupReturnChoice: "return-to-hub",
    setupReturnFromType: "site",
    setupReturnFromAddress: "",
    setupReturnDepartureTime: "",
    setupReturnTravelHours: 0,
    setupReturnTravelMinutes: 0,
    setupReturnDistanceKm: 0,
    setupReturnToType: "hub",
    setupReturnToAddress: "",
    setupReturnTravelMins: 0,
    setupReturnArrivalTime: "",
    setupNextTaskOrderNumber: "",
    confirmedSetupDate: "",
    confirmedSetupTime: "",
    confirmedDismantleDate: "",
    confirmedDismantleTime: "",
    dismantleDepartureFromType: "hub",
    dismantleDepartureAddress: "",
    dismantleDestinationAddress: getOrderCustomerAddress(o),
    dismantleDistanceKm: 0,
    dismantleDepartureTime: "",
    dismantleTravelHours: 0,
    dismantleTravelMinutes: 0,
    dismantleDurationHours: 0,
    dismantleDurationMinutes: 0,
    dismantleScheduleStartTime: "",
    dismantleLorry: "",
    dismantleBufferTime: DEFAULT_BUFFER_TIME,
    dismantleBufferReason: "",
    dismantleTotalTimeHours: 0,
    dismantleTotalTimeMinutes: 0,
    dismantleEstimatedEndTime: "",
    dismantleNextAction: "warehouse",
    dismantleReturnChoice: "return-to-hub",
    dismantleReturnFromType: "site",
    dismantleReturnFromAddress: "",
    dismantleReturnDepartureTime: "",
    dismantleReturnTravelHours: 0,
    dismantleReturnTravelMinutes: 0,
    dismantleReturnDistanceKm: 0,
    dismantleReturnToType: "hub",
    dismantleReturnToAddress: "",
    dismantleReturnTravelMins: 0,
    dismantleReturnArrivalTime: "",
    dismantleNextTaskOrderNumber: "",
    confirmedOtherAdhocDate: "",
    confirmedOtherAdhocTime: "",
    otherAdhocDurationHours: 0,
    otherAdhocDurationMinutes: 0,
    otherAdhocScheduleStartTime: "",
    otherAdhocLorry: "",
    otherAdhocBufferTime: DEFAULT_BUFFER_TIME,
    otherAdhocBufferReason: "",
    otherAdhocTotalTimeHours: 0,
    otherAdhocTotalTimeMinutes: 0,
    otherAdhocEstimatedEndTime: "",
    schedulingPersonnel: "",
    schedulingDate: new Date().toISOString().split("T")[0],
    schedulingTime: new Date().toTimeString().slice(0, 5),
  })

  const handleClearAllScheduling = () => {
    if (!order) return
    if (!confirm("Clear ALL scheduling fields for this order? This cannot be undone.")) return

    const cleared = createEmptyAdditionalInfo(order)
    const updated = updateOrderByNumber(order.orderNumber, (current) => ({
      ...current,
      additionalInfo: cleared,
      updatedAt: new Date().toISOString(),
    }))

    const refreshed = updated.find((o) => o.orderNumber === order.orderNumber)
    if (refreshed) setOrder(refreshed)

    setAdditionalInfo(cleared)
    setShowScheduleDocument(false)
    setSetupLocked(false)
    setDismantleLocked(false)
    setOtherAdhocLocked(false)
    setIsSchedulingReadOnly(false)
    setAIScheduleApplied(false)
    setAIScheduleStep("ask")
    setAIScheduleResult(null)
    setAiCoJoinApproved(false)
    setShowAIReport(false)
    showAlert("Scheduling cleared. You can run AI Schedule again.", { title: "Cleared", actionText: "OK" })
  }

  const handleSaveAdditionalInfo = () => {
    if (!order) return

    if (!additionalInfo.schedulingPersonnel.trim()) {
      showAlert("Please enter scheduling personnel name")
      return
    }
    if (!additionalInfo.schedulingDate) {
      showAlert("Please enter scheduling date")
      return
    }
    if (!additionalInfo.schedulingTime) {
      showAlert("Please enter scheduling time")
      return
    }

    const setupBeforeSOError = getSetupBeforeSalesOrderError(order, additionalInfo)
    if (setupBeforeSOError) {
      showAlert(setupBeforeSOError, { title: "Invalid Setup Time" })
      return
    }

    const errors = getLorryClashErrors()
    if (errors.length) {
      showAlert(`Cannot save due to lorry clash:\n\n${errors.join("\n")}`, { title: "Lorry Clash" })
      return
    }
    
    const updated = updateOrderByNumber(orderNumber, (current) => ({
      ...current,
      additionalInfo,
      updatedAt: new Date().toISOString(),
    }))
    const refreshed = updated.find((o) => o.orderNumber === orderNumber)
    if (refreshed) setOrder(refreshed)
    setShowScheduleDocument(true)

    const hasAnySchedule =
      !!additionalInfo.scheduleStartTime ||
      !!additionalInfo.dismantleScheduleStartTime ||
      !!additionalInfo.otherAdhocScheduleStartTime ||
      refreshed?.status === "packing"

    if (hasAnySchedule) {
      setIsSchedulingReadOnly(true)
      setSetupLocked(true)
      setDismantleLocked(true)
      setOtherAdhocLocked(true)
    }

    showAlert("Schedule information saved!", { title: "Saved" })
  }

  const handleProceedToPacking = () => {
    if (!order) return

    if (!additionalInfo.schedulingPersonnel.trim()) {
      showAlert("Please enter scheduling personnel name")
      return
    }
    if (!additionalInfo.schedulingDate) {
      showAlert("Please enter scheduling date")
      return
    }
    if (!additionalInfo.schedulingTime) {
      showAlert("Please enter scheduling time")
      return
    }

    const setupBeforeSOError = getSetupBeforeSalesOrderError(order, additionalInfo)
    if (setupBeforeSOError) {
      showAlert(setupBeforeSOError, { title: "Invalid Setup Time" })
      return
    }

    const errors = getLorryClashErrors()
    if (errors.length) {
      showAlert(`Cannot proceed due to lorry clash:\n\n${errors.join("\n")}`, { title: "Lorry Clash" })
      return
    }

    const nextStatus = getNextStatus(order, "scheduling")
    updateOrderByNumber(orderNumber, (current) => {
      const base = {
        ...current,
        additionalInfo,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      }
      if (nextStatus === "packing") {
        return {
          ...base,
          packingData: {
            items: generatePackingItems(order),
            packingPersonnel: "",
            packingDate: "",
            packingTime: "",
            status: "pending",
          },
        }
      }
      if (nextStatus === "setting-up") {
        return {
          ...base,
          setupData: {
            setupPersonnel: "",
            setupDate: "",
            setupStartTime: "",
            setupCompletionTime: "",
            photos: [],
            status: "pending",
          },
        }
      }
      if (nextStatus === "dismantling") {
        return {
          ...base,
          dismantleData: {
            dismantlePersonnel: "",
            dismantleDate: "",
            dismantleStartTime: "",
            dismantleCompletionTime: "",
            photos: [],
            status: "pending",
          },
        }
      }
      if (nextStatus === "other-adhoc") {
        return {
          ...base,
          otherAdhocData: {
            personnel: "",
            date: "",
            time: "",
            status: "pending",
          },
        }
      }
      return base
    })

    if (nextStatus === "packing") {
      router.push(`/portal/packing`)
    } else if (nextStatus === "setting-up") {
      router.push(`/portal/setting-up`)
    } else if (nextStatus === "dismantling") {
      router.push(`/portal/dismantle`)
    } else if (nextStatus === "other-adhoc") {
      router.push(`/portal/other-adhoc`)
    } else {
      router.push(`/portal/completed`)
    }
  }

  const generatePackingItems = (order: SalesOrder) => {
    if (order.orderSource === "ad-hoc" && order.items?.length) {
      return order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        packed: false,
      }))
    }
    const items = []
    if (order.pricingData.tent10x10.quantity > 0) {
      items.push({ name: `Arabian Canopy 10x10 (${order.pricingData.tent10x10.color})`, quantity: order.pricingData.tent10x10.quantity, packed: false })
    }
    if (order.pricingData.tent20x20.quantity > 0) {
      items.push({ name: `Arabian Canopy 20x20 (${order.pricingData.tent20x20.color})`, quantity: order.pricingData.tent20x20.quantity, packed: false })
    }
    if (order.pricingData.tent20x30.quantity > 0) {
      items.push({ name: `Arabian Canopy 20x30 (${order.pricingData.tent20x30.color})`, quantity: order.pricingData.tent20x30.quantity, packed: false })
    }
    if (order.pricingData.tableSet > 0) {
      items.push({ name: "Table Set (1 table + 10 chairs)", quantity: order.pricingData.tableSet, packed: false })
    }
    if (order.pricingData.longTable.quantity > 0) {
      items.push({ name: order.pricingData.longTable.withSkirting ? "Long Table with Skirting" : "Long Table", quantity: order.pricingData.longTable.quantity, packed: false })
    }
    if (order.pricingData.extraChairs > 0) {
      items.push({ name: "Extra Chairs", quantity: order.pricingData.extraChairs, packed: false })
    }
    if (order.pricingData.coolerFan > 0) {
      items.push({ name: "Cooler Fan", quantity: order.pricingData.coolerFan, packed: false })
    }
    return items
  }

  const tentBreakdown = useMemo(() => {
    if (!order) return []
    return getTentSetupBreakdown(order.pricingData, getAppSettings())
  }, [order])
  const totalTaskMinutes = useMemo(() => {
    const setupMins = additionalInfo.setupDurationHours * 60 + additionalInfo.setupDurationMinutes
    const bufferMins = parseInt(additionalInfo.bufferTime) || 0
    return setupMins + bufferMins
  }, [
    additionalInfo.setupDurationHours,
    additionalInfo.setupDurationMinutes,
    additionalInfo.bufferTime,
  ])
  const dismantleTaskMinutes = useMemo(() => {
    const dismantleMins = additionalInfo.dismantleDurationHours * 60 + additionalInfo.dismantleDurationMinutes
    const bufferMins = parseInt(additionalInfo.dismantleBufferTime) || 0
    return dismantleMins + bufferMins
  }, [
    additionalInfo.dismantleDurationHours,
    additionalInfo.dismantleDurationMinutes,
    additionalInfo.dismantleBufferTime,
  ])

  const otherAdhocTaskMinutes = useMemo(() => {
    const taskMins = additionalInfo.otherAdhocDurationHours * 60 + additionalInfo.otherAdhocDurationMinutes
    const bufferMins = parseInt(additionalInfo.otherAdhocBufferTime) || 0
    return taskMins + bufferMins
  }, [
    additionalInfo.otherAdhocDurationHours,
    additionalInfo.otherAdhocDurationMinutes,
    additionalInfo.otherAdhocBufferTime,
  ])

  const calendarDate =
    additionalInfo.confirmedSetupDate ||
    additionalInfo.confirmedDismantleDate ||
    additionalInfo.confirmedOtherAdhocDate ||
    new Date().toISOString().split("T")[0]
  const dismantleCalendarDate = additionalInfo.confirmedDismantleDate || new Date().toISOString().split("T")[0]
  const otherAdhocCalendarDate = additionalInfo.confirmedOtherAdhocDate || new Date().toISOString().split("T")[0]

  useEffect(() => {
    if (!jumpToDate) setJumpToDate(calendarDate)
  }, [calendarDate, jumpToDate])

  const isAdHoc = order ? isAdHocOrder(order) : false
  const setupRequired = order ? isPhaseRequired(order, "setup") : true
  const dismantleRequired = order ? isPhaseRequired(order, "dismantle") : true
  const packingRequired = order ? isPhaseRequired(order, "packing") : true
  const otherAdhocRequired = order ? isPhaseRequired(order, "other-adhoc") : false
  const nextStatus = order ? getNextStatus(order, "scheduling") : "packing"
  const nextActionLabel =
    nextStatus === "packing"
      ? "Proceed to Packing"
      : nextStatus === "setting-up"
        ? "Proceed to Setup"
        : nextStatus === "dismantling"
          ? "Proceed to Dismantle"
          : nextStatus === "other-adhoc"
            ? "Proceed to Other Adhoc"
          : "Mark Completed"

  const getScheduleDurationMins = (info: AdditionalInfo | undefined, type: "setup" | "dismantle" | "other-adhoc") => {
    if (!info) return 0
    if (type === "setup") {
      const setupMins = info.setupDurationHours * 60 + info.setupDurationMinutes
      const bufferMins = parseInt(info.bufferTime) || 0
      return setupMins + bufferMins
    }
    if (type === "dismantle") {
      const dismantleMins = info.dismantleDurationHours * 60 + info.dismantleDurationMinutes
      const bufferMins = parseInt(info.dismantleBufferTime) || 0
      return dismantleMins + bufferMins
    }
    const otherMins = info.otherAdhocDurationHours * 60 + info.otherAdhocDurationMinutes
    const bufferMins = parseInt(info.otherAdhocBufferTime) || 0
    return otherMins + bufferMins
  }

  const getEngagedInterval = (info: AdditionalInfo, type: "setup" | "dismantle" | "other-adhoc") => {
    const date =
      type === "setup" ? info.confirmedSetupDate : type === "dismantle" ? info.confirmedDismantleDate : info.confirmedOtherAdhocDate
    if (!date) return null

    if (type === "setup") {
      // Calendar "start time" should follow the confirmed task start time (scheduleStartTime),
      // not the hub departure time. Otherwise manual edits snap back to the AI-calculated departure.
      const startTime = info.scheduleStartTime || info.departureFromHub
      const endTime =
        info.setupReturnChoice === "return-to-hub" && info.setupReturnArrivalTime
          ? info.setupReturnArrivalTime
          : info.estimatedEndTime || addMinutesToTime(info.scheduleStartTime, getScheduleDurationMins(info, "setup"))
      const start = toDateTime(date, startTime)
      const endBase = toDateTime(date, endTime)
      if (!start || !endBase) return null
      return { start, end: ensureEndAfterStart(start, endBase) }
    }

    if (type === "dismantle") {
      const startTime = info.dismantleDepartureTime || info.dismantleScheduleStartTime
      const endTime =
        info.dismantleReturnChoice === "return-to-hub" && info.dismantleReturnArrivalTime
          ? info.dismantleReturnArrivalTime
          : info.dismantleEstimatedEndTime || addMinutesToTime(info.dismantleScheduleStartTime, getScheduleDurationMins(info, "dismantle"))
      const start = toDateTime(date, startTime)
      const endBase = toDateTime(date, endTime)
      if (!start || !endBase) return null
      return { start, end: ensureEndAfterStart(start, endBase) }
    }

    const startTime = info.otherAdhocScheduleStartTime
    const endTime = info.otherAdhocEstimatedEndTime || addMinutesToTime(info.otherAdhocScheduleStartTime, getScheduleDurationMins(info, "other-adhoc"))
    const start = toDateTime(date, startTime)
    const endBase = toDateTime(date, endTime)
    if (!start || !endBase) return null
    return { start, end: ensureEndAfterStart(start, endBase) }
  }

  const buildEventFromOrder = (orderItem: SalesOrder, type: "setup" | "dismantle" | "other-adhoc") => {
    const info = orderItem.additionalInfo
    if (!info) return null
    if (orderItem.orderSource === "ad-hoc") {
      if (type === "setup" && !isPhaseRequired(orderItem, "setup")) return null
      if (type === "dismantle" && !isPhaseRequired(orderItem, "dismantle")) return null
      if (type === "other-adhoc" && !isPhaseRequired(orderItem, "other-adhoc")) return null
    }
    const interval = getEngagedInterval(info, type)
    if (!interval) return null
    const { start, end } = interval
    return {
      id: `${type}-${orderItem.orderNumber}`,
      title: `${orderItem.orderNumber}`,
      start,
      end,
      editable: orderItem.orderNumber === orderNumber,
      extendedProps: {
        orderNumber: orderItem.orderNumber,
        eventName: orderItem.eventData.eventName || "-",
        phase: type === "setup" ? "Setup" : type === "dismantle" ? "Dismantle" : "Other Adhoc",
        lorry: normalizeTeamLabel(
          type === "setup" ? info.setupLorry : type === "dismantle" ? info.dismantleLorry : info.otherAdhocLorry
        ),
        lorryCode: getLorryCode(
          type === "setup" ? info.setupLorry : type === "dismantle" ? info.dismantleLorry : info.otherAdhocLorry
        ),
        lorryClass: getLorryClass(
          type === "setup" ? info.setupLorry : type === "dismantle" ? info.dismantleLorry : info.otherAdhocLorry
        ),
      },
      classNames: [
        type === "setup" ? "fc-setup-event" : type === "dismantle" ? "fc-dismantle-event" : "fc-other-adhoc-event",
        getLorryClass(type === "setup" ? info.setupLorry : type === "dismantle" ? info.dismantleLorry : info.otherAdhocLorry),
      ].filter(Boolean),
    }
  }

  const getStoredOrders = () => getAllOrders()

  const findConflict = (
    candidateStart: Date,
    candidateEnd: Date,
    candidateLorry: string,
    candidateType: "setup" | "dismantle" | "other-adhoc"
  ) => {
    if (!candidateLorry) return null
    const orders = getStoredOrders()
    if (!orders.length) return null

    const types: Array<"setup" | "dismantle" | "other-adhoc"> = ["setup", "dismantle", "other-adhoc"]
    for (const orderItem of orders) {
      for (const type of types) {
        if (orderItem.orderNumber === orderNumber && type === candidateType) continue
        const event = buildEventFromOrder(orderItem, type)
        if (!event) continue
        const eventLorry = (event as any)?.extendedProps?.lorry as string | undefined
        if (!eventLorry || eventLorry !== candidateLorry) continue
        const start = event.start as Date
        const end = event.end as Date
        if (candidateStart < end && candidateEnd > start) {
          return `${orderItem.orderNumber} (${(event as any)?.extendedProps?.phase || type})`
        }
      }
    }
    return null
  }

  const getLorryClashErrors = () => {
    const errors: string[] = []

    const pushConflict = (
      type: "setup" | "dismantle" | "other-adhoc",
      lorry: string
    ) => {
      if (!lorry) return
      const interval = getEngagedInterval(additionalInfo, type)
      if (!interval) return
      const conflict = findConflict(interval.start, interval.end, lorry, type)
      if (conflict) {
        errors.push(`${type.toUpperCase()}: ${lorry} clashes with ${conflict}`)
      }
    }

    if (setupRequired) {
      pushConflict("setup", additionalInfo.setupLorry || "")
    }
    if (dismantleRequired) {
      pushConflict("dismantle", additionalInfo.dismantleLorry || "")
    }
    if (otherAdhocRequired) {
      pushConflict("other-adhoc", additionalInfo.otherAdhocLorry || "")
    }

    return errors
  }

  const scheduleEvents = useMemo(() => {
    const orders = getStoredOrders()
    const otherOrders = orders.filter(orderItem => orderItem.orderNumber !== orderNumber)
    const events = otherOrders
      .map(orderItem => buildEventFromOrder(orderItem, "setup"))
      .filter(
        (event): event is NonNullable<ReturnType<typeof buildEventFromOrder>> => event !== null
      )
    if (order) {
      const currentOrderEvent = buildEventFromOrder({ ...order, additionalInfo }, "setup")
      if (currentOrderEvent) events.push(currentOrderEvent)
    }
    return events
  }, [
    additionalInfo.scheduleStartTime,
    totalTaskMinutes,
    calendarDate,
    orderNumber,
    order,
    additionalInfo,
  ])

  const dismantleScheduleEvents = useMemo(() => {
    const orders = getStoredOrders()
    const otherOrders = orders.filter(orderItem => orderItem.orderNumber !== orderNumber)
    const events = otherOrders
      .map(orderItem => buildEventFromOrder(orderItem, "dismantle"))
      .filter(
        (event): event is NonNullable<ReturnType<typeof buildEventFromOrder>> => event !== null
      )
    if (order) {
      const currentOrderEvent = buildEventFromOrder({ ...order, additionalInfo }, "dismantle")
      if (currentOrderEvent) events.push(currentOrderEvent)
    }
    return events
  }, [
    additionalInfo.dismantleScheduleStartTime,
    dismantleTaskMinutes,
    dismantleCalendarDate,
    orderNumber,
    order,
    additionalInfo,
  ])

  const otherAdhocScheduleEvents = useMemo(() => {
    const orders = getStoredOrders()
    const otherOrders = orders.filter(orderItem => orderItem.orderNumber !== orderNumber)
    const events = otherOrders
      .map(orderItem => buildEventFromOrder(orderItem, "other-adhoc"))
      .filter(
        (event): event is NonNullable<ReturnType<typeof buildEventFromOrder>> => event !== null
      )
    if (order) {
      const currentOrderEvent = buildEventFromOrder({ ...order, additionalInfo }, "other-adhoc")
      if (currentOrderEvent) events.push(currentOrderEvent)
    }
    return events
  }, [
    additionalInfo.otherAdhocScheduleStartTime,
    otherAdhocTaskMinutes,
    otherAdhocCalendarDate,
    orderNumber,
    order,
    additionalInfo,
  ])

  useEffect(() => {
    if (!additionalInfo.scheduleStartTime && totalTaskMinutes > 0 && additionalInfo.confirmedSetupDate) {
      setAdditionalInfo(prev => ({ ...prev, scheduleStartTime: "08:00" }))
    }
  }, [additionalInfo.scheduleStartTime, totalTaskMinutes, additionalInfo.confirmedSetupDate])

  useEffect(() => {
    if (!additionalInfo.dismantleScheduleStartTime && dismantleTaskMinutes > 0 && additionalInfo.confirmedDismantleDate) {
      setAdditionalInfo(prev => ({ ...prev, dismantleScheduleStartTime: "08:00" }))
    }
  }, [additionalInfo.dismantleScheduleStartTime, dismantleTaskMinutes, additionalInfo.confirmedDismantleDate])

  useEffect(() => {
    if (!additionalInfo.otherAdhocScheduleStartTime && otherAdhocTaskMinutes > 0 && additionalInfo.confirmedOtherAdhocDate) {
      setAdditionalInfo(prev => ({ ...prev, otherAdhocScheduleStartTime: "08:00" }))
    }
  }, [additionalInfo.otherAdhocScheduleStartTime, otherAdhocTaskMinutes, additionalInfo.confirmedOtherAdhocDate])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">Order Not Found</h3>
        <p className="mb-6 text-sm text-muted-foreground">
          The order you are looking for does not exist.
        </p>
        <Link href="/portal/scheduling">
          <Button variant="outline" className="gap-2 bg-transparent">
            <ArrowLeft className="h-4 w-4" />
            Back to Scheduling
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <OrderProgress
        currentStatus={order.status}
        orderNumber={order.orderNumber}
        hasIssue={order.hasIssue}
        orderSource={order.orderSource}
        adHocOptions={order.adHocOptions}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/portal/scheduling">
            <Button variant="outline" size="icon" className="bg-transparent">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{order.orderNumber}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isAdHoc ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {isAdHoc ? "Ad Hoc" : "Sales"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Customer: {order.customerData.customerName} | Event: {formatDate(order.eventData.eventDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* AI Schedule Button - changes appearance when applied */}
          {aiScheduleApplied ? (
            <>
              <div className="flex items-center gap-1 px-3 py-2 rounded-md bg-green-100 border border-green-300 text-green-700 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                AI Scheduled
                <Check className="h-4 w-4 ml-1" />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowAIReport(true)}
                className="gap-2 bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                <FileText className="h-4 w-4" />
                View AI Report
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setShowAIScheduleModal(true)
                setAIScheduleStep("ask")
                setAITeamPreference({ hasPreference: false, setupTeam: "", dismantleTeam: "" })
                setAIDistanceKm(15)
                setAIDistanceMapUrl("")
                setAIScheduleResult(null)
              }}
              disabled={isSchedulingReadOnly}
              className="gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 hover:from-purple-600 hover:to-indigo-600"
            >
              <Sparkles className="h-4 w-4" />
              AI Schedule
            </Button>
          )}
          <Button
            variant="outline"
            onClick={openFlagModal}
            disabled={order.hasIssue}
            className={`gap-2 ${order.hasIssue ? "bg-red-500 text-white hover:bg-red-600 cursor-not-allowed" : "bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"}`}
          >
            <AlertCircle className="h-4 w-4" />
            {order.hasIssue ? "Issue Flagged" : "Flag Issue"}
          </Button>
          {!isAdHoc && (
            <Button
              variant="outline"
              onClick={() => router.push(`/portal/sales-order?preview=${orderNumber}`)}
              className="gap-2 bg-transparent"
            >
              <FileText className="h-4 w-4" />
              See Sales Order
            </Button>
          )}
          {isSchedulingReadOnly && (
            <Button
              variant="outline"
              onClick={() => setShowEditSchedulingConfirm(true)}
              className="gap-2 bg-transparent"
            >
              <Edit className="h-4 w-4" />
              Edit Scheduling
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowEditOrderConfirm(true)} className="gap-2 bg-transparent">
            <Edit className="h-4 w-4" />
            {isAdHoc ? "Edit Ad Hoc Order" : "Edit SO Order"}
          </Button>
          <Button
            variant="outline"
            className="gap-2 text-destructive hover:bg-destructive/10 bg-transparent"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Additional Information Panel - Always visible */}
      <div className="rounded-lg border border-border bg-card">
        <button
          onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
          className="flex w-full items-center justify-between border-b border-border bg-accent/10 px-6 py-4"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Info className="h-5 w-5" />
            Scheduling Information
          </h2>
          {showAdditionalInfo ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        
        {showAdditionalInfo && (
          <div className="p-6 space-y-6">
            {/* Customer Preferred vs Confirmed Times */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">Time Confirmation</h4>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Setup Times */}
                <div className="space-y-3">
                  <h5 className="font-medium text-blue-800">Setup</h5>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-700">Customer Preferred:</span>
                      <span className="font-medium text-blue-900 flex items-center gap-2">
                        <span>{formatDate(order.eventData.customerPreferredSetupDate)} - {order.customerData.setupTimeSlot || order.eventData.desiredSetupTime || "Not specified"}</span>
                        {order.customerData.setupTimeSlot && order.customerData.setupTimeSlot !== "NONE" && (
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            order.customerData.setupTimeWindowMode === "strict"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}>
                            {order.customerData.setupTimeWindowMode === "strict" ? "🔒 Rigid" : "🔄 Flexible"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-700 shrink-0">Confirmed Date:</span>
                      <Input
                        type="text"
                        value={confirmedSetupDateInput}
                        onChange={(e) => {
                          const value = e.target.value
                          setConfirmedSetupDateInput(value)
                          if (!value) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedSetupDate: "" }))
                            return
                          }
                          const parsed = parseDMYToISO(value)
                          if (parsed) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedSetupDate: parsed }))
                          }
                        }}
                        placeholder="dd/mm/yyyy"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-700 shrink-0">Confirmed Time:</span>
                      <Input
                        type="time"
                        value={additionalInfo.confirmedSetupTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, confirmedSetupTime: e.target.value }))}
                        className="h-8 w-32 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Dismantle Times */}
                <div className="space-y-3">
                  <h5 className="font-medium text-blue-800">Dismantle</h5>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-700">Customer Preferred:</span>
                      <span className="font-medium text-blue-900 flex items-center gap-2">
                        <span>{formatDate(order.eventData.customerPreferredDismantleDate)} - {order.customerData.dismantleTimeSlot || order.eventData.desiredDismantleTime || "Not specified"}</span>
                        {order.customerData.dismantleTimeSlot && order.customerData.dismantleTimeSlot !== "NONE" && (
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            order.customerData.dismantleTimeWindowMode === "strict"
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}>
                            {order.customerData.dismantleTimeWindowMode === "strict" ? "🔒 Rigid" : "🔄 Flexible"}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-700 shrink-0">Confirmed Date:</span>
                      <Input
                        type="text"
                        value={confirmedDismantleDateInput}
                        onChange={(e) => {
                          const value = e.target.value
                          setConfirmedDismantleDateInput(value)
                          if (!value) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedDismantleDate: "" }))
                            return
                          }
                          const parsed = parseDMYToISO(value)
                          if (parsed) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedDismantleDate: parsed }))
                          }
                        }}
                        placeholder="dd/mm/yyyy"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-700 shrink-0">Confirmed Time:</span>
                      <Input
                        type="time"
                        value={additionalInfo.confirmedDismantleTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, confirmedDismantleTime: e.target.value }))}
                        className="h-8 w-32 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inconsistency Warning */}
              {((additionalInfo.confirmedSetupDate && additionalInfo.confirmedSetupDate !== order.eventData.customerPreferredSetupDate) ||
                (additionalInfo.confirmedDismantleDate && additionalInfo.confirmedDismantleDate !== order.eventData.customerPreferredDismantleDate)) && (
                <div className="mt-4 rounded-lg bg-amber-100 border border-amber-300 p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold">Time Inconsistency Detected</p>
                    <p>The confirmed dates differ from customer preferences. Please call the customer to verify and confirm these changes.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-6 border-t pt-6 lg:grid-cols-2">
              {!setupRequired && !dismantleRequired && !otherAdhocRequired && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground lg:col-span-2">
                  Setup, Dismantle, and Other Adhoc scheduling are not required for this order. You can proceed to the next department.
                </div>
              )}

              {/* SETUP PATH */}
              {setupRequired && (
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Left Panel</p>
                  <h3 className="text-md font-semibold text-foreground border-b pb-2">Setup Path</h3>
                </div>

                {/* Setup Traffic Departure */}
                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-background p-3">
                  <p className="text-sm font-semibold text-foreground mb-3">Traffic Departure (Setup)</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Departure from?</div>
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <Select
                          value={additionalInfo.setupDepartureFromType}
                          onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, setupDepartureFromType: value as AdditionalInfo["setupDepartureFromType"] }))}
                          disabled={setupLocked || !setupRequired}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hub">Hub</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Other address (if not hub)"
                          value={additionalInfo.setupDepartureAddress}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupDepartureAddress: e.target.value }))}
                          className="min-w-[220px] flex-1"
                          disabled={setupLocked || !setupRequired}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Departure time:</div>
                      <Input
                        type="time"
                        value={additionalInfo.departureFromHub}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, departureFromHub: e.target.value }))}
                        className="w-32"
                        disabled={setupLocked || !setupRequired}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Travelling Time:</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="23"
                          value={additionalInfo.travelDurationHours}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, travelDurationHours: parseInt(e.target.value) || 0 }))}
                          className="w-20"
                          disabled={setupLocked || !setupRequired}
                        />
                        <span className="text-sm text-muted-foreground">hrs</span>
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          value={additionalInfo.travelDurationMinutes}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, travelDurationMinutes: parseInt(e.target.value) || 0 }))}
                          className="w-20"
                          disabled={setupLocked || !setupRequired}
                        />
                        <span className="text-sm text-muted-foreground">mins</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Distance:</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={additionalInfo.setupDistanceKm || ""}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupDistanceKm: parseFloat(e.target.value) || 0 }))}
                          className="w-24"
                          placeholder="0.0"
                          disabled={setupLocked || !setupRequired}
                        />
                        <span className="text-sm text-muted-foreground">km</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">To destination:</div>
                      <div className="flex-1 flex gap-2">
                        <Input
                          placeholder="Enter destination address"
                          value={additionalInfo.setupDestinationAddress}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupDestinationAddress: e.target.value }))}
                          className="flex-1"
                          disabled={setupLocked || !setupRequired}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={setupDistanceLoading || !additionalInfo.setupDestinationAddress || setupLocked}
                          onClick={async () => {
                            setSetupDistanceLoading(true)
                            setSetupDistanceResult(null)
                            try {
                              const fromAddr = additionalInfo.setupDepartureFromType === "hub"
                                ? getAISettings().hubAddress
                                : additionalInfo.setupDepartureAddress
                              const response = await fetch("/api/calculate-distance", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  fromAddress: fromAddr,
                                  toAddress: additionalInfo.setupDestinationAddress,
                                }),
                              })
                              const data = await response.json()
                              if (data.success) {
                                setSetupDistanceResult({
                                  distanceKm: data.distance.km,
                                  mapUrl: data.mapUrl,
                                  fromAddress: data.from.address,
                                  toAddress: data.to.address,
                                })
                                // Auto-fill distance and travel time based on distance and mins/km setting
                                const aiSettings = getAISettings()
                                const travelMins = Math.round(data.distance.km * aiSettings.minutesPerKm)
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  setupDistanceKm: data.distance.km,
                                  travelDurationHours: Math.floor(travelMins / 60),
                                  travelDurationMinutes: travelMins % 60,
                                }))
                              } else {
                                showAlert(data.error || "Could not calculate distance", { title: "Distance Error", actionText: "OK" })
                              }
                            } catch (error) {
                              showAlert("Failed to calculate distance", { title: "Error", actionText: "OK" })
                            } finally {
                              setSetupDistanceLoading(false)
                            }
                          }}
                          className="gap-1"
                        >
                          <MapPin className="h-4 w-4" />
                          {setupDistanceLoading ? "..." : "Estimate"}
                        </Button>
                      </div>
                    </div>

                    {/* Distance Estimation Result with Map */}
                    {setupDistanceResult && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-green-700">Distance Estimated</div>
                          <div className="text-lg font-bold text-green-700">{setupDistanceResult.distanceKm} km</div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          <div>From: {setupDistanceResult.fromAddress}</div>
                          <div>To: {setupDistanceResult.toAddress}</div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-green-200">
                          <iframe
                            src={getGoogleMapsEmbedDirectionsUrl(setupDistanceResult.fromAddress, setupDistanceResult.toAddress)}
                            className="w-full h-40"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                        <div className="mt-2 text-xs text-green-600 flex justify-between items-center">
                          <span>Travel time auto-filled: {additionalInfo.travelDurationHours}h {additionalInfo.travelDurationMinutes}m (at {getAISettings().minutesPerKm} mins/km)</span>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-muted-foreground"
                            onClick={() => {
                              setEnlargedMapUrl(getGoogleMapsEmbedDirectionsUrl(setupDistanceResult.fromAddress, setupDistanceResult.toAddress))
                              setEnlargedMapInfo({
                                from: setupDistanceResult.fromAddress,
                                to: setupDistanceResult.toAddress,
                                distance: setupDistanceResult.distanceKm,
                              })
                            }}
                          >
                            Open larger
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Departure Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {additionalInfo.departureFromHub ? displayHHmm(additionalInfo.departureFromHub) : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Travelling Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {additionalInfo.travelDurationHours}h {additionalInfo.travelDurationMinutes}m
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Arrival Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {arrivalTime ? displayHHmm(arrivalTime) : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Setup Work Time (Auto Calculated) */}
                <div className="flex items-start gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Setup Work Time:</div>
                  <div className="flex-1">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-foreground">
                          Total: {formatMinutesToTime(additionalInfo.tentSetupTimeCalculated)}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                          onClick={() => {
                            const details =
                              tentBreakdown.length === 0
                                ? "No tents in this order"
                                : tentBreakdown
                                    .map((item) => `${item.name} x ${item.qty} — ${item.timeEach} mins each = ${item.total} mins`)
                                    .join("\n")
                            showAlert(details, { title: "Tent setup time breakdown" })
                          }}
                        >
                          (i)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Setup Duration */}
                <div className="flex items-center gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Setup Duration:</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={additionalInfo.setupDurationHours}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupDurationHours: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      disabled={setupLocked || !setupRequired}
                    />
                    <span className="text-sm text-muted-foreground">hrs</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={additionalInfo.setupDurationMinutes}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupDurationMinutes: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      disabled={setupLocked || !setupRequired}
                    />
                    <span className="text-sm text-muted-foreground">mins</span>
                  </div>
                </div>

                {/* Buffer Time */}
                <div className="flex items-start gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Buffer Time:</div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={additionalInfo.bufferTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, bufferTime: e.target.value }))}
                        className="w-24"
                        disabled={setupLocked || !setupRequired}
                        placeholder="0"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                    <Input
                      placeholder="Reason for buffer time..."
                      value={additionalInfo.bufferReason}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, bufferReason: e.target.value }))}
                      className="w-full"
                      disabled={setupLocked || !setupRequired}
                    />
                  </div>
                </div>

                {/* Setup Lorry */}
                <div className="flex items-center gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Assigned Lorry:</div>
                  <Select
                    value={additionalInfo.setupLorry}
                    onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, setupLorry: value as typeof LORRY_OPTIONS[number] }))}
                    disabled={setupLocked || !setupRequired}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select lorry" />
                    </SelectTrigger>
                    <SelectContent>
                      {LORRY_OPTIONS.map((lorry) => (
                        <SelectItem key={lorry} value={lorry}>
                          {getTeamDisplayName(lorry)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>


                {/* Calculated Summary */}
                <div className="mt-4 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.scheduleStartTime || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Setup Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.totalTaskTimeHours}h {additionalInfo.totalTaskTimeMinutes}m
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated End Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.estimatedEndTime || "-"}
                    </p>
                  </div>
                </div>

                {/* Traffic Return (Setup) */}
                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-background p-3 mt-4">
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Traffic Return (Setup)
                  </p>
                  <div className="space-y-3">
                    {/* Return Choice */}
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Return choice:</div>
                      <Select
                        value={additionalInfo.setupReturnChoice}
                        onValueChange={(value) => {
                          setAdditionalInfo(prev => ({
                            ...prev,
                            setupReturnChoice: value as "return-to-hub" | "remain-on-site" | "",
                            // Also update legacy field for backward compatibility
                            setupNextAction: value === "return-to-hub" ? "warehouse" : value === "remain-on-site" ? "next-task" : "" as any,
                            ...(value === "remain-on-site"
                              ? { setupReturnDistanceKm: 0, setupReturnTravelHours: 0, setupReturnTravelMinutes: 0, setupReturnTravelMins: 0, setupReturnArrivalTime: "" }
                              : null),
                          }))
                        }}
                        disabled={setupLocked || !setupRequired}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="return-to-hub">Return to Hub</SelectItem>
                          <SelectItem value="remain-on-site">Remain on Site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Only show remaining fields if "return-to-hub" is selected */}
                    {additionalInfo.setupReturnChoice === "return-to-hub" && (
                      <>
                        {/* Return from? */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Return from?</div>
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            <Select
                              value={additionalInfo.setupReturnFromType}
                              onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, setupReturnFromType: value as "site" | "other" | "" }))}
                              disabled={setupLocked || !setupRequired}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="site">Site</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={additionalInfo.setupReturnFromType === "site" ? (getSetupSiteAddress() || "Site address") : "Other address"}
                              value={additionalInfo.setupReturnFromType === "site" ? "" : additionalInfo.setupReturnFromAddress}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupReturnFromAddress: e.target.value }))}
                              className="min-w-[220px] flex-1"
                              disabled={setupLocked || !setupRequired || additionalInfo.setupReturnFromType === "site"}
                            />
                          </div>
                        </div>

                        {/* Departure time */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Departure time:</div>
                          <Input
                            type="time"
                            value={additionalInfo.setupReturnDepartureTime || additionalInfo.estimatedEndTime || ""}
                            onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupReturnDepartureTime: e.target.value }))}
                            className="w-32"
                            disabled={setupLocked || !setupRequired}
                          />
                        </div>

                        {/* Travelling Time */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Travelling Time:</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              value={additionalInfo.setupReturnTravelHours}
                              onChange={(e) => {
                                const hrs = parseInt(e.target.value) || 0
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  setupReturnTravelHours: hrs,
                                  setupReturnTravelMins: hrs * 60 + prev.setupReturnTravelMinutes,
                                }))
                              }}
                              className="w-20"
                              disabled={setupLocked || !setupRequired}
                            />
                            <span className="text-sm text-muted-foreground">hrs</span>
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              value={additionalInfo.setupReturnTravelMinutes}
                              onChange={(e) => {
                                const mins = parseInt(e.target.value) || 0
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  setupReturnTravelMinutes: mins,
                                  setupReturnTravelMins: prev.setupReturnTravelHours * 60 + mins,
                                }))
                              }}
                              className="w-20"
                              disabled={setupLocked || !setupRequired}
                            />
                            <span className="text-sm text-muted-foreground">mins</span>
                          </div>
                        </div>

                        {/* Distance */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Distance:</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={additionalInfo.setupReturnDistanceKm || ""}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupReturnDistanceKm: parseFloat(e.target.value) || 0 }))}
                              className="w-24"
                              placeholder="0.0"
                              disabled={setupLocked || !setupRequired}
                            />
                            <span className="text-sm text-muted-foreground">km</span>
                          </div>
                        </div>

                        {/* Return to */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Return to:</div>
                          <div className="flex-1 flex gap-2">
                            <Select
                              value={additionalInfo.setupReturnToType}
                              onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, setupReturnToType: value as "hub" | "other" | "" }))}
                              disabled={setupLocked || !setupRequired}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hub">Hub</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={additionalInfo.setupReturnToType === "hub" ? getAISettings().hubAddress : "Enter destination address"}
                              value={additionalInfo.setupReturnToType === "hub" ? "" : additionalInfo.setupReturnToAddress}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, setupReturnToAddress: e.target.value }))}
                              className="flex-1"
                              disabled={setupLocked || !setupRequired || additionalInfo.setupReturnToType === "hub"}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={setupReturnDistanceLoading || setupLocked || !setupRequired}
                              onClick={async () => {
                                try {
                                  setSetupReturnDistanceLoading(true)
                                  setSetupReturnDistanceResult(null)
                                  const fromAddr = additionalInfo.setupReturnFromType === "site"
                                    ? getSetupSiteAddress()
                                    : additionalInfo.setupReturnFromAddress
                                  const toAddr = additionalInfo.setupReturnToType === "hub"
                                    ? getAISettings().hubAddress
                                    : additionalInfo.setupReturnToAddress
                                  if (!fromAddr || !toAddr) {
                                    showAlert("Please enter both from and to addresses", { title: "Missing Address", actionText: "OK" })
                                    return
                                  }
                                  const res = await estimateReturnToHub(fromAddr, toAddr)
                                  setSetupReturnDistanceResult({
                                    distanceKm: res.distanceKm,
                                    mapUrl: res.mapUrl,
                                    fromAddress: res.fromAddress,
                                    toAddress: res.toAddress,
                                  })
                                  setAdditionalInfo(prev => ({
                                    ...prev,
                                    setupReturnDistanceKm: res.distanceKm,
                                    setupReturnTravelHours: Math.floor(res.travelMins / 60),
                                    setupReturnTravelMinutes: res.travelMins % 60,
                                    setupReturnTravelMins: res.travelMins,
                                  }))
                                } catch (e) {
                                  showAlert(e instanceof Error ? e.message : "Could not calculate distance", { title: "Distance Error", actionText: "OK" })
                                } finally {
                                  setSetupReturnDistanceLoading(false)
                                }
                              }}
                              className="gap-1"
                            >
                              <MapPin className="h-4 w-4" />
                              {setupReturnDistanceLoading ? "..." : "Estimate"}
                            </Button>
                          </div>
                        </div>

                        {/* Distance Estimation Result with Map */}
                        {setupReturnDistanceResult && (
                          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-medium text-green-700">Distance Estimated</div>
                              <div className="text-lg font-bold text-green-700">{setupReturnDistanceResult.distanceKm} km</div>
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">
                              <div>From: {setupReturnDistanceResult.fromAddress}</div>
                              <div>To: {setupReturnDistanceResult.toAddress}</div>
                            </div>
                            <div className="rounded-lg overflow-hidden border border-green-200">
                              <iframe
                                src={getGoogleMapsEmbedDirectionsUrl(setupReturnDistanceResult.fromAddress, setupReturnDistanceResult.toAddress)}
                                className="w-full h-40"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                            </div>
                            <div className="mt-2 text-xs text-green-600 flex justify-between items-center">
                              <span>Travel time auto-filled: {additionalInfo.setupReturnTravelHours}h {additionalInfo.setupReturnTravelMinutes}m (at {getAISettings().minutesPerKm} mins/km)</span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-muted-foreground"
                                onClick={() => {
                                  setEnlargedMapUrl(getGoogleMapsEmbedDirectionsUrl(setupReturnDistanceResult.fromAddress, setupReturnDistanceResult.toAddress))
                                  setEnlargedMapInfo({
                                    from: setupReturnDistanceResult.fromAddress,
                                    to: setupReturnDistanceResult.toAddress,
                                    distance: setupReturnDistanceResult.distanceKm,
                                  })
                                }}
                              >
                                Open larger
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Golden Summary Panel */}
                        <div className="mt-2 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Departure Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {(additionalInfo.setupReturnDepartureTime || additionalInfo.estimatedEndTime)
                                ? displayHHmm(additionalInfo.setupReturnDepartureTime || additionalInfo.estimatedEndTime)
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Travelling Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {additionalInfo.setupReturnTravelHours}h {additionalInfo.setupReturnTravelMinutes}m
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Estimated Arrival Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {additionalInfo.setupReturnArrivalTime ? displayHHmm(additionalInfo.setupReturnArrivalTime) : "-"}
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {additionalInfo.setupReturnChoice === "remain-on-site" && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Team will remain on site after setup completion.
                        {additionalInfo.setupNextTaskOrderNumber ? (
                          <div className="mt-1 text-foreground">
                            Co-join: proceed to{" "}
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 font-semibold"
                              onClick={() => router.push(`/portal/scheduling/${additionalInfo.setupNextTaskOrderNumber}`)}
                            >
                              {additionalInfo.setupNextTaskOrderNumber}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {/* Setup Confirm/Edit */}
                <div className="flex justify-end gap-2 mt-4">
                  {setupLocked ? (
                    <Button
                      variant="outline"
                      onClick={() => setSetupLocked(false)}
                      disabled={isSchedulingReadOnly}
                      className="bg-transparent"
                    >
                      {isSchedulingReadOnly ? "Locked (Edit Scheduling)" : "Edit Setup"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowSetupConfirm(true)}
                      disabled={isSchedulingReadOnly}
                      className="bg-accent text-accent-foreground"
                    >
                      Confirm Setup
                    </Button>
                  )}
                </div>
              </div>
              )}
              {/* DISMANTLE PATH */}
              {dismantleRequired && (
              <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Right Panel</p>
                  <h3 className="text-md font-semibold text-foreground border-b pb-2">Dismantle Path</h3>
                </div>

                {/* Dismantle Traffic Departure */}
                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-background p-3">
                  <p className="text-sm font-semibold text-foreground mb-3">Traffic Departure (Dismantle)</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Departure from?</div>
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <Select
                          value={additionalInfo.dismantleDepartureFromType}
                          onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, dismantleDepartureFromType: value as AdditionalInfo["dismantleDepartureFromType"] }))}
                          disabled={dismantleLocked || !dismantleRequired}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hub">Hub</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Other address (if not hub)"
                          value={additionalInfo.dismantleDepartureAddress}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDepartureAddress: e.target.value }))}
                          className="min-w-[220px] flex-1"
                          disabled={dismantleLocked || !dismantleRequired}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Departure time:</div>
                      <Input
                        type="time"
                        value={additionalInfo.dismantleDepartureTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDepartureTime: e.target.value }))}
                        className="w-32"
                        disabled={dismantleLocked || !dismantleRequired}
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Travelling Time:</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="23"
                          value={additionalInfo.dismantleTravelHours}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleTravelHours: parseInt(e.target.value) || 0 }))}
                          className="w-20"
                          disabled={dismantleLocked || !dismantleRequired}
                        />
                        <span className="text-sm text-muted-foreground">hrs</span>
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          value={additionalInfo.dismantleTravelMinutes}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleTravelMinutes: parseInt(e.target.value) || 0 }))}
                          className="w-20"
                          disabled={dismantleLocked || !dismantleRequired}
                        />
                        <span className="text-sm text-muted-foreground">mins</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Distance:</div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={additionalInfo.dismantleDistanceKm || ""}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDistanceKm: parseFloat(e.target.value) || 0 }))}
                          className="w-24"
                          placeholder="0.0"
                          disabled={dismantleLocked || !dismantleRequired}
                        />
                        <span className="text-sm text-muted-foreground">km</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">To destination:</div>
                      <div className="flex-1 flex gap-2">
                        <Input
                          placeholder="Enter destination address"
                          value={additionalInfo.dismantleDestinationAddress}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDestinationAddress: e.target.value }))}
                          className="flex-1"
                          disabled={dismantleLocked || !dismantleRequired}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={dismantleDistanceLoading || !additionalInfo.dismantleDestinationAddress || dismantleLocked}
                          onClick={async () => {
                            setDismantleDistanceLoading(true)
                            setDismantleDistanceResult(null)
                            try {
                              const fromAddr = additionalInfo.dismantleDepartureFromType === "hub"
                                ? getAISettings().hubAddress
                                : additionalInfo.dismantleDepartureAddress
                              const response = await fetch("/api/calculate-distance", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  fromAddress: fromAddr,
                                  toAddress: additionalInfo.dismantleDestinationAddress,
                                }),
                              })
                              const data = await response.json()
                              if (data.success) {
                                setDismantleDistanceResult({
                                  distanceKm: data.distance.km,
                                  mapUrl: data.mapUrl,
                                  fromAddress: data.from.address,
                                  toAddress: data.to.address,
                                })
                                // Auto-fill distance and travel time based on distance and mins/km setting
                                const aiSettings = getAISettings()
                                const travelMins = Math.round(data.distance.km * aiSettings.minutesPerKm)
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  dismantleDistanceKm: data.distance.km,
                                  dismantleTravelHours: Math.floor(travelMins / 60),
                                  dismantleTravelMinutes: travelMins % 60,
                                }))
                              } else {
                                showAlert(data.error || "Could not calculate distance", { title: "Distance Error", actionText: "OK" })
                              }
                            } catch (error) {
                              showAlert("Failed to calculate distance", { title: "Error", actionText: "OK" })
                            } finally {
                              setDismantleDistanceLoading(false)
                            }
                          }}
                          className="gap-1"
                        >
                          <MapPin className="h-4 w-4" />
                          {dismantleDistanceLoading ? "..." : "Estimate"}
                        </Button>
                      </div>
                    </div>

                    {/* Dismantle Distance Estimation Result with Map */}
                    {dismantleDistanceResult && (
                      <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-orange-700">Distance Estimated</div>
                          <div className="text-lg font-bold text-orange-700">{dismantleDistanceResult.distanceKm} km</div>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          <div>From: {dismantleDistanceResult.fromAddress}</div>
                          <div>To: {dismantleDistanceResult.toAddress}</div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-orange-200">
                          <iframe
                            src={getGoogleMapsEmbedDirectionsUrl(dismantleDistanceResult.fromAddress, dismantleDistanceResult.toAddress)}
                            className="w-full h-40"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                        <div className="mt-2 text-xs text-orange-600 flex justify-between items-center">
                          <span>Travel time auto-filled: {additionalInfo.dismantleTravelHours}h {additionalInfo.dismantleTravelMinutes}m (at {getAISettings().minutesPerKm} mins/km)</span>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-muted-foreground"
                            onClick={() => {
                              setEnlargedMapUrl(getGoogleMapsEmbedDirectionsUrl(dismantleDistanceResult.fromAddress, dismantleDistanceResult.toAddress))
                              setEnlargedMapInfo({
                                from: dismantleDistanceResult.fromAddress,
                                to: dismantleDistanceResult.toAddress,
                                distance: dismantleDistanceResult.distanceKm,
                              })
                            }}
                          >
                            Open larger
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Departure Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {additionalInfo.dismantleDepartureTime ? displayHHmm(additionalInfo.dismantleDepartureTime) : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Travelling Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {additionalInfo.dismantleTravelHours}h {additionalInfo.dismantleTravelMinutes}m
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Arrival Time</p>
                        <p className="text-2xl font-bold text-foreground">
                          {dismantleArrivalTime ? displayHHmm(dismantleArrivalTime) : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dismantle Work Time (Auto Calculated) */}
                <div className="flex items-start gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Dismantle Work Time:</div>
                  <div className="flex-1">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="font-semibold text-foreground">
                        Total: {formatMinutesToTime(additionalInfo.dismantleWorkTimeCalculated ?? additionalInfo.tentSetupTimeCalculated)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dismantle Duration */}
                <div className="flex items-center gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Dismantle Duration:</div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={additionalInfo.dismantleDurationHours}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDurationHours: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      disabled={dismantleLocked || !dismantleRequired}
                    />
                    <span className="text-sm text-muted-foreground">hrs</span>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={additionalInfo.dismantleDurationMinutes}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleDurationMinutes: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      disabled={dismantleLocked || !dismantleRequired}
                    />
                    <span className="text-sm text-muted-foreground">mins</span>
                  </div>
                </div>

                {/* Buffer Time */}
                <div className="flex items-start gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Buffer Time:</div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={additionalInfo.dismantleBufferTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleBufferTime: e.target.value }))}
                        className="w-24"
                        disabled={dismantleLocked || !dismantleRequired}
                        placeholder="0"
                      />
                      <span className="text-sm text-muted-foreground">minutes</span>
                    </div>
                    <Input
                      placeholder="Reason for buffer time..."
                      value={additionalInfo.dismantleBufferReason}
                      onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleBufferReason: e.target.value }))}
                      className="w-full"
                      disabled={dismantleLocked || !dismantleRequired}
                    />
                  </div>
                </div>

                {/* Dismantle Lorry */}
                <div className="flex items-center gap-4">
                  <div className="w-48 text-sm font-medium text-foreground">Assigned Lorry:</div>
                  <Select
                    value={additionalInfo.dismantleLorry}
                    onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, dismantleLorry: value as typeof LORRY_OPTIONS[number] }))}
                    disabled={dismantleLocked || !dismantleRequired}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select lorry" />
                    </SelectTrigger>
                    <SelectContent>
                      {LORRY_OPTIONS.map((lorry) => (
                        <SelectItem key={lorry} value={lorry}>
                          {getTeamDisplayName(lorry)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Calculated Summary */}
                <div className="mt-4 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Start Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.dismantleScheduleStartTime || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Dismantle Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.dismantleTotalTimeHours}h {additionalInfo.dismantleTotalTimeMinutes}m
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated End Time</p>
                    <p className="text-2xl font-bold text-foreground">
                      {additionalInfo.dismantleEstimatedEndTime || "-"}
                    </p>
                  </div>
                </div>

                {/* Traffic Return (Dismantle) */}
                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-background p-3 mt-4">
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Traffic Return (Dismantle)
                  </p>
                  <div className="space-y-3">
                    {/* Return Choice */}
                    <div className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-foreground">Return choice:</div>
                      <Select
                        value={additionalInfo.dismantleReturnChoice}
                        onValueChange={(value) => {
                          setAdditionalInfo(prev => ({
                            ...prev,
                            dismantleReturnChoice: value as "return-to-hub" | "remain-on-site" | "",
                            // Also update legacy field for backward compatibility
                            dismantleNextAction: value === "return-to-hub" ? "warehouse" : value === "remain-on-site" ? "next-task" : "" as any,
                            ...(value === "remain-on-site"
                              ? { dismantleReturnDistanceKm: 0, dismantleReturnTravelHours: 0, dismantleReturnTravelMinutes: 0, dismantleReturnTravelMins: 0, dismantleReturnArrivalTime: "" }
                              : null),
                          }))
                        }}
                        disabled={dismantleLocked || !dismantleRequired}
                      >
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="return-to-hub">Return to Hub</SelectItem>
                          <SelectItem value="remain-on-site">Remain on Site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Only show remaining fields if "return-to-hub" is selected */}
                    {additionalInfo.dismantleReturnChoice === "return-to-hub" && (
                      <>
                        {/* Return from? */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Return from?</div>
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            <Select
                              value={additionalInfo.dismantleReturnFromType}
                              onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnFromType: value as "site" | "other" | "" }))}
                              disabled={dismantleLocked || !dismantleRequired}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="site">Site</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={additionalInfo.dismantleReturnFromType === "site" ? (getDismantleSiteAddress() || "Site address") : "Other address"}
                              value={additionalInfo.dismantleReturnFromType === "site" ? "" : additionalInfo.dismantleReturnFromAddress}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnFromAddress: e.target.value }))}
                              className="min-w-[220px] flex-1"
                              disabled={dismantleLocked || !dismantleRequired || additionalInfo.dismantleReturnFromType === "site"}
                            />
                          </div>
                        </div>

                        {/* Departure time */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Departure time:</div>
                          <Input
                            type="time"
                            value={additionalInfo.dismantleReturnDepartureTime || additionalInfo.dismantleEstimatedEndTime || ""}
                            onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnDepartureTime: e.target.value }))}
                            className="w-32"
                            disabled={dismantleLocked || !dismantleRequired}
                          />
                        </div>

                        {/* Travelling Time */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Travelling Time:</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              value={additionalInfo.dismantleReturnTravelHours}
                              onChange={(e) => {
                                const hrs = parseInt(e.target.value) || 0
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  dismantleReturnTravelHours: hrs,
                                  dismantleReturnTravelMins: hrs * 60 + prev.dismantleReturnTravelMinutes,
                                }))
                              }}
                              className="w-20"
                              disabled={dismantleLocked || !dismantleRequired}
                            />
                            <span className="text-sm text-muted-foreground">hrs</span>
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              value={additionalInfo.dismantleReturnTravelMinutes}
                              onChange={(e) => {
                                const mins = parseInt(e.target.value) || 0
                                setAdditionalInfo(prev => ({
                                  ...prev,
                                  dismantleReturnTravelMinutes: mins,
                                  dismantleReturnTravelMins: prev.dismantleReturnTravelHours * 60 + mins,
                                }))
                              }}
                              className="w-20"
                              disabled={dismantleLocked || !dismantleRequired}
                            />
                            <span className="text-sm text-muted-foreground">mins</span>
                          </div>
                        </div>

                        {/* Distance */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Distance:</div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={additionalInfo.dismantleReturnDistanceKm || ""}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnDistanceKm: parseFloat(e.target.value) || 0 }))}
                              className="w-24"
                              placeholder="0.0"
                              disabled={dismantleLocked || !dismantleRequired}
                            />
                            <span className="text-sm text-muted-foreground">km</span>
                          </div>
                        </div>

                        {/* Return to */}
                        <div className="flex items-center gap-4">
                          <div className="w-48 text-sm font-medium text-foreground">Return to:</div>
                          <div className="flex-1 flex gap-2">
                            <Select
                              value={additionalInfo.dismantleReturnToType}
                              onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnToType: value as "hub" | "other" | "" }))}
                              disabled={dismantleLocked || !dismantleRequired}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hub">Hub</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={additionalInfo.dismantleReturnToType === "hub" ? getAISettings().hubAddress : "Enter destination address"}
                              value={additionalInfo.dismantleReturnToType === "hub" ? "" : additionalInfo.dismantleReturnToAddress}
                              onChange={(e) => setAdditionalInfo(prev => ({ ...prev, dismantleReturnToAddress: e.target.value }))}
                              className="flex-1"
                              disabled={dismantleLocked || !dismantleRequired || additionalInfo.dismantleReturnToType === "hub"}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={dismantleReturnDistanceLoading || dismantleLocked || !dismantleRequired}
                              onClick={async () => {
                                try {
                                  setDismantleReturnDistanceLoading(true)
                                  setDismantleReturnDistanceResult(null)
                                  const fromAddr = additionalInfo.dismantleReturnFromType === "site"
                                    ? getDismantleSiteAddress()
                                    : additionalInfo.dismantleReturnFromAddress
                                  const toAddr = additionalInfo.dismantleReturnToType === "hub"
                                    ? getAISettings().hubAddress
                                    : additionalInfo.dismantleReturnToAddress
                                  if (!fromAddr || !toAddr) {
                                    showAlert("Please enter both from and to addresses", { title: "Missing Address", actionText: "OK" })
                                    return
                                  }
                                  const res = await estimateReturnToHub(fromAddr, toAddr)
                                  setDismantleReturnDistanceResult({
                                    distanceKm: res.distanceKm,
                                    mapUrl: res.mapUrl,
                                    fromAddress: res.fromAddress,
                                    toAddress: res.toAddress,
                                  })
                                  setAdditionalInfo(prev => ({
                                    ...prev,
                                    dismantleReturnDistanceKm: res.distanceKm,
                                    dismantleReturnTravelHours: Math.floor(res.travelMins / 60),
                                    dismantleReturnTravelMinutes: res.travelMins % 60,
                                    dismantleReturnTravelMins: res.travelMins,
                                  }))
                                } catch (e) {
                                  showAlert(e instanceof Error ? e.message : "Could not calculate distance", { title: "Distance Error", actionText: "OK" })
                                } finally {
                                  setDismantleReturnDistanceLoading(false)
                                }
                              }}
                              className="gap-1"
                            >
                              <MapPin className="h-4 w-4" />
                              {dismantleReturnDistanceLoading ? "..." : "Estimate"}
                            </Button>
                          </div>
                        </div>

                        {/* Distance Estimation Result with Map */}
                        {dismantleReturnDistanceResult && (
                          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-medium text-green-700">Distance Estimated</div>
                              <div className="text-lg font-bold text-green-700">{dismantleReturnDistanceResult.distanceKm} km</div>
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">
                              <div>From: {dismantleReturnDistanceResult.fromAddress}</div>
                              <div>To: {dismantleReturnDistanceResult.toAddress}</div>
                            </div>
                            <div className="rounded-lg overflow-hidden border border-green-200">
                              <iframe
                                src={getGoogleMapsEmbedDirectionsUrl(dismantleReturnDistanceResult.fromAddress, dismantleReturnDistanceResult.toAddress)}
                                className="w-full h-40"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                            </div>
                            <div className="mt-2 text-xs text-green-600 flex justify-between items-center">
                              <span>Travel time auto-filled: {additionalInfo.dismantleReturnTravelHours}h {additionalInfo.dismantleReturnTravelMinutes}m (at {getAISettings().minutesPerKm} mins/km)</span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-muted-foreground"
                                onClick={() => {
                                  setEnlargedMapUrl(getGoogleMapsEmbedDirectionsUrl(dismantleReturnDistanceResult.fromAddress, dismantleReturnDistanceResult.toAddress))
                                  setEnlargedMapInfo({
                                    from: dismantleReturnDistanceResult.fromAddress,
                                    to: dismantleReturnDistanceResult.toAddress,
                                    distance: dismantleReturnDistanceResult.distanceKm,
                                  })
                                }}
                              >
                                Open larger
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Golden Summary Panel */}
                        <div className="mt-2 grid gap-4 rounded-lg border-2 border-accent bg-accent/5 p-4 sm:grid-cols-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Departure Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {(additionalInfo.dismantleReturnDepartureTime || additionalInfo.dismantleEstimatedEndTime)
                                ? displayHHmm(additionalInfo.dismantleReturnDepartureTime || additionalInfo.dismantleEstimatedEndTime)
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Travelling Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {additionalInfo.dismantleReturnTravelHours}h {additionalInfo.dismantleReturnTravelMinutes}m
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Estimated Arrival Time</p>
                            <p className="text-2xl font-bold text-foreground">
                              {additionalInfo.dismantleReturnArrivalTime ? displayHHmm(additionalInfo.dismantleReturnArrivalTime) : "-"}
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {additionalInfo.dismantleReturnChoice === "remain-on-site" && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                        Team will remain on site after dismantle completion.
                        {additionalInfo.dismantleNextTaskOrderNumber ? (
                          <div className="mt-1 text-foreground">
                            Co-join: proceed to{" "}
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto p-0 font-semibold"
                              onClick={() => router.push(`/portal/scheduling/${additionalInfo.dismantleNextTaskOrderNumber}`)}
                            >
                              {additionalInfo.dismantleNextTaskOrderNumber}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dismantle Confirm/Edit */}
                <div className="flex justify-end gap-2 mt-4">
                  {dismantleLocked ? (
                    <Button
                      variant="outline"
                      onClick={() => setDismantleLocked(false)}
                      disabled={isSchedulingReadOnly}
                      className="bg-transparent"
                    >
                      {isSchedulingReadOnly ? "Locked (Edit Scheduling)" : "Edit Dismantle"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowDismantleConfirm(true)}
                      disabled={isSchedulingReadOnly}
                      className="bg-accent text-accent-foreground"
                    >
                      Confirm Dismantle
                    </Button>
                  )}
                </div>
              </div>
              )}

              {/* OTHER ADHOC SCHEDULING */}
              {otherAdhocRequired && (
                <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ad Hoc</p>
                    <h3 className="text-md font-semibold text-foreground border-b pb-2">
                      Other Adhoc Scheduling
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Event name:{" "}
                      <span className="font-medium text-foreground">
                        {order.adHocOptions?.otherAdhocName || "-"}
                      </span>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Confirmed Date</Label>
                      <Input
                        type="text"
                        value={confirmedOtherAdhocDateInput}
                        onChange={(e) => {
                          const value = e.target.value
                          setConfirmedOtherAdhocDateInput(value)
                          if (!value) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedOtherAdhocDate: "" }))
                            return
                          }
                          const parsed = parseDMYToISO(value)
                          if (parsed) {
                            setAdditionalInfo(prev => ({ ...prev, confirmedOtherAdhocDate: parsed }))
                          }
                        }}
                        placeholder="dd/mm/yyyy"
                        disabled={otherAdhocLocked || !otherAdhocRequired}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirmed Time</Label>
                      <Input
                        type="time"
                        value={additionalInfo.confirmedOtherAdhocTime}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, confirmedOtherAdhocTime: e.target.value }))}
                        disabled={otherAdhocLocked || !otherAdhocRequired}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-48 text-sm font-medium text-foreground">Task Duration:</div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        value={additionalInfo.otherAdhocDurationHours}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, otherAdhocDurationHours: parseInt(e.target.value) || 0 }))}
                        className="w-20"
                        disabled={otherAdhocLocked || !otherAdhocRequired}
                      />
                      <span className="text-sm text-muted-foreground">hrs</span>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        value={additionalInfo.otherAdhocDurationMinutes}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, otherAdhocDurationMinutes: parseInt(e.target.value) || 0 }))}
                        className="w-20"
                        disabled={otherAdhocLocked || !otherAdhocRequired}
                      />
                      <span className="text-sm text-muted-foreground">mins</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-48 text-sm font-medium text-foreground">Buffer Time:</div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={additionalInfo.otherAdhocBufferTime}
                          onChange={(e) => setAdditionalInfo(prev => ({ ...prev, otherAdhocBufferTime: e.target.value }))}
                          className="w-24"
                          disabled={otherAdhocLocked || !otherAdhocRequired}
                          placeholder="0"
                        />
                        <span className="text-sm text-muted-foreground">minutes</span>
                      </div>
                      <Input
                        placeholder="Reason for buffer time..."
                        value={additionalInfo.otherAdhocBufferReason}
                        onChange={(e) => setAdditionalInfo(prev => ({ ...prev, otherAdhocBufferReason: e.target.value }))}
                        className="w-full"
                        disabled={otherAdhocLocked || !otherAdhocRequired}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-48 text-sm font-medium text-foreground">Assigned Lorry:</div>
                    <Select
                      value={additionalInfo.otherAdhocLorry}
                      onValueChange={(value) => setAdditionalInfo(prev => ({ ...prev, otherAdhocLorry: value as typeof LORRY_OPTIONS[number] }))}
                      disabled={otherAdhocLocked || !otherAdhocRequired}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select lorry" />
                      </SelectTrigger>
                      <SelectContent>
                        {LORRY_OPTIONS.map((lorry) => (
                          <SelectItem key={lorry} value={lorry}>
                            {getTeamDisplayName(lorry)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mt-4 grid gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Start Time</p>
                      <p className="text-2xl font-bold text-foreground">
                        {additionalInfo.otherAdhocScheduleStartTime || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Time</p>
                      <p className="text-2xl font-bold text-foreground">
                        {additionalInfo.otherAdhocTotalTimeHours}h {additionalInfo.otherAdhocTotalTimeMinutes}m
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Estimated End Time</p>
                      <p className="text-2xl font-bold text-foreground">
                        {additionalInfo.otherAdhocEstimatedEndTime || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    {otherAdhocLocked ? (
                      <Button
                        variant="outline"
                        onClick={() => setOtherAdhocLocked(false)}
                        disabled={isSchedulingReadOnly}
                        className="bg-transparent"
                      >
                        {isSchedulingReadOnly ? "Locked (Edit Scheduling)" : "Edit Other Adhoc"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setShowOtherAdhocConfirm(true)}
                        disabled={isSchedulingReadOnly}
                        className="bg-accent text-accent-foreground"
                      >
                        Confirm Other Adhoc
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Linked Schedule Calendar */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Schedule Calendar</p>
                  <p className="text-xs text-muted-foreground">
                    Drag the tasks within the confirmed dates to set the start time.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Setup Date: {additionalInfo.confirmedSetupDate || "Not set"} | Dismantle Date: {additionalInfo.confirmedDismantleDate || "Not set"}
                  {otherAdhocRequired ? ` | Other Adhoc Date: ${additionalInfo.confirmedOtherAdhocDate || "Not set"}` : ""}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Jump to date</Label>
                    <Input
                      type="date"
                      value={jumpToDate}
                      onChange={(e) => handleJumpToDate(e.target.value)}
                      className="h-9 w-44"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => handleJumpToDate(formatDateToISO(new Date()))}
                  >
                    Today
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => handleJumpToDate(calendarDate)}
                  >
                    This Order
                  </Button>
                </div>
              </div>

              <FullCalendar
                plugins={[timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                initialDate={calendarDate}
                headerToolbar={{ left: "prev,next", center: "title", right: "" }}
                allDaySlot={false}
                slotMinTime="06:00:00"
                slotMaxTime="22:00:00"
                slotDuration="00:30:00"
                height="420px"
                editable
                eventDurationEditable={false}
                events={[...scheduleEvents, ...dismantleScheduleEvents, ...otherAdhocScheduleEvents]}
                slotLaneClassNames={(arg) => (arg.date && isNonWorkingSlot(arg.date) ? ["fc-nonworking"] : [])}
                ref={calendarRef}
                eventContent={(arg) => {
                  const start = arg.event.start
                  const end = arg.event.end
                  const timeText = start && end ? formatTimeRange(start, end) : arg.timeText
                  return (
                    <div className="fc-event-content-custom">
                      <div className="fc-event-phase">{arg.event.extendedProps.phase}</div>
                      <div className="fc-event-time">{timeText}</div>
                      <div className="fc-event-order">{arg.event.extendedProps.orderNumber}</div>
                      <div className="fc-event-name">{arg.event.extendedProps.eventName}</div>
                      <div className="fc-event-lorry">
                        <span
                          className={`lorry-dot ${arg.event.extendedProps.lorryClass || ""}`}
                          aria-label={arg.event.extendedProps.lorry || "Unassigned"}
                        >
                          {arg.event.extendedProps.lorryCode || ""}
                        </span>
                        {arg.event.extendedProps.lorry || "Unassigned"}
                      </div>
                    </div>
                  )
                }}
                eventAllow={(dropInfo, draggedEvent) => {
                  const phase = draggedEvent?.extendedProps?.phase
                  if (phase === "Setup") {
                    if (setupLocked) return false
                    if (!additionalInfo.confirmedSetupDate) return true
                    return formatDateToISO(dropInfo.start) === additionalInfo.confirmedSetupDate
                  }
                  if (phase === "Dismantle") {
                    if (dismantleLocked) return false
                    if (!additionalInfo.confirmedDismantleDate) return true
                    return formatDateToISO(dropInfo.start) === additionalInfo.confirmedDismantleDate
                  }
                  if (phase === "Other Adhoc") {
                    if (otherAdhocLocked) return false
                    if (!additionalInfo.confirmedOtherAdhocDate) return true
                    return formatDateToISO(dropInfo.start) === additionalInfo.confirmedOtherAdhocDate
                  }
                  return true
                }}
                eventDrop={(info) => {
                  if (!info.event.start) return
                  const phase = info.event.extendedProps.phase
                  if (phase === "Setup") {
                    if (setupLocked) {
                      info.revert()
                      return
                    }
                    if (additionalInfo.confirmedSetupDate && formatDateToISO(info.event.start) !== additionalInfo.confirmedSetupDate) {
                      info.revert()
                      return
                    }
                    if (totalTaskMinutes <= 0) {
                      showAlert("Please set setup duration and buffer time first.")
                      info.revert()
                      return
                    }
                    const candidateStart = info.event.start
                    const candidateEnd = new Date(candidateStart.getTime() + totalTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.setupLorry || "", "setup")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.setupLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      info.revert()
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      scheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                    return
                  }
                  if (phase === "Dismantle") {
                    if (dismantleLocked) {
                      info.revert()
                      return
                    }
                    if (additionalInfo.confirmedDismantleDate && formatDateToISO(info.event.start) !== additionalInfo.confirmedDismantleDate) {
                      info.revert()
                      return
                    }
                    if (dismantleTaskMinutes <= 0) {
                      showAlert("Please set dismantle duration and buffer time first.")
                      info.revert()
                      return
                    }
                    const candidateStart = info.event.start
                    const candidateEnd = new Date(candidateStart.getTime() + dismantleTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.dismantleLorry || "", "dismantle")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.dismantleLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      info.revert()
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      dismantleScheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                    return
                  }
                  if (phase === "Other Adhoc") {
                    if (otherAdhocLocked) {
                      info.revert()
                      return
                    }
                    if (additionalInfo.confirmedOtherAdhocDate && formatDateToISO(info.event.start) !== additionalInfo.confirmedOtherAdhocDate) {
                      info.revert()
                      return
                    }
                    if (otherAdhocTaskMinutes <= 0) {
                      showAlert("Please set other adhoc duration and buffer time first.")
                      info.revert()
                      return
                    }
                    const candidateStart = info.event.start
                    const candidateEnd = new Date(candidateStart.getTime() + otherAdhocTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.otherAdhocLorry || "", "other-adhoc")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.otherAdhocLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      info.revert()
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      otherAdhocScheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                  }
                }}
                dateClick={(info) => {
                  const date = formatDateToISO(info.date)
                  if (additionalInfo.confirmedSetupDate && date === additionalInfo.confirmedSetupDate) {
                    if (setupLocked) return
                    if (totalTaskMinutes <= 0) {
                      showAlert("Please set setup duration and buffer time first.")
                      return
                    }
                    const candidateStart = info.date
                    const candidateEnd = new Date(candidateStart.getTime() + totalTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.setupLorry || "", "setup")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.setupLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      scheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                    return
                  }
                  if (additionalInfo.confirmedDismantleDate && date === additionalInfo.confirmedDismantleDate) {
                    if (dismantleLocked) return
                    if (dismantleTaskMinutes <= 0) {
                      showAlert("Please set dismantle duration and buffer time first.")
                      return
                    }
                    const candidateStart = info.date
                    const candidateEnd = new Date(candidateStart.getTime() + dismantleTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.dismantleLorry || "", "dismantle")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.dismantleLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      dismantleScheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                    return
                  }
                  if (additionalInfo.confirmedOtherAdhocDate && date === additionalInfo.confirmedOtherAdhocDate) {
                    if (otherAdhocLocked) return
                    if (otherAdhocTaskMinutes <= 0) {
                      showAlert("Please set other adhoc duration and buffer time first.")
                      return
                    }
                    const candidateStart = info.date
                    const candidateEnd = new Date(candidateStart.getTime() + otherAdhocTaskMinutes * 60000)
                    const conflict = findConflict(candidateStart, candidateEnd, additionalInfo.otherAdhocLorry || "", "other-adhoc")
                    if (conflict) {
                      showAlert(
                        `Lorry clash detected: ${additionalInfo.otherAdhocLorry || "Unassigned lorry"} conflicts with ${conflict}.\n\nPlease choose another slot or change lorry.`,
                        { title: "Lorry Clash" }
                      )
                      return
                    }
                    setAdditionalInfo(prev => ({
                      ...prev,
                      otherAdhocScheduleStartTime: formatTimeToHHMM(candidateStart),
                    }))
                    return
                  }
                  showAlert("Please select a time within the confirmed setup, dismantle, or other adhoc date.")
                }}
              />
            </div>

            <ConfirmDialog
              open={showEditSchedulingConfirm}
              title="Edit Scheduling"
              description={
                order?.status === "packing"
                  ? "This order is already sent to Packing. Unlock scheduling fields anyway?"
                  : "Unlock scheduling fields so you can edit and re-save scheduling information?"
              }
              confirmText="Yes, edit scheduling"
              onConfirm={() => {
                setIsSchedulingReadOnly(false)
                setSetupLocked(false)
                setDismantleLocked(false)
                setOtherAdhocLocked(false)
                setShowEditSchedulingConfirm(false)
              }}
              onCancel={() => setShowEditSchedulingConfirm(false)}
            />
            <ConfirmDialog
              open={showEditOrderConfirm}
              title={isAdHoc ? "Edit Ad Hoc Order" : "Edit SO Order"}
              description="Navigate to the order edit page? Unsaved scheduling changes will be lost."
              confirmText="Yes, edit order"
              onConfirm={() => {
                setShowEditOrderConfirm(false)
                handleEdit()
              }}
              onCancel={() => setShowEditOrderConfirm(false)}
            />

            <ConfirmDialog
              open={showSetupConfirm}
              title="Confirm Setup"
              description="Confirm and lock setup details? You can unlock using Edit."
              confirmText="Yes, confirm"
              onConfirm={() => { setSetupLocked(true); setShowSetupConfirm(false) }}
              onCancel={() => setShowSetupConfirm(false)}
            />
            <ConfirmDialog
              open={showDismantleConfirm}
              title="Confirm Dismantle"
              description="Confirm and lock dismantle details? You can unlock using Edit."
              confirmText="Yes, confirm"
              onConfirm={() => { setDismantleLocked(true); setShowDismantleConfirm(false) }}
              onCancel={() => setShowDismantleConfirm(false)}
            />
            <ConfirmDialog
              open={showOtherAdhocConfirm}
              title="Confirm Other Adhoc"
              description="Confirm and lock other adhoc schedule details? You can unlock using Edit."
              confirmText="Yes, confirm"
              onConfirm={() => { setOtherAdhocLocked(true); setShowOtherAdhocConfirm(false) }}
              onCancel={() => setShowOtherAdhocConfirm(false)}
            />

            {/* Daily Route Optimizer Panel */}
            {!isSchedulingReadOnly && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  <h3 className="text-md font-semibold text-foreground">Daily Route Optimizer</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-4 items-end">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Date</Label>
                    <Input
                      type="date"
                      value={routeOptimizerDate}
                      onChange={(e) => setRouteOptimizerDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Team</Label>
                    <Select value={routeOptimizerTeam} onValueChange={setRouteOptimizerTeam}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        {LORRY_OPTIONS.map((team) => (
                          <SelectItem key={team} value={team}>{getTeamDisplayName(team)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Starting Point</Label>
                    <Select value={routeOptimizerStartingPoint} onValueChange={(v) => setRouteOptimizerStartingPoint(v as "hub" | "other")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hub">Hub</SelectItem>
                        <SelectItem value="other">Other Address</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={async () => {
                      if (!routeOptimizerDate || !routeOptimizerTeam) {
                        showAlert("Please select date and team")
                        return
                      }
                      if (routeOptimizerStartingPoint === "other" && !routeOptimizerCustomAddress) {
                        showAlert("Please enter starting address")
                        return
                      }
                      setShowRouteOptimizerModal(true)
                      setRouteOptimizerStep("loading")
                      try {
                        const { optimizeDailyRoute } = await import("@/lib/daily-route-optimizer")
                        const result = await optimizeDailyRoute(
                          routeOptimizerTeam as any,
                          routeOptimizerDate,
                          routeOptimizerStartingPoint,
                          routeOptimizerStartingPoint === "other" ? routeOptimizerCustomAddress : undefined
                        )
                        setRouteOptimizerResult(result)
                        setRouteOptimizerStep("result")
                      } catch (error) {
                        setShowRouteOptimizerModal(false)
                        showAlert(error instanceof Error ? error.message : "Failed to optimize route")
                      }
                    }}
                    className="gap-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-0 hover:from-purple-600 hover:to-indigo-600"
                  >
                    <Sparkles className="h-4 w-4" />
                    🚀 Optimize Daily Routes
                  </Button>
                </div>

                {routeOptimizerStartingPoint === "other" && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium">Custom Starting Address</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={routeOptimizerCustomAddress}
                        onChange={(e) => {
                          setRouteOptimizerCustomAddress(e.target.value)
                          setRouteOptimizerLocation(null)
                        }}
                        placeholder="Enter starting address"
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (!routeOptimizerCustomAddress.trim()) {
                            showAlert("Please enter an address to search")
                            return
                          }
                          setRouteOptimizerSearching(true)
                          setRouteOptimizerLocation(null)
                          try {
                            const res = await fetch(`/api/calculate-route?address=${encodeURIComponent(routeOptimizerCustomAddress)}`)
                            const data = await res.json()
                            if (data.success) {
                              setRouteOptimizerLocation({ lat: data.lat, lon: data.lon, address: data.address })
                            } else {
                              showAlert(data.error || "Could not find location")
                            }
                          } catch {
                            showAlert("Failed to search location")
                          } finally {
                            setRouteOptimizerSearching(false)
                          }
                        }}
                        disabled={routeOptimizerSearching}
                        className="gap-2"
                      >
                        {routeOptimizerSearching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MapPin className="h-4 w-4" />
                        )}
                        Search
                      </Button>
                    </div>
                  </div>
                )}

                {/* Location Map Preview */}
                {routeOptimizerLocation && (
                  <div className="mt-4 rounded-lg border border-border overflow-hidden">
                    <div className="p-2 bg-green-50 border-b border-green-200 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Location Found</span>
                      <span className="text-xs text-green-600 ml-auto">
                        {routeOptimizerLocation.lat.toFixed(6)}, {routeOptimizerLocation.lon.toFixed(6)}
                      </span>
                    </div>
                    <div className="text-xs p-2 text-muted-foreground">{routeOptimizerLocation.address}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=600&height=200&center=lonlat:${routeOptimizerLocation.lon},${routeOptimizerLocation.lat}&zoom=15&marker=lonlat:${routeOptimizerLocation.lon},${routeOptimizerLocation.lat};color:%23ff0000;size:medium&apiKey=${process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY}`}
                      alt="Location map preview"
                      className="w-full h-[200px] object-cover"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Scheduling Personnel */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-md font-semibold text-foreground border-b pb-2">Scheduled By</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Personnel Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={additionalInfo.schedulingPersonnel}
                    onChange={(e) => setAdditionalInfo(prev => ({ ...prev, schedulingPersonnel: e.target.value }))}
                    placeholder="Staff name"
                    required
                    disabled={isSchedulingReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={additionalInfo.schedulingDate}
                    onChange={(e) => setAdditionalInfo(prev => ({ ...prev, schedulingDate: e.target.value }))}
                    required
                    disabled={isSchedulingReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time <span className="text-destructive">*</span></Label>
                  <Input
                    type="time"
                    value={additionalInfo.schedulingTime}
                    onChange={(e) => setAdditionalInfo(prev => ({ ...prev, schedulingTime: e.target.value }))}
                    required
                    disabled={isSchedulingReadOnly}
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 border-t pt-6">
              <Button
                variant="outline"
                onClick={handleClearAllScheduling}
                disabled={isSchedulingReadOnly}
                className="gap-2 bg-transparent"
              >
                <Undo2 className="h-4 w-4" />
                Clear All
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveAdditionalInfo}
                disabled={isSchedulingReadOnly}
                className="gap-2 bg-transparent"
              >
                <Save className="h-4 w-4" />
                Save Information
              </Button>
              <Button
                onClick={handleProceedToPacking}
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Package className="h-4 w-4" />
                {nextActionLabel}
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* Route Optimizer Modal */}
      {showRouteOptimizerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRouteOptimizerModal(false)}>
          <div className="mx-4 w-full max-w-2xl rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>

            {/* Loading */}
            {routeOptimizerStep === "loading" && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-500" />
                <p className="text-muted-foreground">Optimizing route...</p>
              </div>
            )}

            {/* Step 3: Show results */}
            {routeOptimizerStep === "result" && routeOptimizerResult && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground">Optimization Results</h3>
                  <button onClick={() => setShowRouteOptimizerModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Savings Summary */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-lg bg-green-50 p-4 border border-green-200">
                    <div className="text-xs text-green-600 mb-1">Distance Saved</div>
                    <div className="text-lg font-bold text-green-700">
                      {routeOptimizerResult.distanceSaved.toFixed(1)} km
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                    <div className="text-xs text-blue-600 mb-1">Time Saved</div>
                    <div className="text-lg font-bold text-blue-700">
                      {Math.round(routeOptimizerResult.timeSaved)} mins
                    </div>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-4 border border-purple-200">
                    <div className="text-xs text-purple-600 mb-1">Improvement</div>
                    <div className="text-lg font-bold text-purple-700">
                      {routeOptimizerResult.percentSaved.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Route Comparison */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-red-700">Original Route</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {routeOptimizerResult.originalRoute.map((stop: any, idx: number) => (
                        <div key={idx} className="text-xs p-2 bg-red-50 rounded border border-red-200">
                          <div className="font-medium">{stop.orderNumber}</div>
                          <div className="text-muted-foreground">{stop.arrivalTime} - {stop.departureTime}</div>
                          <div className="text-muted-foreground truncate">{stop.address}</div>
                          {stop.isRigid && <span className="text-xs text-red-600">🔒 Rigid</span>}
                          {stop.isCoJoin && <span className="text-xs text-orange-600">🔗 Co-join</span>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Total: {routeOptimizerResult.originalTotalDistance.toFixed(1)} km, {Math.round(routeOptimizerResult.originalTotalTime)} mins
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-green-700">Optimized Route</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {routeOptimizerResult.optimizedRoute.map((stop: any, idx: number) => (
                        <div key={idx} className="text-xs p-2 bg-green-50 rounded border border-green-200">
                          <div className="font-medium">{stop.orderNumber}</div>
                          <div className="text-muted-foreground">{stop.arrivalTime} - {stop.departureTime}</div>
                          <div className="text-muted-foreground truncate">{stop.address}</div>
                          {stop.isRigid && <span className="text-xs text-red-600">🔒 Rigid</span>}
                          {stop.isCoJoin && <span className="text-xs text-orange-600">🔗 Co-join</span>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Total: {routeOptimizerResult.optimizedTotalDistance.toFixed(1)} km, {Math.round(routeOptimizerResult.optimizedTotalTime)} mins
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setRouteOptimizerStep("select")}>
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600"
                    onClick={async () => {
                      try {
                        const { applyOptimizedRoute } = await import("@/lib/daily-route-optimizer")
                        await applyOptimizedRoute(routeOptimizerResult)
                        showAlert("Route optimization applied successfully!", { title: "Success" })
                        setShowRouteOptimizerModal(false)
                        // Reload the page to show updated times
                        window.location.reload()
                      } catch (error: any) {
                        showAlert(error.message || "Failed to apply optimization")
                      }
                    }}
                  >
                    Apply Optimization
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Schedule Document Preview (shows after save) */}
      {showScheduleDocument && order.additionalInfo && (
        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-lg print:shadow-none">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Schedule Document
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 bg-transparent">
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
          <div className="p-8">
            {/* Document Header */}
            <div className="mb-8 flex items-start justify-between border-b-4 border-accent pb-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Être Patisserie</h1>
                <p className="text-sm text-muted-foreground">Schedule & Logistics Document</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-bold text-foreground">SCHEDULE</h2>
                <p className="text-lg font-medium text-foreground">{order.orderNumber}</p>
              </div>
            </div>

            {/* Schedule Details */}
            <div
              className={`grid gap-8 ${
                [setupRequired, dismantleRequired, otherAdhocRequired].filter(Boolean).length >= 2 ? "md:grid-cols-2" : ""
              }`}
            >
              {setupRequired && (
              <div>
                <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase">Setup Schedule</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">
                      {formatDate(additionalInfo.confirmedSetupDate || order.eventData.customerPreferredSetupDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule Start:</span>
                    <span className="font-medium">{additionalInfo.scheduleStartTime || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Departure Time:</span>
                    <span className="font-medium">{additionalInfo.departureFromHub || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Travel Duration:</span>
                    <span className="font-medium">{additionalInfo.travelDurationHours}h {additionalInfo.travelDurationMinutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tent Setup:</span>
                    <span className="font-medium">{formatMinutesToTime(additionalInfo.tentSetupTimeCalculated)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer:</span>
                    <span className="font-medium">{formatBufferLabel(additionalInfo.bufferTime)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Total Time:</span>
                    <span className="font-bold">{additionalInfo.totalTaskTimeHours}h {additionalInfo.totalTaskTimeMinutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Est. End:</span>
                    <span className="font-bold">{additionalInfo.estimatedEndTime || "-"}</span>
                  </div>
                </div>
              </div>
              )}

              {dismantleRequired && (
              <div>
                <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase">Dismantle Schedule</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">
                      {formatDate(additionalInfo.confirmedDismantleDate || order.eventData.customerPreferredDismantleDate)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule Start:</span>
                    <span className="font-medium">{additionalInfo.dismantleScheduleStartTime || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Departure Time:</span>
                    <span className="font-medium">{additionalInfo.dismantleDepartureTime || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Travel Duration:</span>
                    <span className="font-medium">{additionalInfo.dismantleTravelHours}h {additionalInfo.dismantleTravelMinutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dismantle Duration:</span>
                    <span className="font-medium">{additionalInfo.dismantleDurationHours}h {additionalInfo.dismantleDurationMinutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer:</span>
                    <span className="font-medium">{formatBufferLabel(additionalInfo.dismantleBufferTime)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Total Time:</span>
                    <span className="font-bold">{additionalInfo.dismantleTotalTimeHours}h {additionalInfo.dismantleTotalTimeMinutes}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Est. End:</span>
                    <span className="font-bold">{additionalInfo.dismantleEstimatedEndTime || "-"}</span>
                  </div>
                </div>
              </div>
              )}

              {otherAdhocRequired && (
                <div>
                  <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase">Other Adhoc Schedule</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date:</span>
                      <span className="font-medium">{formatDate(additionalInfo.confirmedOtherAdhocDate) || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Schedule Start:</span>
                      <span className="font-medium">{additionalInfo.otherAdhocScheduleStartTime || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-medium">{additionalInfo.otherAdhocDurationHours}h {additionalInfo.otherAdhocDurationMinutes}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Buffer:</span>
                      <span className="font-medium">{formatBufferLabel(additionalInfo.otherAdhocBufferTime)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="font-semibold">Total Time:</span>
                      <span className="font-bold">{additionalInfo.otherAdhocTotalTimeHours}h {additionalInfo.otherAdhocTotalTimeMinutes}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Est. End:</span>
                      <span className="font-bold">{additionalInfo.otherAdhocEstimatedEndTime || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lorry:</span>
                      <span className="font-medium">{additionalInfo.otherAdhocLorry || "-"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Items List */}
            <div className="mt-8">
              <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase">Items to Deliver</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-center">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {generatePackingItems(order).map((item, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Delivery Address */}
            <div className="mt-8">
              <h3 className="mb-3 border-b pb-2 text-sm font-semibold uppercase">Delivery Location</h3>
              <p className="text-sm">
                {order.customerData.deliveryAddress}, {order.customerData.deliveryPostCode}, {order.customerData.deliveryState}
              </p>
            </div>

            {/* Footer */}
            <div className="mt-8 border-t pt-4 text-sm text-muted-foreground">
              <p>Scheduled by: {additionalInfo.schedulingPersonnel} | Date: {additionalInfo.schedulingDate} | Time: {additionalInfo.schedulingTime}</p>
            </div>
          </div>

          {/* Bottom action (for long scroll documents) */}
          <div className="flex justify-end gap-3 border-t border-border bg-muted/20 px-6 py-4">
            <Button
              onClick={handleProceedToPacking}
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Package className="h-4 w-4" />
              {nextActionLabel}
            </Button>
          </div>
        </div>
      )}


      {/* Flag Issue Modal */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowFlagModal(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Flag Issue - {order?.orderNumber}
              </h3>
              <button onClick={() => setShowFlagModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Flagged By (Personnel Name) *</Label>
                <Input
                  value={flagData.personnel}
                  onChange={(e) => setFlagData(prev => ({ ...prev, personnel: e.target.value }))}
                  placeholder="Enter your name"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Issue Description *</Label>
                <Textarea
                  value={flagData.issue}
                  onChange={(e) => setFlagData(prev => ({ ...prev, issue: e.target.value }))}
                  placeholder="Describe the issue in detail..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date</Label>
                  <Input
                    type="date"
                    value={flagData.date}
                    onChange={(e) => setFlagData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Time</Label>
                  <Input
                    type="time"
                    value={flagData.time}
                    onChange={(e) => setFlagData(prev => ({ ...prev, time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowFlagModal(false)}
                  className="flex-1 bg-transparent"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleFlagIssue}
                  className="flex-1 gap-2 bg-amber-500 text-white hover:bg-amber-600"
                  disabled={!flagData.personnel || !flagData.issue}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Flag Issue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Schedule Modal */}
      {isMounted && showAIScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAIScheduleModal(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>

            {/* Step 1: Ask about team preference */}
            {aiScheduleStep === "ask" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    AI Schedule Assistant
                  </h3>
                  <button onClick={() => setShowAIScheduleModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <p className="text-muted-foreground mb-6">
                  Do you have any specific team preferences for this order?
                </p>

                <div className="space-y-4 mb-6">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-4"
                    onClick={() => setAITeamPreference(prev => ({ ...prev, hasPreference: true }))}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${aiTeamPreference.hasPreference ? "border-purple-500 bg-purple-500" : "border-muted-foreground"}`}>
                      {aiTeamPreference.hasPreference && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Yes, I have preferences</div>
                      <div className="text-sm text-muted-foreground">Let me specify which team for setup/dismantle</div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-3 h-auto py-4"
                    onClick={() => setAITeamPreference(prev => ({ ...prev, hasPreference: false }))}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${!aiTeamPreference.hasPreference ? "border-purple-500 bg-purple-500" : "border-muted-foreground"}`}>
                      {!aiTeamPreference.hasPreference && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="text-left">
                      <div className="font-medium">No, AI can decide</div>
                      <div className="text-sm text-muted-foreground">Auto-assign available teams</div>
                    </div>
                  </Button>
                </div>

                {/* Team selection if user has preferences */}
                {aiTeamPreference.hasPreference && (
                  <div className="space-y-4 mb-6 p-4 bg-accent/20 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">Setup Team</Label>
                      <Select value={aiTeamPreference.setupTeam} onValueChange={(v) => setAITeamPreference(prev => ({ ...prev, setupTeam: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select team for setup" />
                        </SelectTrigger>
                        <SelectContent>
                          {LORRY_OPTIONS.map((team) => (
                            <SelectItem key={team} value={team}>{getTeamDisplayName(team)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Dismantle Team</Label>
                      <Select value={aiTeamPreference.dismantleTeam} onValueChange={(v) => setAITeamPreference(prev => ({ ...prev, dismantleTeam: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select team for dismantle" />
                        </SelectTrigger>
                        <SelectContent>
                          {LORRY_OPTIONS.map((team) => (
                            <SelectItem key={team} value={team}>{getTeamDisplayName(team)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowAIScheduleModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
                    onClick={() => {
                      setAIScheduleStep("distance")
                      setAIDistanceMapUrl("")
                      setAIDistanceAutoCalculated(false)
                    }}
                  >
                    Next: Enter Distance
                  </Button>
                </div>
              </>
            )}

            {/* Step 2: Distance Input */}
            {aiScheduleStep === "distance" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    Distance & Travel Time
                  </h3>
                  <button onClick={() => setShowAIScheduleModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Hub Address */}
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="text-xs text-purple-600 font-medium mb-1">📍 From (Hub)</div>
                  <div className="text-xs text-muted-foreground">{getAISettings().hubAddress}</div>
                </div>

                {/* Customer Address */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-xs text-blue-600 font-medium mb-1">📍 To (Customer)</div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const parts = [
                        order?.customerData?.deliveryBuildingName,
                        order?.customerData?.deliveryAddressGate,
                        order?.customerData?.deliveryAddress1,
                        order?.customerData?.deliveryAddress2,
                        order?.customerData?.deliveryPostCode,
                        order?.customerData?.deliveryCity,
                        order?.customerData?.deliveryState,
                      ].filter(Boolean)
                      return parts.length > 0
                        ? parts.join(", ")
                        : (order?.customerData?.deliveryAddress || order?.customerData?.billingAddress || "Customer Location")
                    })()}
                  </div>
                </div>

                {/* Auto Calculate Distance Button */}
                <Button
                  variant="outline"
                  className="w-full mb-4 gap-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 hover:from-green-600 hover:to-emerald-600"
                  disabled={aiDistanceLoading}
                  onClick={async () => {
                    setAIDistanceLoading(true)
                    try {
                      const hubAddr = getAISettings().hubAddress
                      const parts = [
                        order?.customerData?.deliveryBuildingName,
                        order?.customerData?.deliveryAddressGate,
                        order?.customerData?.deliveryAddress1,
                        order?.customerData?.deliveryAddress2,
                        order?.customerData?.deliveryPostCode,
                        order?.customerData?.deliveryCity,
                        order?.customerData?.deliveryState,
                      ].filter(Boolean)
                      const custAddr = parts.length > 0 ? parts.join(", ") : (order?.customerData?.deliveryAddress || order?.customerData?.billingAddress || "")

                      const response = await fetch("/api/calculate-distance", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          fromAddress: hubAddr,
                          toAddress: custAddr,
                        }),
                      })
                      const data = await response.json()
                      if (data.success) {
                        setAIDistanceKm(data.distance.km)
                        setAIDistanceMapUrl(data.mapUrl)
                        setAIDistanceAutoCalculated(true)
                      } else {
                        showAlert(data.error || "Could not calculate distance", { title: "Distance Error", actionText: "OK" })
                      }
                    } catch (error) {
                      showAlert("Failed to calculate distance", { title: "Error", actionText: "OK" })
                    } finally {
                      setAIDistanceLoading(false)
                    }
                  }}
                >
                  <MapPin className="h-4 w-4" />
                  {aiDistanceLoading ? "Calculating..." : "Auto Calculate Distance"}
                </Button>

                {/* Map Preview */}
                {aiDistanceMapUrl && (() => {
                  const hubAddr = getAISettings().hubAddress
                  const parts = [
                    order?.customerData?.deliveryBuildingName,
                    order?.customerData?.deliveryAddressGate,
                    order?.customerData?.deliveryAddress1,
                    order?.customerData?.deliveryAddress2,
                    order?.customerData?.deliveryPostCode,
                    order?.customerData?.deliveryCity,
                    order?.customerData?.deliveryState,
                  ].filter(Boolean)
                  const custAddr = parts.length > 0
                    ? parts.join(", ")
                    : (order?.customerData?.deliveryAddress || order?.customerData?.billingAddress || "Customer Location")
                  return (
                    <div className="mb-4 rounded-lg overflow-hidden border border-green-200">
                      <iframe
                        src={getGoogleMapsEmbedDirectionsUrl(hubAddr, custAddr)}
                        className="w-full h-40"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <div className="text-center text-xs text-muted-foreground py-1 bg-muted/50">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => {
                            setEnlargedMapUrl(getGoogleMapsEmbedDirectionsUrl(hubAddr, custAddr))
                            setEnlargedMapInfo({
                              from: hubAddr,
                              to: custAddr,
                              distance: aiDistanceKm,
                            })
                          }}
                        >
                          Open larger
                        </Button>
                      </div>
                    </div>
                  )
                })()}

                {/* Distance Result */}
                <div className="mb-4 p-4 bg-accent/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Distance</Label>
                    <span className="text-lg font-bold text-purple-600">{aiDistanceKm} km</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Travel time calculated at {getAISettings().minutesPerKm} mins/km
                  </p>
                  <p className="text-sm font-medium text-purple-600">
                    Estimated travel time: {Math.floor((aiDistanceKm * getAISettings().minutesPerKm) / 60)}h {Math.round((aiDistanceKm * getAISettings().minutesPerKm) % 60)}m
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!aiDistanceAutoCalculated}
                    onClick={() => setAIScheduleStep("ask")}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600"
                    disabled={!aiDistanceAutoCalculated}
                    onClick={() => {
                      setAIScheduleStep("loading")
                      setAiCoJoinApproved(false)
                      setAiOvertimeApproved(false)
                      // Use the new AI Scheduler from lib/ai-scheduler.ts
                      setTimeout(async () => {
                        if (!order) {
                          setAIScheduleStep("ask")
                          return
                        }

                        const aiSettingsConfig = getAISettings()
                        const appSettingsConfig = getAppSettings()
                        const allOrders = getAllOrders()

                        // Call the new AI Scheduler (async: co-join uses Geoapify distance)
                        let result: NewAIScheduleResult
                        try {
                          result = await runAISchedule({
                            order,
                            allOrders,
                            aiSettings: aiSettingsConfig as AISettings,
                            appSettings: appSettingsConfig as AppSettings,
                            distanceKm: aiDistanceKm,
                            preferredSetupTeam: aiTeamPreference.hasPreference && aiTeamPreference.setupTeam
                              ? aiTeamPreference.setupTeam as TeamName
                              : undefined,
                            preferredDismantleTeam: aiTeamPreference.hasPreference && aiTeamPreference.dismantleTeam
                              ? aiTeamPreference.dismantleTeam as TeamName
                              : undefined,
                            timeWindowMode: (order.customerData.setupTimeWindowMode === "strict" || order.customerData.dismantleTimeWindowMode === "strict") ? "strict" : "flexible",
                          })
                        } catch {
                          setAIScheduleStep("ask")
                          showAlert("AI scheduling failed. Please try again.", { title: "AI Scheduler Error", actionText: "OK" })
                          return
                        }

                        // Build reasoning with co-join and workload info
                        const setupReasoningFinal = [...result.setupReasoning]
                        const dismantleReasoningFinal = [...result.dismantleReasoning]

                        // Add co-join update info to reasoning if applicable
                        if (result.setupCoJoin.applied && result.setupCoJoin.linkedOrderUpdate) {
                          setupReasoningFinal.push(
                            `🔗 CO-JOIN APPLIED: ${result.setupCoJoin.linkedOrderNumber} will change from "Return to Hub" → "Remain on site"`
                          )
                        }
                        if (result.dismantleCoJoin.applied && result.dismantleCoJoin.linkedOrderUpdate) {
                          dismantleReasoningFinal.push(
                            `🔗 CO-JOIN APPLIED: ${result.dismantleCoJoin.linkedOrderNumber} will change from "Return to Hub" → "Remain on site"`
                          )
                        }

                        // Add workload balance info
                        setupReasoningFinal.push(`Workload: ${result.setupTeam} has ${result.setupTeamJobCount} tasks today`)
                        dismantleReasoningFinal.push(`Workload: ${result.dismantleTeam} has ${result.dismantleTeamJobCount} tasks today`)

                        // Add warnings
                        if (result.capacityOverflow.isOverflow) {
                          setupReasoningFinal.push(`⚠️ ${result.capacityOverflow.message}`)
                        }
                        if (result.setupTeamOverloaded) {
                          setupReasoningFinal.push(`⚠️ Team overloaded: ${result.setupTeam} has >4 tasks`)
                        }
                        if (result.dismantleTeamOverloaded) {
                          dismantleReasoningFinal.push(`⚠️ Team overloaded: ${result.dismantleTeam} has >4 tasks`)
                        }
                        if (result.longTravelWarning) {
                          setupReasoningFinal.push(`⚠️ Long travel: ${result.distanceKm}km exceeds 30km`)
                        }

                        setAIScheduleResult({
                          ...result,
                          setupReasoning: setupReasoningFinal,
                          dismantleReasoning: dismantleReasoningFinal,
                        })

                        // OT policy prompt comes first (company wants to avoid OT).
                        if (result.overtimeDecision?.required) {
                          setAIScheduleStep("ot-prompt")
                          return
                        }

                        // Otherwise, if co-join was applied, show co-join prompt.
                        const hasCoJoin = result.setupCoJoin.applied || result.dismantleCoJoin.applied
                        setAIScheduleStep(hasCoJoin ? "co-join-prompt" : "result")
                      }, 1500)
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Schedule
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: Loading */}
            {aiScheduleStep === "loading" && (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 mb-6">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">AI Assistant is working...</h3>
                <p className="text-muted-foreground">Analyzing schedules and finding optimal arrangement</p>
              </div>
            )}

            {/* Step 3a: Overtime (OT) Prompt */}
            {aiScheduleStep === "ot-prompt" && aiScheduleResult && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Overtime (OT) Detected
                  </h3>
                  <button onClick={() => setShowAIScheduleModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-amber-900 mb-2">Company policy: avoid OT by default.</div>
                      <p className="text-sm text-amber-800">
                        {aiScheduleResult.overtimeDecision?.message || `One or more tasks end after ${aiScheduleResult.workEndTime}.`}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                        {aiScheduleResult.setupOvertime && (
                          <div className="rounded border border-amber-200 bg-white/60 p-2">
                            <div className="font-medium text-amber-900">Setup</div>
                            <div className="text-amber-800">Ends at {displayHHmm(aiScheduleResult.setupEndTime)} (work ends {displayHHmm(aiScheduleResult.workEndTime)})</div>
                          </div>
                        )}
                        {aiScheduleResult.dismantleOvertime && (
                          <div className="rounded border border-amber-200 bg-white/60 p-2">
                            <div className="font-medium text-amber-900">Dismantle</div>
                            <div className="text-amber-800">Ends at {displayHHmm(aiScheduleResult.dismantleEndTime)} (work ends {displayHHmm(aiScheduleResult.workEndTime)})</div>
                          </div>
                        )}
                      </div>
                      {aiScheduleResult.overtimeDecision?.recommendation === "deploy-new-team" ? (
                        <div className="mt-3 text-xs text-amber-900">
                          Recommended: deploy another team (avoid OT).
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-amber-900">
                          Note: OT may be unavoidable within the current time window and task duration. AI already tries head/tail co-join first (within radius &amp; waiting threshold).
                        </div>
                      )}
                      <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 p-3">
                        <div className="text-xs font-semibold text-amber-900 mb-2">Impact Comparison</div>
                        {aiScheduleNoCoJoinLoading && (
                          <div className="text-xs text-amber-800">Calculating “Deploy another team” outcome...</div>
                        )}
                        {aiScheduleNoCoJoinError && !aiScheduleNoCoJoinLoading && (
                          <div className="text-xs text-amber-800">{aiScheduleNoCoJoinError}</div>
                        )}
                        {!aiScheduleNoCoJoinLoading && !aiScheduleNoCoJoinError && aiScheduleNoCoJoinResult && (
                          <div className="grid gap-3 sm:grid-cols-2 text-xs">
                            <div className="rounded border border-amber-200 bg-white/80 p-2">
                              <div className="font-medium text-amber-900">Allow OT (current schedule)</div>
                              {aiScheduleResult.setupEndTime && (
                                <div className="text-amber-800">
                                  Setup ends {displayHHmm(aiScheduleResult.setupEndTime)} {aiScheduleResult.setupOvertime ? "(OT)" : "(No OT)"}
                                </div>
                              )}
                              {aiScheduleResult.dismantleEndTime && (
                                <div className="text-amber-800">
                                  Dismantle ends {displayHHmm(aiScheduleResult.dismantleEndTime)} {aiScheduleResult.dismantleOvertime ? "(OT)" : "(No OT)"}
                                </div>
                              )}
                            </div>
                            <div className="rounded border border-amber-200 bg-white/80 p-2">
                              <div className="font-medium text-amber-900">Deploy Another Team (no co-join)</div>
                              {aiScheduleNoCoJoinResult.setupEndTime && (
                                <div className="text-amber-800">
                                  Setup ends {displayHHmm(aiScheduleNoCoJoinResult.setupEndTime)} {aiScheduleNoCoJoinResult.setupOvertime ? "(OT)" : "(No OT)"}
                                </div>
                              )}
                              {aiScheduleNoCoJoinResult.dismantleEndTime && (
                                <div className="text-amber-800">
                                  Dismantle ends {displayHHmm(aiScheduleNoCoJoinResult.dismantleEndTime)} {aiScheduleNoCoJoinResult.dismantleOvertime ? "(OT)" : "(No OT)"}
                                </div>
                              )}
                              {aiScheduleNoCoJoinResult.overtimeDecision?.required && (
                                <div className="mt-1 text-amber-800">OT still required without co-join.</div>
                              )}
                              {!aiScheduleNoCoJoinResult.overtimeDecision?.required && (
                                <div className="mt-1 text-amber-800">OT avoided by disabling co-join.</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                    onClick={() => {
                      setAiOvertimeApproved(true)
                      const hasCoJoin = aiScheduleResult.setupCoJoin.applied || aiScheduleResult.dismantleCoJoin.applied
                      setAIScheduleStep(hasCoJoin ? "co-join-prompt" : "result")
                    }}
                  >
                    Allow OT â€” continue with this schedule
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      if (!order) return
                      setAiOvertimeApproved(false)
                      setAiCoJoinApproved(false)
                      setAIScheduleStep("loading")

                      const excluded: TeamName[] = []
                      if (aiScheduleResult.setupCoJoin?.applied && aiScheduleResult.setupCoJoin?.team) excluded.push(aiScheduleResult.setupCoJoin.team)
                      if (aiScheduleResult.dismantleCoJoin?.applied && aiScheduleResult.dismantleCoJoin?.team) excluded.push(aiScheduleResult.dismantleCoJoin.team)

                      try {
                        const aiSettingsConfig = getAISettings()
                        const appSettingsConfig = getAppSettings()
                        const allOrders = getAllOrders()
                        const result = await runAISchedule({
                          order,
                          allOrders,
                          aiSettings: aiSettingsConfig as AISettings,
                          appSettings: appSettingsConfig as AppSettings,
                          distanceKm: aiDistanceKm,
                          allowCoJoin: false,
                          excludedTeams: excluded,
                          preferredSetupTeam: aiTeamPreference.hasPreference && aiTeamPreference.setupTeam
                            ? aiTeamPreference.setupTeam as TeamName
                            : undefined,
                          preferredDismantleTeam: aiTeamPreference.hasPreference && aiTeamPreference.dismantleTeam
                            ? aiTeamPreference.dismantleTeam as TeamName
                            : undefined,
                          timeWindowMode: aiTimeWindowMode || "flexible",
                        })
                        setAIScheduleResult(result)
                        // After "Deploy another team", if OT still required, it's unavoidable (not caused by co-join).
                        // Proceed to result with OT accepted, don't loop back to OT prompt.
                        if (result.overtimeDecision?.required) {
                          showAlert(
                            `OT is still required even after deploying another team. To avoid OT, adjust the date/time window; otherwise choose "Allow OT".`,
                            { title: "OT Still Required", actionText: "OK" }
                          )
                          setAiOvertimeApproved(true)
                          setAIScheduleStep("result")
                        } else {
                          setAIScheduleStep("result")
                        }
                      } catch {
                        setAIScheduleStep("ask")
                        showAlert("AI scheduling failed. Please try again.", { title: "AI Scheduler Error", actionText: "OK" })
                      }
                    }}
                  >
                    Deploy another team (try avoid OT)
                  </Button>
                </div>
              </>
            )}

            {/* Step 3b: Co-Join Prompt */}
            {aiScheduleStep === "co-join-prompt" && aiScheduleResult && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Link2 className="h-5 w-5 text-green-500" />
                    Co-Join Detected!
                  </h3>
                  <button onClick={() => setShowAIScheduleModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Co-Join Explanation */}
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <Link2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-green-800 mb-2">AI has detected a Co-Join opportunity!</div>
                      <p className="text-sm text-green-700 mb-3">
                        Co-Join chains nearby jobs together without returning to hub, saving travel time and fuel.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Setup Co-Join Details */}
                {aiScheduleResult.setupCoJoin.applied && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Truck className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-800">Setup: {aiScheduleResult.setupCoJoin.type?.toUpperCase()} Co-Join</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-blue-700">
                          <strong>Linked Order:</strong> {aiScheduleResult.setupCoJoin.linkedOrderNumber}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-blue-700">
                          <strong>Team:</strong> {aiScheduleResult.setupTeam} (same team continues)
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span className="text-blue-700">
                          <strong>Distance:</strong> {aiScheduleResult.setupCoJoin.distanceKm?.toFixed(1) || "~"}km between sites
                        </span>
                      </div>
                      {aiScheduleResult.setupCoJoin.waitingMins != null && (
                        <div className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="text-blue-700">
                            <strong>Waiting Time:</strong> {Math.floor(aiScheduleResult.setupCoJoin.waitingMins / 60)}h {aiScheduleResult.setupCoJoin.waitingMins % 60}m
                          </span>
                        </div>
                      )}
                      {aiScheduleResult.setupCoJoin.linkedOrderUpdate && (
                        <div className="mt-3 p-2 bg-blue-100 rounded text-blue-800 text-xs">
                          <strong>What happens:</strong> {aiScheduleResult.setupCoJoin.linkedOrderNumber} will change from <span className="line-through">Return to Hub</span> → <strong>Remain on site / Proceed to next job</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Dismantle Co-Join Details */}
                {aiScheduleResult.dismantleCoJoin.applied && (
                  <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <Package className="h-5 w-5 text-orange-600" />
                      <span className="font-semibold text-orange-800">Dismantle: {aiScheduleResult.dismantleCoJoin.type?.toUpperCase()} Co-Join</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span className="text-orange-700">
                          <strong>Linked Order:</strong> {aiScheduleResult.dismantleCoJoin.linkedOrderNumber}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span className="text-orange-700">
                          <strong>Team:</strong> {aiScheduleResult.dismantleTeam} (same team continues)
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span className="text-orange-700">
                          <strong>Distance:</strong> {aiScheduleResult.dismantleCoJoin.distanceKm?.toFixed(1) || "~"}km between sites
                        </span>
                      </div>
                      {aiScheduleResult.dismantleCoJoin.waitingMins != null && (
                        <div className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span className="text-orange-700">
                            <strong>Waiting Time:</strong> {Math.floor(aiScheduleResult.dismantleCoJoin.waitingMins / 60)}h {aiScheduleResult.dismantleCoJoin.waitingMins % 60}m
                          </span>
                        </div>
                      )}
                      {aiScheduleResult.dismantleCoJoin.linkedOrderUpdate && (
                        <div className="mt-3 p-2 bg-orange-100 rounded text-orange-800 text-xs">
                          <strong>What happens:</strong> {aiScheduleResult.dismantleCoJoin.linkedOrderNumber} will change from <span className="line-through">Return to Hub</span> → <strong>Remain on site / Proceed to next job</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Continue Button */}
                <div className="mt-6">
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600"
                      onClick={() => {
                        setAiCoJoinApproved(true)
                        setAIScheduleStep("result")
                      }}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Yes, use Co-Join
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        if (!order) return
                        setAiCoJoinApproved(false)
                        setAIScheduleStep("loading")

                        const excluded: TeamName[] = []
                        if (aiScheduleResult.setupCoJoin?.applied && aiScheduleResult.setupCoJoin?.team) excluded.push(aiScheduleResult.setupCoJoin.team)
                        if (aiScheduleResult.dismantleCoJoin?.applied && aiScheduleResult.dismantleCoJoin?.team) excluded.push(aiScheduleResult.dismantleCoJoin.team)

                        try {
                          const aiSettingsConfig = getAISettings()
                          const appSettingsConfig = getAppSettings()
                          const allOrders = getAllOrders()
                          const result = await runAISchedule({
                            order,
                            allOrders,
                            aiSettings: aiSettingsConfig as AISettings,
                            appSettings: appSettingsConfig as AppSettings,
                            distanceKm: aiDistanceKm,
                            allowCoJoin: false,
                            excludedTeams: excluded,
                            preferredSetupTeam: aiTeamPreference.hasPreference && aiTeamPreference.setupTeam
                              ? aiTeamPreference.setupTeam as TeamName
                              : undefined,
                            preferredDismantleTeam: aiTeamPreference.hasPreference && aiTeamPreference.dismantleTeam
                              ? aiTeamPreference.dismantleTeam as TeamName
                              : undefined,
                            timeWindowMode: (order.customerData.setupTimeWindowMode === "strict" || order.customerData.dismantleTimeWindowMode === "strict") ? "strict" : "flexible",
                          })
                          setAIScheduleResult(result)
                          setAIScheduleStep(result.overtimeDecision?.required ? "ot-prompt" : "result")
                        } catch {
                          setAIScheduleStep("ask")
                          showAlert("AI scheduling failed. Please try again.", { title: "AI Scheduler Error", actionText: "OK" })
                        }
                      }}
                    >
                      No Co-Join — assign another team (AI)
                    </Button>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setAiCoJoinApproved(false)
                          setShowAIScheduleModal(false)
                        }}
                      >
                        Manual schedule
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setAiCoJoinApproved(false)
                          setShowAIScheduleModal(false)
                          openFlagModal()
                        }}
                      >
                        Raise flag
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Step 4: Results */}
            {aiScheduleStep === "result" && aiScheduleResult && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    AI Schedule Complete
                  </h3>
                  <button onClick={() => setShowAIScheduleModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Schedule Results */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {/* Setup */}
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-sm font-medium text-blue-600 mb-3">Setup Schedule</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{formatDateToDMY(aiScheduleResult.setupDate)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Team:</span> <span className="font-medium">{aiScheduleResult.setupTeam}</span></div>
                      <hr className="my-2 border-blue-200" />
                      <div className="flex justify-between"><span className="text-muted-foreground">Depart Hub:</span> <span className="font-medium">{displayHHmm(aiScheduleResult.setupDepartureTime)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Travel Time:</span> <span className="font-medium">{aiScheduleResult.setupTravelTimeHours}h {aiScheduleResult.setupTravelTimeMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Arrival:</span> <span className="font-medium text-blue-700">{displayHHmm(aiScheduleResult.setupArrivalTime)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Setup Duration:</span> <span className="font-medium">{aiScheduleResult.setupDurationMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Buffer:</span> <span className="font-medium">{aiScheduleResult.setupBufferMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">End Time:</span> <span className="font-medium">{displayHHmm(aiScheduleResult.setupEndTime)}</span></div>
                    </div>
                  </div>

                  {/* Dismantle */}
                  <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                    <div className="text-sm font-medium text-orange-600 mb-3">Dismantle Schedule</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Date:</span> <span className="font-medium">{formatDateToDMY(aiScheduleResult.dismantleDate)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Team:</span> <span className="font-medium">{aiScheduleResult.dismantleTeam}</span></div>
                      <hr className="my-2 border-orange-200" />
                      <div className="flex justify-between"><span className="text-muted-foreground">Depart Hub:</span> <span className="font-medium">{displayHHmm(aiScheduleResult.dismantleDepartureTime)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Travel Time:</span> <span className="font-medium">{aiScheduleResult.dismantleTravelTimeHours}h {aiScheduleResult.dismantleTravelTimeMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Arrival:</span> <span className="font-medium text-orange-700">{displayHHmm(aiScheduleResult.dismantleArrivalTime)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Dismantle Duration:</span> <span className="font-medium">{aiScheduleResult.dismantleDurationMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Buffer:</span> <span className="font-medium">{aiScheduleResult.dismantleBufferMins}m</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">End Time:</span> <span className="font-medium">{displayHHmm(aiScheduleResult.dismantleEndTime)}</span></div>
                    </div>
                  </div>
                </div>

                {/* Destination Info */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                  <div className="text-xs text-muted-foreground mb-1">Destination Address</div>
                  <div className="text-sm font-medium">{aiScheduleResult.setupDestination}</div>
                </div>

                {/* Validation Checks */}
                <div className="space-y-3 mb-6 p-4 bg-accent/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${aiScheduleResult.noOverlap ? "bg-green-500" : "bg-red-500"}`}>
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm">No overlapped team on other projects</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${aiScheduleResult.withinPreferred ? "bg-green-500" : "bg-amber-500"}`}>
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm">Schedule within customer preferred time</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => {
                    setAIScheduleStep("ask")
                    setAIScheduleResult(null)
                  }}>
                    Regenerate
                  </Button>
                  <Button
                    className="flex-1 bg-green-500 text-white hover:bg-green-600"
                    onClick={() => {
                      if (aiScheduleResult) {
                        const hasCoJoin = aiScheduleResult.setupCoJoin?.applied || aiScheduleResult.dismantleCoJoin?.applied
                        if (hasCoJoin && !aiCoJoinApproved) {
                          showAlert("Please confirm whether to use Co-Join first.", { title: "Co-Join Confirmation Required", actionText: "OK" })
                          return
                        }

                        // Fill in Setup confirmed date/time display inputs
                        setConfirmedSetupDateInput(formatDateToDMY(aiScheduleResult.setupDate))
                        setArrivalTime(aiScheduleResult.setupArrivalTime)

                        // Fill in Dismantle confirmed date/time display inputs
                        setConfirmedDismantleDateInput(formatDateToDMY(aiScheduleResult.dismantleDate))
                        setDismantleArrivalTime(aiScheduleResult.dismantleArrivalTime)

                        // Fill in ALL Additional Info fields with correct field names
                        const aiSettingsForApply = getAISettings()
                        const setupIsTailCoJoin = aiScheduleResult.setupCoJoin?.applied && aiScheduleResult.setupCoJoin?.type === "tail"
                        const dismantleIsTailCoJoin = aiScheduleResult.dismantleCoJoin?.applied && aiScheduleResult.dismantleCoJoin?.type === "tail"

                        setAdditionalInfo(prev => ({
                          ...prev,
                          // Setup confirmed date/time (arrival time is the confirmed time)
                          confirmedSetupDate: aiScheduleResult.setupDate,
                          confirmedSetupTime: aiScheduleResult.setupArrivalTime,
                          // Setup driver departure fields
                          setupDepartureFromType: setupIsTailCoJoin ? "other" : "hub",
                          setupDepartureAddress: setupIsTailCoJoin ? (aiScheduleResult.setupCoJoin.linkedOrderSite || "") : aiSettingsForApply.hubAddress,
                          setupDestinationAddress: aiScheduleResult.setupDestination,
                          setupDistanceKm: setupIsTailCoJoin ? (aiScheduleResult.setupCoJoin.distanceKm || 0) : aiScheduleResult.distanceKm,
                          departureFromHub: setupIsTailCoJoin
                            ? (aiScheduleResult.setupCoJoin.adjustedDepartureTime || aiScheduleResult.setupDepartureTime)
                            : aiScheduleResult.setupDepartureTime,
                          travelDurationHours: setupIsTailCoJoin
                            ? Math.floor(((aiScheduleResult.setupCoJoin.travelMins || 0) as number) / 60)
                            : aiScheduleResult.setupTravelTimeHours,
                          travelDurationMinutes: setupIsTailCoJoin
                            ? (((aiScheduleResult.setupCoJoin.travelMins || 0) as number) % 60)
                            : aiScheduleResult.setupTravelTimeMins,
                          // Setup task fields
                          scheduleStartTime: aiScheduleResult.setupArrivalTime, // Start time = arrival time
                          setupLorry: aiScheduleResult.setupTeam as "Team A" | "Team B" | "Team C" | "Team D" | "Team E" | "",
                          bufferTime: aiScheduleResult.setupBufferMins.toString(),
                          setupDurationHours: Math.floor(aiScheduleResult.setupDurationMins / 60),
                          setupDurationMinutes: aiScheduleResult.setupDurationMins % 60,
                          // Dismantle confirmed date/time (arrival time is the confirmed time)
                          confirmedDismantleDate: aiScheduleResult.dismantleDate,
                          confirmedDismantleTime: aiScheduleResult.dismantleArrivalTime,
                          // Dismantle driver departure fields
                          dismantleDepartureFromType: dismantleIsTailCoJoin ? "other" : "hub",
                          dismantleDepartureAddress: dismantleIsTailCoJoin ? (aiScheduleResult.dismantleCoJoin.linkedOrderSite || "") : aiSettingsForApply.hubAddress,
                          dismantleDestinationAddress: aiScheduleResult.dismantleDestination,
                          dismantleDistanceKm: dismantleIsTailCoJoin ? (aiScheduleResult.dismantleCoJoin.distanceKm || 0) : aiScheduleResult.distanceKm,
                          dismantleDepartureTime: dismantleIsTailCoJoin
                            ? (aiScheduleResult.dismantleCoJoin.adjustedDepartureTime || aiScheduleResult.dismantleDepartureTime)
                            : aiScheduleResult.dismantleDepartureTime,
                          dismantleTravelHours: dismantleIsTailCoJoin
                            ? Math.floor(((aiScheduleResult.dismantleCoJoin.travelMins || 0) as number) / 60)
                            : aiScheduleResult.dismantleTravelTimeHours,
                          dismantleTravelMinutes: dismantleIsTailCoJoin
                            ? (((aiScheduleResult.dismantleCoJoin.travelMins || 0) as number) % 60)
                            : aiScheduleResult.dismantleTravelTimeMins,
                          // Dismantle task fields
                          dismantleScheduleStartTime: aiScheduleResult.dismantleArrivalTime, // Start time = arrival time
                          dismantleLorry: aiScheduleResult.dismantleTeam as "Team A" | "Team B" | "Team C" | "Team D" | "Team E" | "",
                          dismantleBufferTime: aiScheduleResult.dismantleBufferMins.toString(),
                          dismantleDurationHours: Math.floor(aiScheduleResult.dismantleDurationMins / 60),
                          dismantleDurationMinutes: aiScheduleResult.dismantleDurationMins % 60,
                        }))

                        // Mark as AI scheduled
                        setAIScheduleApplied(true)

                        // Apply co-join updates to linked orders (change "Return to Hub" → "Remain on site")
                        if (aiCoJoinApproved && aiScheduleResult.setupCoJoin?.applied && aiScheduleResult.setupCoJoin?.linkedOrderUpdate) {
                          applyCoJoinUpdate(aiScheduleResult.setupCoJoin)
                        }
                        if (aiCoJoinApproved && aiScheduleResult.dismantleCoJoin?.applied && aiScheduleResult.dismantleCoJoin?.linkedOrderUpdate) {
                          applyCoJoinUpdate(aiScheduleResult.dismantleCoJoin)
                        }
                      }
                      setShowAIScheduleModal(false)

                      // Show message about co-join if applied
                      const coJoinMsg = (aiScheduleResult?.setupCoJoin?.applied || aiScheduleResult?.dismantleCoJoin?.applied)
                        ? "\n\nCo-join applied: Linked order(s) updated from 'Return to Hub' to 'Remain on site'."
                        : ""
                      showAlert(`The AI-generated schedule has been applied. You can still edit the values before confirming.${coJoinMsg}`, { title: "AI Schedule Applied", actionText: "OK" })
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Apply Schedule
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* AI Report Modal */}
      {isMounted && showAIReport && aiScheduleResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAIReport(false)}>
          <div className="mx-4 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-card pb-2 -mt-2 pt-2 z-10">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                AI Schedule Report
              </h3>
              <button onClick={() => setShowAIReport(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Order Info */}
            <div className="mb-6 p-4 bg-accent/20 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">Order</div>
              <div className="font-semibold text-lg">{order?.orderNumber}</div>
              <div className="text-sm text-muted-foreground">{order?.customerData.customerName}</div>
              <div className="text-xs text-muted-foreground mt-1">Location: {aiScheduleResult.setupDestination}</div>
            </div>

            {/* Hub Info */}
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-xs text-purple-600 font-medium mb-1">Departure Hub</div>
              <div className="text-xs text-muted-foreground">{aiScheduleResult.hubAddress}</div>
            </div>

            {/* Working Hours */}
            <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs font-medium text-slate-700 mb-1">Working Hours</div>
              <div className="text-xs text-muted-foreground">
                Work ends: <span className="font-medium text-foreground">{aiScheduleResult.workEndTime}</span> • Lunch:{" "}
                <span className="font-medium text-foreground">{aiScheduleResult.lunchStartTime}-{aiScheduleResult.lunchEndTime}</span>
              </div>
            </div>

            {/* Schedule Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Setup */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                    <Truck className="h-4 w-4 text-white" />
                  </div>
                  <div className="font-semibold text-blue-700">Setup</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">{formatDateToDMY(aiScheduleResult.setupDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team:</span>
                    <span className="font-medium">{aiScheduleResult.setupTeam}</span>
                  </div>
                  <hr className="my-2 border-blue-200" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Depart Hub:</span>
                    <span className="font-medium">{displayHHmm(aiScheduleResult.setupDepartureTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Travel Time:</span>
                    <span className="font-medium">{aiScheduleResult.setupTravelTimeHours}h {aiScheduleResult.setupTravelTimeMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arrival:</span>
                    <span className="font-medium text-blue-700">{displayHHmm(aiScheduleResult.setupArrivalTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Setup Duration:</span>
                    <span className="font-medium">{aiScheduleResult.setupDurationMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer:</span>
                    <span className="font-medium">{aiScheduleResult.setupBufferMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Time:</span>
                    <span className="font-medium">{displayHHmm(aiScheduleResult.setupEndTime)}</span>
                  </div>
                  {aiScheduleResult.setupHubArrivalTime && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Return Hub (est):</span>
                      <span className="font-medium">{displayHHmm(aiScheduleResult.setupHubArrivalTime)}</span>
                    </div>
                  )}
                  {aiScheduleResult.setupLunchSuggestion && (
                    <div className="pt-2 text-xs text-muted-foreground">
                      Lunch suggested:{" "}
                      <span className="font-medium text-foreground">
                        {aiScheduleResult.setupLunchSuggestion.start}-{aiScheduleResult.setupLunchSuggestion.end}
                      </span>
                    </div>
                  )}
                  {aiScheduleResult.setupOvertime && (
                    <div className="pt-1 text-xs text-amber-700">
                      Ends after {aiScheduleResult.workEndTime} → treat as last task (return to hub)
                    </div>
                  )}
                  <hr className="my-2 border-blue-200" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer Preferred:</span>
                    <span className="font-medium text-xs">{order?.customerData?.setupTimeSlot || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Dismantle */}
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                    <Package className="h-4 w-4 text-white" />
                  </div>
                  <div className="font-semibold text-orange-700">Dismantle</div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">{formatDateToDMY(aiScheduleResult.dismantleDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Team:</span>
                    <span className="font-medium">{aiScheduleResult.dismantleTeam}</span>
                  </div>
                  <hr className="my-2 border-orange-200" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Depart Hub:</span>
                    <span className="font-medium">{displayHHmm(aiScheduleResult.dismantleDepartureTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Travel Time:</span>
                    <span className="font-medium">{aiScheduleResult.dismantleTravelTimeHours}h {aiScheduleResult.dismantleTravelTimeMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arrival:</span>
                    <span className="font-medium text-orange-700">{displayHHmm(aiScheduleResult.dismantleArrivalTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dismantle Duration:</span>
                    <span className="font-medium">{aiScheduleResult.dismantleDurationMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buffer:</span>
                    <span className="font-medium">{aiScheduleResult.dismantleBufferMins}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">End Time:</span>
                    <span className="font-medium">{displayHHmm(aiScheduleResult.dismantleEndTime)}</span>
                  </div>
                  {aiScheduleResult.dismantleHubArrivalTime && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Return Hub (est):</span>
                      <span className="font-medium">{displayHHmm(aiScheduleResult.dismantleHubArrivalTime)}</span>
                    </div>
                  )}
                  {aiScheduleResult.dismantleLunchSuggestion && (
                    <div className="pt-2 text-xs text-muted-foreground">
                      Lunch suggested:{" "}
                      <span className="font-medium text-foreground">
                        {aiScheduleResult.dismantleLunchSuggestion.start}-{aiScheduleResult.dismantleLunchSuggestion.end}
                      </span>
                    </div>
                  )}
                  {aiScheduleResult.dismantleOvertime && (
                    <div className="pt-1 text-xs text-amber-700">
                      Ends after {aiScheduleResult.workEndTime} → treat as last task (return to hub)
                    </div>
                  )}
                  <hr className="my-2 border-orange-200" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer Preferred:</span>
                    <span className="font-medium text-xs">{order?.customerData?.dismantleTimeSlot || "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reasoning */}
            {(aiScheduleResult.setupReasoning?.length || aiScheduleResult.dismantleReasoning?.length) && (
              <div className="mb-6 space-y-3">
                <div className="text-sm font-medium">AI Reasoning</div>
                {aiScheduleResult.setupReasoning?.length ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="text-xs font-semibold text-blue-700 mb-2">Setup</div>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                      {aiScheduleResult.setupReasoning.map((r, idx) => (
                        <li key={`setup-r-${idx}`}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {aiScheduleResult.dismantleReasoning?.length ? (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <div className="text-xs font-semibold text-orange-700 mb-2">Dismantle</div>
                    <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                      {aiScheduleResult.dismantleReasoning.map((r, idx) => (
                        <li key={`dismantle-r-${idx}`}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}

            {/* Validation Summary */}
            <div className="mb-6">
              <div className="text-sm font-medium mb-3">AI Validation Checks</div>
              <div className="space-y-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${aiScheduleResult.noOverlap ? "bg-green-500" : "bg-red-500"}`}>
                    <Check className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">No Team Overlap</div>
                    <div className="text-xs text-muted-foreground">
                      {aiScheduleResult.noOverlap
                        ? "Teams are not double-booked on other projects"
                        : `Conflict found. Setup: ${aiScheduleResult.setupConflictWith || "-"}; Dismantle: ${aiScheduleResult.dismantleConflictWith || "-"}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${aiScheduleResult.withinPreferred ? "bg-green-500" : "bg-amber-500"}`}>
                    <Check className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Within Customer Preferred Time</div>
                    <div className="text-xs text-muted-foreground">Schedule matches customer's requested time slots</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAIReport(false)
                  setAIScheduleApplied(false)
                  setShowAIScheduleModal(true)
                  setAIScheduleStep("ask")
                }}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Re-run AI Schedule
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowAIReport(false)}
              >
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Map Modal */}
      {isMounted && enlargedMapUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => {
            setEnlargedMapUrl(null)
            setEnlargedMapInfo(null)
          }}
        >
          <div
            className="mx-4 w-full max-w-4xl rounded-lg border border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Route Map</h3>
              <button
                onClick={() => {
                  setEnlargedMapUrl(null)
                  setEnlargedMapInfo(null)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {enlargedMapInfo && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">From:</div>
                    <div className="font-medium">{enlargedMapInfo.from}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">To:</div>
                    <div className="font-medium">{enlargedMapInfo.to}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Distance:</div>
                    <div className="font-bold text-lg text-green-600">{enlargedMapInfo.distance} km</div>
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe
                src={enlargedMapUrl}
                className="w-full h-[60vh] bg-muted"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Zoom and pan directly in the map above. Use "Open in Google Maps" for full navigation.
            </p>
            <div className="mt-4 flex justify-between gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (enlargedMapInfo) {
                    // Open Google Maps with directions
                    const origin = encodeURIComponent(enlargedMapInfo.from)
                    const destination = encodeURIComponent(enlargedMapInfo.to)
                    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
                    window.open(googleMapsUrl, "_blank")
                  }
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open in Google Maps
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEnlargedMapUrl(null)
                  setEnlargedMapInfo(null)
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        description={alertState.description}
        actionText={alertState.actionText}
        onClose={closeAlert}
      />
    </div>
  )
}
