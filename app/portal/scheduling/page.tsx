"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  FileText,
  Search,
  Trash2,
  Calendar,
  Plus,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  Pencil,
} from "lucide-react"
import type { SalesOrder } from "@/lib/types"
import { OrderProgress } from "@/components/portal/order-progress"
import Loading from "./loading"
import { deleteOrderByNumber, getAdHocOrders, getSalesOrders } from "@/lib/order-storage"

export default function SchedulingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "needs" | "scheduled" | "sent">("all")
  const [currentPage, setCurrentPage] = useState(1)
  const ordersPerPage = 30

  useEffect(() => {
    const loadOrders = () => {
      const salesOrders = getSalesOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
      const adHocOrders = getAdHocOrders().map(order => ({ ...order, orderSource: "ad-hoc" as const }))
      const list = [...salesOrders, ...adHocOrders].filter((o) => o.status === "scheduling" || o.status === "packing")
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setOrders(list)
      setIsLoading(false)
    }

    loadOrders()
  }, [])

  const getScheduleState = (order: SalesOrder): "needs" | "scheduled" | "sent" => {
    if (order.status === "packing") return "sent"

    const ai = order.additionalInfo
    const hasAnySchedule =
      !!ai?.scheduleStartTime ||
      !!ai?.dismantleScheduleStartTime ||
      !!ai?.otherAdhocScheduleStartTime

    return hasAnySchedule ? "scheduled" : "needs"
  }

  const getScheduleBadge = (order: SalesOrder) => {
    const state = getScheduleState(order)
    switch (state) {
      case "needs":
        return { label: "Needs Scheduling", className: "bg-yellow-100 text-yellow-800" }
      case "scheduled":
        return { label: "Scheduled", className: "bg-blue-100 text-blue-800" }
      case "sent":
        return { label: "Sent to Packing", className: "bg-green-100 text-green-800" }
    }
  }

  const counts = orders.reduce(
    (acc, order) => {
      const state = getScheduleState(order)
      acc[state] += 1
      acc.all += 1
      return acc
    },
    { all: 0, needs: 0, scheduled: 0, sent: 0 } as Record<"all" | "needs" | "scheduled" | "sent", number>
  )

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerData.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerData.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerData.phone || "").includes(searchQuery)

    const matchesScheduleState = scheduleFilter === "all" ? true : getScheduleState(order) === scheduleFilter

    return matchesSearch && matchesScheduleState
  })

  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage)
  const startIndex = (currentPage - 1) * ordersPerPage
  const paginatedOrders = filteredOrders.slice(startIndex, startIndex + ordersPerPage)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const handleEdit = (order: SalesOrder) => {
    const label = order.orderSource === "ad-hoc" ? "Ad Hoc order" : "SO order"
    if (!confirm(`Are you sure you want to edit ${label}?`)) return
    if (order.orderSource === "ad-hoc") {
      router.push(`/portal/ad-hoc?edit=${order.orderNumber}`)
      return
    }
    router.push(`/portal/sales-order?edit=${order.orderNumber}`)
  }

  const handleDelete = (orderNumber: string) => {
    if (confirm("Are you sure you want to delete this order?")) {
      deleteOrderByNumber(orderNumber)
      const salesOrders = getSalesOrders().map(order => ({ ...order, orderSource: order.orderSource || "sales" }))
      const adHocOrders = getAdHocOrders().map(order => ({ ...order, orderSource: "ad-hoc" as const }))
      const list = [...salesOrders, ...adHocOrders].filter((o) => o.status === "scheduling" || o.status === "packing")
      setOrders(list)
    }
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
        {/* Progress Bar */}
        <OrderProgress currentPhase={1} />

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Scheduling</h1>
            <p className="text-sm text-muted-foreground">
              {counts.needs} need scheduling • {counts.scheduled} scheduled • {counts.sent} sent to packing
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/portal/sales-order">
              <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </Link>
            <Link href="/portal/ad-hoc">
              <Button variant="outline" className="gap-2 bg-transparent">
                <Plus className="h-4 w-4" />
                New Ad Hoc Order
              </Button>
            </Link>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order number, customer name, or phone..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={scheduleFilter === "all" ? "default" : "outline"}
                onClick={() => {
                  setScheduleFilter("all")
                  setCurrentPage(1)
                }}
                className={scheduleFilter === "all" ? "bg-slate-600 text-white hover:bg-slate-700" : "bg-transparent"}
              >
                All ({counts.all})
              </Button>
              <Button
                size="sm"
                variant={scheduleFilter === "needs" ? "default" : "outline"}
                onClick={() => {
                  setScheduleFilter("needs")
                  setCurrentPage(1)
                }}
                className={scheduleFilter === "needs" ? "bg-yellow-600 text-white hover:bg-yellow-700" : "bg-transparent"}
              >
                Needs ({counts.needs})
              </Button>
              <Button
                size="sm"
                variant={scheduleFilter === "scheduled" ? "default" : "outline"}
                onClick={() => {
                  setScheduleFilter("scheduled")
                  setCurrentPage(1)
                }}
                className={scheduleFilter === "scheduled" ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-transparent"}
              >
                Scheduled ({counts.scheduled})
              </Button>
              <Button
                size="sm"
                variant={scheduleFilter === "sent" ? "default" : "outline"}
                onClick={() => {
                  setScheduleFilter("sent")
                  setCurrentPage(1)
                }}
                className={scheduleFilter === "sent" ? "bg-green-600 text-white hover:bg-green-700" : "bg-transparent"}
              >
                Sent ({counts.sent})
              </Button>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        {paginatedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16">
            <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">No Orders to Schedule</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {searchQuery
                ? "Try adjusting your search criteria"
                : "Create a sales or ad hoc order and save it to see it here"}
            </p>
            {!searchQuery && (
              <div className="flex flex-wrap gap-2">
                <Link href="/portal/sales-order">
                  <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                    <Plus className="h-4 w-4" />
                    Create Order
                  </Button>
                </Link>
                <Link href="/portal/ad-hoc">
                  <Button variant="outline" className="gap-2 bg-transparent">
                    <Plus className="h-4 w-4" />
                    Create Ad Hoc
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-[170px_120px_220px_1fr_140px_140px_180px_140px_auto] gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <div>Order No</div>
                  <div>Type</div>
                  <div>Customer</div>
                  <div>Event</div>
                  <div>Created</div>
                  <div>Event Date</div>
                  <div>Schedule Status</div>
                  <div className="text-right">Total</div>
                  <div className="text-right">Actions</div>
                </div>

                {paginatedOrders.map((order) => {
                  const createdLabel = order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-MY") : "-"
                  const customerLabel = order.customerData.companyName || order.customerData.customerName || "N/A"
                  const badge = getScheduleBadge(order)

                  return (
                    <div
                      key={order.orderNumber}
                      className="grid grid-cols-[170px_120px_220px_1fr_140px_140px_180px_140px_auto] items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-muted/20"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate text-sm font-medium text-foreground">{order.orderNumber}</span>
                        </div>
                      </div>

                      <div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${order.orderSource === "ad-hoc" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                          {order.orderSource === "ad-hoc" ? "Ad Hoc" : "Sales"}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs text-foreground">{customerLabel}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{order.customerData.phone || "-"}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-xs text-muted-foreground">{order.eventData.eventName || "-"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{order.eventData.eventType || "-"}</p>
                      </div>

                      <div className="text-xs text-muted-foreground">{createdLabel}</div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{order.eventData.eventDate ? formatDate(order.eventData.eventDate) : "-"}</span>
                      </div>

                      <div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="text-right text-sm font-semibold text-foreground">
                        RM {order.total.toFixed(2)}
                      </div>

                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/portal/scheduling/${order.orderNumber}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={order.status === "packing" ? "View Schedule" : "Schedule"}
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(order)}
                          title={order.orderSource === "ad-hoc" ? "Edit Ad Hoc Order" : "Edit SO Order"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDelete(order.orderNumber)}
                          title="Delete Order"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
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
      </div>
    </Suspense>
  )
}
