"use client"

import React, { useState, useEffect, Suspense, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Search,
  BarChart3,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  Package,
  Boxes,
  Wrench,
  Truck,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SalesOrder, OrderStatus } from "@/lib/types"
import { useSearchParams } from "next/navigation"
import Loading from "./loading"
import FullCalendar from "@fullcalendar/react"
import timeGridPlugin from "@fullcalendar/timegrid"
import { deleteOrderByNumber, getAllOrders } from "@/lib/order-storage"
import { getLunchWindowFromLocalStorage, getWorkWindowFromLocalStorage, overlapsMinutesWindow, parseHHMMToMinutes } from "@/lib/time-window"

const getLorryCode = (lorry: string) => {
  const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
  return match ? match[1].toUpperCase() : ""
}

const normalizeTeamLabel = (lorry: string) => {
  if (!lorry) return ""
  const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
  return match ? `Team ${match[1].toUpperCase()}` : lorry
}

const getLorryClass = (lorry: string) => {
  const code = getLorryCode(lorry)
  return code ? `lorry-${code.toLowerCase()}` : ""
}

const SALES_FLOW_PHASES = [
  { key: "quotation", label: "Quotation", icon: FileText, href: "/portal/sales-order" },
  { key: "sales-confirmation", label: "Sales Confirmation", icon: Clock, href: "/portal/sales-confirmation" },
  { key: "planning", label: "Planning", icon: Package, href: "/portal/planning" },
  { key: "procurement", label: "Procurement", icon: Boxes, href: "/portal/procurement" },
  { key: "delivery-setup", label: "Delivery (Setup)", icon: Wrench, href: "/portal/setting-up" },
  { key: "delivery-dismantle", label: "Delivery (Dismantle)", icon: Truck, href: "/portal/dismantle" },
  { key: "invoice", label: "Invoice", icon: CheckCircle, href: "/portal/invoice" },
]

const ADHOC_FLOW_PHASES = [
  { key: "quotation", label: "Quotation", icon: FileText, href: "/portal/ad-hoc" },
  { key: "sales-confirmation", label: "Sales Confirmation", icon: Clock, href: "/portal/sales-confirmation" },
  { key: "planning", label: "Planning", icon: Package, href: "/portal/planning" },
  { key: "procurement", label: "Procurement", icon: Boxes, href: "/portal/procurement" },
  { key: "delivery-setup", label: "Delivery (Setup)", icon: Wrench, href: "/portal/setting-up" },
  { key: "delivery-dismantle", label: "Delivery (Dismantle)", icon: Truck, href: "/portal/dismantle" },
  { key: "invoice", label: "Invoice", icon: CheckCircle, href: "/portal/invoice" },
]

