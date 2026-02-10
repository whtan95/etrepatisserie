"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppAlert } from "@/components/ui/use-app-alert"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Plus, Save, Trash2 } from "lucide-react"
import type { InventoryItem } from "@/lib/inventory"
import { DEFAULT_INVENTORY_ITEMS } from "@/lib/inventory"
import { getInventoryDbFromLocalStorage, hasInventoryDbInLocalStorage, saveInventoryDbToLocalStorage } from "@/lib/inventory-storage"

const PASTRY_CATEGORIES = ["Viennoiserie", "Bread", "Tart & Savoury", "Petit Gateaux", "Seasonal", "Cheesecake"] as const
const PACKAGING_CATEGORIES = ["Product packaging", "Plating equipments", "Service ware", "Labels & display", "Event day service crew"] as const
const CATEGORIES = [...PASTRY_CATEGORIES, ...PACKAGING_CATEGORIES] as const
const UNIT_TYPES = ["piece", "loaf", "set", "box", "tray", "pack", "roll", "others"] as const
const STATUSES = ["Active", "Inactive", "Active (Seasonal)"] as const

function asNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

type InventoryRow = InventoryItem & { rowId: string }

export default function InventoryPage() {
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [items, setItems] = useState<InventoryRow[]>(
    DEFAULT_INVENTORY_ITEMS.map((it) => ({ ...it, rowId: crypto.randomUUID() }))
  )
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [groupView, setGroupView] = useState<"all" | "pastry" | "packaging">("all")

  const normalizeCategory = (input: string) => {
    const raw = (input || "").trim()
    if (raw === "Savoury" || raw === "Tart") return "Tart & Savoury"
    return raw
  }

  useEffect(() => {
    if (hasInventoryDbInLocalStorage()) {
      const localDb = getInventoryDbFromLocalStorage()
      if (Array.isArray(localDb.items) && localDb.items.length) {
        setItems(
          localDb.items.map((it: InventoryItem) => ({
            ...it,
            category: normalizeCategory(it.category),
            rowId: crypto.randomUUID(),
          })),
        )
      }
    }

    let canceled = false
    ;(async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok || !data?.success) return
        if (!canceled && Array.isArray(data.inventory?.items)) {
          // If localStorage already has data, prefer it. Otherwise hydrate from API and mirror to localStorage.
          const hasLocal = hasInventoryDbInLocalStorage()
          if (!hasLocal) {
            const normalizedIncoming = data.inventory.items.map((it: InventoryItem) => ({
              ...it,
              category: normalizeCategory(it.category),
            }))
            const saved = saveInventoryDbToLocalStorage(normalizedIncoming)
            setItems(saved.items.map((it: InventoryItem) => ({ ...it, rowId: crypto.randomUUID() })))
          }
        }
      } catch {
        // ignore and use defaults
      }
    })()
    return () => {
      canceled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const base = !term
      ? items
      : items.filter((it) => {
      const haystack = [
        it.sku,
        it.id,
        it.category,
        it.name,
        it.unitType,
        it.status,
        it.notes,
      ]
        .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(term)
      })

    if (groupView === "all") return base
    const pastrySet = new Set<string>(PASTRY_CATEGORIES)
    const packagingSet = new Set<string>(PACKAGING_CATEGORIES)
    return base.filter((it) => {
      const cat = normalizeCategory(it.category)
      return groupView === "packaging" ? packagingSet.has(cat) : pastrySet.has(cat)
    })
  }, [items, search, groupView])

  const categoryOptionsByView = useMemo(() => {
    if (groupView === "pastry") return Array.from(PASTRY_CATEGORIES)
    if (groupView === "packaging") return Array.from(PACKAGING_CATEGORIES)
    return Array.from(CATEGORIES)
  }, [groupView])

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        rowId: crypto.randomUUID(),
        id: "",
        sku: "",
        category: groupView === "packaging" ? PACKAGING_CATEGORIES[0] : PASTRY_CATEGORIES[0],
        name: "",
        normalSizePrice: 0,
        petitSizePrice: 0,
        unitType: "piece",
        defaultMoq: 0,
        status: "Active",
        seasonal: false,
        notes: "",
        defaultSst: false,
      },
    ])
  }

  const removeItem = (rowId: string) => {
    setItems((prev) => prev.filter((it) => it.rowId !== rowId))
  }

  const updateItem = (rowId: string, patch: Partial<InventoryRow>) => {
    setItems((prev) => prev.map((it) => (it.rowId === rowId ? { ...it, ...patch } : it)))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const cleaned = items.map((it) => {
        const sku = (it.sku || it.id || "").trim().toUpperCase()
        return {
          id: sku,
          sku,
          name: it.name.trim(),
          category: normalizeCategory(it.category),
          normalSizePrice: Number.isFinite(it.normalSizePrice) ? it.normalSizePrice : 0,
          petitSizePrice: Number.isFinite(it.petitSizePrice) ? it.petitSizePrice : 0,
          unitType: (it.unitType || "").trim() || "piece",
          defaultMoq: Number.isFinite(it.defaultMoq) ? Math.max(0, it.defaultMoq) : 0,
          status: (it.status || "").trim() || "Active",
          seasonal: !!it.seasonal,
          notes: (it.notes || "").trim(),
          defaultSst: !!it.defaultSst,
        } satisfies InventoryItem
      })

      const withoutEmpty = cleaned.filter((it) => it.sku && it.name)
      const skuCounts = new Map<string, number>()
      for (const it of withoutEmpty) {
        skuCounts.set(it.sku, (skuCounts.get(it.sku) || 0) + 1)
      }
      const dup = Array.from(skuCounts.entries()).find(([, n]) => n > 1)?.[0]
      if (dup) {
        showAlert(`Duplicate SKU found: ${dup}`, { title: "Save Failed", actionText: "OK" })
        return
      }

      // Always save to localStorage (primary, per-client).
      const savedLocal = saveInventoryDbToLocalStorage(withoutEmpty)
      setItems(savedLocal.items.map((it: InventoryItem) => ({ ...it, rowId: crypto.randomUUID() })))

      // Best-effort: also persist to server DB so other browsers/devices can hydrate.
      try {
        const res = await fetch("/api/inventory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: withoutEmpty, version: 4 }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.success && Array.isArray(data.inventory?.items)) {
          // Mirror normalized server response back into localStorage too.
          const synced = saveInventoryDbToLocalStorage(data.inventory.items)
          setItems(synced.items.map((it: InventoryItem) => ({ ...it, rowId: crypto.randomUUID() })))
        }
      } catch {
        // ignore; localStorage already saved
      }

      showAlert("Inventory saved (local)", { title: "Saved", actionText: "OK" })
    } catch {
      showAlert("Failed to save inventory", { title: "Save Failed", actionText: "OK" })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <AlertDialog {...alertState} onClose={closeAlert} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Manage physical items used by Sales Order and Ad-hoc item pickers. System fees (MBI/Sunday OT) are configured in Settings.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={addItem} className="gap-2 bg-transparent">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_240px]">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, name, category..." />
          </div>
          <div className="space-y-2">
            <Label>View</Label>
            <Select value={groupView} onValueChange={(v) => setGroupView(v as "all" | "pastry" | "packaging")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pastry">Pastry & dessert</SelectItem>
                <SelectItem value="packaging">Non-food (Ops)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3 w-32">SKU</th>
                <th className="p-3 w-44">Category</th>
                <th className="p-3 min-w-[220px]">Product Name</th>
                <th className="p-3 w-32">Normal (RM)</th>
                <th className="p-3 w-32">Petit (RM)</th>
                <th className="p-3 w-28">Unit</th>
                <th className="p-3 w-28">MOQ</th>
                <th className="p-3 w-40">Status</th>
                <th className="p-3 w-28">Seasonal</th>
                <th className="p-3 w-44">Notes</th>
                <th className="p-3 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.rowId} className="border-t border-border">
                  <td className="p-3">
                    <Input
                      value={it.sku}
                      onChange={(e) => updateItem(it.rowId, { sku: e.target.value, id: e.target.value })}
                      placeholder="SKU"
                      className="font-mono text-xs"
                    />
                  </td>
                  <td className="p-3">
                    {(() => {
                      const normalized = normalizeCategory(it.category)
                      const hasCurrent = categoryOptionsByView.includes(normalized as any)
                      const options = hasCurrent ? categoryOptionsByView : [normalized, ...categoryOptionsByView]
                      return (
                    <Select value={it.category} onValueChange={(v) => updateItem(it.rowId, { category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                      )
                    })()}
                  </td>
                  <td className="p-3">
                    <Input
                      value={it.name}
                      onChange={(e) => updateItem(it.rowId, { name: e.target.value })}
                      placeholder="Product name"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min="0"
                      value={it.normalSizePrice}
                      onChange={(e) => updateItem(it.rowId, { normalSizePrice: asNumber(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min="0"
                      value={it.petitSizePrice}
                      onChange={(e) => updateItem(it.rowId, { petitSizePrice: asNumber(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <Select value={it.unitType} onValueChange={(v) => updateItem(it.rowId, { unitType: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_TYPES.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min="0"
                      value={it.defaultMoq}
                      onChange={(e) => updateItem(it.rowId, { defaultMoq: asNumber(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <Select
                      value={it.status}
                      onValueChange={(v) => {
                        const nextStatus = v
                        if (nextStatus === "Active (Seasonal)") {
                          updateItem(it.rowId, { status: nextStatus, seasonal: true })
                          return
                        }
                        // If switching away from seasonal status, seasonal must be off.
                        updateItem(it.rowId, { status: nextStatus, seasonal: false })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={it.seasonal}
                        onCheckedChange={(v) => {
                          // Seasonal = Yes implies Active (Seasonal)
                          if (v) {
                            updateItem(it.rowId, { seasonal: true, status: "Active (Seasonal)" })
                            return
                          }
                          if (!v && it.status === "Active (Seasonal)") {
                            updateItem(it.rowId, { seasonal: false, status: "Active" })
                            return
                          }
                          updateItem(it.rowId, { seasonal: v })
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{it.seasonal ? "Yes" : "No"}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Input
                      value={it.notes}
                      onChange={(e) => updateItem(it.rowId, { notes: e.target.value })}
                      placeholder="Short notes"
                      maxLength={80}
                      title={it.notes || ""}
                      className="text-xs truncate overflow-hidden whitespace-nowrap"
                    />
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(it.rowId)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={11}>
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
