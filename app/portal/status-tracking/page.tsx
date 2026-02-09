"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarDays, LayoutGrid, List, Search } from "lucide-react"
import type { OrderStatus, SalesOrder } from "@/lib/types"
import { getAllOrders } from "@/lib/order-storage"
import { getRequestForQuotations, type RequestForQuotation } from "@/lib/request-for-quotation-storage"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Quotation",
  scheduling: "Sales Conf.",
  planning: "Planning",
  procurement: "Procurement",
  packing: "Packing",
  "setting-up": "Delivery",
  dismantling: "Returning",
  invoice: "Invoice",
  payment: "Payment",
  "other-adhoc": "Other",
  completed: "Payment",
  cancelled: "Cancelled",
}

const RFQ_COLOR = "#A855F7" // purple

const statusColor = (status: OrderStatus): string => {
  switch (status) {
    case "scheduling": return "#F59E0B" // amber
    case "planning": return "#3B82F6" // blue
    case "procurement": return "#8B5CF6" // purple
    case "packing": return "#10B981" // green
    case "setting-up": return "#0EA5E9" // sky
    case "dismantling": return "#EF4444" // red
    case "invoice": return "#111827" // slate
    case "payment": return "#16A34A"
    case "completed": return "#16A34A"
    default: return "#6B7280"
  }
}

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const d = new Date(dateString)
  return Number.isNaN(d.getTime()) ? dateString : d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

function getDisplayOrderNumber(order: SalesOrder) {
  return order.orderMeta?.salesOrderNumber || order.orderNumber
}

function getStageHref(status: OrderStatus): string {
  if (status === "draft") return "/portal/sales-order"
  if (status === "scheduling") return "/portal/sales-confirmation"
  if (status === "planning") return "/portal/planning"
  if (status === "procurement") return "/portal/procurement"
  if (status === "packing") return "/portal/packing"
  if (status === "setting-up") return "/portal/delivery"
  if (status === "dismantling") return "/portal/returning"
  if (status === "invoice") return "/portal/invoice"
  if (status === "payment") return "/portal/payment"
  if (status === "completed") return "/portal/payment"
  return "/portal/status-tracking"
}

