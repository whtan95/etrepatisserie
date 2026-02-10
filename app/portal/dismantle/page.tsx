"use client"

import React, { useEffect, Suspense, useRef, useState } from "react"
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
  Save,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react"
import type { SalesOrder, IssueData, DismantleData, DismantlePhase } from "@/lib/types"
import { LORRIES } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import Loading from "./loading"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getNextStatus, isPhaseRequired } from "@/lib/order-flow"
import { getLunchWindowFromLocalStorage, overlapsMinutesWindow, parseHHMMToMinutes } from "@/lib/time-window"

export default function DismantlePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Accept form data

  // Flag issue data
  const [flagData, setFlagData] = useState({
    personnel: "",
    issue: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
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
    // Determine phase from order data
    const phase = normalized.dismantleData?.phase || "pending"
    setDismantlePhase(phase)
    setPhotos(normalized.dismantleData?.photos || [])
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
    const canProceed =
      dismantlePhase === "photos_saved" ||
      dismantlePhase === "completed" ||
      Boolean(selectedOrder.dismantleData?.photosSavedAt)

    switch (dismantlePhase) {
      case "pending":
      case "accepted":
      case "tracking":
      case "photos_saved":
        return (
          <div className="space-y-4">
            {acceptance?.personnel && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-200">Order Accepted</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Personnel:</span>
                    <span className="ml-2 font-medium">{acceptance.personnel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lorry:</span>
                    <span
                      className="ml-2 font-medium px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: getLorryColor(acceptance.lorry || "") }}
                    >
                      {LORRIES.find((l) => l.id === acceptance.lorry)?.name || acceptance.lorry}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="ml-2">{formatDate(acceptance.acceptedDate || "")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>
                    <span className="ml-2">{acceptance.acceptedTime}</span>
                  </div>
                </div>
              </div>
            )}

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
              {dismantlePhase !== "photos_saved" && photos.length > 0 && (
                <Button onClick={handleSavePhotos} className="mt-4 gap-2 bg-green-600 text-white hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  Save Images
                </Button>
              )}
              {dismantlePhase === "photos_saved" && <p className="text-sm text-muted-foreground mt-2">Photos saved.</p>}
            </div>

            {canProceed && (
              <div className="p-4 border-t border-border">
                <Button onClick={handleDismantleDone} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                  <CheckCircle className="h-4 w-4" />
                  Returning Done - Proceed to Invoice
                </Button>
              </div>
            )}
          </div>
        )

      case "completed":
        return (
          <div className="space-y-4">
            {/* Completed Banner */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">Returning Completed</span>
              </div>
            </div>

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
