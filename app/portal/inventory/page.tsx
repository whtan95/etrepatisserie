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

const CATEGORIES = ["Tents", "Tables & Chairs", "Equipment", "Others"] as const

function asNumber(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export default function InventoryPage() {
  const { alertState, showAlert, closeAlert } = useAppAlert()
  const [items, setItems] = useState<InventoryItem[]>(DEFAULT_INVENTORY_ITEMS)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" })
        const data = await res.json()
        if (!res.ok || !data?.success) return
        if (!canceled && Array.isArray(data.inventory?.items)) {
          setItems(data.inventory.items)
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
    if (!term) return items
    return items.filter((it) => it.name.toLowerCase().includes(term) || it.category.toLowerCase().includes(term))
  }, [items, search])

  const addItem = () => {
    const id = crypto.randomUUID()
    setItems((prev) => [
      ...prev,
      { id, category: "Others", name: "", defaultPrice: 0, defaultSst: true },
    ])
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const updateItem = (id: string, patch: Partial<InventoryItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const cleaned = items
        .map((it) => ({
          ...it,
          name: it.name.trim(),
          category: it.category.trim() || "Others",
          defaultPrice: Number.isFinite(it.defaultPrice) ? it.defaultPrice : 0,
          defaultSst: !!it.defaultSst,
        }))
        .filter((it) => it.name)

      const res = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cleaned }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        showAlert(data?.error || "Failed to save inventory", { title: "Save Failed", actionText: "OK" })
        return
      }
      if (Array.isArray(data.inventory?.items)) {
        setItems(data.inventory.items)
      }
      showAlert("Inventory saved", { title: "Saved", actionText: "OK" })
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
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or category..." />
          </div>
        </div>

        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Name</th>
                <th className="p-3 w-52">Category</th>
                <th className="p-3 w-36">Price (RM)</th>
                <th className="p-3 w-28">SST</th>
                <th className="p-3 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="p-3">
                    <Input
                      value={it.name}
                      onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      placeholder="Item name"
                    />
                  </td>
                  <td className="p-3">
                    <Select value={it.category} onValueChange={(v) => updateItem(it.id, { category: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min="0"
                      value={it.defaultPrice}
                      onChange={(e) => updateItem(it.id, { defaultPrice: asNumber(e.target.value) })}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Switch checked={it.defaultSst} onCheckedChange={(v) => updateItem(it.id, { defaultSst: v })} />
                      <span className="text-xs text-muted-foreground">{it.defaultSst ? "On" : "Off"}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(it.id)}
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
                  <td className="p-6 text-center text-muted-foreground" colSpan={5}>
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