export default function StatusTrackingPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [rfqs, setRfqs] = useState<RequestForQuotation[]>([])
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const active = all.filter((o) => o.orderSource !== "ad-hoc" && o.status !== "cancelled")
    active.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(active)
    const allRfqs = getRequestForQuotations()
    allRfqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setRfqs(allRfqs)
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((o) => {
      const displayNo = getDisplayOrderNumber(o).toLowerCase()
      const matchesSearch =
        !term ||
        o.orderNumber.toLowerCase().includes(term) ||
        displayNo.includes(term) ||
        (o.customerData.customerName || "").toLowerCase().includes(term) ||
        (o.eventData.eventName || "").toLowerCase().includes(term)

      const d = o.eventData.eventDate
      const matchesFrom = !dateFrom || (d && new Date(d) >= new Date(dateFrom))
      const matchesTo = !dateTo || (d && new Date(d) <= new Date(dateTo))

      return matchesSearch && matchesFrom && matchesTo
    })
  }, [orders, search, dateFrom, dateTo])

  const filteredRfqs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rfqs.filter((r) => {
      const customerName = `${r.request.customer.companyName} ${r.request.customer.name}`.toLowerCase()
      const matchesSearch =
        !term ||
        r.id.toLowerCase().includes(term) ||
        customerName.includes(term) ||
        (r.request.customer.email || "").toLowerCase().includes(term) ||
        (r.request.event.eventName || "").toLowerCase().includes(term)

      const d = r.request.event.eventDate
      const matchesFrom = !dateFrom || (d && new Date(d) >= new Date(dateFrom))
      const matchesTo = !dateTo || (d && new Date(d) <= new Date(dateTo))

      return matchesSearch && matchesFrom && matchesTo
    })
  }, [rfqs, search, dateFrom, dateTo])

  const counts = useMemo(() => {
    const countBy = (status: OrderStatus) => filtered.filter((o) => o.status === status).length
      return {
        rfq: filteredRfqs.length,
        quotation: countBy("draft"),
        salesConf: countBy("scheduling"),
        planning: countBy("planning"),
        procurement: countBy("procurement"),
        packing: countBy("packing"),
        deliveryS: countBy("setting-up"),
        deliveryD: countBy("dismantling"),
        invoice: countBy("invoice"),
        payment: countBy("payment") + countBy("completed"),
        issues: filtered.filter((o) => o.hasIssue && !o.issueData?.isResolved).length,
      }
    }, [filtered, filteredRfqs])

  const calendarEvents = useMemo(() => {
    const rfqEvents = filteredRfqs
      .filter((r) => !!r.request.event.eventDate)
      .map((r) => ({
        id: `rfq:${r.id}`,
        title: `RFQ - ${r.request.customer.companyName || r.request.customer.name || r.id}`,
        start: r.request.event.eventDate,
        allDay: true,
        backgroundColor: RFQ_COLOR,
        borderColor: RFQ_COLOR,
        textColor: "#ffffff",
        extendedProps: {
          kind: "rfq",
          requestId: r.id,
        },
      }))

    const orderEvents = filtered
      .filter((o) => !!o.eventData.eventDate)
      .map((o) => ({
        id: `so:${o.orderNumber}`,
        title: `${STATUS_LABEL[o.status]} - ${getDisplayOrderNumber(o)}`,
        start: o.eventData.eventDate,
        allDay: true,
        backgroundColor: statusColor(o.status),
        borderColor: statusColor(o.status),
        textColor: "#ffffff",
        extendedProps: {
          kind: "order",
          orderNumber: o.orderNumber,
          status: o.status,
        },
      }))

    return [...rfqEvents, ...orderEvents]
  }, [filtered, filteredRfqs])

  const boardColumns = useMemo(
    () =>
      [
        { status: "rfq", title: "Request for quotation" },
        { status: "draft", title: "Quotation" },
        { status: "scheduling", title: "Sales Confirmation" },
        { status: "planning", title: "Planning" },
        { status: "procurement", title: "Procurement" },
        { status: "packing", title: "Packing" },
        { status: "setting-up", title: "Delivery" },
        { status: "dismantling", title: "Returning" },
        { status: "invoice", title: "Invoice" },
        { status: "payment", title: "Payment" },
      ] as Array<{ status: "rfq" | OrderStatus; title: string }>,
    [],
  )

  const boardByStatus = useMemo(() => {
    const map = new Map<"rfq" | OrderStatus, Array<SalesOrder | RequestForQuotation>>()
    for (const col of boardColumns) map.set(col.status, [])

    for (const r of filteredRfqs) {
      map.get("rfq")!.push(r)
    }

    for (const o of filtered) {
      const normalizedStatus = o.status === "completed" ? "payment" : o.status
      if (!map.has(normalizedStatus)) continue
      map.get(normalizedStatus)!.push(o)
    }

    for (const col of boardColumns) {
      const list = map.get(col.status)!
      list.sort((a, b) => {
        const aTime = "request" in a ? new Date(a.createdAt).getTime() : new Date(a.updatedAt).getTime()
        const bTime = "request" in b ? new Date(b.createdAt).getTime() : new Date(b.updatedAt).getTime()
        return bTime - aTime
      })
    }

    return map
  }, [filtered, filteredRfqs, boardColumns])

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Sales Orders</h1>
          <p className="text-sm text-muted-foreground">
            Request for quotation → Quotation → Sales Confirmation → Planning → Procurement → Packing → Delivery → Returning (optional) → Invoice → Payment.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2 lg:grid lg:grid-cols-11">
          {[
            { label: "RFQ", value: counts.rfq },
            { label: "Quote", value: counts.quotation },
            { label: "Conf.", value: counts.salesConf },
            { label: "Plan", value: counts.planning },
            { label: "Proc.", value: counts.procurement },
            { label: "Pack", value: counts.packing },
            { label: "Deliv.", value: counts.deliveryS },
            { label: "Return", value: counts.deliveryD },
            { label: "Inv.", value: counts.invoice },
            { label: "Pay", value: counts.payment },
            { label: "Issues", value: counts.issues },
          ].map((c) => (
          <div key={c.label} className="rounded border border-border bg-card px-1.5 py-1 sm:px-3 sm:py-2 text-center min-w-[52px]">
            <div className="text-[9px] sm:text-xs text-muted-foreground">{c.label}</div>
            <div className="text-sm sm:text-lg font-semibold text-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, customer, event..." className="pl-9" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board" className="gap-2"><LayoutGrid className="h-4 w-4" />Sales orders</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2"><CalendarDays className="h-4 w-4" />Progress calendar</TabsTrigger>
          <TabsTrigger value="list" className="gap-2"><List className="h-4 w-4" />List</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          <div className="w-full overflow-x-auto rounded-lg border border-border bg-card p-4">
            <div className="flex min-w-max items-center">
              {boardColumns.map((step, index) => {
                const isLast = index === boardColumns.length - 1
                return (
                  <div key={step.status} className="relative flex flex-col items-center">
                    <div
                      className="relative flex h-9 min-w-[140px] items-center justify-center bg-muted px-3 text-xs font-semibold text-muted-foreground sm:h-10 sm:min-w-[160px] sm:text-sm"
                      style={{
                        clipPath: isLast
                          ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)"
                          : index === 0
                            ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                            : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
                      }}
                    >
                      {step.title}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[1400px] grid-cols-10 gap-3">
              {boardColumns.map((col) => {
                const list = boardByStatus.get(col.status) || []
                return (
                  <div key={col.status} className="rounded-lg border border-border bg-card">
                    <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
                      <div className="text-xs font-semibold text-foreground">{col.title}</div>
                      <div className="text-xs text-muted-foreground">{list.length}</div>
                    </div>
                    <div className="max-h-[520px] space-y-2 overflow-auto p-2">
                      {list.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                          Empty
                        </div>
                      ) : (
                        list.map((entry) => {
                          if ("request" in entry) {
                            const r = entry as RequestForQuotation
                            const companyOrName = r.request.customer.companyName || r.request.customer.name || "-"
                            return (
                              <Link
                                key={r.id}
                                href={`/portal/quotation/request-for-quotation/${encodeURIComponent(r.id)}`}
                                className="block rounded-md border border-border bg-background p-2 hover:bg-secondary/30"
                                title="Open"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-xs text-foreground">{r.id}</div>
                                    <div className="truncate text-xs text-muted-foreground">{companyOrName}</div>
                                    <div className="truncate text-xs text-muted-foreground">{r.request.event.eventName || "-"}</div>
                                  </div>
                                  <span
                                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-white"
                                    style={{ backgroundColor: RFQ_COLOR }}
                                  >
                                    RFQ
                                  </span>
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  Event: {formatDate(r.request.event.eventDate)}
                                </div>
                              </Link>
                            )
                          }

                          const o = entry as SalesOrder
                          return (
                            <Link
                              key={o.orderNumber}
                              href={`${getStageHref(o.status)}?order=${encodeURIComponent(o.orderNumber)}`}
                              className="block rounded-md border border-border bg-background p-2 hover:bg-secondary/30"
                              title="Open"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-mono text-xs text-foreground">{getDisplayOrderNumber(o)}</div>
                                  <div className="truncate text-xs text-muted-foreground">{o.customerData.customerName || "-"}</div>
                                  <div className="truncate text-xs text-muted-foreground">{o.eventData.eventName || "-"}</div>
                                </div>
                                <span
                                  className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-white"
                                  style={{ backgroundColor: statusColor(o.status) }}
                                >
                                  {STATUS_LABEL[o.status]}
                                </span>
                              </div>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                Event: {formatDate(o.eventData.eventDate)}
                              </div>
                            </Link>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              height="auto"
              events={calendarEvents as any}
              eventClick={(info) => {
                const props = info.event.extendedProps as any
                if (props?.kind === "rfq" && props?.requestId) {
                  window.location.href = `/portal/quotation/request-for-quotation/${encodeURIComponent(props.requestId)}`
                  return
                }
                const orderNumber = props?.orderNumber as string | undefined
                const status = props?.status as OrderStatus | undefined
                if (!orderNumber) return
                const base = getStageHref(status || "draft")
                window.location.href = `${base}?order=${encodeURIComponent(orderNumber)}`
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Quotation</th>
                    <th className="px-4 py-3 font-medium">Sales order</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Event date</th>
                    <th className="px-4 py-3 font-medium">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRfqs.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-white"
                          style={{ backgroundColor: RFQ_COLOR }}
                        >
                          RFQ
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.id}</td>
                      <td className="px-4 py-3 font-mono text-xs">-</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.request.customer.companyName || r.request.customer.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.request.event.eventName || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.request.event.eventDate)}</td>
                      <td className="px-4 py-3">
                        <Button asChild variant="outline" className="bg-transparent">
                          <Link href={`/portal/quotation/request-for-quotation/${encodeURIComponent(r.id)}`}>
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.map((o) => (
                    <tr key={o.orderNumber} className="hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-white" style={{ backgroundColor: statusColor(o.status) }}>
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                      <td className="px-4 py-3 font-mono text-xs">{o.orderMeta?.salesOrderNumber || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.customerData.customerName || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.eventData.eventName || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(o.eventData.eventDate)}</td>
                      <td className="px-4 py-3">
                        <Button asChild variant="outline" className="bg-transparent">
                          <Link href={`${getStageHref(o.status)}?order=${encodeURIComponent(o.orderNumber)}`}>
                            Open
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
