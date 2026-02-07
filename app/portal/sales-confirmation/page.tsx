"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Calendar, CheckCircle, Search } from "lucide-react"
import type { SalesOrder } from "@/lib/types"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"

function generateSalesOrderNumber() {
  const prefix = "SO"
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}${year}${month}-${random}`
}

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

export default function SalesConfirmationPage() {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [search, setSearch] = useState("")
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("")
  const [salesOrderNumber, setSalesOrderNumber] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)

  const load = () => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const pending = all.filter((o) => o.status === "scheduling")
    pending.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(pending)
  }

  useEffect(() => {
    load()
  }, [])

  const selectedOrder = useMemo(
    () => orders.find((o) => o.orderNumber === selectedOrderNumber) || null,
    [orders, selectedOrderNumber],
  )

  useEffect(() => {
    if (!selectedOrder) {
      setSalesOrderNumber("")
      return
    }
    setSalesOrderNumber(selectedOrder.orderMeta?.salesOrderNumber || generateSalesOrderNumber())
  }, [selectedOrder])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return orders
    return orders.filter((o) => {
      const displayNo = o.orderMeta?.salesOrderNumber || o.orderNumber
      return (
        o.orderNumber.toLowerCase().includes(term) ||
        displayNo.toLowerCase().includes(term) ||
        o.customerData.customerName?.toLowerCase().includes(term) ||
        o.eventData.eventName?.toLowerCase().includes(term)
      )
    })
  }, [orders, search])

  const handleConfirm = () => {
    if (!selectedOrder) return
    if (!salesOrderNumber.trim()) {
      showAlert("Please enter a Sales Order Number.", { title: "Missing Sales Order Number", actionText: "OK" })
      return
    }
    setConfirmOpen(true)
  }

  const confirm = () => {
    if (!selectedOrder) return

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "packing",
      orderMeta: {
        ...order.orderMeta,
        salesOrderNumber: salesOrderNumber.trim(),
      },
      updatedAt: new Date().toISOString(),
    }))

    load()
    setConfirmOpen(false)
    showAlert("Confirmed. Sent to Planning.", { title: "Sales Confirmed", actionText: "OK" })
    router.push("/portal/planning")
  }

  return (
    <div className="p-6 space-y-6">
      <AlertDialog {...alertState} onClose={closeAlert} />
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm quotation?"
        description="This will generate/attach the Sales Order Number and send the order to Planning."
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Sales Confirmation</h1>
          <p className="text-sm text-muted-foreground">Confirm quotations and send them to Planning.</p>
        </div>
        <div className="w-full sm:w-[320px] space-y-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, customer, event..." className="pl-9" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Pending Quotations ({filtered.length})</h2>
          </div>
          <div className="max-h-[70vh] overflow-auto p-2">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No pending quotations.</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((o) => {
                  const active = o.orderNumber === selectedOrderNumber
                  const displayNo = o.orderMeta?.salesOrderNumber || o.orderNumber
                  return (
                    <button
                      key={o.orderNumber}
                      type="button"
                      onClick={() => setSelectedOrderNumber(o.orderNumber)}
                      className={[
                        "w-full rounded-md border px-3 py-2 text-left transition-colors",
                        active ? "border-accent bg-accent/10" : "border-border hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{displayNo}</p>
                        <span className="text-[11px] text-muted-foreground">{o.orderSource === "ad-hoc" ? "Adhoc" : "Sales"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{o.customerData.customerName || "-"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {formatDate(o.eventData.eventDate)}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          {!selectedOrder ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Select a quotation on the left to confirm.
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-accent" />
                  Confirm Quotation
                </h2>
                <p className="text-sm text-muted-foreground">
                  Quotation: <span className="font-medium text-foreground">{selectedOrder.orderNumber}</span>
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Customer</Label>
                  <div className="h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center text-sm">
                    {selectedOrder.customerData.customerName || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Event</Label>
                  <div className="h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center text-sm">
                    {selectedOrder.eventData.eventName || "-"}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Event Date</Label>
                  <div className="h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center text-sm">
                    {formatDate(selectedOrder.eventData.eventDate)}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Total (RM)</Label>
                  <div className="h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center text-sm">
                    {Number.isFinite(selectedOrder.total) ? selectedOrder.total.toFixed(2) : "-"}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="grid gap-2 md:grid-cols-[200px_1fr] md:items-center">
                  <Label>Sales Order Number</Label>
                  <Input value={salesOrderNumber} onChange={(e) => setSalesOrderNumber(e.target.value)} placeholder="e.g. SO2602-ABCD" />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSalesOrderNumber(generateSalesOrderNumber())}
                    className="bg-transparent"
                  >
                    Auto-generate
                  </Button>
                  <Button type="button" onClick={handleConfirm} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                    <CheckCircle className="h-4 w-4" />
                    Confirm & Send to Planning
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

