"use client"

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
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
  Wrench,
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
  Play,
  Square,
  Navigation,
  Truck,
  Save,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import type { SalesOrder, IssueData, SetupData, SetupPhase, JourneyStart, GPSPoint, GPSTrackingData } from "@/lib/types"
import { LORRIES } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getNextStatus } from "@/lib/order-flow"
import { useSearchParams } from "next/navigation"
import { useGPSTracking, generateStaticMapUrl, formatTrackingTime, formatTrackingDuration } from "@/hooks/use-gps-tracking"
import { getLunchWindowFromLocalStorage, overlapsMinutesWindow, parseHHMMToMinutes } from "@/lib/time-window"

export default function SettingUpPage() {
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

  // Setup phase state
  const [setupPhase, setSetupPhase] = useState<SetupPhase>("pending")
  const [photos, setPhotos] = useState<string[]>([])

  // Modal states
  const [showStartModal, setShowStartModal] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showSendBackModal, setShowSendBackModal] = useState(false)

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
          setupData: {
            ...order.setupData!,
            gpsTracking: {
              ...order.setupData?.gpsTracking,
              route: [...(order.setupData?.gpsTracking?.route || []), point],
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
    const settingUpOrders = allOrders.filter(order => order.status === "setting-up")
    setOrders(settingUpOrders)
    setIsLoading(false)
  }

  const isLunchOverlapForOrder = (order: SalesOrder) => {
    const info = order.additionalInfo
    if (!info?.scheduleStartTime || !info?.estimatedEndTime) return false
    const { lunchStartTime, lunchEndTime } = getLunchWindowFromLocalStorage()
    const lunchStartMins = parseHHMMToMinutes(lunchStartTime)
    const lunchEndMins = parseHHMMToMinutes(lunchEndTime)
    const startMins = parseHHMMToMinutes(info.scheduleStartTime)
    const endMins = parseHHMMToMinutes(info.estimatedEndTime)
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
      const setupLorry = order.setupData?.acceptance?.lorry
      const lorryName = LORRIES.find(l => l.id === setupLorry)?.name || normalizeTeamLabel(setupLorry || "")
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

  const ensureSetupData = (order: SalesOrder) => {
    if (order.setupData) return order

    const setupData: SetupData = {
      setupPersonnel: "",
      setupDate: "",
      setupStartTime: "",
      setupCompletionTime: "",
      photos: [],
      status: "pending",
      phase: "pending",
    }

    updateOrderByNumber(order.orderNumber, (current) => ({
      ...current,
      setupData,
      updatedAt: new Date().toISOString(),
    }))

    return { ...order, setupData }
  }

  const handleSelectOrder = (order: SalesOrder) => {
    const normalized = ensureSetupData(order)
    setSelectedOrder(normalized)
    // Determine phase from order data
    const phase = normalized.setupData?.phase || "pending"
    setSetupPhase(phase)
    setPhotos(normalized.setupData?.photos || [])
  }

  // Start Journey
  const openStartModal = async () => {
    setStartData({
      personnel: selectedOrder?.setupData?.acceptance?.personnel || "",
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
      setupData: {
        ...order.setupData!,
        phase: "tracking" as SetupPhase,
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
      setSetupPhase("tracking")
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
      setupData: {
        ...order.setupData!,
        photos,
        photosSavedAt: new Date().toISOString(),
        phase: "photos_saved" as SetupPhase,
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) {
      setSelectedOrder(updated)
      setSetupPhase("photos_saved")
    }
    showAlert("Photos saved!", { title: "Saved" })
  }

  // End Journey
  const openEndModal = async () => {
    setEndData({
      personnel: selectedOrder?.setupData?.journeyStart?.personnel || "",
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
      setupData: {
        ...order.setupData!,
        setupCompletionTime: new Date().toTimeString().slice(0, 5),
        phase: "completed" as SetupPhase,
        gpsTracking: {
          ...order.setupData?.gpsTracking,
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
      setSetupPhase("completed")
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
      flaggedAtStage: "setting-up",
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

  const sendBackTo = (target: "packing" | "procurement" | "scheduling") => {
    if (!selectedOrder) return

    // Ensure timers stop before we clear data / navigate.
    stopTracking()

    updateOrderByNumber(selectedOrder.orderNumber, (order) => {
      const base = {
        ...order,
        status: target,
        updatedAt: new Date().toISOString(),
      }

      if (target === "packing" || target === "procurement") {
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
    setSetupPhase("pending")
    setPhotos([])
    setShowSendBackModal(false)
    showAlert(
      target === "packing"
        ? "Order sent back to Planning!"
        : target === "procurement"
          ? "Order sent back to Procurement!"
          : "Order sent back to Sales Confirmation!",
      { title: "Sent Back" }
    )
  }

  // Complete setup
  const handleSetupDone = () => {
    if (!selectedOrder) return

    const nextStatus = getNextStatus(selectedOrder, "setting-up")
    updateOrderByNumber(selectedOrder.orderNumber, (order) => {
      const base = {
        ...order,
        status: nextStatus,
        setupData: {
          ...order.setupData!,
          status: "completed" as const,
        },
        updatedAt: new Date().toISOString(),
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
            status: "pending" as const,
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
            status: "pending" as const,
          },
        }
      }
      return base
    })
    loadOrders()
    setSelectedOrder(null)
    setSetupPhase("pending")
    setPhotos([])
    if (nextStatus === "dismantling") {
      showAlert("Delivery completed! Order moved to Returning.", { title: "Updated" })
      router.push("/portal/returning")
    } else if (nextStatus === "other-adhoc") {
      showAlert("Delivery completed! Order moved to Other Adhoc.", { title: "Updated" })
      router.push("/portal/other-adhoc")
    } else {
      showAlert("Delivery completed! Order moved to Invoice.", { title: "Invoice" })
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

    const acceptance = selectedOrder.setupData?.acceptance
    const journeyStart = selectedOrder.setupData?.journeyStart
    const gpsTracking = selectedOrder.setupData?.gpsTracking
    const displayRoute = isTracking ? route : (gpsTracking?.route || [])

      switch (setupPhase) {
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
                      if (!selectedOrder?.setupData?.gpsTracking?.route?.length) {
                        showAlert("No existing tracking data to resume. Start Journey again.", { title: "Tracking" })
                        return
                      }
                      const point = await resumeTracking(selectedOrder.setupData.gpsTracking.route)
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

            {/* Photo Upload */}
            <div className="p-4 border-t border-border">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Photo Proof
                {setupPhase === "photos_saved" && (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">Saved</span>
                )}
              </h4>
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative">
                    <img src={photo} alt={`Delivery ${idx + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border" />
                    {setupPhase !== "photos_saved" && (
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
                {setupPhase !== "photos_saved" && photos.length < 4 && (
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
              {setupPhase === "tracking" && photos.length > 0 && (
                <Button onClick={handleSavePhotos} className="mt-4 gap-2 bg-green-600 text-white hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  Save Images
                </Button>
              )}
              {setupPhase === "photos_saved" && (
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
                <h4 className="font-medium mb-3">Delivery Photos</h4>
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo, idx) => (
                    <img key={idx} src={photo} alt={`Delivery ${idx + 1}`} className="h-24 w-24 object-cover rounded-lg border border-border" />
                  ))}
                </div>
              </div>
            )}

            {/* Complete Button */}
            <div className="p-4 border-t border-border">
              <Button onClick={handleSetupDone} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <CheckCircle className="h-4 w-4" />
                {((selectedOrder?.orderSource === "ad-hoc"
                  ? selectedOrder?.adHocOptions?.requiresDismantle
                  : selectedOrder?.eventData?.dismantleRequired) ?? true)
                  ? "Delivery Done - Proceed to Returning"
                  : "Delivery Done - Proceed to Invoice"}
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
      <Suspense fallback={null}>
        <div className="space-y-6">
          <OrderProgress
            currentStep="delivery"
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
                <h2 className="font-semibold text-foreground mb-3">Pending Delivery</h2>
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
                    <Wrench className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No orders pending delivery</p>
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
                            {order.setupData?.acceptance && (
                              <span
                                className="text-xs px-1.5 py-0.5 rounded text-white"
                                style={{ backgroundColor: getLorryColor(order.setupData.acceptance.lorry) }}
                              >
                                {LORRIES.find(l => l.id === order.setupData?.acceptance?.lorry)?.name?.replace("Lorry ", "")}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{order.customerData.customerName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(order.eventData.customerPreferredSetupDate)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Setup Details */}
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
                            Delivery: {formatDate(selectedOrder.additionalInfo?.confirmedSetupDate || selectedOrder.eventData.customerPreferredSetupDate)}
                          </p>
                          <p className="flex items-center gap-1 justify-end text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            {selectedOrder.customerData.deliveryAddress || "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {!!selectedOrder.customerData?.photos?.length && (
                      <div className="p-4 border-b border-border bg-muted/10">
                        <h3 className="font-semibold text-foreground mb-3">Customer Uploaded Photos</h3>
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

                    {/* Schedule Info from Additional Info - if available */}
                    {selectedOrder.additionalInfo && (
                      <div className="p-4 border-b border-border bg-blue-50">
                      <h3 className="font-semibold text-blue-900 mb-2">Delivery Schedule Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-blue-700">Departure:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.departureFromHub || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Arrival:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.confirmedSetupTime || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Travel:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {`${selectedOrder.additionalInfo.travelDurationHours || 0}h ${selectedOrder.additionalInfo.travelDurationMinutes || 0}m`}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Distance:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.setupDistanceKm ? `${selectedOrder.additionalInfo.setupDistanceKm} km` : "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Est. End:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.estimatedEndTime || "Not set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Team:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.setupLorry || "Not assigned"}
                          </span>
                        </div>
                        <div>
                          <span className="text-blue-700">Buffer:</span>
                          <span className="ml-2 font-medium text-blue-900">
                            {selectedOrder.additionalInfo.bufferTime ? `${selectedOrder.additionalInfo.bufferTime} mins` : "Not set"}
                          </span>
                        </div>
                      </div>

                      {selectedOrder.additionalInfo.setupNextAction && (
                        <div className="mt-3 rounded-lg border border-blue-200 bg-white/70 p-3">
                          <p className="text-xs font-semibold text-blue-800 mb-2">After Delivery Completion</p>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-blue-700">Next:</span>
                              <span className="ml-2 font-medium text-blue-900">
                                {selectedOrder.additionalInfo.setupNextAction === "warehouse"
                                  ? "Return to Warehouse"
                                  : `Next Task (${selectedOrder.additionalInfo.setupNextTaskOrderNumber || "-"})`}
                              </span>
                            </div>
                            <div>
                              <span className="text-blue-700">ETA:</span>
                              <span className="ml-2 font-medium text-blue-900">
                                {selectedOrder.additionalInfo.setupNextAction === "warehouse"
                                  ? (selectedOrder.additionalInfo.setupReturnArrivalTime || "Not set")
                                  : "Not set"}
                              </span>
                            </div>
                            <div>
                              <span className="text-blue-700">Distance:</span>
                              <span className="ml-2 font-medium text-blue-900">
                                {selectedOrder.additionalInfo.setupNextAction === "warehouse" && selectedOrder.additionalInfo.setupReturnDistanceKm
                                  ? `${selectedOrder.additionalInfo.setupReturnDistanceKm} km`
                                  : "Not set"}
                              </span>
                            </div>
                            <div>
                              <span className="text-blue-700">Duration:</span>
                              <span className="ml-2 font-medium text-blue-900">
                                {selectedOrder.additionalInfo.setupNextAction === "warehouse" && selectedOrder.additionalInfo.setupReturnTravelMins
                                  ? `${selectedOrder.additionalInfo.setupReturnTravelMins} mins`
                                  : "Not set"}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items List */}
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-foreground mb-3">Items to Set Up</h3>
                    <div className="space-y-2">
                      {selectedOrder.packingData?.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                          <span className="text-foreground">{item.name}</span>
                          <span className="font-medium text-foreground">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Phase Content */}
                  {renderPhaseContent()}

                  {/* Action Buttons */}
                  <div className="p-4 border-t border-border flex flex-wrap gap-2">
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
                  <Wrench className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Select an Order</h3>
                  <p className="text-muted-foreground">Choose an order from the list to start delivery</p>
                </div>
              )}
            </div>
          </div>
        </div>

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
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 bg-transparent"
                  onClick={() => sendBackTo("packing")}
                  disabled={selectedOrder?.orderSource === "ad-hoc" && selectedOrder?.adHocOptions?.requiresPacking === false}
                >
                  <Undo2 className="h-4 w-4" />
                  Back to Planning
                </Button>
                <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("procurement")}>
                  <Undo2 className="h-4 w-4" />
                  Back to Procurement
                </Button>
                <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => sendBackTo("scheduling")}>
                  <Undo2 className="h-4 w-4" />
                  Back to Sales Confirmation
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
