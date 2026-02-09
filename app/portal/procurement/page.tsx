"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { AlertCircle, Calendar, ClipboardList, Search } from "lucide-react"
import type { IssueData, MaterialPlanningLine, SalesOrder } from "@/lib/types"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { OrderProgress } from "@/components/portal/order-progress"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage } from "@/lib/inventory-storage"

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

function getDisplayOrderNumber(order: SalesOrder) {
  return order.orderMeta?.salesOrderNumber || order.orderNumber
}

export default function ProcurementPage() {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [search, setSearch] = useState("")
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>("")
  const [note, setNote] = useState("")
  const [procurementPersonnel, setProcurementPersonnel] = useState("")
  const [procurementDate, setProcurementDate] = useState("")
  const [procurementTime, setProcurementTime] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [flagPersonnel, setFlagPersonnel] = useState("")
  const [flagIssue, setFlagIssue] = useState("")

  const load = () => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const list = all.filter((o) => o.status === "procurement")
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    setOrders(list)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!hasInventoryDbInLocalStorage()) return
    const db = getInventoryDbFromLocalStorage()
    if (db?.items?.length) setInventoryItems(db.items)
  }, [])

  const inventoryNamesByCategory = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const it of inventoryItems) {
      const category = (it.category || "").trim()
      const name = (it.name || "").trim()
      if (!category || !name) continue
      const list = map.get(category) ?? []
      list.push(name)
      map.set(category, list)
    }
    for (const [cat, list] of map.entries()) {
      map.set(cat, Array.from(new Set(list)).sort((a, b) => a.localeCompare(b)))
    }
    return map
  }, [inventoryItems])

  const selectedOrder = useMemo(
    () => orders.find((o) => o.orderNumber === selectedOrderNumber) || null,
    [orders, selectedOrderNumber],
  )

  useEffect(() => {
    if (!selectedOrder) {
      setNote("")
      setProcurementPersonnel("")
      setProcurementDate("")
      setProcurementTime("")
      return
    }
    setNote("")
    const now = new Date()
    setProcurementPersonnel(selectedOrder.procurementData?.personnel || "")
    setProcurementDate(selectedOrder.procurementData?.date || now.toISOString().slice(0, 10))
    setProcurementTime(selectedOrder.procurementData?.time || now.toTimeString().slice(0, 5))
  }, [selectedOrder])

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

  type PurchasingLine = MaterialPlanningLine & { lineIndex: number }
  const purchasingLines: PurchasingLine[] = useMemo(() => {
    if (!selectedOrder?.materialPlanning?.lines) return []
    return selectedOrder.materialPlanning.lines
      .map((l, idx) => ({ ...l, lineIndex: idx }))
      .filter((l) => l.purchasingRequired)
  }, [selectedOrder])

  const [purchasingEdits, setPurchasingEdits] = useState<PurchasingLine[]>([])

  useEffect(() => {
    setPurchasingEdits(purchasingLines.map((l) => ({ ...l })))
  }, [selectedOrderNumber])

  const updatePurchasingLine = (lineIndex: number, patch: Partial<PurchasingLine>) => {
    setPurchasingEdits((prev) => prev.map((l) => (l.lineIndex === lineIndex ? { ...l, ...patch } : l)))
  }

  const savePurchasingEdits = (orderNumber: string) => {
    updateOrderByNumber(orderNumber, (order) => {
      if (!order.materialPlanning?.lines?.length) return { ...order, updatedAt: new Date().toISOString() }
      const nextLines = order.materialPlanning.lines.map((l, idx) => {
        const edited = purchasingEdits.find((p) => p.lineIndex === idx)
        if (!edited) return l
        return {
          ...l,
          item: edited.item || "",
          poDate: edited.poDate || "",
          supplier: edited.supplier || "",
          estimatedArrivalTime: edited.estimatedArrivalTime || "",
          arrivalDate: edited.arrivalDate || "",
        }
      })

      return {
        ...order,
        materialPlanning: {
          ...order.materialPlanning,
          lines: nextLines,
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const markDone = () => {
    if (!selectedOrder) return
    setConfirmOpen(true)
  }

  const sendBackToPlanningStage = () => {
    if (!selectedOrder) return
    setSendBackOpen(true)
  }

  const confirmSendBackToPlanningStage = () => {
    if (!selectedOrder) return

    savePurchasingEdits(selectedOrder.orderNumber)
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "planning",
      updatedAt: new Date().toISOString(),
    }))

    setSendBackOpen(false)
    load()
    showAlert("Order sent back to Planning stage.", { title: "Sent back", actionText: "OK" })
    router.push(`/portal/planning?order=${encodeURIComponent(selectedOrder.orderNumber)}`)
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
      showAlert("Please fill in personnel and issue.", { title: "Missing info", actionText: "OK" })
      return
    }

    const issueData: IssueData = {
      flaggedPersonnel: flagPersonnel.trim(),
      flaggedIssue: flagIssue.trim(),
      flaggedDate: new Date().toISOString().split("T")[0],
      flaggedTime: new Date().toTimeString().slice(0, 5),
      flaggedAtStage: "procurement",
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

  const confirmDone = () => {
    if (!selectedOrder) return
    if (!procurementPersonnel.trim() || !procurementDate.trim() || !procurementTime.trim()) {
      showAlert("Please fill in procurement personnel, date, and time.", { title: "Missing info", actionText: "OK" })
      return
    }

    savePurchasingEdits(selectedOrder.orderNumber)
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "packing",
      updatedAt: new Date().toISOString(),
      packingData: order.packingData ?? {
        items: (order.items || []).map((it) => ({
          name: it.name,
          quantity: it.quantity,
          packed: false,
        })),
        packingPersonnel: "",
        packingDate: "",
        packingTime: "",
        status: "pending",
      },
      materialPlanning: order.materialPlanning
        ? {
            ...order.materialPlanning,
            updatedAt: new Date().toISOString(),
            confirmedBy: order.materialPlanning.confirmedBy,
          }
        : order.materialPlanning,
      additionalInfo: order.additionalInfo
        ? { ...order.additionalInfo }
        : order.additionalInfo,
      // Store procurement note in issueData.resolvedNote would be wrong; keep it in materialPlanning.confirmedBy? no.
      // For now, attach as a soft note in customer special request to keep data visible everywhere.
      customerData: note.trim()
        ? { ...order.customerData, specialRequest: [order.customerData.specialRequest, `Procurement note: ${note.trim()}`].filter(Boolean).join("\n") }
        : order.customerData,
      procurementData: {
        personnel: procurementPersonnel.trim(),
        date: procurementDate.trim(),
        time: procurementTime.trim(),
        updatedAt: new Date().toISOString(),
      },
    }))

    setConfirmOpen(false)
    showAlert("Procurement completed. Sent to Packing.", { title: "Done", actionText: "OK" })
    load()
    router.push("/portal/packing")
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
      <AlertDialog {...alertState} onClose={closeAlert} />
      <ConfirmDialog
        open={confirmOpen}
        title="Mark procurement done?"
        description="This will send the order to Packing."
        confirmText="Yes, send"
        cancelText="Cancel"
        onConfirm={confirmDone}
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
      <ConfirmDialog
        open={sendBackOpen}
        title="Send back to Planning stage?"
        description="This will move the order back to Planning so the planning lines can be updated."
        confirmText="Send back"
        cancelText="Cancel"
        onConfirm={confirmSendBackToPlanningStage}
        onCancel={() => setSendBackOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this order?"
        description={selectedOrder ? `Delete order ${selectedOrder.orderNumber}? This cannot be undone.` : "Delete this order? This cannot be undone."}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <OrderProgress
        currentStep="procurement"
        orderNumber={selectedOrder?.orderNumber}
        hasIssue={selectedOrder?.hasIssue}
        orderSource={selectedOrder?.orderSource}
        quotationPath="/portal/quotation/official-quotation"
        requiresDismantle={
          selectedOrder
            ? selectedOrder.orderSource === "ad-hoc"
              ? selectedOrder.adHocOptions?.requiresDismantle ?? true
              : selectedOrder.eventData?.dismantleRequired ?? true
            : undefined
        }
        adHocOptions={selectedOrder?.adHocOptions}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Procurement</h1>
          <p className="text-sm text-muted-foreground">Review missing materials and confirm purchasing is completed.</p>
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
            <h2 className="text-sm font-semibold text-foreground">In Procurement ({filtered.length})</h2>
          </div>
          <div className="max-h-[70vh] overflow-auto p-2">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No orders in procurement.</div>
            ) : (
              <div className="space-y-1">
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
            <div className="p-10 text-center text-sm text-muted-foreground">
              Select an order on the left to review procurement.
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-accent" />
                    Procurement Checklist
                  </h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {getDisplayOrderNumber(selectedOrder)} • {selectedOrder.customerData.customerName || "-"} • {selectedOrder.eventData.eventName || "-"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="bg-transparent" onClick={openFlag} disabled={selectedOrder.hasIssue}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {selectedOrder.hasIssue ? "Issue Flagged" : "Flag Issue"}
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-transparent"
                    onClick={sendBackToPlanningStage}
                  >
                    Send back to Planning stage
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-transparent text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Purchasing required</h3>
                {purchasingLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchasing required items were flagged in Planning.</p>
                ) : (
                  <div className="overflow-auto rounded-md border border-border bg-card">
                    <table className="w-full min-w-[1200px] text-sm">
                      <thead className="bg-muted/40">
                        <tr className="text-left">
                          <th className="p-3 w-10">#</th>
                          <th className="p-3 w-56">Category</th>
                          <th className="p-3 min-w-[360px]">Item</th>
                          <th className="p-3 w-28">Qty</th>
                          <th className="p-3 w-36">PIC</th>
                          <th className="p-3 w-36">PO date</th>
                          <th className="p-3 w-56">Supplier</th>
                          <th className="p-3 w-40">ETA date</th>
                          <th className="p-3 w-36">Arrival date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasingEdits.map((l, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="p-3">{idx + 1}</td>
                            <td className="p-3 w-56">{l.category}</td>
                            <td className="p-3 min-w-[360px]">
                              <Input
                                value={l.item}
                                onChange={(e) => updatePurchasingLine(l.lineIndex, { item: e.target.value })}
                                list={`proc-item-options-${idx}`}
                                placeholder="Choose or type item"
                              />
                              <datalist id={`proc-item-options-${idx}`}>
                                {(inventoryNamesByCategory.get(l.category) ?? []).map((name) => (
                                  <option key={name} value={name} />
                                ))}
                              </datalist>
                            </td>
                            <td className="p-3">{l.quantity}</td>
                            <td className="p-3">{l.picName}</td>
                            <td className="p-3">
                              <Input
                                type="date"
                                value={l.poDate || ""}
                                onChange={(e) => updatePurchasingLine(l.lineIndex, { poDate: e.target.value })}
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                value={l.supplier || ""}
                                onChange={(e) => updatePurchasingLine(l.lineIndex, { supplier: e.target.value })}
                                placeholder="Supplier"
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                type="date"
                                value={l.estimatedArrivalTime || ""}
                                onChange={(e) => updatePurchasingLine(l.lineIndex, { estimatedArrivalTime: e.target.value })}
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                type="date"
                                value={l.arrivalDate || ""}
                                onChange={(e) => updatePurchasingLine(l.lineIndex, { arrivalDate: e.target.value })}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Procurement Note (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for delivery / team..." />
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Procurement personnel *</Label>
                    <Input value={procurementPersonnel} onChange={(e) => setProcurementPersonnel(e.target.value)} placeholder="Name" />
                  </div>
                  <div className="space-y-1">
                    <Label>Date *</Label>
                    <Input type="date" value={procurementDate} onChange={(e) => setProcurementDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Time *</Label>
                    <Input type="time" value={procurementTime} onChange={(e) => setProcurementTime(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={markDone} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                  Mark Procurement Done → Delivery
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
