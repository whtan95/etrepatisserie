"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar, CheckCircle, ClipboardList, Search, Save, Undo2, AlertCircle, Trash2 } from "lucide-react"
import type { IssueData, MaterialPlanningLine, SalesOrder } from "@/lib/types"
import { deleteOrderByNumber, getAllOrders, updateOrderByNumber } from "@/lib/order-storage"
import { OrderProgress } from "@/components/portal/order-progress"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage } from "@/lib/inventory-storage"

const PLANNING_CATEGORIES = [
  "Kitchen item (raw ingredients)",
  "Product packaging",
  "Plating equipments",
  "Service ware",
  "Labels & display",
  "Event day service crew",
  "Transport",
] as const

const createEmptyLine = (): MaterialPlanningLine => ({
  category: PLANNING_CATEGORIES[0],
  item: "",
  quantity: "",
  picName: "",
  purchasingRequired: true,
  adequacy: "unknown",
})

function formatDate(dateString: string) {
  if (!dateString) return "-"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

function getDisplayOrderNumber(order: SalesOrder) {
  return order.orderMeta?.salesOrderNumber || order.orderNumber
}

export default function PlanningPage() {
  const router = useRouter()
  const { alertState, showAlert, closeAlert } = useAppAlert()

  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [search, setSearch] = useState("")
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("")
  const [approvedBy, setApprovedBy] = useState("")
  const [approvedDate, setApprovedDate] = useState("")
  const [approvedTime, setApprovedTime] = useState("")
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [lines, setLines] = useState<MaterialPlanningLine[]>([createEmptyLine()])
  const [isLocked, setIsLocked] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [flagPersonnel, setFlagPersonnel] = useState("")
  const [flagIssue, setFlagIssue] = useState("")

  const load = () => {
    const all = getAllOrders().map((o) => ({ ...o, orderSource: o.orderSource || "sales" }))
    const list = all.filter((o) => o.status === "planning")
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

  useEffect(() => {
    if (!selectedOrder) {
      setApprovedBy("")
      setApprovedDate("")
      setApprovedTime("")
      setLines([createEmptyLine()])
      setIsLocked(false)
      return
    }
    const mp = selectedOrder.materialPlanning
    const now = new Date()
    setApprovedBy(mp?.approvedBy || mp?.confirmedBy || "")
    setApprovedDate(mp?.approvedDate || now.toISOString().slice(0, 10))
    setApprovedTime(mp?.approvedTime || now.toTimeString().slice(0, 5))
    setLines(
      selectedOrder.materialPlanning?.lines?.length
        ? selectedOrder.materialPlanning.lines.map((l) => ({ ...l }))
        : [createEmptyLine()],
    )
    setIsLocked(Boolean(mp?.approvedBy || mp?.confirmedBy))
  }, [selectedOrderNumber])

  const updateLine = (idx: number, patch: Partial<MaterialPlanningLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((prev) => [...prev, createEmptyLine()])
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx))

  const normalizedLines = useMemo(() => {
    return lines
      .map((l) => ({
        ...l,
        category: (l.category || "").trim(),
        item: (l.item || "").trim(),
        quantity: (l.quantity || "").trim(),
        picName: (l.picName || "").trim(),
      }))
      .filter((l) => l.category || l.item || l.quantity || l.picName)
  }, [lines])

  const save = () => {
    if (!selectedOrder) return
    if (!approvedBy.trim()) {
      showAlert("Please enter Approved by.", { title: "Missing Approved by", actionText: "OK" })
      return
    }
    if (!approvedDate.trim() || !approvedTime.trim()) {
      showAlert("Please enter approval date and time.", { title: "Missing approval timestamp", actionText: "OK" })
      return
    }
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      materialPlanning: {
        lines: normalizedLines.length ? normalizedLines : [createEmptyLine()],
        updatedAt: new Date().toISOString(),
        approvedBy: approvedBy.trim(),
        approvedDate: approvedDate.trim(),
        approvedTime: approvedTime.trim(),
        confirmedBy: approvedBy.trim(),
      },
      updatedAt: new Date().toISOString(),
    }))
    setIsLocked(true)
    showAlert("Planning information saved.", { title: "Saved", actionText: "OK" })
    load()
  }

  const proceed = () => {
    if (!selectedOrder) return
    if (!isLocked) {
      showAlert("Please save Planning first.", { title: "Not saved", actionText: "OK" })
      return
    }
    setConfirmOpen(true)
  }

  const confirmProceed = () => {
    if (!selectedOrder) return
    const needsProcurement = (normalizedLines.length ? normalizedLines : lines).some((l) => l.purchasingRequired)
    const next = needsProcurement ? ("procurement" as const) : ("packing" as const)

    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: next,
      updatedAt: new Date().toISOString(),
      // Ensure packingData exists when moving forward to packing.
      packingData:
        next === "packing"
          ? (order.packingData ?? {
              items: (order.items || []).map((it) => ({
                name: it.name,
                quantity: it.quantity,
                packed: false,
              })),
              packingPersonnel: "",
              packingDate: "",
              packingTime: "",
              status: "pending",
            })
          : order.packingData,
    }))

    setConfirmOpen(false)
    load()
    router.push(next === "procurement" ? "/portal/procurement" : "/portal/packing")
  }

  const sendBackToSalesConfirmation = () => {
    if (!selectedOrder) return
    updateOrderByNumber(selectedOrder.orderNumber, (order) => ({
      ...order,
      status: "scheduling",
      updatedAt: new Date().toISOString(),
    }))
    setSelectedOrderNumber("")
    load()
    showAlert("Sent back to Sales order.", { title: "Sent back", actionText: "OK" })
    router.push("/portal/sales-confirmation")
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
      flaggedAtStage: "planning",
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
        title="Proceed to next stage?"
        description="This will send the order to Procurement (if purchasing is required) or to Packing."
        confirmText="Proceed"
        cancelText="Cancel"
        onConfirm={confirmProceed}
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
        open={deleteOpen}
        title="Delete this order?"
        description={selectedOrder ? `Delete order ${selectedOrder.orderNumber}? This cannot be undone.` : "Delete this order? This cannot be undone."}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <OrderProgress
        currentStep="planning"
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
          <h1 className="text-2xl font-semibold text-foreground">Planning</h1>
          <p className="text-sm text-muted-foreground">Create planning lines and mark purchasing required items.</p>
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
            <h2 className="text-sm font-semibold text-foreground">Orders for Planning ({filtered.length})</h2>
          </div>
          <div className="p-3">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No orders in Planning.</div>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-accent" />
                    Planning Lines
                  </h2>
                  <p className="text-sm text-muted-foreground truncate">
                    {getDisplayOrderNumber(selectedOrder)} • {selectedOrder.customerData.customerName || "-"} • {selectedOrder.eventData.eventName || "-"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2 bg-transparent" onClick={sendBackToSalesConfirmation} disabled={isLocked}>
                    <Undo2 className="h-4 w-4" />
                    Send back
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 bg-transparent"
                    onClick={() => router.push(`/portal/sales-confirmation?order=${encodeURIComponent(selectedOrder.orderNumber)}`)}
                  >
                    Return to Sales order
                  </Button>
                  <Button variant="outline" className="gap-2 bg-transparent" onClick={openFlag} disabled={selectedOrder.hasIssue}>
                    <AlertCircle className="h-4 w-4" />
                    {selectedOrder.hasIssue ? "Issue Flagged" : "Flag Issue"}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 bg-transparent text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="p-3 w-10">#</th>
                      <th className="p-3 w-64">Category</th>
                      <th className="p-3 min-w-[360px]">Item</th>
                      <th className="p-3 w-36">Qty</th>
                      <th className="p-3 w-48">PIC</th>
                      <th className="p-3 w-40">Purchasing required</th>
                      <th className="p-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l, idx) => (
                      <tr key={idx}>
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3">
                          <Select
                            value={l.category}
                            onValueChange={(v) => updateLine(idx, { category: v })}
                            disabled={isLocked}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLANNING_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 min-w-[360px]">
                          <Input
                            value={l.item}
                            onChange={(e) => updateLine(idx, { item: e.target.value })}
                            disabled={isLocked}
                            list={`planning-item-options-${idx}`}
                            placeholder="Choose or type item"
                          />
                          <datalist id={`planning-item-options-${idx}`}>
                            {(inventoryNamesByCategory.get(l.category) ?? []).map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                        </td>
                        <td className="p-3">
                          <Input value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} disabled={isLocked} />
                        </td>
                        <td className="p-3">
                          <Input value={l.picName} onChange={(e) => updateLine(idx, { picName: e.target.value })} disabled={isLocked} />
                        </td>
                        <td className="p-3">
                          <Select
                            value={l.purchasingRequired ? "yes" : "no"}
                            onValueChange={(v) => updateLine(idx, { purchasingRequired: v === "yes" })}
                            disabled={isLocked}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="bg-transparent"
                            onClick={() => removeLine(idx)}
                            disabled={isLocked || lines.length <= 1}
                            title="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Approved by *</Label>
                    <Input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Name" disabled={isLocked} />
                  </div>
                  <div className="space-y-1">
                    <Label>Date *</Label>
                    <Input type="date" value={approvedDate} onChange={(e) => setApprovedDate(e.target.value)} disabled={isLocked} />
                  </div>
                  <div className="space-y-1">
                    <Label>Time *</Label>
                    <Input type="time" value={approvedTime} onChange={(e) => setApprovedTime(e.target.value)} disabled={isLocked} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-between">
                <Button variant="outline" className="bg-transparent" onClick={addLine} disabled={isLocked}>
                  Add line
                </Button>
                <div className="flex flex-wrap gap-2">
                  {isLocked ? (
                    <Button variant="outline" className="bg-transparent" onClick={() => setIsLocked(false)}>
                      Edit
                    </Button>
                  ) : (
                    <Button onClick={save} className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                  )}
                  <Button onClick={proceed} disabled={!selectedOrder} className="gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Proceed
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