export default function StatusTrackingPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [appliedDateFrom, setAppliedDateFrom] = useState("")
  const [appliedDateTo, setAppliedDateTo] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [calendarFrom, setCalendarFrom] = useState("")
  const [calendarTo, setCalendarTo] = useState("")
  const [appliedCalendarFrom, setAppliedCalendarFrom] = useState("")
  const [appliedCalendarTo, setAppliedCalendarTo] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [selectedLorryClasses, setSelectedLorryClasses] = useState<string[]>([])
  const searchParams = useSearchParams()
  const calendarRef = useRef<FullCalendar>(null)

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = () => {
    const allOrders = getAllOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
    const activeOrders = allOrders.filter(o => o.status !== "cancelled" && o.status !== "draft")
    setOrders(activeOrders)
    setIsLoading(false)
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "asc" ? "desc" : "asc")
  }

  const applyDateRange = () => {
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
  }

  const showAllOrders = () => {
    setDateFrom("")
    setDateTo("")
    setAppliedDateFrom("")
    setAppliedDateTo("")
  }

  const clearDateRange = () => {
    setDateFrom("")
    setDateTo("")
  }

  const handleDeleteOrder = (orderNumber: string) => {
    if (!confirm(`Are you sure you want to delete order ${orderNumber}? This action cannot be undone.`)) {
      return
    }

    deleteOrderByNumber(orderNumber)
    loadOrders()
    setSelectedOrder(null)
  }

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(order => {
      // Search filter
      const matchesSearch = searchTerm === "" ||
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerData.customerName?.toLowerCase().includes(searchTerm.toLowerCase())

      // Date filter - use appliedDateFrom and appliedDateTo
      let matchesDate = true
      if (appliedDateFrom) {
        matchesDate = matchesDate && new Date(order.eventData.eventDate) >= new Date(appliedDateFrom)
      }
      if (appliedDateTo) {
        matchesDate = matchesDate && new Date(order.eventData.eventDate) <= new Date(appliedDateTo)
      }

      return matchesSearch && matchesDate
    })

    // Sort by event date
    filtered.sort((a, b) => {
      const dateA = new Date(a.eventData.eventDate).getTime()
      const dateB = new Date(b.eventData.eventDate).getTime()
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA
    })

    return filtered
  }, [orders, searchTerm, appliedDateFrom, appliedDateTo, sortOrder])

  const salesOrders = useMemo(() => {
    return filteredOrders.filter(order => order.orderSource !== "ad-hoc")
  }, [filteredOrders])

  const adHocOrders = useMemo(() => {
    return filteredOrders.filter(order => order.orderSource === "ad-hoc")
  }, [filteredOrders])

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const formatTimeRange = (start: Date, end: Date) => {
    const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
    return `${hhmm(start)}-${hhmm(end)}`
  }

  const isNonWorkingSlot = (date: Date) => {
    const { workStartTime, workEndTime } = getWorkWindowFromLocalStorage()
    const workStartMins = parseHHMMToMinutes(workStartTime)
    const workEndMins = parseHHMMToMinutes(workEndTime)
    if (workStartMins === null || workEndMins === null || workEndMins <= workStartMins) return false
    const mins = date.getHours() * 60 + date.getMinutes()
    return mins < workStartMins || mins >= workEndMins
  }

  const parseLocalDate = (ymd: string) => new Date(`${ymd}T00:00:00`)
  const endOfLocalDate = (ymd: string) => {
    const d = parseLocalDate(ymd)
    d.setHours(23, 59, 59, 999)
    return d
  }
  const addDays = (ymd: string, days: number) => {
    const d = parseLocalDate(ymd)
    d.setDate(d.getDate() + days)
    return d
  }

  const applyCalendarRange = () => {
    setAppliedCalendarFrom(calendarFrom)
    setAppliedCalendarTo(calendarTo)

    if (calendarFrom) {
      calendarRef.current?.getApi().gotoDate(calendarFrom)
    }
  }

  const clearCalendarRange = () => {
    setCalendarFrom("")
    setCalendarTo("")
    setAppliedCalendarFrom("")
    setAppliedCalendarTo("")
  }

  const calendarEvents = useMemo(() => {
    const events: Array<{
      id: string
      title: string
      start: Date
      end: Date
      classNames: string[]
      extendedProps: {
        orderNumber: string
        phase: string
        lorry?: string
        lorryCode?: string
        lorryClass?: string
        customerLabel: string
        address1: string
        orderSource: "sales" | "ad-hoc"
      }
    } | any> = []

    const { lunchStartTime, lunchEndTime } = getLunchWindowFromLocalStorage()
    const lunchStartMins = parseHHMMToMinutes(lunchStartTime)
    const lunchEndMins = parseHHMMToMinutes(lunchEndTime)

    const taskOverlapsLunch = (start: Date, end: Date) => {
      if (lunchStartMins === null || lunchEndMins === null) return false
      const sM = start.getHours() * 60 + start.getMinutes()
      const eM = end.getHours() * 60 + end.getMinutes()
      return overlapsMinutesWindow(sM, eM, lunchStartMins, lunchEndMins)
    }

    const addLunchBackground = () => {
      if (lunchStartMins === null || lunchEndMins === null || lunchEndMins <= lunchStartMins) return
      const today = new Date()
      const day = (today.getDay() + 6) % 7 // Monday=0
      const monday = new Date(today)
      monday.setHours(0, 0, 0, 0)
      monday.setDate(monday.getDate() - day)

      const startDate = appliedCalendarFrom ? parseLocalDate(appliedCalendarFrom) : monday
      const endDate = appliedCalendarTo ? endOfLocalDate(appliedCalendarTo) : new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)

      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
      for (let i = 0; i < days; i++) {
        const d = new Date(startDate.getTime())
        d.setDate(d.getDate() + i)
        const ymd = d.toISOString().split("T")[0]
        events.push({
          id: `lunch-${ymd}`,
          title: "",
          start: new Date(`${ymd}T${lunchStartTime}`),
          end: new Date(`${ymd}T${lunchEndTime}`),
          display: "background",
          classNames: ["fc-lunch-bg"],
          extendedProps: {},
        })
      }
    }

    addLunchBackground()

    orders.forEach(order => {
      const info = order.additionalInfo
      if (!info) return
      const customerLabel = order.customerData.companyName || order.customerData.customerName || "-"
      const address1 = order.customerData.deliveryAddressJalan || "-"
      const orderSource = order.orderSource === "ad-hoc" ? "ad-hoc" : "sales"

      // Setup event
      if (info.confirmedSetupDate && info.scheduleStartTime) {
        if (order.orderSource === "ad-hoc" && order.adHocOptions?.requiresSetup === false) {
          return
        }
        const durationMins =
          info.setupDurationHours * 60 +
          info.setupDurationMinutes +
          (parseInt(info.bufferTime) || 0)
        if (durationMins > 0) {
          const start = new Date(`${info.confirmedSetupDate}T${info.scheduleStartTime}`)
          const end = new Date(start.getTime() + durationMins * 60000)
          const lunchClass = taskOverlapsLunch(start, end) ? ["fc-lunch-overlap"] : []
          events.push({
            id: `setup-${order.orderNumber}`,
            title: order.orderNumber,
            start,
            end,
            classNames: ["fc-setup-event", getLorryClass(info.setupLorry || ""), ...lunchClass].filter(Boolean),
            extendedProps: {
              orderNumber: order.orderNumber,
              phase: "Setup",
              lorry: normalizeTeamLabel(info.setupLorry || ""),
              lorryCode: getLorryCode(info.setupLorry || ""),
              lorryClass: getLorryClass(info.setupLorry || ""),
              customerLabel,
              address1,
              orderSource,
            },
          })
        }
      }

      // Dismantle event
      if (info.confirmedDismantleDate && info.dismantleScheduleStartTime) {
        if (order.orderSource === "ad-hoc" && order.adHocOptions?.requiresDismantle === false) {
          return
        }
        const durationMins =
          info.dismantleDurationHours * 60 +
          info.dismantleDurationMinutes +
          (parseInt(info.dismantleBufferTime) || 0)
        if (durationMins > 0) {
          const start = new Date(`${info.confirmedDismantleDate}T${info.dismantleScheduleStartTime}`)
          const end = new Date(start.getTime() + durationMins * 60000)
          const lunchClass = taskOverlapsLunch(start, end) ? ["fc-lunch-overlap"] : []
          events.push({
            id: `dismantle-${order.orderNumber}`,
            title: order.orderNumber,
            start,
            end,
            classNames: ["fc-dismantle-event", getLorryClass(info.dismantleLorry || ""), ...lunchClass].filter(Boolean),
            extendedProps: {
              orderNumber: order.orderNumber,
              phase: "Dismantle",
              lorry: normalizeTeamLabel(info.dismantleLorry || ""),
              lorryCode: getLorryCode(info.dismantleLorry || ""),
              lorryClass: getLorryClass(info.dismantleLorry || ""),
              customerLabel,
              address1,
              orderSource,
            },
          })
        }
      }

      // Other adhoc event (ad-hoc only)
      if (order.orderSource === "ad-hoc") {
        const requiresOtherAdhoc =
          (order.adHocOptions as any)?.requiresOtherAdhoc ?? (order.adHocOptions as any)?.requiresPickup ?? false
        if (requiresOtherAdhoc && info.confirmedOtherAdhocDate && info.otherAdhocScheduleStartTime) {
          const durationMins =
            info.otherAdhocDurationHours * 60 +
            info.otherAdhocDurationMinutes +
            (parseInt(info.otherAdhocBufferTime) || 0)
          if (durationMins > 0) {
            const start = new Date(`${info.confirmedOtherAdhocDate}T${info.otherAdhocScheduleStartTime}`)
            const end = new Date(start.getTime() + durationMins * 60000)
            const lunchClass = taskOverlapsLunch(start, end) ? ["fc-lunch-overlap"] : []
            events.push({
              id: `other-adhoc-${order.orderNumber}`,
              title: order.orderNumber,
              start,
              end,
              classNames: ["fc-other-adhoc-event", getLorryClass(info.otherAdhocLorry || ""), ...lunchClass].filter(Boolean),
              extendedProps: {
                orderNumber: order.orderNumber,
                phase: "Adhoc",
                lorry: normalizeTeamLabel(info.otherAdhocLorry || ""),
                lorryCode: getLorryCode(info.otherAdhocLorry || ""),
                lorryClass: getLorryClass(info.otherAdhocLorry || ""),
                customerLabel,
                address1,
                orderSource,
              },
            })
          }
        }
      }
    })

    const rangeFiltered = events.filter(event => {
      if (!appliedCalendarFrom && !appliedCalendarTo) return true
      const start = event.start
      if (!start) return false
      if (appliedCalendarFrom && start < parseLocalDate(appliedCalendarFrom)) return false
      if (appliedCalendarTo) {
        if (start > endOfLocalDate(appliedCalendarTo)) return false
      } else if (appliedCalendarFrom) {
        if (start > endOfLocalDate(appliedCalendarFrom)) return false
      }
      return true
    })

    if (!selectedLorryClasses.length) return rangeFiltered
    return rangeFiltered.filter(event =>
      event.display === "background" || selectedLorryClasses.includes(event.extendedProps?.lorryClass || "")
    )
  }, [orders, selectedLorryClasses, appliedCalendarFrom, appliedCalendarTo])

  const calendarVisibleRange = useMemo(() => {
    if (!appliedCalendarFrom && !appliedCalendarTo) return undefined
    if (appliedCalendarFrom && !appliedCalendarTo) {
      return { start: parseLocalDate(appliedCalendarFrom), end: addDays(appliedCalendarFrom, 1) }
    }
    if (!appliedCalendarFrom && appliedCalendarTo) {
      return { start: parseLocalDate(appliedCalendarTo), end: addDays(appliedCalendarTo, 1) }
    }
    return { start: parseLocalDate(appliedCalendarFrom), end: addDays(appliedCalendarTo, 1) }
  }, [appliedCalendarFrom, appliedCalendarTo])

  const toggleLorryFilter = (lorryClass: string) => {
    setSelectedLorryClasses(prev => {
      if (lorryClass === "all") return []
      if (prev.includes(lorryClass)) {
        const next = prev.filter(item => item !== lorryClass)
        return next
      }
      return [...prev, lorryClass]
    })
  }

  const getPhaseProgress = (status: OrderStatus): number => {
    switch (status) {
      case "scheduling": return 2 // Sales Confirmation
      case "packing": return 3 // Planning
      case "procurement": return 4
      case "setting-up": return 5
      case "dismantling": return 6
      case "completed": return 7 // Invoice
      default: return 0
    }
  }

  const getOrderDetailHref = (order: SalesOrder): string => {
    switch (order.status) {
      case "scheduling": return `/portal/sales-confirmation`
      case "packing": return `/portal/packing?order=${order.orderNumber}`
      case "procurement": return `/portal/procurement`
      case "setting-up": return `/portal/setting-up?order=${order.orderNumber}`
      case "dismantling": return `/portal/dismantle?order=${order.orderNumber}`
      case "other-adhoc": return `/portal/other-adhoc?order=${order.orderNumber}`
      case "completed": return `/portal/completed?order=${order.orderNumber}`
      default: return `/portal/sales-confirmation`
    }
  }

  // Summary counts
  const summary = {
    salesConfirmation: orders.filter(o => o.status === "scheduling").length,
    planning: orders.filter(o => o.status === "packing").length,
    procurement: orders.filter(o => o.status === "procurement").length,
    deliverySetup: orders.filter(o => o.status === "setting-up").length,
    deliveryDismantle: orders.filter(o => o.status === "dismantling").length,
    invoice: orders.filter(o => o.status === "completed").length,
    issues: orders.filter(o => o.hasIssue).length,
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <Suspense fallback={<Loading />}>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground">Status Tracking</h1>
          <p className="text-sm text-muted-foreground">Overview of all orders and their progress</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-yellow-400 transition-colors" onClick={() => router.push("/portal/sales-confirmation")}>
            <div className="flex items-center gap-1.5 text-yellow-600">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Sales Conf.</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.salesConfirmation}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-blue-400 transition-colors" onClick={() => router.push("/portal/planning")}>
            <div className="flex items-center gap-1.5 text-blue-600">
              <Package className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Planning</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.planning}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-slate-400 transition-colors" onClick={() => router.push("/portal/procurement")}>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Boxes className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Procurement</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.procurement}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-purple-400 transition-colors" onClick={() => router.push("/portal/setting-up")}>
            <div className="flex items-center gap-1.5 text-purple-600">
              <Wrench className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Delivery (S)</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.deliverySetup}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-orange-400 transition-colors" onClick={() => router.push("/portal/dismantle")}>
            <div className="flex items-center gap-1.5 text-orange-600">
              <Truck className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Delivery (D)</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.deliveryDismantle}</p>
          </div>
          <div className="rounded-md border border-border bg-card p-2 cursor-pointer hover:border-green-400 transition-colors" onClick={() => router.push("/portal/invoice")}>
            <div className="flex items-center gap-1.5 text-green-600">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Invoice</span>
            </div>
            <p className="text-base font-bold text-foreground mt-1 leading-none">{summary.invoice}</p>
          </div>
          <div className="rounded-md border border-red-300 bg-red-50 p-2">
            <div className="flex items-center gap-1.5 text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Issues</span>
            </div>
            <p className="text-base font-bold text-red-600 mt-1 leading-none">{summary.issues}</p>
          </div>
        </div>

        {/* Setup & Dismantle Overview Calendar */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Delivery Overview</h2>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <Input
              type="date"
              value={calendarFrom}
              onChange={(e) => setCalendarFrom(e.target.value)}
              className="h-8 w-40"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={calendarTo}
              onChange={(e) => setCalendarTo(e.target.value)}
              className="h-8 w-40"
            />
            <Button
              size="sm"
              onClick={applyCalendarRange}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              title="Search date range"
            >
              Search
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCalendarRange}
              className="bg-transparent"
            >
              Clear
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Filter teams:</span>
            <Button
              size="sm"
              variant={selectedLorryClasses.length === 0 ? "default" : "outline"}
              className={selectedLorryClasses.length === 0 ? "bg-accent text-accent-foreground" : "bg-transparent"}
              onClick={() => toggleLorryFilter("all")}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={selectedLorryClasses.includes("lorry-a") ? "default" : "outline"}
              className={selectedLorryClasses.includes("lorry-a") ? "bg-red-500 text-white hover:bg-red-600" : "bg-transparent"}
              onClick={() => toggleLorryFilter("lorry-a")}
            >
              Team A
            </Button>
            <Button
              size="sm"
              variant={selectedLorryClasses.includes("lorry-b") ? "default" : "outline"}
              className={selectedLorryClasses.includes("lorry-b") ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-transparent"}
              onClick={() => toggleLorryFilter("lorry-b")}
            >
              Team B
            </Button>
            <Button
              size="sm"
              variant={selectedLorryClasses.includes("lorry-c") ? "default" : "outline"}
              className={selectedLorryClasses.includes("lorry-c") ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-transparent"}
              onClick={() => toggleLorryFilter("lorry-c")}
            >
              Team C
            </Button>
            <Button
              size="sm"
              variant={selectedLorryClasses.includes("lorry-d") ? "default" : "outline"}
              className={selectedLorryClasses.includes("lorry-d") ? "bg-green-500 text-white hover:bg-green-600" : "bg-transparent"}
              onClick={() => toggleLorryFilter("lorry-d")}
            >
              Team D
            </Button>
            <Button
              size="sm"
              variant={selectedLorryClasses.includes("lorry-e") ? "default" : "outline"}
              className={selectedLorryClasses.includes("lorry-e") ? "bg-violet-500 text-white hover:bg-violet-600" : "bg-transparent"}
              onClick={() => toggleLorryFilter("lorry-e")}
            >
              Team E
            </Button>
          </div>
          <FullCalendar
            plugins={[timeGridPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            allDaySlot={false}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:30:00"
            height="360px"
            contentHeight="300px"
            scrollTime="08:00:00"
            editable={false}
            events={calendarEvents}
            slotLaneClassNames={(arg) => (arg.date && isNonWorkingSlot(arg.date) ? ["fc-nonworking"] : [])}
            ref={calendarRef}
            visibleRange={calendarVisibleRange}
            eventClick={(arg) => {
              const orderNumber = String(arg.event.extendedProps.orderNumber || "")
              const orderSource = String(arg.event.extendedProps.orderSource || "sales")
              if (!orderNumber) return
              if (orderSource === "ad-hoc") {
                router.push(`/portal/ad-hoc?edit=${orderNumber}`)
                return
              }
              router.push(`/portal/sales-order?preview=${orderNumber}`)
            }}
            eventContent={(arg) => {
              const start = arg.event.start
              const end = arg.event.end
              const timeText = start && end ? formatTimeRange(start, end) : arg.timeText
              return (
                <div className="fc-event-content-custom">
                  <div className="fc-event-phase">{arg.event.extendedProps.phase}</div>
                  <div className="fc-event-time">{timeText}</div>
                  <div className="fc-event-order">{arg.event.extendedProps.orderNumber}</div>
                  <div className="fc-event-name">{arg.event.extendedProps.customerLabel}</div>
                  <div className="fc-event-lorry">
                    <span
                      className={`lorry-dot ${arg.event.extendedProps.lorryClass || ""}`}
                      aria-label={arg.event.extendedProps.lorry || "Unassigned"}
                    >
                      {arg.event.extendedProps.lorryCode || ""}
                    </span>
                    <span className="truncate">{arg.event.extendedProps.address1}</span>
                  </div>
                </div>
              )
            }}
          />
        </div>

        {/* Shared Filter Controls */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-foreground mb-1 block">Search Orders</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Order number or customer name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-foreground mb-1 block">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-foreground mb-1 block">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={showAllOrders}
                  className="bg-transparent"
                  title="Show all orders"
                >
                  Show All
                </Button>
                <Button
                  onClick={applyDateRange}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  title="Apply date range filter"
                >
                  Generate
                </Button>
                <Button
                  variant="outline"
                  onClick={clearDateRange}
                  className="bg-transparent"
                  title="Clear date inputs"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sales Progress Chart */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-slate-100 dark:bg-slate-800 p-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Sales
            </h3>
          </div>
          {/* Header Row */}
          <div className="grid grid-cols-[170px_1fr] border-b border-border bg-muted/50">
            <div className="px-2 py-1.5 font-semibold text-[11px] text-foreground flex items-center justify-between">
              <span>Order</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSortOrder}
                className="h-6 w-6 p-0"
                title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
              >
                {sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            <div className="grid grid-cols-7">
              {SALES_FLOW_PHASES.map((phase) => (
                <div key={phase.key} className="px-2 py-1.5 text-center text-[10px] font-semibold text-foreground border-l border-border">
                  <phase.icon className="h-3.5 w-3.5 mx-auto mb-0.5" />
                  {phase.label}
                </div>
              ))}
            </div>
          </div>

          {/* Order Rows */}
          {salesOrders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm">No sales orders found</p>
            </div>
          ) : (
            <div className="max-h-[700px] overflow-y-auto">
              {salesOrders.map((order) => {
                const progress = getPhaseProgress(order.status)
                const isCompleted = order.status === "completed"
                const hasIssue = order.hasIssue

                return (
                  <div
                    key={order.orderNumber}
                    className="grid grid-cols-[170px_1fr] border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => router.push(getOrderDetailHref(order))}
                  >
                    {/* Order Info */}
                    <div className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium text-foreground text-xs">{order.orderMeta?.salesOrderNumber || order.orderNumber}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700">
                          Sales
                        </span>
                        {hasIssue && <AlertCircle className="h-4 w-4 text-red-500" />}
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteOrder(order.orderNumber)
                            }}
                            className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{order.customerData.customerName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {formatDate(order.eventData.eventDate)}
                      </p>
                    </div>

                    {/* Progress Bar Cells */}
                    <div className="grid grid-cols-7">
                      {SALES_FLOW_PHASES.map((phase, idx) => {
                        const phaseNum = idx + 1
                        const dismantleRequired = order.eventData?.dismantleRequired ?? true
                        const isRequired = phase.key === "delivery-dismantle" ? dismantleRequired : true
                        const isPhaseCompleted = progress > phaseNum
                        const isCurrent = progress === phaseNum
                        const issueStage = order.issueData?.flaggedAtStage
                        const phaseStatus =
                          phase.key === "sales-confirmation"
                            ? "scheduling"
                            : phase.key === "planning"
                              ? "packing"
                              : phase.key === "procurement"
                                ? "procurement"
                                : phase.key === "delivery-setup"
                                  ? "setting-up"
                                  : phase.key === "delivery-dismantle"
                                    ? "dismantling"
                                    : phase.key === "invoice"
                                      ? "completed"
                                      : "draft"
                        const isIssuePhase = hasIssue && issueStage === phaseStatus

                        let barColor = "bg-muted"
                        let bgColor = "bg-transparent"

                        if (!isRequired) {
                          barColor = "bg-muted"
                          bgColor = "bg-transparent"
                        } else if (isIssuePhase) {
                          barColor = "bg-red-500"
                          bgColor = "bg-red-100"
                        } else if (isCompleted) {
                          barColor = "bg-green-500"
                          bgColor = "bg-green-100"
                        } else if (isPhaseCompleted) {
                          barColor = "bg-green-500"
                          bgColor = "bg-green-100"
                        } else if (isCurrent) {
                          barColor = "bg-yellow-500"
                          bgColor = "bg-yellow-100"
                        }

                        return (
                          <div
                            key={phase.key}
                            className={`relative flex items-center justify-center border-l border-border ${bgColor}`}
                          >
                            {!isRequired ? null : (isPhaseCompleted || isCurrent) ? (
                              <div
                                className={`w-full h-2 mx-2 ${barColor} rounded-full ${isCurrent && !hasIssue && !isCompleted ? "animate-pulse" : ""}`}
                              />
                            ) : (
                              <div className="w-full h-2 mx-2 bg-muted rounded-full" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Adhoc Progress Chart */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-amber-100 dark:bg-amber-900 p-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Adhoc
            </h3>
          </div>
          {/* Header Row */}
          <div className="grid grid-cols-[170px_1fr] border-b border-border bg-muted/50">
            <div className="px-2 py-1.5 font-semibold text-[11px] text-foreground flex items-center justify-between">
              <span>Order</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSortOrder}
                className="h-6 w-6 p-0"
                title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
              >
                {sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            </div>
            <div className="grid grid-cols-7">
              {ADHOC_FLOW_PHASES.map((phase) => (
                <div key={phase.key} className="px-2 py-1.5 text-center text-[10px] font-semibold text-foreground border-l border-border">
                  <phase.icon className="h-3.5 w-3.5 mx-auto mb-0.5" />
                  {phase.label}
                </div>
              ))}
            </div>
          </div>

          {/* Order Rows */}
          {adHocOrders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm">No ad hoc orders found</p>
            </div>
          ) : (
            <div className="max-h-[700px] overflow-y-auto">
              {adHocOrders.map((order) => {
                const progress = getPhaseProgress(order.status)
                const isCompleted = order.status === "completed"
                const hasIssue = order.hasIssue

                return (
                  <div
                    key={order.orderNumber}
                    className="grid grid-cols-[170px_1fr] border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => router.push(getOrderDetailHref(order))}
                  >
                    {/* Order Info */}
                    <div className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium text-foreground text-xs">{order.orderMeta?.salesOrderNumber || order.orderNumber}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800">
                          Adhoc
                        </span>
                        {hasIssue && <AlertCircle className="h-4 w-4 text-red-500" />}
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteOrder(order.orderNumber)
                            }}
                            className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{order.customerData.customerName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {formatDate(order.eventData.eventDate)}
                      </p>
                    </div>

                    {/* Progress Bar Cells */}
                    <div className="grid grid-cols-7">
                      {ADHOC_FLOW_PHASES.map((phase, idx) => {
                        const phaseNum = idx + 1
                        const dismantleRequired =
                          order.eventData?.dismantleRequired ?? (order.adHocOptions?.requiresDismantle ?? true)
                        const isRequired = phase.key === "delivery-dismantle" ? dismantleRequired : true

                        const isPhaseCompleted = isRequired && progress > phaseNum
                        const isCurrent = isRequired && progress === phaseNum
                        const issueStage = order.issueData?.flaggedAtStage
                        const phaseStatus =
                          phase.key === "sales-confirmation"
                            ? "scheduling"
                            : phase.key === "planning"
                              ? "packing"
                              : phase.key === "procurement"
                                ? "procurement"
                                : phase.key === "delivery-setup"
                                  ? "setting-up"
                                  : phase.key === "delivery-dismantle"
                                    ? "dismantling"
                                    : phase.key === "invoice"
                                      ? "completed"
                                      : "draft"
                        const isIssuePhase = hasIssue && issueStage === phaseStatus

                        let barColor = "bg-muted"
                        let bgColor = "bg-transparent"

                        if (!isRequired) {
                          barColor = "bg-muted"
                          bgColor = "bg-transparent"
                        } else if (isIssuePhase) {
                          barColor = "bg-red-500"
                          bgColor = "bg-red-100"
                        } else if (isCompleted) {
                          barColor = "bg-green-500"
                          bgColor = "bg-green-100"
                        } else if (isPhaseCompleted) {
                          barColor = "bg-green-500"
                          bgColor = "bg-green-100"
                        } else if (isCurrent) {
                          barColor = "bg-yellow-500"
                          bgColor = "bg-yellow-100"
                        }

                        return (
                          <div
                            key={phase.key}
                            className={`relative flex items-center justify-center border-l border-border ${bgColor}`}
                          >
                            {!isRequired ? null : (isPhaseCompleted || isCurrent) ? (
                              <div
                                className={`w-full h-2 mx-2 ${barColor} rounded-full ${isCurrent && !hasIssue && !isCompleted ? "animate-pulse" : ""}`}
                              />
                            ) : (
                              <div className="w-full h-2 mx-2 bg-muted rounded-full" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 bg-green-500 rounded-full" />
            <span className="text-muted-foreground">Completed Phase</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 bg-yellow-500 rounded-full" />
            <span className="text-muted-foreground">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 bg-red-500 rounded-full" />
            <span className="text-muted-foreground">Has Issue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 rounded-full border border-border bg-transparent" />
            <span className="text-muted-foreground">Not Required</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-2 bg-muted rounded-full" />
            <span className="text-muted-foreground">Pending Phase</span>
          </div>
        </div>
          </TabsContent>

        </Tabs>
      </div>
    </Suspense>
  )
}
