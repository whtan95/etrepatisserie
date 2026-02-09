"use client"

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  Search,
  Truck,
  ChevronRight,
  Calendar,
  Clock,
  User,
  MapPin,
  Undo2,
  CheckCircle,
  Camera,
  X,
  AlertCircle,
  AlertTriangle,
  FileText,
  Download,
  Printer,
  Play,
  Square,
  Navigation,
  Save,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react"
import type { SalesOrder, IssueData, DismantleData, DismantlePhase, JourneyStart, GPSPoint, GPSTrackingData } from "@/lib/types"
import { LORRIES } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import Loading from "./loading"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getNextStatus, isPhaseRequired } from "@/lib/order-flow"
import { useGPSTracking, generateStaticMapUrl, formatTrackingDuration, formatTrackingTime } from "@/hooks/use-gps-tracking"
import { getLunchWindowFromLocalStorage, overlapsMinutesWindow, parseHHMMToMinutes } from "@/lib/time-window"

export default function DismantlePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [routeMapFailed, setRouteMapFailed] = useState(false)

  const formatLocationLabel = useCallback((point?: GPSPoint | null) => {
    if (!point) return "Unknown location"
    const coords = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
    const address = point.fullAddress || point.streetName
    return address ? `${address} (${coords})` : coords
  }, [])

  // Orders state
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [appliedDateFrom, setAppliedDateFrom] = useState("")
  const [appliedDateTo, setAppliedDateTo] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [sortCriteria, setSortCriteria] = useState<"eventDate" | "name" | "orderDate" | "pricing">("eventDate")
  const [lorryFilter, setLorryFilter] = useState<"all" | (typeof LORRIES)[number]["name"]>("all")
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Dismantle phase state
  const [dismantlePhase, setDismantlePhase] = useState<DismantlePhase>("pending")
  const [photos, setPhotos] = useState<string[]>([])

  // Modal states
  const [showStartModal, setShowStartModal] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showSetupLog, setShowSetupLog] = useState(false)
  const [setupLogMapFailed, setSetupLogMapFailed] = useState(false)

  // Accept form data

  // Start journey form data
  const [startData, setStartData] = useState({
    personnel: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
    location: null as GPSPoint | null,
  })

  // End journey form data
  const [endData, setEndData] = useState({
    personnel: "",
    location: null as GPSPoint | null,
  })

  // Flag issue data
  const [flagData, setFlagData] = useState({
    personnel: "",
    issue: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })

  // GPS Tracking
  const {
    isTracking,
    route,
    currentLocation,
    error: gpsError,
    startTracking,
    resumeTracking,
    stopTracking,
    getCurrentLocation,
    getTrackingData,
  } = useGPSTracking({
    onLocationUpdate: (point) => {
      // Save route updates to order
      if (selectedOrder) {
        updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
          ...order,
          dismantleData: {
            ...order.dismantleData!,
            gpsTracking: {
              ...order.dismantleData?.gpsTracking,
              route: [...(order.dismantleData?.gpsTracking?.route || []), point],
            } as GPSTrackingData,
          },
          updatedAt: new Date().toISOString(),
        }))
      }
    },
  })

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = () => {
    const allOrders = getAllOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
    const dismantlingOrders = allOrders.filter(order => order.status === "dismantling")
    dismantlingOrders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(dismantlingOrders)
    setIsLoading(false)
  }

  const confirmDelete = () => {
    if (!selectedOrder) return
    deleteOrderByNumber(selectedOrder.orderNumber)
    setDeleteOpen(false)
    setSelectedOrder(null)
    loadOrders()
    showAlert("Order deleted.", { title: "Deleted", actionText: "OK" })
  }

  const isLunchOverlapForOrder = (order: SalesOrder) => {
    const info = order.additionalInfo
    if (!info?.dismantleScheduleStartTime || !info?.dismantleEstimatedEndTime) return false
    const { lunchStartTime, lunchEndTime } = getLunchWindowFromLocalStorage()
    const lunchStartMins = parseHHMMToMinutes(lunchStartTime)
    const lunchEndMins = parseHHMMToMinutes(lunchEndTime)
    const startMins = parseHHMMToMinutes(info.dismantleScheduleStartTime)
    const endMins = parseHHMMToMinutes(info.dismantleEstimatedEndTime)
    if (lunchStartMins === null || lunchEndMins === null || startMins === null || endMins === null) return false
    return overlapsMinutesWindow(startMins, endMins, lunchStartMins, lunchEndMins)
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "asc" ? "desc" : "asc")
  }

  const normalizeTeamLabel = (lorry: string) => {
    if (!lorry) return ""
    const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
    return match ? `Team ${match[1].toUpperCase()}` : lorry
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerData.customerName.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    const eventDate = order.eventData.eventDate
    if (appliedDateFrom) {
      matchesDate = matchesDate && !!eventDate && new Date(eventDate) >= new Date(appliedDateFrom)
    }
    if (appliedDateTo) {
      matchesDate = matchesDate && !!eventDate && new Date(eventDate) <= new Date(appliedDateTo)
    }

    let matchesLorry = true
    if (lorryFilter !== "all") {
      const dismantleLorry = order.dismantleData?.acceptance?.lorry
      const lorryName = LORRIES.find(l => l.id === dismantleLorry)?.name || normalizeTeamLabel(dismantleLorry || "")
      matchesLorry = lorryName === lorryFilter
    }

    return matchesSearch && matchesDate && matchesLorry
  }).sort((a, b) => {
    let compareResult = 0

    if (sortCriteria === "eventDate") {
      const dateA = new Date(a.eventData.eventDate).getTime()
      const dateB = new Date(b.eventData.eventDate).getTime()
      compareResult = dateA - dateB
    } else if (sortCriteria === "name") {
      const nameA = a.customerData.customerName || a.customerData.companyName || ""
      const nameB = b.customerData.customerName || b.customerData.companyName || ""
      compareResult = nameA.localeCompare(nameB)
    } else if (sortCriteria === "orderDate") {
      const dateA = new Date(a.orderMeta.orderDate).getTime()
      const dateB = new Date(b.orderMeta.orderDate).getTime()
      compareResult = dateA - dateB
    } else if (sortCriteria === "pricing") {
      compareResult = (a.total || 0) - (b.total || 0)
    }

    return sortOrder === "asc" ? compareResult : -compareResult
  })

  const applyDateRange = () => {
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
  }

  const clearDateRange = () => {
    setDateFrom("")
    setDateTo("")
    setAppliedDateFrom("")
    setAppliedDateTo("")
  }

  const showAllDates = () => {
    setAppliedDateFrom("")
    setAppliedDateTo("")
  }

  const handleSelectOrder = (order: SalesOrder) => {
    const normalized = (() => {
      if (order.dismantleData) return order
      const dismantleData: DismantleData = {
        dismantlePersonnel: "",
        dismantleDate: "",
        dismantleStartTime: "",
        dismantleCompletionTime: "",
        photos: [],
        status: "pending",
        phase: "pending",
      }
      updateOrderByNumber(order.orderNumber, (current) => ({
        ...current,
        dismantleData,
        updatedAt: new Date().toISOString(),
      }))
      return { ...order, dismantleData }
    })()

    setSelectedOrder(normalized)
    setShowSetupLog(false)
    setSetupLogMapFailed(false)
    // Determine phase from order data
    const phase = normalized.dismantleData?.phase || "pending"
    setDismantlePhase(phase)
    setPhotos(normalized.dismantleData?.photos || [])
  }

  // Start Journey
  const openStartModal = async () => {
    setStartData({
      personnel: selectedOrder?.dismantleData?.acceptance?.personnel || "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
      location: null,
    })
    setShowStartModal(true)

    // Get current location
    const location = await getCurrentLocation()
    if (location) {
      setStartData(prev => ({ ...prev, location }))
    }
  }

  const handleStartJourney = async () => {
    if (!selectedOrder || !startData.personnel) {
      showAlert("Please fill in all required fields")
      return
    }

    // Start GPS tracking
    const startPoint = await startTracking()
    if (!startPoint) {
      showAlert("Failed to get GPS location. Please allow location access.")
      return
    }

    const journeyStart: JourneyStart = {
      personnel: startData.personnel,
      date: startData.date,
      time: startData.time,
      startLocation: startPoint,
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      dismantleData: {
        ...order.dismantleData!,
        phase: "tracking" as DismantlePhase,
        journeyStart,
        gpsTracking: {
          startLocation: startPoint,
          endLocation: null,
          route: [startPoint],
          startedAt: startPoint.timestamp,
          endedAt: null,
        },
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) {
      setSelectedOrder(updated)
      setDismantlePhase("tracking")
    }
    setRouteMapFailed(false)
    setShowStartModal(false)
    showAlert("Journey started! GPS tracking is active.", { title: "Tracking" })
  }

  // Photo handling
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSavePhotos = () => {
    if (!selectedOrder || photos.length === 0) {
      showAlert("Please upload at least one photo")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      dismantleData: {
        ...order.dismantleData!,
        photos,
        photosSavedAt: new Date().toISOString(),
        phase: "photos_saved" as DismantlePhase,
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) {
      setSelectedOrder(updated)
      setDismantlePhase("photos_saved")
    }
    showAlert("Photos saved!", { title: "Saved" })
  }

  // End Journey
  const openEndModal = async () => {
    setEndData({
      personnel: selectedOrder?.dismantleData?.journeyStart?.personnel || "",
      location: null,
    })
    setShowEndModal(true)

    // Get current location
    const location = await getCurrentLocation()
    if (location) {
      setEndData(prev => ({ ...prev, location }))
    }
  }

  const handleEndJourney = () => {
    if (!selectedOrder || !endData.personnel) {
      showAlert("Please fill in all required fields")
      return
    }

    // Stop GPS tracking
    const endPoint = stopTracking()
    const trackingData = getTrackingData()

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      dismantleData: {
        ...order.dismantleData!,
        dismantleCompletionTime: new Date().toTimeString().slice(0, 5),
        phase: "completed" as DismantlePhase,
        gpsTracking: {
          ...order.dismantleData?.gpsTracking,
          endLocation: endData.location || endPoint,
          endedAt: new Date().toISOString(),
          route: trackingData.route,
        } as GPSTrackingData,
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) {
      setSelectedOrder(updated)
      setDismantlePhase("completed")
    }
    setShowEndModal(false)
    showAlert("Journey completed!", { title: "Completed" })
  }

  // Flag issue
  const openFlagModal = () => {
    if (!selectedOrder) return
    setFlagData({
      personnel: "",
      issue: "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })
    setShowFlagModal(true)
  }

  const handleFlagIssue = () => {
    if (!selectedOrder) return
    if (!flagData.personnel || !flagData.issue) {
      showAlert("Please fill in all required fields")
      return
    }

    const issueData: IssueData = {
      flaggedPersonnel: flagData.personnel,
      flaggedIssue: flagData.issue,
      flaggedDate: flagData.date,
      flaggedTime: flagData.time,
      flaggedAtStage: "dismantling",
      isResolved: false,
    }
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      hasIssue: true,
      issueData,
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) setSelectedOrder(updated)
    setShowFlagModal(false)
  }

  // Send back
  const openSendBackModal = () => {
    if (!selectedOrder) return
    setShowSendBackModal(true)
  }

  const sendBackTo = (target: "setting-up" | "procurement" | "packing" | "scheduling") => {
    if (!selectedOrder) return

    // Ensure timers stop before we clear data / navigate.
    stopTracking()

    updateOrderByNumber(selectedOrder.orderNumber, (order) => {
      const base = {
        ...order,
        status: target,
        updatedAt: new Date().toISOString(),
      }

      if (target === "setting-up" || target === "procurement" || target === "packing") {
        return {
          ...base,
          setupData: undefined,
          dismantleData: undefined,
          otherAdhocData: undefined,
        }
      }

      return {
        ...base,
        packingData: undefined,
        setupData: undefined,
        dismantleData: undefined,
        otherAdhocData: undefined,
      }
    })

    loadOrders()
    setSelectedOrder(null)
    setDismantlePhase("pending")
    setPhotos([])
    setShowSendBackModal(false)
    showAlert(
      target === "setting-up"
        ? "Order sent back to Delivery (Setup)!"
        : target === "procurement"
          ? "Order sent back to Procurement!"
          : target === "packing"
            ? "Order sent back to Planning!"
            : "Order sent back to Sales order!",
      { title: "Sent Back" }
    )
  }

  // Complete dismantle
  const handleDismantleDone = () => {
    if (!selectedOrder) return

    const nextStatus = getNextStatus(selectedOrder, "dismantling")
    updateOrderByNumber(selectedOrder.orderNumber, (order) => {
      const base = {
        ...order,
        status: nextStatus,
        dismantleData: {
          ...order.dismantleData!,
          status: "completed" as const,
        },
        updatedAt: new Date().toISOString(),
      }
      if (nextStatus === "other-adhoc") {
        return {
          ...base,
          otherAdhocData: {
            personnel: "",
            date: "",
            time: "",
            status: "pending" as const,
          },
        }
      }
      return base
    })
    loadOrders()
    setSelectedOrder(null)
    setDismantlePhase("pending")
    setPhotos([])
    if (nextStatus === "other-adhoc") {
      showAlert("Returning completed! Order moved to Other Adhoc.", { title: "Updated" })
      router.push("/portal/other-adhoc")
    } else {
      showAlert("Returning completed! Order moved to Invoice.", { title: "Invoice" })
      router.push("/portal/invoice")
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  // Get lorry color
  const getLorryColor = (lorryId: string) => {
    const lorry = LORRIES.find(l => l.id === lorryId || l.name === lorryId)
    return lorry?.color || "#888"
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  // Render content based on phase
  const renderPhaseContent = () => {
    if (!selectedOrder) return null

    const acceptance = selectedOrder.dismantleData?.acceptance
    const journeyStart = selectedOrder.dismantleData?.journeyStart
    const gpsTracking = selectedOrder.dismantleData?.gpsTracking
    const displayRoute = isTracking ? route : (gpsTracking?.route || [])

    switch (dismantlePhase) {
      case "pending":
        return (
          <div className="p-6 text-center">
            <Navigation className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground mb-2">Ready to Start</h3>
            <p className="text-muted-foreground mb-6">Team is already assigned. Start the journey when leaving.</p>
            <Button onClick={openStartModal} size="lg" className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              <Play className="h-5 w-5" />
              Start Journey
            </Button>
          </div>
        )

      case "accepted":
        return (
          <div className="p-4 space-y-4">
            {/* Acceptance Info */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">Order Accepted</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Personnel:</span>
                  <span className="ml-2 font-medium">{acceptance?.personnel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lorry:</span>
                  <span
                    className="ml-2 font-medium px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: getLorryColor(acceptance?.lorry || "") }}
                  >
                    {LORRIES.find(l => l.id === acceptance?.lorry)?.name || acceptance?.lorry}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(acceptance?.acceptedDate || "")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time:</span>
                  <span className="ml-2">{acceptance?.acceptedTime}</span>
                </div>
              </div>
            </div>

            {/* Start Journey Button */}
            <div className="text-center py-6">
              <Button onClick={openStartModal} size="lg" className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                <Play className="h-5 w-5" />
                Start Journey
              </Button>
              <p className="text-sm text-muted-foreground mt-2">Click when leaving the hub</p>
            </div>
          </div>
        )

      case "tracking":
      case "photos_saved":
        return (
          <div className="space-y-4">
            {/* Tracking Banner */}
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  {isTracking ? "Tracking Active" : "Tracking Paused"}
                </span>
                <span className="text-sm text-red-600 dark:text-red-300">
                  ({displayRoute.length} points)
                </span>
              </div>
              <div className="flex gap-2">
                {!isTracking && (
                  <Button
                    onClick={async () => {
                      if (!selectedOrder?.dismantleData?.gpsTracking?.route?.length) {
                        showAlert("No existing tracking data to resume. Start Journey again.", { title: "Tracking" })
                        return
                      }
                      const point = await resumeTracking(selectedOrder.dismantleData.gpsTracking.route)
                      if (!point) {
                        showAlert("Failed to resume tracking. Please allow location access.", { title: "Tracking" })
                        return
                      }
                      setRouteMapFailed(false)
                      showAlert("Tracking resumed.", { title: "Tracking" })
                    }}
                    size="sm"
                    variant="outline"
                    className="gap-2 bg-transparent"
                  >
                    <Play className="h-4 w-4" />
                    Continue Tracking
                  </Button>
                )}
                <Button onClick={openEndModal} variant="destructive" size="sm" className="gap-2">
                  <Square className="h-4 w-4" />
                  End Journey
                </Button>
              </div>
            </div>

            {/* Journey Start Info */}
            {journeyStart && (
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-sm">
                <span className="text-blue-800 dark:text-blue-200">
                  Started at {journeyStart.time} from {formatLocationLabel(journeyStart.startLocation)}
                </span>
              </div>
            )}

            {gpsError && (
              <div className="mx-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-700 dark:text-red-200 text-sm">
                {gpsError}
              </div>
            )}

            {/* Tracking Log & Map */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              {/* Tracking Log */}
              <div className="border border-border rounded-lg">
                <div className="p-3 border-b border-border bg-muted/30">
                  <h4 className="font-medium">Tracking Log</h4>
                </div>
                <div className="max-h-[300px] overflow-y-auto p-2">
                  {displayRoute.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">No tracking data yet</p>
                  ) : (
                    displayRoute.map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 text-sm border-b border-border last:border-0">
                        <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium">{formatTrackingTime(point.timestamp)}</span>
                          <span className="mx-2">-</span>
                          <span className="text-muted-foreground">{formatLocationLabel(point)}</span>
                          {idx === 0 && <span className="ml-2 text-xs text-green-600">(Started)</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Map */}
              <div className="border border-border rounded-lg">
                <div className="p-3 border-b border-border bg-muted/30">
                  <h4 className="font-medium">Route Map</h4>
                </div>
                <div className="p-2">
                  {displayRoute.length >= 2 && !routeMapFailed ? (
                    (() => {
                      const mapUrl = generateStaticMapUrl(displayRoute, 400, 300)
                      if (!mapUrl) return null
                      return (
                        <img
                          src={mapUrl}
                          alt="Route map"
                          className="w-full h-[300px] object-cover rounded"
                          onError={() => setRouteMapFailed(true)}
                        />
                      )
                    })()
                  ) : (
                    <div className="h-[300px] flex items-center justify-center bg-muted/30 rounded">
                      <p className="text-sm text-muted-foreground">
                        {routeMapFailed ? "Map preview failed to load" : "Map will appear after 2+ points"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Customer Uploaded Photos (from Sales Order) */}
            {!!selectedOrder?.customerData?.photos?.length && (
              <div className="p-4 border-t border-border bg-muted/10">
                <h4 className="font-medium mb-3">Customer Uploaded Photos</h4>
                <div className="flex flex-wrap gap-3">
                  {selectedOrder.customerData.photos.map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo || "/placeholder.svg"}
                      alt={`Customer upload ${idx + 1}`}
                      className="h-24 w-24 object-cover rounded-lg border border-border"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Photo Upload */}
            <div className="p-4 border-t border-border">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Photo Proof
                {dismantlePhase === "photos_saved" && (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Saved</span>
                )}
              </h4>
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative">
                    <img src={photo} alt={`Returning ${idx + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border" />
                    {dismantlePhase !== "photos_saved" && (
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                {dismantlePhase !== "photos_saved" && photos.length < 4 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-20 w-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                  >
                    <Camera className="h-6 w-6" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              {dismantlePhase === "tracking" && photos.length > 0 && (
                <Button onClick={handleSavePhotos} className="mt-4 gap-2 bg-green-600 text-white hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  Save Images
                </Button>
              )}
              {dismantlePhase === "photos_saved" && (
                <p className="text-sm text-muted-foreground mt-2">
                  Photos saved. Click "End Journey" when back at hub.
                </p>
              )}
            </div>
          </div>
        )

      case "completed":
        return (
          <div className="space-y-4">
            {/* Completed Banner */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">Journey Completed</span>
              </div>
              {gpsTracking?.startedAt && gpsTracking?.endedAt && (
                <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                  <p>Started: {formatTrackingTime(gpsTracking.startedAt)} at {formatLocationLabel(gpsTracking.startLocation)}</p>
                  <p>Ended: {formatTrackingTime(gpsTracking.endedAt)} at {formatLocationLabel(gpsTracking.endLocation)}</p>
                  <p>Duration: {formatTrackingDuration(gpsTracking.startedAt, gpsTracking.endedAt)} | {gpsTracking.route?.length || 0} points</p>
                </div>
              )}
            </div>

            {/* Final Map */}
            {gpsTracking?.route && gpsTracking.route.length >= 2 && (
              <div className="p-4">
                <h4 className="font-medium mb-3">Complete Route</h4>
                <img
                  src={generateStaticMapUrl(gpsTracking.route, 600, 400)}
                  alt="Complete route"
                  className="w-full rounded-lg border border-border"
                />
              </div>
            )}

            {/* Photo Gallery */}
            {photos.length > 0 && (
              <div className="p-4 border-t border-border">
                <h4 className="font-medium mb-3">Returning Photos</h4>
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo, idx) => (
                    <img key={idx} src={photo} alt={`Returning ${idx + 1}`} className="h-24 w-24 object-cover rounded-lg border border-border" />
                  ))}
                </div>
              </div>
            )}

            {/* Complete Button */}
            <div className="p-4 border-t border-border">
              <Button onClick={handleDismantleDone} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <CheckCircle className="h-4 w-4" />
                Returning Done - Proceed to Invoice
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <>
    <Suspense fallback={<Loading />}>
      <div className="space-y-6">
        <OrderProgress
          currentStep="returning"
          orderNumber={selectedOrder?.orderNumber}
          hasIssue={selectedOrder?.hasIssue}
          orderSource={selectedOrder?.orderSource}
          quotationPath="/portal/quotation/official-quotation"
          requiresDismantle={
            selectedOrder
              ? selectedOrder.orderSource === "ad-hoc"
                ? selectedOrder.adHocOptions?.requiresDismantle ?? true
                : selectedOrder.eventData?.dismantleRequired ?? true
              : undefined
          }
          adHocOptions={selectedOrder?.adHocOptions}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List */}
          <div className="lg:col-span-1 border border-border rounded-lg bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground mb-3">Pending Returning</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Sort By</Label>
                    <Select value={sortCriteria} onValueChange={(v) => setSortCriteria(v as typeof sortCriteria)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eventDate">Event Date</SelectItem>
                        <SelectItem value="name">Customer Name</SelectItem>
                        <SelectItem value="orderDate">Order Date</SelectItem>
                        <SelectItem value="pricing">Pricing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSortOrder}
                      className="w-full gap-2"
                      title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
                    >
                      {sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      {sortOrder === "asc" ? "Ascending" : "Descending"}
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1">Team</Label>
                    <Select value={lorryFilter} onValueChange={(v) => setLorryFilter(v as typeof lorryFilter)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        {LORRIES.map((lorry) => (
                          <SelectItem key={lorry.id} value={lorry.name}>
                            {lorry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={showAllDates}>
                    Show All
                  </Button>
                  <Button type="button" size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={applyDateRange}>
                    Generate
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={clearDateRange}>
                    Clear
                  </Button>
                </div>
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No orders pending returning</p>
                </div>
              ) : (
                  filteredOrders.map((order) => (
                    <button
                      key={order.orderNumber}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className={`w-full p-4 text-left border-b border-border hover:bg-accent/30 transition-colors ${
                        selectedOrder?.orderNumber === order.orderNumber ? "bg-accent/50" : ""
                      } ${isLunchOverlapForOrder(order) ? "bg-yellow-50/60" : ""}`}
                    >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{order.orderNumber}</p>
                          {order.dismantleData?.acceptance && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded text-white"
                              style={{ backgroundColor: getLorryColor(order.dismantleData.acceptance.lorry) }}
                            >
                              {LORRIES.find(l => l.id === order.dismantleData?.acceptance?.lorry)?.name?.replace("Lorry ", "")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{order.customerData.customerName}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(order.eventData.customerPreferredDismantleDate)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Dismantle Details */}
          <div className="lg:col-span-2">
            {selectedOrder ? (
              <div className="border border-border rounded-lg bg-card">
                {/* Order Info Header */}
                <div className="p-4 border-b border-border bg-muted/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{selectedOrder.orderNumber}</h2>
                      <p className="text-muted-foreground">{selectedOrder.customerData.customerName}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="flex items-center gap-1 justify-end text-foreground">
                        <Calendar className="h-4 w-4" />
                        Returning: {formatDate(selectedOrder.additionalInfo?.confirmedDismantleDate || selectedOrder.eventData.customerPreferredDismantleDate)}
                      </p>
                      <p className="flex items-center gap-1 justify-end text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {selectedOrder.customerData.deliveryAddress || "N/A"}
                      </p>
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 bg-transparent"
                          onClick={() => {
                            setSetupLogMapFailed(false)
                            setShowSetupLog(true)
                          }}
                          disabled={!selectedOrder.setupData?.gpsTracking?.route?.length}
                        >
                          <FileText className="h-4 w-4" />
                          See Delivery Log
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schedule Info from Additional Info - if available */}
                  {selectedOrder.additionalInfo && (
                    <div className="p-4 border-b border-border bg-orange-50">
                      <h3 className="font-semibold text-orange-900 mb-2">Returning Schedule Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-orange-700">Departure:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.dismantleDepartureTime || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Arrival:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.confirmedDismantleTime || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Travel:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {`${selectedOrder.additionalInfo.dismantleTravelHours || 0}h ${selectedOrder.additionalInfo.dismantleTravelMinutes || 0}m`}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Distance:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.dismantleDistanceKm ? `${selectedOrder.additionalInfo.dismantleDistanceKm} km` : "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Est. End:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.dismantleEstimatedEndTime || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Team:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.dismantleLorry || "Not assigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-700">Buffer:</span>
                          <span className="ml-2 font-medium text-orange-900">
                            {selectedOrder.additionalInfo.dismantleBufferTime ? `${selectedOrder.additionalInfo.dismantleBufferTime} mins` : "Not set"}
                          </span>
                        </div>
                      </div>

                      {selectedOrder.additionalInfo.dismantleNextAction && (
                        <div className="mt-3 rounded-lg border border-orange-200 bg-white/70 p-3">
                          <p className="text-xs font-semibold text-orange-800 mb-2">After Returning Completion</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-orange-700">Next:</span>
                              <span className="ml-2 font-medium text-orange-900">
                                {selectedOrder.additionalInfo.dismantleNextAction === "warehouse"
                                  ? "Return to Warehouse"
                                  : `Next Task (${selectedOrder.additionalInfo.dismantleNextTaskOrderNumber || "-"})`}
                              </span>
                            </div>
                            <div>
                              <span className="text-orange-700">ETA:</span>
                              <span className="ml-2 font-medium text-orange-900">
                                {selectedOrder.additionalInfo.dismantleNextAction === "warehouse"
                                  ? (selectedOrder.additionalInfo.dismantleReturnArrivalTime || "Not set")
                                  : "Not set"}
                              </span>
                            </div>
                            <div>
                              <span className="text-orange-700">Distance:</span>
                              <span className="ml-2 font-medium text-orange-900">
                                {selectedOrder.additionalInfo.dismantleNextAction === "warehouse" && selectedOrder.additionalInfo.dismantleReturnDistanceKm
                                  ? `${selectedOrder.additionalInfo.dismantleReturnDistanceKm} km`
                                  : "Not set"}
                              </span>
                            </div>
                            <div>
                              <span className="text-orange-700">Duration:</span>
                              <span className="ml-2 font-medium text-orange-900">
                                {selectedOrder.additionalInfo.dismantleNextAction === "warehouse" && selectedOrder.additionalInfo.dismantleReturnTravelMins
                                  ? `${selectedOrder.additionalInfo.dismantleReturnTravelMins} mins`
                                  : "Not set"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                {/* Items List - No Prices */}
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-foreground mb-3">Items to Return</h3>
                  <div className="space-y-2">
                    {selectedOrder.packingData?.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="text-foreground">{item.name}</span>
                        <span className="font-medium text-foreground">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup Journey (read-only) */}
                {selectedOrder.setupData?.gpsTracking?.route?.length ? (
                  <div className="hidden">
                    <h3 className="font-semibold text-foreground mb-3">Setup Journey (GPS)</h3>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
                      <p>
                        Started:{" "}
                        {selectedOrder.setupData.gpsTracking.startedAt
                          ? formatTrackingTime(selectedOrder.setupData.gpsTracking.startedAt)
                          : "-"}
                        {" • "}
                        Ended:{" "}
                        {selectedOrder.setupData.gpsTracking.endedAt
                          ? formatTrackingTime(selectedOrder.setupData.gpsTracking.endedAt)
                          : "-"}
                      </p>
                      {selectedOrder.setupData.gpsTracking.startedAt && selectedOrder.setupData.gpsTracking.endedAt ? (
                        <p className="text-muted-foreground">
                          Duration:{" "}
                          {formatTrackingDuration(
                            selectedOrder.setupData.gpsTracking.startedAt,
                            selectedOrder.setupData.gpsTracking.endedAt
                          )}
                          {" • "}
                          {selectedOrder.setupData.gpsTracking.route.length} points
                        </p>
                      ) : (
                        <p className="text-muted-foreground">{selectedOrder.setupData.gpsTracking.route.length} points</p>
                      )}
                    </div>

                    {(() => {
                      if (selectedOrder.setupData.gpsTracking.route.length < 2) return null
                      const mapUrl = generateStaticMapUrl(selectedOrder.setupData.gpsTracking.route, 600, 240)
                      if (!mapUrl) return null
                      return (
                        <div className="mt-3">
                          <img
                            src={mapUrl}
                            alt="Setup journey route"
                            className="w-full rounded-lg border border-border object-cover"
                          />
                        </div>
                      )
                    })()}

                    <div className="mt-3 space-y-2">
                      {selectedOrder.setupData.gpsTracking.route.map((p, idx) => {
                        const label =
                          idx === 0
                            ? "Start"
                            : idx === selectedOrder.setupData!.gpsTracking!.route.length - 1
                              ? "End"
                              : `Point ${idx + 1}`
                        const coords = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                        const address = p.fullAddress || p.streetName
                        const display = address ? `${address} (${coords})` : coords
                        return (
                          <div key={`${p.timestamp}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{label}</p>
                              <p className="text-xs text-muted-foreground">{formatTrackingTime(p.timestamp)}</p>
                              <p className="text-muted-foreground break-words">{display}</p>
                            </div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {p.accuracy ? `±${Math.round(p.accuracy)}m` : ""}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Phase Content */}
                {renderPhaseContent()}

                {/* Action Buttons */}
                <div className="p-4 border-t border-border flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/portal/setting-up?order=${encodeURIComponent(selectedOrder.orderNumber)}`)}
                    className="gap-2 bg-transparent"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Return
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOpen(true)}
                    className="gap-2 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openSendBackModal}
                    className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
                  >
                    <Undo2 className="h-4 w-4" />
                    Send Back
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openFlagModal}
                    disabled={selectedOrder?.hasIssue}
                    className={`gap-2 ${selectedOrder?.hasIssue ? "bg-red-500 text-white hover:bg-red-600 cursor-not-allowed" : "bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"}`}
                  >
                    <AlertCircle className="h-4 w-4" />
                    {selectedOrder?.hasIssue ? "Issue Flagged" : "Flag Issue"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-border rounded-lg bg-card p-12 text-center">
                <Truck className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-2">Select an Order</h3>
                <p className="text-muted-foreground">Choose an order from the list to record returning</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this order?"
        description={
          selectedOrder
            ? `Delete order ${selectedOrder.orderNumber}? This cannot be undone.`
            : "Delete this order? This cannot be undone."
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Start Journey Modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowStartModal(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Play className="h-5 w-5 text-blue-500" />
                Start Journey - {selectedOrder?.orderNumber}
              </h3>
              <button onClick={() => setShowStartModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Personnel *</Label>
                <Input
                  value={startData.personnel}
                  onChange={(e) => setStartData(prev => ({ ...prev, personnel: e.target.value }))}
                  placeholder="Confirm personnel name"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date</Label>
                  <Input type="date" value={startData.date} disabled className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Time</Label>
                  <Input type="time" value={startData.time} disabled className="bg-muted" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Current Location</Label>
                <div className="p-3 bg-muted rounded-lg">
                  {startData.location ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-500" />
                      <span className="text-sm">{formatLocationLabel(startData.location)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span className="text-sm">Getting location...</span>
                    </div>
                  )}
                </div>
              </div>

              {gpsError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 text-sm">
                  {gpsError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowStartModal(false)} className="flex-1 bg-transparent">
                  Cancel
                </Button>
                <Button
                  onClick={handleStartJourney}
                  className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                  disabled={!startData.personnel}
                >
                  <Play className="h-4 w-4" />
                  Start Tracking
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End Journey Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEndModal(false)}>
          <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Square className="h-5 w-5 text-red-500" />
                End Journey - {selectedOrder?.orderNumber}
              </h3>
              <button onClick={() => setShowEndModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Personnel *</Label>
                <Input
                  value={endData.personnel}
                  onChange={(e) => setEndData(prev => ({ ...prev, personnel: e.target.value }))}
                  placeholder="Confirm personnel name"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">End Location</Label>
                <div className="p-3 bg-muted rounded-lg">
                  {endData.location ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-red-500" />
                      <span className="text-sm">{formatLocationLabel(endData.location)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span className="text-sm">Getting location...</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                Make sure you are back at the hub before ending the journey.
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowEndModal(false)} className="flex-1 bg-transparent">
                  Cancel
                </Button>
                <Button
                  onClick={handleEndJourney}
                  className="flex-1 gap-2 bg-red-600 text-white hover:bg-red-700"
                  disabled={!endData.personnel}
                >
                  <Square className="h-4 w-4" />
                  End Journey
                </Button>
              </div>
            </div>
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
                Flag Issue - {selectedOrder?.orderNumber}
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
                <Button variant="outline" onClick={() => setShowFlagModal(false)} className="flex-1 bg-transparent">
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

      {/* Delivery Log Bottom Sheet (non-blocking) */}
      {showSetupLog && selectedOrder?.setupData?.gpsTracking?.route?.length ? (
        <div className="fixed inset-0 z-50" onClick={() => setShowSetupLog(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Delivery Log</p>
                <h3 className="truncate text-base font-semibold text-foreground">{selectedOrder.orderNumber}</h3>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 bg-transparent"
                  onClick={() => {
                    const tracking = selectedOrder.setupData?.gpsTracking
                    if (!tracking) return
                    const payload = {
                      orderNumber: selectedOrder.orderNumber,
                      customerName: selectedOrder.customerData.customerName,
                      journeyStart: selectedOrder.setupData?.journeyStart || null,
                      gpsTracking: tracking,
                    }
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `${selectedOrder.orderNumber}-setup-log.json`
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 bg-transparent"
                  onClick={() => {
                    const tracking = selectedOrder.setupData?.gpsTracking
                    if (!tracking) return

                    const escapeHtml = (s: string) =>
                      s
                        .replaceAll("&", "&amp;")
                        .replaceAll("<", "&lt;")
                        .replaceAll(">", "&gt;")
                        .replaceAll("\"", "&quot;")
                        .replaceAll("'", "&#039;")

                    const rows = tracking.route
                      .map((p, idx) => {
                        const coords = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                        const address = p.fullAddress || p.streetName || ""
                        const where = address ? `${address} (${coords})` : coords
                        const label = idx === 0 ? "Start" : idx === tracking.route.length - 1 ? "End" : `Point ${idx + 1}`
                        const accuracy = p.accuracy ? `±${Math.round(p.accuracy)}m` : ""
                        return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(formatTrackingTime(p.timestamp))}</td><td>${escapeHtml(where)}</td><td>${escapeHtml(accuracy)}</td></tr>`
                      })
                      .join("")

                    const started = tracking.startedAt ? formatTrackingTime(tracking.startedAt) : "-"
                    const ended = tracking.endedAt ? formatTrackingTime(tracking.endedAt) : "-"
                    const duration =
                      tracking.startedAt && tracking.endedAt ? formatTrackingDuration(tracking.startedAt, tracking.endedAt) : "-"

                    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(selectedOrder.orderNumber)} - Delivery Log</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 18px; }
    .meta { margin: 0 0 16px; color: #444; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f6f6f6; text-align: left; }
  </style>
</head>
<body>
  <h1>Delivery Log - ${escapeHtml(selectedOrder.orderNumber)}</h1>
  <div class="meta">
    Customer: ${escapeHtml(selectedOrder.customerData.customerName)}<br/>
    Started: ${escapeHtml(started)} • Ended: ${escapeHtml(ended)} • Duration: ${escapeHtml(duration)} • Points: ${tracking.route.length}
  </div>
  <table>
    <thead><tr><th>Label</th><th>Time</th><th>Location</th><th>Accuracy</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`

                    const w = window.open("", "_blank")
                    if (!w) return
                    w.document.open()
                    w.document.write(html)
                    w.document.close()
                    w.focus()
                    w.print()
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowSetupLog(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(85vh-64px)] overflow-y-auto p-4">
              {(() => {
                const tracking = selectedOrder.setupData?.gpsTracking
                if (!tracking) return null

                const started = tracking.startedAt ? formatTrackingTime(tracking.startedAt) : "-"
                const ended = tracking.endedAt ? formatTrackingTime(tracking.endedAt) : "-"
                const duration =
                  tracking.startedAt && tracking.endedAt ? formatTrackingDuration(tracking.startedAt, tracking.endedAt) : "-"

                return (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <p>
                        Started: <span className="font-medium">{started}</span> • Ended: <span className="font-medium">{ended}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Duration: {duration} • {tracking.route.length} points
                      </p>
                    </div>

                    {tracking.route.length >= 2 && !setupLogMapFailed ? (
                      (() => {
                        const mapUrl = generateStaticMapUrl(tracking.route, 900, 320)
                        if (!mapUrl) return null
                        return (
                          <img
                            src={mapUrl}
                            alt="Setup journey route"
                            className="w-full rounded-lg border border-border object-cover"
                            onError={() => setSetupLogMapFailed(true)}
                          />
                        )
                      })()
                    ) : (
                      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        {setupLogMapFailed ? "Map preview failed to load" : "Map will appear after 2+ points"}
                      </div>
                    )}

                    <div className="space-y-2">
                      {tracking.route.map((p, idx) => {
                        const label = idx === 0 ? "Start" : idx === tracking.route.length - 1 ? "End" : `Point ${idx + 1}`
                        const coords = `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
                        const address = p.fullAddress || p.streetName
                        const display = address ? `${address} (${coords})` : coords
                        return (
                          <div
                            key={`${p.timestamp}-${idx}`}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{label}</p>
                              <p className="text-xs text-muted-foreground">{formatTrackingTime(p.timestamp)}</p>
                              <p className="break-words text-muted-foreground">{display}</p>
                            </div>
                            <div className="whitespace-nowrap text-xs text-muted-foreground">{p.accuracy ? `±${Math.round(p.accuracy)}m` : ""}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </Suspense>
    <AlertDialog
      open={alertState.open}
      title={alertState.title}
      description={alertState.description}
      actionText={alertState.actionText}
      onClose={closeAlert}
    />
    {showSendBackModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSendBackModal(false)}>
        <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-500" />
              Send Back - {selectedOrder?.orderNumber}
            </h3>
            <button onClick={() => setShowSendBackModal(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose where to send this order back to:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedOrder && isPhaseRequired(selectedOrder, "setup") && (
                <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("setting-up")}>
                  <Undo2 className="h-4 w-4" />
                  Back to Setup (Redo)
                </Button>
              )}
              {selectedOrder && isPhaseRequired(selectedOrder, "packing") && (
                <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("packing")}>
                  <Undo2 className="h-4 w-4" />
                  Back to Planning
                </Button>
              )}
              <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("procurement")}>
                <Undo2 className="h-4 w-4" />
                Back to Procurement
              </Button>
              <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("scheduling")}>
                <Undo2 className="h-4 w-4" />
                Back to Sales order
              </Button>
            </div>
            <div className="pt-2">
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowSendBackModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
