"use client"

import React, { useState, useEffect, Suspense, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  ChevronRight,
  Calendar,
  Clock,
  User,
  MapPin,
  ArrowLeft,
  Undo2,
  CheckCircle,
  Camera,
  X,
  AlertCircle,
  Play,
  Square,
  Truck,
  Save,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react"
import type { SalesOrder, IssueData, SetupData, SetupPhase } from "@/lib/types"
import { LORRIES } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getNextStatus } from "@/lib/order-flow"

export default function SettingUpPage() {
  const router = useRouter()
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

  // Setup phase state
  const [setupPhase, setSetupPhase] = useState<SetupPhase>("pending")
  const [photos, setPhotos] = useState<string[]>([])

  // Modal states
  const [showStartModal, setShowStartModal] = useState(false)
  const [showEndModal, setShowEndModal] = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Start delivery form data
  const [startData, setStartData] = useState({
    personnel: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })

  // End delivery form data
  const [endData, setEndData] = useState({
    personnel: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })

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
    const settingUpOrders = allOrders.filter(order => order.status === "setting-up")
    setOrders(settingUpOrders)
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
    const phase = normalized.setupData?.phase || "pending"
    setSetupPhase(phase)
    setPhotos(normalized.setupData?.photos || [])
  }

  // Start Delivery
  const openStartModal = () => {
    setStartData({
      personnel: selectedOrder?.setupData?.acceptance?.personnel || "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })
    setShowStartModal(true)
  }

  const handleStartDelivery = () => {
    if (!selectedOrder || !startData.personnel) {
      showAlert("Please fill in all required fields")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      setupData: {
        ...order.setupData!,
        phase: "tracking" as SetupPhase,
        setupPersonnel: startData.personnel,
        setupDate: startData.date,
        setupStartTime: startData.time,
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const updated = getAllOrders().find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) {
      setSelectedOrder(updated)
      setSetupPhase("tracking")
    }
    setShowStartModal(false)
    showAlert("Delivery started!", { title: "Started" })
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

  // End Delivery
  const openEndModal = () => {
    setEndData({
      personnel: selectedOrder?.setupData?.setupPersonnel || "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })
    setShowEndModal(true)
  }

  const handleEndDelivery = () => {
    if (!selectedOrder || !endData.personnel) {
      showAlert("Please fill in all required fields")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      setupData: {
        ...order.setupData!,
        setupCompletionTime: endData.time,
        phase: "completed" as SetupPhase,
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
    showAlert("Delivery completed!", { title: "Completed" })
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
        ? "Order sent back to Packing!"
        : target === "procurement"
          ? "Order sent back to Procurement!"
          : "Order sent back to Sales Confirmation!",
      { title: "Sent Back" }
    )
  }

  // Complete delivery
  const handleDeliveryDone = () => {
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

    const setupData = selectedOrder.setupData

    switch (setupPhase) {
      case "pending":
        return (
          <div className="p-6 text-center">
            <Truck className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground mb-2">Ready to Start Delivery</h3>
            <p className="text-muted-foreground mb-6">Click the button below to start the delivery.</p>
            <Button onClick={openStartModal} size="lg" className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              <Play className="h-5 w-5" />
              Start Delivery
            </Button>
          </div>
        )

      case "tracking":
      case "photos_saved":
        return (
          <div className="space-y-4">
            {/* Delivery Started Info */}
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800 dark:text-blue-200">Delivery In Progress</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">PIC:</span>
                  <span className="ml-2 font-medium">{setupData?.setupPersonnel || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(setupData?.setupDate || "")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Start Time:</span>
                  <span className="ml-2">{setupData?.setupStartTime || "-"}</span>
                </div>
              </div>
            </div>

            {/* Photo Upload */}
            <div className="p-4 border border-border rounded-lg">
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
            </div>

            {/* Complete Delivery Button */}
            <div className="p-4 border-t border-border">
              <Button onClick={openEndModal} size="lg" className="w-full gap-2 bg-green-600 text-white hover:bg-green-700">
                <Square className="h-5 w-5" />
                Complete Delivery
              </Button>
            </div>
          </div>
        )

      case "completed":
        return (
          <div className="space-y-4">
            {/* Completed Banner */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">Delivery Completed</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">PIC:</span>
                  <span className="ml-2 font-medium">{setupData?.setupPersonnel || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="ml-2">{formatDate(setupData?.setupDate || "")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Start Time:</span>
                  <span className="ml-2">{setupData?.setupStartTime || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">End Time:</span>
                  <span className="ml-2">{setupData?.setupCompletionTime || "-"}</span>
                </div>
              </div>
            </div>

            {/* Photo Gallery */}
            {photos.length > 0 && (
              <div className="p-4 border border-border rounded-lg">
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
              <Button onClick={handleDeliveryDone} className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
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
                      Apply
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={clearDateRange}>
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                {filteredOrders.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No orders pending delivery.
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <button
                      key={order.orderNumber}
                      type="button"
                      onClick={() => handleSelectOrder(order)}
                      className={`w-full p-4 text-left transition-colors hover:bg-muted/50 ${
                        selectedOrder?.orderNumber === order.orderNumber ? "bg-accent/10" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{order.orderNumber}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{order.customerData.customerName}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(order.eventData.eventDate)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Order Details */}
            <div className="lg:col-span-2 border border-border rounded-lg bg-card">
              {!selectedOrder ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  Select an order to view details
                </div>
              ) : (
                <div>
                  {/* Order Header */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{selectedOrder.orderNumber}</h3>
                        <p className="text-sm text-muted-foreground">{selectedOrder.customerData.customerName}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/portal/packing?order=${encodeURIComponent(selectedOrder.orderNumber)}`)}
                          className="gap-2 bg-transparent"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          Return
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteOpen(true)}
                          className="gap-2 bg-transparent text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                        <Button variant="outline" size="sm" onClick={openFlagModal} className="gap-2 bg-transparent" disabled={selectedOrder.hasIssue}>
                          <AlertCircle className="h-4 w-4" />
                          {selectedOrder.hasIssue ? "Issue Flagged" : "Flag Issue"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={openSendBackModal} className="gap-2 bg-transparent">
                          <Undo2 className="h-4 w-4" />
                          Send Back
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Order Info */}
                  <div className="p-4 border-b border-border bg-muted/30">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Event Date:</span>
                        <span className="ml-2 font-medium">{formatDate(selectedOrder.eventData.eventDate)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Event:</span>
                        <span className="ml-2 font-medium">{selectedOrder.eventData.eventName || "-"}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Address:</span>
                        <span className="ml-2 font-medium">{selectedOrder.customerData.deliveryAddress || "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Phase Content */}
                  {renderPhaseContent()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Start Delivery Modal */}
        <ConfirmDialog
          open={showStartModal}
          title="Start Delivery"
          description="Enter the delivery details to begin."
          confirmText="Start"
          cancelText="Cancel"
          onConfirm={handleStartDelivery}
          onCancel={() => setShowStartModal(false)}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Person in Charge (PIC) *</Label>
              <Input value={startData.personnel} onChange={(e) => setStartData(prev => ({ ...prev, personnel: e.target.value }))} placeholder="Name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={startData.date} onChange={(e) => setStartData(prev => ({ ...prev, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Time</Label>
                <Input type="time" value={startData.time} onChange={(e) => setStartData(prev => ({ ...prev, time: e.target.value }))} />
              </div>
            </div>
          </div>
        </ConfirmDialog>

        {/* End Delivery Modal */}
        <ConfirmDialog
          open={showEndModal}
          title="Complete Delivery"
          description="Confirm the delivery completion."
          confirmText="Complete"
          cancelText="Cancel"
          onConfirm={handleEndDelivery}
          onCancel={() => setShowEndModal(false)}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Person in Charge (PIC) *</Label>
              <Input value={endData.personnel} onChange={(e) => setEndData(prev => ({ ...prev, personnel: e.target.value }))} placeholder="Name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={endData.date} onChange={(e) => setEndData(prev => ({ ...prev, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Completion Time</Label>
                <Input type="time" value={endData.time} onChange={(e) => setEndData(prev => ({ ...prev, time: e.target.value }))} />
              </div>
            </div>
          </div>
        </ConfirmDialog>

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
        <ConfirmDialog
          open={showFlagModal}
          title="Flag Issue"
          description="Report an issue with this delivery."
          confirmText="Flag"
          cancelText="Cancel"
          onConfirm={handleFlagIssue}
          onCancel={() => setShowFlagModal(false)}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Personnel *</Label>
              <Input value={flagData.personnel} onChange={(e) => setFlagData(prev => ({ ...prev, personnel: e.target.value }))} placeholder="Name" />
            </div>
            <div className="space-y-1">
              <Label>Issue *</Label>
              <Input value={flagData.issue} onChange={(e) => setFlagData(prev => ({ ...prev, issue: e.target.value }))} placeholder="What happened?" />
            </div>
          </div>
        </ConfirmDialog>

        {/* Send Back Modal */}
        <ConfirmDialog
          open={showSendBackModal}
          title="Send Back Order"
          description="Choose where to send this order back to."
          confirmText=""
          cancelText="Cancel"
          onConfirm={() => {}}
          onCancel={() => setShowSendBackModal(false)}
        >
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start bg-transparent" onClick={() => sendBackTo("packing")}>
              Send to Packing
            </Button>
            <Button variant="outline" className="w-full justify-start bg-transparent" onClick={() => sendBackTo("procurement")}>
              Send to Procurement
            </Button>
            <Button variant="outline" className="w-full justify-start bg-transparent" onClick={() => sendBackTo("scheduling")}>
              Send to Sales Confirmation
            </Button>
          </div>
        </ConfirmDialog>

        <AlertDialog {...alertState} onClose={closeAlert} />
      </Suspense>
    </>
  )
}
