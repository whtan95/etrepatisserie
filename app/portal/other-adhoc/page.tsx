"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { OrderProgress } from "@/components/portal/order-progress"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { getPreviousStatus } from "@/lib/order-flow"
import type { SalesOrder } from "@/lib/types"
import { Calendar, CheckCircle, FileText, Search, Undo2, Navigation, ArrowUp, ArrowDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LORRIES } from "@/lib/types"

export default function OtherAdhocPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialOrderNumber = searchParams.get("order")
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [appliedDateFrom, setAppliedDateFrom] = useState("")
  const [appliedDateTo, setAppliedDateTo] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [sortCriteria, setSortCriteria] = useState<"eventDate" | "name" | "orderDate" | "pricing">("eventDate")
  const [lorryFilter, setLorryFilter] = useState<"all" | (typeof LORRIES)[number]["name"]>("all")
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [info, setInfo] = useState({
    personnel: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })
  const [personnelAgreed, setPersonnelAgreed] = useState(false)

  const loadOrders = () => {
    const allOrders = getAllOrders().map((order) => ({ ...order, orderSource: order.orderSource || "sales" }))
    const stageOrders = allOrders.filter((order) => order.status === "other-adhoc")
    stageOrders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(stageOrders)
    if (initialOrderNumber) {
      const found = stageOrders.find((o) => o.orderNumber === initialOrderNumber)
      if (found) setSelectedOrder(found)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === "asc" ? "desc" : "asc")
  }

  const normalizeTeamLabel = (lorry: string) => {
    if (!lorry) return ""
    const match = lorry.match(/(?:Lorry|Team)\s+([A-E])/i)
    return match ? `Team ${match[1].toUpperCase()}` : lorry
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        searchTerm === "" ||
        order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerData.customerName?.toLowerCase().includes(searchTerm.toLowerCase())

      let matchesDate = true
      const eventDate = order.eventData.eventDate
      if (appliedDateFrom) matchesDate = matchesDate && !!eventDate && new Date(eventDate) >= new Date(appliedDateFrom)
      if (appliedDateTo) matchesDate = matchesDate && !!eventDate && new Date(eventDate) <= new Date(appliedDateTo)

      let matchesLorry = true
      if (lorryFilter !== "all") {
        const setupLorry = order.setupData?.acceptance?.lorry
        const dismantleLorry = order.dismantleData?.acceptance?.lorry
        const lorry = dismantleLorry || setupLorry
        const lorryName = LORRIES.find(l => l.id === lorry)?.name || normalizeTeamLabel(lorry || "")
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
  }, [orders, searchTerm, appliedDateFrom, appliedDateTo, sortOrder, sortCriteria, lorryFilter])

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

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    return new Date(dateString).toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const handleDone = () => {
    if (!selectedOrder) return
    if (!info.personnel) {
      showAlert("Please enter personnel name")
      return
    }
    if (!personnelAgreed) {
      showAlert("Please click Accept Order first")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "invoice" as const,
      otherAdhocData: {
        personnel: info.personnel,
        date: info.date,
        time: info.time,
        status: "completed" as const,
      },
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const completedOrderNumber = selectedOrder.orderNumber
    setSelectedOrder(null)
    setInfo({
      personnel: "",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toTimeString().slice(0, 5),
    })
    showAlert("Other Adhoc completed! Sent to Invoice.", {
      title: `Sent to Invoice ${completedOrderNumber}`,
      actionText: "Go to Invoice",
      onClose: () => router.push("/portal/invoice"),
    })
  }

  const handleSendBack = () => {
    if (!selectedOrder) return
    const prevStatus = getPreviousStatus(selectedOrder, "other-adhoc")
    const label =
      prevStatus === "scheduling"
        ? "Scheduling"
        : prevStatus === "packing"
          ? "Packing"
          : prevStatus === "setting-up"
            ? "Setting Up"
            : prevStatus === "dismantling"
              ? "Dismantle"
              : prevStatus === "other-adhoc"
                ? "Other Adhoc"
                : "Scheduling"

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: prevStatus,
      updatedAt: new Date().toISOString(),
    }))

    loadOrders()
    const sentBackOrderNumber = selectedOrder.orderNumber
    setSelectedOrder(null)
    showAlert(`Order sent back to ${label}.`, {
      title: `Sent Back ${sentBackOrderNumber}`,
      actionText: `Go to ${label}`,
      onClose: () => {
        if (prevStatus === "scheduling") router.push("/portal/scheduling")
        else if (prevStatus === "packing") router.push("/portal/packing")
        else if (prevStatus === "setting-up") router.push("/portal/setting-up")
        else if (prevStatus === "dismantling") router.push("/portal/dismantle")
        else router.push("/portal/scheduling")
      },
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
    <div className="space-y-6">
      <OrderProgress
        currentStatus={selectedOrder?.status}
        orderNumber={selectedOrder?.orderNumber}
        hasIssue={selectedOrder?.hasIssue}
        orderSource={selectedOrder?.orderSource}
        adHocOptions={selectedOrder?.adHocOptions as any}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 border border-border rounded-lg bg-card flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground mb-3">Orders for Other Adhoc</h2>
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

          <div className="max-h-[600px] flex-1 overflow-y-auto">
            {filteredOrders.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">No orders found</div>
            ) : (
              filteredOrders.map((order) => (
                <button
                  key={order.orderNumber}
                  type="button"
                  onClick={() => {
                    setSelectedOrder(order)
                    setInfo((prev) => ({ ...prev, personnel: "" }))
                    setPersonnelAgreed(false)
                  }}
                  className={`w-full p-4 text-left border-b border-border hover:bg-muted/30 transition-colors ${
                    selectedOrder?.orderNumber === order.orderNumber ? "bg-muted/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{order.orderNumber}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        order.orderSource === "ad-hoc"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {order.orderSource === "ad-hoc" ? "Ad Hoc" : "Sales"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">{order.customerData.customerName}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(order.eventData.eventDate)}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className="p-4 border-t border-border">
            {(() => {
              const prevStatus = selectedOrder ? getPreviousStatus(selectedOrder, "other-adhoc") : null
              const label =
                prevStatus === "scheduling"
                  ? "Scheduling"
                  : prevStatus === "packing"
                    ? "Packing"
                    : prevStatus === "setting-up"
                      ? "Setting Up"
                      : prevStatus === "dismantling"
                        ? "Dismantle"
                        : prevStatus === "other-adhoc"
                          ? "Other Adhoc"
                          : null

              return (
                <Button
                  variant="outline"
                  className="w-full gap-2 bg-transparent"
                  disabled={!selectedOrder || !label}
                  onClick={handleSendBack}
                >
                  <Undo2 className="h-4 w-4" />
                  {label ? `Send Back to ${label}` : "Send Back"}
                </Button>
              )
            })()}
          </div>
        </div>

        <div className="lg:col-span-2 border border-border rounded-lg bg-card">
          {!selectedOrder ? (
            <div className="p-12 text-center text-muted-foreground">Select an order to continue.</div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Other Adhoc</h2>
                  <p className="text-sm text-muted-foreground">{selectedOrder.orderNumber}</p>
                  {selectedOrder.orderSource === "ad-hoc" && selectedOrder.adHocOptions?.otherAdhocName ? (
                    <p className="text-xs text-muted-foreground mt-1">Task: {selectedOrder.adHocOptions.otherAdhocName}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-foreground">Personnel *</Label>
                  <Input value={info.personnel} onChange={(e) => setInfo((p) => ({ ...p, personnel: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Date</Label>
                  <Input type="date" value={info.date} onChange={(e) => setInfo((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">Time</Label>
                  <Input type="time" value={info.time} onChange={(e) => setInfo((p) => ({ ...p, time: e.target.value }))} />
                </div>
              </div>

              {/* Ready to Accept */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-center">
                <h3 className="text-base font-semibold text-foreground">Ready to Accept</h3>
                <p className="text-sm text-muted-foreground">Accept this order to proceed.</p>
                <Button
                  type="button"
                  onClick={() => setPersonnelAgreed(true)}
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={personnelAgreed}
                >
                  <CheckCircle className="h-4 w-4" />
                  {personnelAgreed ? "Accepted" : "Accept Order"}
                </Button>

                {/* GPS Tracking Indicator */}
                {selectedOrder.orderSource === "ad-hoc" && selectedOrder.adHocOptions?.requiresGPSTracking !== undefined && (
                  <div className={`flex items-center gap-2 text-sm ${selectedOrder.adHocOptions.requiresGPSTracking ? 'text-green-600' : 'text-muted-foreground'}`}>
                    <Navigation className="h-4 w-4" />
                    <span>
                      GPS Tracking: {selectedOrder.adHocOptions.requiresGPSTracking ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={handleDone}
                  disabled={!info.personnel || !personnelAgreed}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Complete & Send to Invoice
                  </Button>
                </div>
            </div>
          )}
        </div>
      </div>

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
