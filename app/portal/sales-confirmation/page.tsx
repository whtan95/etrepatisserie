"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, CheckCircle, Search } from "lucide-react"
import type { PaymentInfo, SalesOrder } from "@/lib/types"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { OrderProgress } from "@/components/portal/order-progress"

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

export default function SalesConfirmationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { alertState, showAlert, closeAlert } = useAppAlert()

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [search, setSearch] = useState("")
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("")
  const [salesOrderNumber, setSalesOrderNumber] = useState("")
  const [approvedBy, setApprovedBy] = useState("")
  const [approvedDate, setApprovedDate] = useState("")
  const [approvedTime, setApprovedTime] = useState("")
  const [paymentStatus, setPaymentStatus] = useState<NonNullable<PaymentInfo["status"]>>("not_paid")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositReceived, setDepositReceived] = useState(false)
  const [fullPaymentReceived, setFullPaymentReceived] = useState(false)
  const [fullPaymentProof, setFullPaymentProof] = useState<PaymentInfo["fullPaymentProof"] | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [ccRows, setCcRows] = useState<Array<{ department: string; name: string; email: string }>>([
    { department: "", name: "", email: "" },
  ])

  const load = () => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const pending = all.filter((o) => o.status === "scheduling")
    pending.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(pending)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const order = searchParams.get("order")
    if (!order) return
    setSelectedOrderNumber(order)
  }, [searchParams])

  const selectedOrder = useMemo(
    () => orders.find((o) => o.orderNumber === selectedOrderNumber) || null,
    [orders, selectedOrderNumber],
  )

  useEffect(() => {
    if (!selectedOrder) {
      setSalesOrderNumber("")
      setApprovedBy("")
      setApprovedDate("")
      setApprovedTime("")
      setDepositAmount("")
      setDepositReceived(false)
      return
    }
    const now = new Date()
    setSalesOrderNumber(selectedOrder.orderMeta?.salesOrderNumber || "")
    setApprovedBy(selectedOrder.orderMeta?.salesApprovedBy || "")
    setApprovedDate(selectedOrder.orderMeta?.salesApprovedDate || now.toISOString().slice(0, 10))
    setApprovedTime(selectedOrder.orderMeta?.salesApprovedTime || now.toTimeString().slice(0, 5))
  }, [selectedOrder])

  useEffect(() => {
    if (!selectedOrder) return
    const pi = selectedOrder.paymentInfo
    const nextStatus: NonNullable<PaymentInfo["status"]> =
      pi?.status ?? (pi?.finalPaymentReceivedAt ? "full" : (pi?.depositAmount ?? 0) > 0 ? "deposit" : "not_paid")
    setPaymentStatus(nextStatus)
    const dep = typeof pi?.depositAmount === "number" && Number.isFinite(pi.depositAmount) ? pi.depositAmount : 0
    setDepositAmount(dep > 0 ? dep.toFixed(2) : "")
    setDepositReceived(Boolean(pi?.depositReceivedAt))
    setFullPaymentReceived(Boolean(pi?.finalPaymentReceivedAt))
    setFullPaymentProof(pi?.fullPaymentProof ?? null)
  }, [selectedOrderNumber])

  useEffect(() => {
    if (paymentStatus === "not_paid") {
      setDepositAmount("")
      setDepositReceived(false)
      setFullPaymentReceived(false)
      setFullPaymentProof(null)
    }
    if (paymentStatus === "deposit") {
      setFullPaymentReceived(false)
      setFullPaymentProof(null)
    }
    if (paymentStatus === "full") {
      setDepositAmount("")
      setDepositReceived(false)
      setFullPaymentReceived(true)
    }
  }, [paymentStatus])

  useEffect(() => {
    if (!selectedOrder) return
    const existing = selectedOrder.orderMeta?.salesConfirmationCc
    if (existing?.length) {
      setCcRows(existing.map((r) => ({ department: r.department || "", name: r.name || "", email: r.email || "" })))
    } else {
      setCcRows([{ department: "", name: "", email: "" }])
    }
  }, [selectedOrderNumber])

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
    if (!approvedBy.trim() || !approvedDate.trim() || !approvedTime.trim()) {
      showAlert("Please fill in Approved by, Date, and Time.", { title: "Missing approval info", actionText: "OK" })
      return
    }
    setConfirmOpen(true)
  }

  const confirm = () => {
    if (!selectedOrder) return

    const ccClean = ccRows
      .map((r) => ({
        department: r.department.trim(),
        name: r.name.trim(),
        email: r.email.trim(),
      }))
      .filter((r) => r.department || r.name || r.email)

    const nowIso = new Date().toISOString()
    const existingPaymentInfo = selectedOrder.paymentInfo
    const depositRaw = Number.parseFloat(depositAmount || "")
    const depositValue = Number.isFinite(depositRaw) ? Math.max(0, depositRaw) : 0

    if (paymentStatus === "deposit" && depositValue <= 0) {
      showAlert("Please enter a deposit amount (RM).", { title: "Missing deposit", actionText: "OK" })
      setConfirmOpen(false)
      return
    }

    if (paymentStatus === "full" && fullPaymentReceived && !fullPaymentProof?.dataUrl) {
      showAlert("Please upload full payment proof.", { title: "Missing proof", actionText: "OK" })
      setConfirmOpen(false)
      return
    }

    const nextPaymentInfo: PaymentInfo | undefined =
      paymentStatus === "not_paid"
        ? existingPaymentInfo
          ? {
              ...existingPaymentInfo,
              status: "not_paid",
              depositAmount: 0,
              depositReceivedAt: undefined,
              finalPaymentReceivedAt: undefined,
              fullPaymentProof: undefined,
            }
          : { status: "not_paid", depositAmount: 0 }
        : paymentStatus === "deposit"
          ? {
              ...(existingPaymentInfo ?? { depositAmount: depositValue }),
              status: "deposit",
              depositAmount: depositValue,
              depositReceivedAt: depositReceived ? (existingPaymentInfo?.depositReceivedAt ?? nowIso) : undefined,
              finalPaymentReceivedAt: undefined,
              fullPaymentProof: undefined,
            }
          : {
              ...(existingPaymentInfo ?? { depositAmount: 0 }),
              status: "full",
              depositAmount: 0,
              depositReceivedAt: undefined,
              finalPaymentReceivedAt: fullPaymentReceived ? (existingPaymentInfo?.finalPaymentReceivedAt ?? nowIso) : undefined,
              fullPaymentProof: fullPaymentProof ?? undefined,
            }

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "planning",
      orderMeta: {
        ...order.orderMeta,
        salesOrderNumber: salesOrderNumber.trim(),
        salesApprovedBy: approvedBy.trim(),
        salesApprovedDate: approvedDate.trim(),
        salesApprovedTime: approvedTime.trim(),
        salesConfirmationCc: ccClean.length ? ccClean : undefined,
      },
      paymentInfo: nextPaymentInfo,
      updatedAt: new Date().toISOString(),
    }))

    load()
    setConfirmOpen(false)
    showAlert("Confirmed as sales order. Sent to Planning.", { title: "Sales order confirmed", actionText: "OK" })
    router.push("/portal/planning")
  }

  const confirmDelete = () => {
    if (!selectedOrder) return
    deleteOrderByNumber(selectedOrder.orderNumber)
    setDeleteOpen(false)
    setSelectedOrderNumber("")
    load()
    showAlert("Order deleted.", { title: "Deleted", actionText: "OK" })
  }

  return (
    <div className="p-6 space-y-6">
      <OrderProgress currentStep="sales-confirmation" quotationPath="/portal/quotation/official-quotation" />
      <AlertDialog {...alertState} onClose={closeAlert} />
      <ConfirmDialog
        open={confirmOpen}
        title="Confirmed as sales order?"
        description="This will attach the Sales Order Number and send the order to Planning. Optional: add CC recipients."
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-xs font-semibold text-foreground">CC recipients</div>
          <div className="space-y-2">
            {ccRows.map((row, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-3">
                <Input
                  value={row.department}
                  onChange={(e) =>
                    setCcRows((prev) => prev.map((r, i) => (i === idx ? { ...r, department: e.target.value } : r)))
                  }
                  placeholder="Department"
                />
                <Input
                  value={row.name}
                  onChange={(e) =>
                    setCcRows((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                  }
                  placeholder="Name"
                />
                <div className="flex gap-2">
                  <Input
                    value={row.email}
                    onChange={(e) =>
                      setCcRows((prev) => prev.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                    }
                    placeholder="Email"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => setCcRows((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={ccRows.length <= 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="bg-transparent"
            onClick={() => setCcRows((prev) => [...prev, { department: "", name: "", email: "" }])}
          >
            Add CC
          </Button>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this order?"
        description={selectedOrder ? `Delete order ${selectedOrder.orderNumber}? This cannot be undone.` : "Delete this order? This cannot be undone."}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Sales order</h1>
          <p className="text-sm text-muted-foreground">Confirm quotations and send them to Planning.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-[320px] space-y-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order no, customer, event..." className="pl-9" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="bg-transparent" onClick={() => router.push("/portal/quotation/official-quotation")}>
              Return to Official Quotation
            </Button>
            <Button
              variant="outline"
              className="bg-transparent text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
              disabled={!selectedOrder}
            >
              Delete
            </Button>
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
                  Confirm as sales order
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

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Payment status</Label>
                    <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as NonNullable<PaymentInfo["status"]>)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_paid">Not paid yet</SelectItem>
                        <SelectItem value="deposit">Deposit</SelectItem>
                        <SelectItem value="full">Fully paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paymentStatus === "deposit" ? (
                    <div className="space-y-1">
                      <Label>Deposit (RM)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="e.g. 500.00"
                      />
                    </div>
                  ) : paymentStatus === "full" ? (
                    <div className="flex items-end justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">Full payment received</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {selectedOrder.paymentInfo?.finalPaymentReceivedAt
                            ? new Date(selectedOrder.paymentInfo.finalPaymentReceivedAt).toLocaleString()
                            : "Not recorded"}
                        </div>
                      </div>
                      <Switch checked={fullPaymentReceived} onCheckedChange={setFullPaymentReceived} />
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-muted-foreground">No payment recorded yet.</div>
                  )}
                </div>

                {paymentStatus === "deposit" && (
                  <div className="flex items-end justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">Deposit received</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedOrder.paymentInfo?.depositReceivedAt
                          ? new Date(selectedOrder.paymentInfo.depositReceivedAt).toLocaleString()
                          : "Not received"}
                      </div>
                    </div>
                    <Switch
                      checked={depositReceived}
                      onCheckedChange={(v) => {
                        const dep = Number.parseFloat(depositAmount || "")
                        const depOk = Number.isFinite(dep) && dep > 0
                        setDepositReceived(depOk ? v : false)
                      }}
                    />
                  </div>
                )}

                {paymentStatus === "full" && fullPaymentReceived && (
                  <div className="grid gap-2 rounded-md border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">Payment proof</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {fullPaymentProof?.uploadedAt ? `Uploaded: ${new Date(fullPaymentProof.uploadedAt).toLocaleString()}` : "Not uploaded"}
                        </div>
                      </div>
                      {fullPaymentProof?.dataUrl && (
                        <Button asChild variant="outline" className="bg-transparent">
                          <a href={fullPaymentProof.dataUrl} target="_blank" rel="noreferrer">
                            View
                          </a>
                        </Button>
                      )}
                    </div>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const dataUrl = typeof reader.result === "string" ? reader.result : ""
                          if (!dataUrl) return
                          setFullPaymentProof({
                            fileName: file.name,
                            dataUrl,
                            uploadedAt: new Date().toISOString(),
                          })
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                {fullPaymentProof?.fileName && (
                  <div className="text-xs text-muted-foreground truncate">File: {fullPaymentProof.fileName}</div>
                )}
              </div>
            )}

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Approved by *</Label>
                      <Input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Name" />
                    </div>
                    <div className="space-y-1">
                      <Label>Date *</Label>
                      <Input type="date" value={approvedDate} onChange={(e) => setApprovedDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Time *</Label>
                      <Input type="time" value={approvedTime} onChange={(e) => setApprovedTime(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
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
