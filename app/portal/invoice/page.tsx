"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AlertCircle, Calendar, CheckCircle, FileText, Search } from "lucide-react"
import type { IssueData, SalesOrder } from "@/lib/types"
import { getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { OrderProgress } from "@/components/portal/order-progress"

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

function getDisplayOrderNumber(order: SalesOrder) {
  return order.orderMeta?.salesOrderNumber || order.orderNumber
}

export default function InvoicePage() {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [search, setSearch] = useState("")
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagPersonnel, setFlagPersonnel] = useState("")
  const [flagIssue, setFlagIssue] = useState("")

  const load = () => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const list = all.filter((o) => o.status === "invoice")
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(list)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return orders
    return orders.filter((o) => {
      const displayNo = getDisplayOrderNumber(o)
      return (
        o.orderNumber.toLowerCase().includes(term) ||
        displayNo.toLowerCase().includes(term) ||
        o.customerData.customerName?.toLowerCase().includes(term) ||
        o.eventData.eventName?.toLowerCase().includes(term)
      )
    })
  }, [orders, search])

  const selectedOrder = useMemo(
    () => orders.find((o) => o.orderNumber === selectedOrderNumber) || null,
    [orders, selectedOrderNumber],
  )

  const complete = () => {
    if (!selectedOrder) return
    setConfirmOpen(true)
  }

  const openFlag = () => {
    if (!selectedOrder) return
    setFlagPersonnel("")
    setFlagIssue("")
    setFlagOpen(true)
  }

  const confirmFlag = () => {
    if (!selectedOrder) return
    if (!flagPersonnel.trim() || !flagIssue.trim()) {
      showAlert("Please enter personnel and issue.", { title: "Missing info", actionText: "OK" })
      return
    }
    const issueData: IssueData = {
      flaggedPersonnel: flagPersonnel.trim(),
      flaggedIssue: flagIssue.trim(),
      flaggedDate: new Date().toISOString().split("T")[0],
      flaggedTime: new Date().toTimeString().slice(0, 5),
      flaggedAtStage: "invoice",
      isResolved: false,
    }
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      hasIssue: true,
      issueData,
      updatedAt: new Date().toISOString(),
    }))
    setFlagOpen(false)
    load()
    showAlert("Issue flagged.", { title: "Flagged", actionText: "OK" })
  }

  const confirmComplete = () => {
    if (!selectedOrder) return
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "completed",
      updatedAt: new Date().toISOString(),
    }))
    setConfirmOpen(false)
    showAlert("Invoice completed.", { title: "Completed", actionText: "OK" })
    load()
    router.push("/portal/completed")
  }

  return (
    <div className="p-6 space-y-6">
      <AlertDialog {...alertState} onClose={closeAlert} />
      <ConfirmDialog
        open={confirmOpen}
        title="Mark invoice completed?"
        description="This will move the order to Completed."
        confirmText="Yes, complete"
        cancelText="Cancel"
        onConfirm={confirmComplete}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={flagOpen}
        title="Flag issue"
        description="This will send the case to Warning & Issues."
        confirmText="Flag"
        cancelText="Cancel"
        onConfirm={confirmFlag}
        onCancel={() => setFlagOpen(false)}
      >
        <div className="space-y-2">
          <div className="space-y-1">
            <Label>Personnel *</Label>
            <Input value={flagPersonnel} onChange={(e) => setFlagPersonnel(e.target.value)} placeholder="Name" />
          </div>
          <div className="space-y-1">
            <Label>Issue *</Label>
            <Input value={flagIssue} onChange={(e) => setFlagIssue(e.target.value)} placeholder="What happened?" />
          </div>
        </div>
      </ConfirmDialog>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Invoice</h1>
          <p className="text-sm text-muted-foreground">Finalize invoices and close orders.</p>
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
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">Invoices ({filtered.length})</h2>
          </div>
          <div className="p-3">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No orders in Invoice.</div>
            ) : (
              <div className="space-y-2">
                {filtered.map((o) => {
                  const active = o.orderNumber === selectedOrderNumber
                  const displayNo = getDisplayOrderNumber(o)
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
            <div className="p-10 text-center text-sm text-muted-foreground">Select an order on the left.</div>
          ) : (
            <div className="p-6 space-y-6">
              <OrderProgress
                currentStatus={selectedOrder.status}
                orderNumber={selectedOrder.orderNumber}
                orderSource={selectedOrder.orderSource}
                requiresDismantle={
                  selectedOrder.orderSource === "ad-hoc"
                    ? selectedOrder.adHocOptions?.requiresDismantle ?? true
                    : selectedOrder.eventData?.dismantleRequired ?? true
                }
                adHocOptions={selectedOrder.adHocOptions}
              />

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4" />
                  Invoice summary
                </div>
                <div className="text-sm text-muted-foreground">
                  <div>Quotation: <span className="font-medium text-foreground">{selectedOrder.orderNumber}</span></div>
                  <div>Sales order: <span className="font-medium text-foreground">{selectedOrder.orderMeta?.salesOrderNumber || "-"}</span></div>
                  <div>Customer: <span className="font-medium text-foreground">{selectedOrder.customerData.customerName || "-"}</span></div>
                  <div>Total (RM): <span className="font-medium text-foreground">{Number.isFinite(selectedOrder.total) ? selectedOrder.total.toFixed(2) : "-"}</span></div>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="bg-transparent gap-2" onClick={openFlag} disabled={selectedOrder.hasIssue}>
                    <AlertCircle className="h-4 w-4" />
                    {selectedOrder.hasIssue ? "Issue Flagged" : "Flag Issue"}
                  </Button>
                  <Button onClick={complete} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                    <CheckCircle className="h-4 w-4" />
                    Complete invoice
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
