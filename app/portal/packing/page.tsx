"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import {
  Search,
  Package,
  ChevronRight,
  Calendar,
  Clock,
  User,
  MapPin,
  Undo2,
  CheckCircle,
  AlertCircle,
  X,
  AlertTriangle,
  Save,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SalesOrder, PackingItem, IssueData } from "@/lib/types"
import { getPhaseIndex } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getNextStatus } from "@/lib/order-flow"

export default function PackingPage() {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [appliedDateFrom, setAppliedDateFrom] = useState("")
  const [appliedDateTo, setAppliedDateTo] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [sortCriteria, setSortCriteria] = useState<"eventDate" | "name" | "orderDate" | "pricing">("eventDate")
  const [lorryFilter, setLorryFilter] = useState<"all" | "Team A" | "Team B" | "Team C" | "Team D" | "Team E">("all")
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({})
  const [packingInfo, setPackingInfo] = useState({
    personnel: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })
  const [isFormLocked, setIsFormLocked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showConfirmPacking, setShowConfirmPacking] = useState(false)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [showSendBackConfirm, setShowSendBackConfirm] = useState(false)
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
    const packingOrders = allOrders.filter(order => order.status === "packing")
    setOrders(packingOrders)
    setIsLoading(false)
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
      const setupLorry = order.additionalInfo?.setupLorry
      const normalized = normalizeTeamLabel(setupLorry || "")
      matchesLorry = normalized === lorryFilter
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

  const showAllDates = () => {
    setDateFrom("")
    setDateTo("")
    setAppliedDateFrom("")
    setAppliedDateTo("")
  }

  const clearDateRange = () => {
    setDateFrom("")
    setDateTo("")
  }

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
      flaggedAtStage: "packing",
      isResolved: false,
    }
    const updatedOrders = updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      hasIssue: true,
      issueData,
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
    const updated = updatedOrders.find(o => o.orderNumber === selectedOrder.orderNumber)
    if (updated) setSelectedOrder(updated)
    setShowFlagModal(false)
  }

  const handleSelectOrder = (order: SalesOrder) => {
    setSelectedOrder(order)
    // Initialize checked items from packingData
    const items: Record<number, boolean> = {}
    if (order.packingData?.items) {
      order.packingData.items.forEach((item, idx) => {
        items[idx] = item.packed
      })
    }
    setCheckedItems(items)
    // Set packing info if exists
    if (order.packingData) {
      setPackingInfo({
        personnel: order.packingData.packingPersonnel || "",
        date: order.packingData.packingDate || new Date().toISOString().split("T")[0],
        time: order.packingData.packingTime || new Date().toTimeString().slice(0, 5),
      })
      // Check if form was previously saved
      setIsFormLocked(order.packingData.status === "packed")
    } else {
      setIsFormLocked(false)
    }
  }

  const handleCheckItem = (idx: number, checked: boolean) => {
    setCheckedItems(prev => ({ ...prev, [idx]: checked }))
  }

  const allItemsChecked = selectedOrder?.packingData?.items && 
    selectedOrder.packingData.items.length > 0 &&
    Object.values(checkedItems).filter(Boolean).length === selectedOrder.packingData.items.length

  const handleRejectToScheduling = () => {
    if (!selectedOrder) return
    setShowSendBackConfirm(true)
  }

  const confirmRejectToScheduling = () => {
    if (!selectedOrder) return
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "scheduling" as const,
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
    setSelectedOrder(null)
    setCheckedItems({})
    showAlert("Order sent back to Scheduling!", { title: "Sent Back" })
    setShowSendBackConfirm(false)
  }

  const confirmPacking = () => {
    if (!selectedOrder || !packingInfo.personnel) {
      showAlert("Please enter packing personnel name")
      return
    }
    if (!allItemsChecked) {
      showAlert("Please check all items before saving")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      packingData: {
        ...order.packingData!,
        packingPersonnel: packingInfo.personnel,
        packingDate: packingInfo.date,
        packingTime: packingInfo.time,
        items: order.packingData!.items.map((item, idx) => ({
          ...item,
          packed: checkedItems[idx] || false,
        })),
        status: "packed" as const,
      },
      updatedAt: new Date().toISOString(),
    }))

    setIsFormLocked(true)
    showAlert("Packing information saved!", { title: "Saved" })
    loadOrders()
  }

  const handleEditInformation = () => {
    setIsFormLocked(false)
  }

  const handleProceedToSetup = () => {
    if (!selectedOrder || !packingInfo.personnel) {
      showAlert("Please enter packing personnel name")
      return
    }
    if (!allItemsChecked) {
      showAlert("Please check all items before proceeding")
      return
    }
    if (!isFormLocked) {
      showAlert("Please confirm first before proceeding")
      return
    }

    const nextStatus = getNextStatus(selectedOrder, "packing")
    updateOrderByNumber(selectedOrder.orderNumber, (order) => {
      const base = {
        ...order,
        status: nextStatus,
        packingData: {
          ...order.packingData!,
          packingPersonnel: packingInfo.personnel,
          packingDate: packingInfo.date,
          packingTime: packingInfo.time,
          items: order.packingData!.items.map((item, idx) => ({
            ...item,
            packed: checkedItems[idx] || false,
          })),
          status: "packed" as const,
        },
        updatedAt: new Date().toISOString(),
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
            status: "pending" as const,
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
    setCheckedItems({})
    setPackingInfo({
      personnel: "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })

    if (nextStatus === "setting-up") {
      showAlert("Order moved to Setting Up!", { title: "Updated" })
    } else if (nextStatus === "dismantling") {
      showAlert("Order moved to Dismantle!", { title: "Updated" })
    } else if (nextStatus === "other-adhoc") {
      showAlert("Order moved to Other Adhoc!", { title: "Updated" })
    } else {
      showAlert("Order completed!", { title: "Completed" })
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <>
    <Suspense fallback={null}>
      <ConfirmDialog
        open={showConfirmPacking}
        title="Confirm packing?"
        description="Are you sure you want to confirm and save this packing information? You can still proceed to setup later."
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={() => {
          setShowConfirmPacking(false)
          confirmPacking()
        }}
        onCancel={() => setShowConfirmPacking(false)}
      />
      <div className="space-y-6">
        {/* Progress Bar */}
        <OrderProgress
          currentStep="packing"
          orderNumber={selectedOrder?.orderNumber}
          hasIssue={selectedOrder?.hasIssue}
          orderSource={selectedOrder?.orderSource}
          adHocOptions={selectedOrder?.adHocOptions}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List */}
          <div className="lg:col-span-1 border border-border rounded-lg bg-card">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground mb-3">Orders to Pack</h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1">Team</Label>
                      <Select value={lorryFilter} onValueChange={(v) => setLorryFilter(v as typeof lorryFilter)}>
                        <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        <SelectItem value="Team A">Team A</SelectItem>
                        <SelectItem value="Team B">Team B</SelectItem>
                        <SelectItem value="Team C">Team C</SelectItem>
                        <SelectItem value="Team D">Team D</SelectItem>
                        <SelectItem value="Team E">Team E</SelectItem>
                      </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end sm:col-span-2">
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
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No orders ready for packing</p>
                </div>
              ) : (
                filteredOrders.map((order) => (
                  <button
                    key={order.orderNumber}
                    type="button"
                    onClick={() => handleSelectOrder(order)}
                    className={`w-full p-4 text-left border-b border-border hover:bg-accent/30 transition-colors ${
                      selectedOrder?.orderNumber === order.orderNumber
                        ? "bg-accent/50"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{order.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.customerData.customerName}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(order.eventData.eventDate)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Packing Details */}
          <div className="lg:col-span-2">
            {selectedOrder ? (
              <div className="border border-border rounded-lg bg-card">
                {/* Order Info Header - NO PRICES */}
                <div className="p-4 border-b border-border bg-muted/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">
                        {selectedOrder.orderNumber}
                      </h2>
                      <p className="text-muted-foreground">
                        {selectedOrder.customerData.customerName}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="flex items-center gap-1 justify-end text-foreground">
                        <Calendar className="h-4 w-4" />
                        Event: {formatDate(selectedOrder.eventData.eventDate)}
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
                  <div className="p-4 border-b border-border bg-blue-50">
                    <h3 className="font-semibold text-blue-900 mb-2">Setup Schedule Information</h3>
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
                  </div>
                )}

                {/* Customer Uploaded Photos (from Sales Order) */}
                {!!selectedOrder.customerData?.photos?.length && (
                  <div className="p-4 border-b border-border bg-muted/10">
                    <h3 className="font-semibold text-foreground mb-3">Customer Uploaded Photos</h3>
                    <div className="flex flex-wrap gap-2">
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

                {/* Items to Pack Checklist */}
                <div className="p-4">
                  <h3 className="font-semibold text-foreground mb-4">Items to Pack</h3>
                  <div className="space-y-3">
                    {selectedOrder.packingData?.items && selectedOrder.packingData.items.length > 0 ? (
                      selectedOrder.packingData.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 border border-border rounded-lg"
                        >
                          <Checkbox
                            id={`item-${idx}`}
                            checked={checkedItems[idx] || false}
                            onCheckedChange={(checked) => handleCheckItem(idx, !!checked)}
                            disabled={isFormLocked}
                          />
                          <Label
                            htmlFor={`item-${idx}`}
                            className="flex-1 cursor-pointer text-foreground"
                          >
                            <span className="font-medium">{item.name}</span>
                          </Label>
                          <span className="font-semibold text-foreground">x{item.quantity}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                        <p>No items found for this order</p>
                      </div>
                    )}
                  </div>

                  {selectedOrder.packingData?.items && selectedOrder.packingData.items.length > 0 && (
                    <div className="mt-4 flex items-center gap-2 text-sm">
                      <CheckCircle className={`h-4 w-4 ${allItemsChecked ? "text-green-600" : "text-muted-foreground"}`} />
                      <span className={allItemsChecked ? "text-green-600 font-medium" : "text-muted-foreground"}>
                        {Object.values(checkedItems).filter(Boolean).length} of {selectedOrder.packingData.items.length} items checked
                      </span>
                    </div>
                  )}
                </div>

                {/* Packing Personnel Info */}
                <div className="p-4 border-t border-border bg-muted/30">
                  <h3 className="font-semibold text-foreground mb-4">Packing Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="packing-personnel" className="text-foreground">
                        <User className="h-4 w-4 inline mr-1" />
                        Packing Personnel *
                      </Label>
                      <Input
                        id="packing-personnel"
                        value={packingInfo.personnel}
                        onChange={(e) =>
                          setPackingInfo((prev) => ({
                            ...prev,
                            personnel: e.target.value,
                          }))
                        }
                        placeholder="Enter name"
                        className="mt-1"
                        disabled={isFormLocked}
                      />
                    </div>
                    <div>
                      <Label htmlFor="packing-date" className="text-foreground">
                        <Calendar className="h-4 w-4 inline mr-1" />
                        Date
                      </Label>
                      <Input
                        id="packing-date"
                        type="date"
                        value={packingInfo.date}
                        onChange={(e) =>
                          setPackingInfo((prev) => ({
                            ...prev,
                            date: e.target.value,
                          }))
                        }
                        className="mt-1"
                        disabled={isFormLocked}
                      />
                    </div>
                    <div>
                      <Label htmlFor="packing-time" className="text-foreground">
                        <Clock className="h-4 w-4 inline mr-1" />
                        Time
                      </Label>
                      <Input
                        id="packing-time"
                        type="time"
                        value={packingInfo.time}
                        onChange={(e) =>
                          setPackingInfo((prev) => ({
                            ...prev,
                            time: e.target.value,
                          }))
                        }
                        className="mt-1"
                        disabled={isFormLocked}
                      />
                    </div>
                  </div>

                </div>

                {/* Action Buttons */}
                <div className="p-4 border-t border-border flex flex-wrap gap-2 justify-between">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRejectToScheduling}
                      className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
                      disabled={isFormLocked}
                    >
                      <Undo2 className="h-4 w-4" />
                      Send Back to Scheduling
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
                    <div className="flex gap-2">
                      {isFormLocked ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={handleEditInformation}
                            className="gap-2 bg-transparent"
                          >
                            <Save className="h-4 w-4" />
                            Edit Information
                          </Button>
                          <Button
                            onClick={handleProceedToSetup}
                            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Proceed to Setup
                          </Button>
                        </>
                      ) : (
                        <Button
                        onClick={() => setShowConfirmPacking(true)}
                        disabled={!allItemsChecked || !packingInfo.personnel}
                        className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          <Save className="h-4 w-4" />
                        Confirm
                        </Button>
                      )}
                    </div>
                  </div>
              </div>
            ) : (
              <div className="border border-border rounded-lg bg-card p-12 text-center">
                <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-2">Select an Order</h3>
                <p className="text-muted-foreground">
                  Choose an order from the list to start packing
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </Suspense>
    <AlertDialog
      open={alertState.open}
      title={alertState.title}
      description={alertState.description}
      actionText={alertState.actionText}
      onClose={closeAlert}
    />
    <ConfirmDialog
      open={showSendBackConfirm}
      title="Send Back to Scheduling"
      description="Are you sure you want to send this order back to Scheduling?"
      confirmText="Yes, send back"
      onConfirm={confirmRejectToScheduling}
      onCancel={() => setShowSendBackConfirm(false)}
    />
    </>
  )
}
