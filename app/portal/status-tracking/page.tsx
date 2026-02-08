"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CalendarDays, List, Search } from "lucide-react"
import type { OrderStatus, SalesOrder } from "@/lib/types"
import { getAllOrders } from "@/lib/order-storage"
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
  "other-adhoc": "Other",
  completed: "Completed",
  cancelled: "Cancelled",
}

const statusColor = (status: OrderStatus): string => {
  switch (status) {
    case "scheduling": return "#F59E0B" // amber
    case "planning": return "#3B82F6" // blue
    case "procurement": return "#8B5CF6" // purple
    case "packing": return "#10B981" // green
    case "setting-up": return "#0EA5E9" // sky
    case "dismantling": return "#EF4444" // red
    case "invoice": return "#111827" // slate
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

export default function StatusTrackingPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const active = all.filter((o) => o.status !== "cancelled")
    active.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(active)
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

  const counts = useMemo(() => {
    const countBy = (status: OrderStatus) => filtered.filter((o) => o.status === status).length
    return {
      quotation: countBy("draft"),
      salesConf: countBy("scheduling"),
      planning: countBy("planning"),
      procurement: countBy("procurement"),
      packing: countBy("packing"),
      deliveryS: countBy("setting-up"),
      deliveryD: countBy("dismantling"),
      invoice: countBy("invoice"),
      issues: filtered.filter((o) => o.hasIssue && !o.issueData?.isResolved).length,
    }
  }, [filtered])

  const calendarEvents = useMemo(() => {
    return filtered
      .filter((o) => !!o.eventData.eventDate)
      .map((o) => ({
        id: o.orderNumber,
        title: `${STATUS_LABEL[o.status]} - ${getDisplayOrderNumber(o)}`,
        start: o.eventData.eventDate,
        allDay: true,
        backgroundColor: statusColor(o.status),
        borderColor: statusColor(o.status),
        textColor: "#ffffff",
        extendedProps: {
          orderNumber: o.orderNumber,
          status: o.status,
        },
      }))
  }, [filtered])

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Progress Calendar</h1>
        <p className="text-sm text-muted-foreground">Track order counts and see where each order is in the workflow.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-9">
        {[
          { label: "Quotation", value: counts.quotation },
          { label: "Sales Conf.", value: counts.salesConf },
          { label: "Planning", value: counts.planning },
          { label: "Procurement", value: counts.procurement },
          { label: "Packing", value: counts.packing },
          { label: "Delivery", value: counts.deliveryS },
          { label: "Returning", value: counts.deliveryD },
          { label: "Invoice", value: counts.invoice },
          { label: "Issues", value: counts.issues },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{c.value}</div>
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

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-2"><CalendarDays className="h-4 w-4" />Calendar</TabsTrigger>
          <TabsTrigger value="list" className="gap-2"><List className="h-4 w-4" />List</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <FullCalendar
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              height="auto"
              events={calendarEvents as any}
              eventClick={(info) => {
                const orderNumber = (info.event.extendedProps as any)?.orderNumber as string | undefined
                const status = (info.event.extendedProps as any)?.status as OrderStatus | undefined
                if (!orderNumber) return
                const base =
                  status === "scheduling"
                    ? "/portal/sales-confirmation"
                    : status === "planning"
                      ? "/portal/planning"
                      : status === "procurement"
                        ? "/portal/procurement"
                        : status === "packing"
                          ? "/portal/packing"
                          : status === "setting-up"
                            ? "/portal/delivery"
                            : status === "dismantling"
                              ? "/portal/returning"
                              : status === "invoice"
                                ? "/portal/invoice"
                                : "/portal/completed"
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
                          <Link href={`${o.status === "scheduling"
                            ? "/portal/sales-confirmation"
                            : o.status === "planning"
                              ? "/portal/planning"
                              : o.status === "procurement"
                                ? "/portal/procurement"
                                : o.status === "packing"
                                  ? "/portal/packing"
                                  : o.status === "setting-up"
                                    ? "/portal/delivery"
                                    : o.status === "dismantling"
                                      ? "/portal/returning"
                                      : o.status === "invoice"
                                        ? "/portal/invoice"
                                        : "/portal/completed"}?order=${encodeURIComponent(o.orderNumber)}`}>
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
