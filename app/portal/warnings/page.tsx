"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import {
  AlertTriangle,
  Search,
  CheckCircle,
  Clock,
  FileText,
  X,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import type { SalesOrder, IssueData } from "@/lib/types"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"

const Loading = () => null

export default function WarningsPage() {
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const ordersPerPage = 10
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [resolveNote, setResolveNote] = useState("")
  const [resolveDate, setResolveDate] = useState(new Date().toISOString().split("T")[0])
  const [resolveTime, setResolveTime] = useState(new Date().toTimeString().slice(0, 5))
  const [isEditingResolved, setIsEditingResolved] = useState(false)
  const [resolvedBy, setResolvedBy] = useState("")

  const searchParams = useSearchParams()

  const loadOrders = () => {
    const allOrders = getAllOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
    const issueOrders = allOrders.filter(o => o.hasIssue || o.issueData)
    issueOrders.sort((a, b) => {
      if (a.issueData?.isResolved !== b.issueData?.isResolved) {
        return a.issueData?.isResolved ? 1 : -1
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    setOrders(issueOrders)
    setIsLoading(false)
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerData.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.issueData?.flaggedIssue?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = 
      filterStatus === "all" ||
      (filterStatus === "open" && !order.issueData?.isResolved) ||
      (filterStatus === "resolved" && order.issueData?.isResolved)

    return matchesSearch && matchesFilter
  })

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const startIndex = (currentPage - 1) * ordersPerPage
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + ordersPerPage)

  const openIssuesCount = orders.filter(o => !o.issueData?.isResolved).length
  const resolvedIssuesCount = orders.filter(o => o.issueData?.isResolved).length

  const formatDate = (dateString: string) => {
    if (!dateString) return "-"
    const date = new Date(dateString)
    return date.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return "-"
    return timeString
  }

  const handleResolve = () => {
    if (!selectedOrder || !resolveNote.trim()) {
      showAlert("Please enter a resolution note.")
      return
    }
    if (!resolvedBy.trim()) {
      showAlert("Please enter who resolved this issue.")
      return
    }
    if (!resolveDate || !resolveTime) {
      showAlert("Please enter resolve date and time.")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      hasIssue: false,
      issueData: {
        ...order.issueData!,
        isResolved: true,
        resolvedNote: resolveNote,
        resolvedDate: resolveDate,
        resolvedTime: resolveTime,
        resolvedBy: resolvedBy,
      },
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
    setSelectedOrder(null)
    setResolveNote("")
    setResolveDate(new Date().toISOString().split("T")[0])
    setResolveTime(new Date().toTimeString().slice(0, 5))
    setResolvedBy("")
    setIsEditingResolved(false)
  }

  const handleUpdateResolvedTrace = () => {
    if (!selectedOrder || !resolveNote.trim()) {
      showAlert("Please enter a resolution note.")
      return
    }
    if (!resolvedBy.trim()) {
      showAlert("Please enter who resolved this issue.")
      return
    }
    if (!resolveDate || !resolveTime) {
      showAlert("Please enter resolve date and time.")
      return
    }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      hasIssue: false,
      issueData: {
        ...order.issueData!,
        resolvedNote: resolveNote,
        resolvedDate: resolveDate,
        resolvedTime: resolveTime,
        resolvedBy: resolvedBy,
      },
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
    setSelectedOrder(null)
    setResolveNote("")
    setResolveDate(new Date().toISOString().split("T")[0])
    setResolveTime(new Date().toTimeString().slice(0, 5))
    setResolvedBy("")
    setIsEditingResolved(false)
  }

  const handleDeleteResolvedTrace = (orderNumber: string) => {
    if (!confirm("Delete this resolved issue trace? This cannot be undone.")) return

    updateOrderByNumber(orderNumber, (order) => ({
      ...order,
      issueData: undefined,
      hasIssue: false,
      updatedAt: new Date().toISOString(),
    }))
    loadOrders()
  }

  const getStageLabel = (status: string) => {
    const stages: Record<string, string> = {
      "draft": "Sales Order",
      "scheduling": "Scheduling",
      "packing": "Packing",
      "setting-up": "Setting Up",
      "dismantling": "Dismantle",
      "completed": "Completed",
    }
    return stages[status] || status
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Warning & Issues</h1>
            <p className="text-sm text-muted-foreground">
              {openIssuesCount} open issue{openIssuesCount !== 1 ? "s" : ""}, {resolvedIssuesCount} resolved
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div 
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${filterStatus === "all" ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-muted/50"}`}
            onClick={() => { setFilterStatus("all"); setCurrentPage(1) }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{orders.length}</p>
                <p className="text-xs text-muted-foreground">Total Issues</p>
              </div>
            </div>
          </div>
          <div 
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${filterStatus === "open" ? "border-red-500 bg-red-50" : "border-border bg-card hover:bg-muted/50"}`}
            onClick={() => { setFilterStatus("open"); setCurrentPage(1) }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{openIssuesCount}</p>
                <p className="text-xs text-muted-foreground">Open Issues</p>
              </div>
            </div>
          </div>
          <div 
            className={`cursor-pointer rounded-lg border p-4 transition-colors ${filterStatus === "resolved" ? "border-green-500 bg-green-50" : "border-border bg-card hover:bg-muted/50"}`}
            onClick={() => { setFilterStatus("resolved"); setCurrentPage(1) }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{resolvedIssuesCount}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by order number, customer name, or issue description..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-10"
            />
          </div>
        </div>

        {/* Issues List */}
        {paginatedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16">
            <CheckCircle className="mb-4 h-12 w-12 text-green-500" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">No Issues Found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || filterStatus !== "all"
                ? "Try adjusting your search or filter criteria"
                : "All orders are running smoothly!"}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedOrders.map((order) => (
                <div 
                  key={order.orderNumber} 
                  className={`rounded-lg border bg-card p-4 transition-colors cursor-pointer ${
                    order.issueData?.isResolved 
                      ? "border-green-200 bg-green-50/50" 
                      : "border-red-200 bg-red-50/50 hover:border-red-300"
                  } ${selectedOrder?.orderNumber === order.orderNumber ? "ring-2 ring-accent" : ""}`}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Left side - Issue info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          order.issueData?.isResolved 
                            ? "bg-green-100 text-green-700" 
                            : "bg-red-100 text-red-700"
                        }`}>
                          {order.issueData?.isResolved ? (
                            <><CheckCircle className="h-3 w-3" /> Resolved</>
                          ) : (
                            <><AlertTriangle className="h-3 w-3" /> Open</>
                          )}
                        </span>
                        <span className="font-medium text-foreground">{order.orderNumber}</span>
                        <span className="text-xs text-muted-foreground">
                          Stage: {getStageLabel(order.issueData?.flaggedAtStage || order.status)}
                        </span>
                      </div>

                      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-muted-foreground">Customer:</span>
                          <p className="font-medium">
                            {order.customerData.customerName || order.customerData.companyName || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Flagged By:</span>
                          <p className="font-medium">{order.issueData?.flaggedPersonnel || "Unknown"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Flagged Date:</span>
                          <p className="font-medium">{formatDate(order.issueData?.flaggedDate || "")}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Flagged Time:</span>
                          <p className="font-medium">{formatTime(order.issueData?.flaggedTime || "")}</p>
                        </div>
                      </div>

                      <div className="rounded-md bg-white/50 p-3 border border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Issue Description:</p>
                        <p className="text-sm">{order.issueData?.flaggedIssue || "No description provided"}</p>
                      </div>

                      {order.issueData?.isResolved && (
                        <div className="rounded-md bg-green-100/50 p-3 border border-green-200">
                          <p className="text-xs font-medium text-green-700 mb-1">Resolution:</p>
                          <p className="text-sm text-green-800">{order.issueData.resolvedNote}</p>
                          {order.issueData.resolvedBy && (
                            <p className="text-xs text-green-700 mt-1">Resolved By: {order.issueData.resolvedBy}</p>
                          )}
                          <p className="text-xs text-green-600 mt-1">
                            Resolved on {formatDate(order.issueData.resolvedDate || "")} at {formatTime(order.issueData.resolvedTime || "")}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right side - Actions */}
                    <div className="flex-shrink-0">
                      {!order.issueData?.isResolved ? (
                        <Button 
                          size="sm"
                          className="gap-1 bg-green-600 text-white hover:bg-green-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrder(order)
                            setResolveNote("")
                            setResolveDate(new Date().toISOString().split("T")[0])
                            setResolveTime(new Date().toTimeString().slice(0, 5))
                            setResolvedBy("")
                            setIsEditingResolved(false)
                          }}
                        >
                          <CheckCircle className="h-3 w-3" />
                          Resolve
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedOrder(order)
                              setResolveNote(order.issueData?.resolvedNote || "")
                              setResolveDate(order.issueData?.resolvedDate || new Date().toISOString().split("T")[0])
                              setResolveTime(order.issueData?.resolvedTime || new Date().toTimeString().slice(0, 5))
                              setResolvedBy(order.issueData?.resolvedBy || "")
                              setIsEditingResolved(true)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit Trace
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteResolvedTrace(order.orderNumber)
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete Trace
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(startIndex + ordersPerPage, filteredOrders.length)} of{" "}
                  {filteredOrders.length} issues
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

        {/* Resolve Modal */}
        {selectedOrder && (!selectedOrder.issueData?.isResolved || isEditingResolved) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setSelectedOrder(null); setResolveNote(""); setIsEditingResolved(false) }}>
            <div className="mx-4 w-full max-w-lg rounded-lg border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {isEditingResolved ? "Edit Resolve Trace" : "Resolve Issue"} - {selectedOrder.orderNumber}
                </h3>
                <button onClick={() => { setSelectedOrder(null); setResolveNote(""); setIsEditingResolved(false) }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-md bg-red-50 p-3 border border-red-200">
                  <p className="text-xs font-medium text-red-700 mb-1">Issue:</p>
                  <p className="text-sm text-red-800">{selectedOrder.issueData?.flaggedIssue}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">How was this resolved?</Label>
                  <Textarea
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    placeholder="Describe how the issue was resolved..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Resolved By</Label>
                  <Input
                    value={resolvedBy}
                    onChange={(e) => setResolvedBy(e.target.value)}
                    placeholder="Name of personnel"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Resolve Date</Label>
                    <Input
                      type="date"
                      value={resolveDate}
                      onChange={(e) => setResolveDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Resolve Time</Label>
                    <Input
                      type="time"
                      value={resolveTime}
                      onChange={(e) => setResolveTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedOrder(null); setResolveNote(""); setIsEditingResolved(false) }}
                    className="flex-1 bg-transparent"
                  >
                    Cancel
                  </Button>
                  {isEditingResolved ? (
                    <Button
                      onClick={handleUpdateResolvedTrace}
                      className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                      disabled={!resolveNote.trim() || !resolveDate || !resolveTime}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Save Changes
                    </Button>
                  ) : (
                    <Button
                      onClick={handleResolve}
                      className="flex-1 gap-2 bg-green-600 text-white hover:bg-green-700"
                      disabled={!resolveNote.trim()}
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark as Resolved
                    </Button>
                  )}
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
      </div>
    </Suspense>
  )
}
