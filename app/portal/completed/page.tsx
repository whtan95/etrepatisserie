"use client"

import React, { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import {
  Search,
  CheckCircle,
  Calendar,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
  Undo2,
  AlertCircle,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react"
import type { SalesOrder, IssueData, SetupData, DismantleData } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import { useSearchParams } from "next/navigation"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"

export default function CompletedPage() {
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [showFlagModal, setShowFlagModal] = useState(false)
  const [flagData, setFlagData] = useState({
    personnel: "",
    issue: "",
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0, 5),
  })
  const ordersPerPage = 10
  const searchParams = useSearchParams()

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = () => {
    const allOrders = getAllOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
    const completedOrders = allOrders.filter(order => order.status === "completed")
    completedOrders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(completedOrders)
    setIsLoading(false)
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.orderMeta?.salesOrderNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerData.customerName.toLowerCase().includes(searchTerm.toLowerCase())

    let matchesDate = true
    const eventDate = order.eventData.eventDate
    if (dateFrom) {
      matchesDate = matchesDate && !!eventDate && new Date(eventDate) >= new Date(dateFrom)
    }
    if (dateTo) {
      matchesDate = matchesDate && !!eventDate && new Date(eventDate) <= new Date(dateTo)
    }

    return matchesSearch && matchesDate
  })

  const handleSendBackTo = (orderNumber: string, targetStatus: SalesOrder["status"]) => {
    updateOrderByNumber(orderNumber, (order) => {
      const base = {
        ...order,
        status: targetStatus,
        updatedAt: new Date().toISOString(),
      }

      if (targetStatus === "dismantling") {
        const dismantleData: DismantleData = order.dismantleData ?? {
          dismantlePersonnel: "",
          dismantleDate: "",
          dismantleStartTime: "",
          dismantleCompletionTime: "",
          photos: [],
          status: "pending",
          phase: "pending",
        }
        return {
          ...base,
          dismantleData,
          otherAdhocData: undefined,
        }
      }

      if (targetStatus === "setting-up") {
        const setupData: SetupData = order.setupData ?? {
          setupPersonnel: "",
          setupDate: "",
          setupStartTime: "",
          setupCompletionTime: "",
          photos: [],
          status: "pending",
          phase: "pending",
        }
        return {
          ...base,
          setupData,
          dismantleData: undefined,
          otherAdhocData: undefined,
        }
      }

      if (targetStatus === "procurement") {
        return {
          ...base,
          setupData: undefined,
          dismantleData: undefined,
          otherAdhocData: undefined,
        }
      }

      if (targetStatus === "packing") {
        return {
          ...base,
          setupData: undefined,
          dismantleData: undefined,
          otherAdhocData: undefined,
        }
      }

      if (targetStatus === "scheduling") {
        return {
          ...base,
          packingData: undefined,
          materialPlanning: undefined,
          setupData: undefined,
          dismantleData: undefined,
          otherAdhocData: undefined,
        }
      }

      return base
    })
    loadOrders()
    setSelectedOrder(null)
  }

  const handleDeleteOrder = (orderNumber: string) => {
    if (!confirm(`Delete completed order ${orderNumber}? This cannot be undone.`)) return
    deleteOrderByNumber(orderNumber)
    loadOrders()
    if (selectedOrder?.orderNumber === orderNumber) {
      setSelectedOrder(null)
      setShowReport(false)
    }
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
      flaggedAtStage: "completed",
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

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const startIndex = (currentPage - 1) * ordersPerPage
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + ordersPerPage)

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
    <Suspense fallback={null}>
      <div className="space-y-6">
        <OrderProgress currentStep="invoice" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Invoice</h1>
            <p className="text-sm text-muted-foreground">{filteredOrders.length} invoiceable orders</p>
          </div>
        </div>

        {/* Search + Date Range */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order / sales no or customer..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-10"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* Orders Table */}
        {paginatedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16">
            <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">No Invoiceable Orders</h3>
            <p className="text-sm text-muted-foreground">
              Orders will appear here once delivery is completed
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order / Sales No.</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">
                        Event Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">
                        Total
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-foreground">Invoice</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrders.map((order) => (
                      <tr key={order.orderNumber} className="border-b border-border transition-colors hover:bg-muted/30">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{order.orderMeta?.salesOrderNumber || order.orderNumber}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-foreground">
                            {order.customerData.customerName || order.customerData.companyName || "N/A"}
                          </p>
                          <p className="text-xs text-muted-foreground">{order.customerData.phone || "-"}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground">{formatDate(order.eventData.eventDate)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-foreground">
                          RM {order.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-block rounded-full px-3 py-1 text-xs font-medium bg-green-100 text-green-700">
                            Invoiceable
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View Details"
                              onClick={() => setSelectedOrder(selectedOrder?.orderNumber === order.orderNumber ? null : order)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              title="Delete"
                              onClick={() => handleDeleteOrder(order.orderNumber)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(startIndex + ordersPerPage, filteredOrders.length)} of{" "}
                  {filteredOrders.length} orders
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => prev - 1)}
                    className="bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    className="bg-transparent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Order Detail Panel */}
        {selectedOrder && (
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">Order Summary: {selectedOrder.orderNumber}</h2>
              {selectedOrder.hasIssue && (
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-red-100 text-red-700">
                  <AlertCircle className="h-3 w-3" />
                  Issue Flagged
                </span>
              )}
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Customer</h3>
                <p className="text-sm text-muted-foreground">{selectedOrder.customerData.customerName}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.customerData.phone}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Event</h3>
                <p className="text-sm text-muted-foreground">Date: {formatDate(selectedOrder.eventData.eventDate)}</p>
                <p className="text-sm text-muted-foreground">Type: {selectedOrder.eventData.eventType}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Delivery</h3>
                <p className="text-sm text-muted-foreground">By: {selectedOrder.setupData?.setupPersonnel || "-"}</p>
                <p className="text-sm text-muted-foreground">Completed: {selectedOrder.setupData?.setupCompletionTime || "-"}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Returning</h3>
                <p className="text-sm text-muted-foreground">By: {selectedOrder.dismantleData?.dismantlePersonnel || "-"}</p>
                <p className="text-sm text-muted-foreground">Completed: {selectedOrder.dismantleData?.dismantleCompletionTime || "-"}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                className="gap-2 bg-transparent"
                onClick={() => setShowReport((prev) => !prev)}
              >
                {showReport ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Hide Report
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    See Report
                  </>
                )}
              </Button>
            </div>

            {showReport && (
              <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Sales Confirmation</h3>
                    <p className="text-sm text-muted-foreground">Sales Order No: {selectedOrder.orderMeta?.salesOrderNumber || "-"}</p>
                    <p className="text-sm text-muted-foreground">Personnel: {selectedOrder.additionalInfo?.schedulingPersonnel || "-"}</p>
                    <p className="text-sm text-muted-foreground">Date: {selectedOrder.additionalInfo?.schedulingDate || "-"}</p>
                    <p className="text-sm text-muted-foreground">Time: {selectedOrder.additionalInfo?.schedulingTime || "-"}</p>
                    <p className="text-sm text-muted-foreground">Delivery: {selectedOrder.additionalInfo?.confirmedSetupDate || "-"} {selectedOrder.additionalInfo?.scheduleStartTime || ""} {selectedOrder.additionalInfo?.setupLorry ? `(${selectedOrder.additionalInfo.setupLorry})` : ""}</p>
                    <p className="text-sm text-muted-foreground">Returning: {selectedOrder.additionalInfo?.confirmedDismantleDate || "-"} {selectedOrder.additionalInfo?.dismantleScheduleStartTime || ""} {selectedOrder.additionalInfo?.dismantleLorry ? `(${selectedOrder.additionalInfo.dismantleLorry})` : ""}</p>
                    <p className="text-sm text-muted-foreground">Other Adhoc: {selectedOrder.additionalInfo?.confirmedOtherAdhocDate || "-"} {selectedOrder.additionalInfo?.otherAdhocScheduleStartTime || ""} {selectedOrder.additionalInfo?.otherAdhocLorry ? `(${selectedOrder.additionalInfo.otherAdhocLorry})` : ""}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Other Adhoc</h3>
                    <p className="text-sm text-muted-foreground">Task: {selectedOrder.adHocOptions?.otherAdhocName || "-"}</p>
                    <p className="text-sm text-muted-foreground">By: {selectedOrder.otherAdhocData?.personnel || "-"}</p>
                    <p className="text-sm text-muted-foreground">When: {selectedOrder.otherAdhocData?.date || "-"} {selectedOrder.otherAdhocData?.time || ""}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Planning</h3>
                    <p className="text-sm text-muted-foreground">By: {selectedOrder.packingData?.packingPersonnel || "-"}</p>
                    <p className="text-sm text-muted-foreground">Date: {selectedOrder.packingData?.packingDate || "-"}</p>
                    <p className="text-sm text-muted-foreground">Time: {selectedOrder.packingData?.packingTime || "-"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Delivery</h3>
                    <p className="text-sm text-muted-foreground">By: {selectedOrder.setupData?.setupPersonnel || "-"}</p>
                    <p className="text-sm text-muted-foreground">Date: {selectedOrder.setupData?.setupDate || "-"}</p>
                    <p className="text-sm text-muted-foreground">Start: {selectedOrder.setupData?.setupStartTime || "-"}</p>
                    <p className="text-sm text-muted-foreground">End: {selectedOrder.setupData?.setupCompletionTime || "-"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Returning</h3>
                    <p className="text-sm text-muted-foreground">By: {selectedOrder.dismantleData?.dismantlePersonnel || "-"}</p>
                    <p className="text-sm text-muted-foreground">Date: {selectedOrder.dismantleData?.dismantleDate || "-"}</p>
                    <p className="text-sm text-muted-foreground">Start: {selectedOrder.dismantleData?.dismantleStartTime || "-"}</p>
                    <p className="text-sm text-muted-foreground">End: {selectedOrder.dismantleData?.dismantleCompletionTime || "-"}</p>
                  </div>
                </div>

                {selectedOrder.issueData && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Issue</h3>
                    <p className="text-sm text-muted-foreground">Stage: {selectedOrder.issueData.flaggedAtStage}</p>
                    <p className="text-sm text-muted-foreground">By: {selectedOrder.issueData.flaggedPersonnel}</p>
                    <p className="text-sm text-muted-foreground">When: {selectedOrder.issueData.flaggedDate} {selectedOrder.issueData.flaggedTime}</p>
                    <p className="text-sm text-muted-foreground">Note: {selectedOrder.issueData.flaggedIssue}</p>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={openFlagModal}
                disabled={selectedOrder.hasIssue}
                className={`gap-2 ${selectedOrder.hasIssue ? "bg-red-500 text-white hover:bg-red-600 cursor-not-allowed" : "bg-transparent text-amber-600 border-amber-300 hover:bg-amber-50"}`}
              >
                <AlertCircle className="h-4 w-4" />
                {selectedOrder.hasIssue ? "Issue Flagged" : "Flag Issue"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendBackTo(selectedOrder.orderNumber, "dismantling")}
                className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
                style={{
                  display:
                    ((selectedOrder.orderSource === "ad-hoc"
                      ? selectedOrder.adHocOptions?.requiresDismantle
                      : selectedOrder.eventData?.dismantleRequired) ?? true)
                      ? "inline-flex"
                      : "none",
                }}
              >
                <Undo2 className="h-4 w-4" />
                Send Back to Returning
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendBackTo(selectedOrder.orderNumber, "setting-up")}
                className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <Undo2 className="h-4 w-4" />
                Send Back to Delivery
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendBackTo(selectedOrder.orderNumber, "procurement")}
                className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <Undo2 className="h-4 w-4" />
                Send Back to Procurement
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendBackTo(selectedOrder.orderNumber, "packing")}
                className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <Undo2 className="h-4 w-4" />
                Send Back to Planning
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendBackTo(selectedOrder.orderNumber, "scheduling")}
                className="gap-2 bg-transparent text-orange-600 border-orange-300 hover:bg-orange-50"
              >
                <Undo2 className="h-4 w-4" />
                Send Back to Sales Confirmation
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDeleteOrder(selectedOrder.orderNumber)}
                className="gap-2 bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete Record
              </Button>
            </div>
          </div>
        )}
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

      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        description={alertState.description}
        actionText={alertState.actionText}
        onClose={closeAlert}
      />
    </Suspense>
  )
}
