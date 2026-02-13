"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  getRequestForQuotations,
  deleteRequestForQuotation,
  REQUEST_FOR_QUOTATION_UPDATED_EVENT,
  type RequestForQuotation,
} from "@/lib/request-for-quotation-storage"
import { Search, Eye, Trash2, RefreshCw } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OrderProgress } from "@/components/portal/order-progress"

export default function RequestForQuotationListPage() {
  const [items, setItems] = useState<RequestForQuotation[]>([])
  const [query, setQuery] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadFromApi = useCallback(async () => {
    try {
      const res = await fetch("/api/quote-request")
      if (res.ok) {
        const data = await res.json()
        return (data.requests ?? []) as RequestForQuotation[]
      }
    } catch (err) {
      console.error("Failed to fetch from API:", err)
    }
    return []
  }, [])

  const loadAll = useCallback(async () => {
    setIsLoading(true)
    try {
      // 同时从 localStorage 和 API 读取数据
      const localItems = getRequestForQuotations()
      const apiItems = await loadFromApi()

      // 合并数据，API 优先（因为客户提交的数据在那里）
      const merged = new Map<string, RequestForQuotation>()
      for (const item of localItems) merged.set(item.id, item)
      for (const item of apiItems) merged.set(item.id, item)

      // 按创建时间倒序排列
      const all = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      setItems(all)
    } finally {
      setIsLoading(false)
    }
  }, [loadFromApi])

  useEffect(() => {
    loadAll()
    window.addEventListener(REQUEST_FOR_QUOTATION_UPDATED_EVENT, loadAll as EventListener)
    return () => window.removeEventListener(REQUEST_FOR_QUOTATION_UPDATED_EVENT, loadAll as EventListener)
  }, [loadAll])

  const handleDelete = async (id: string) => {
    // 从 localStorage 删除
    deleteRequestForQuotation(id)

    // 从 API 删除
    try {
      await fetch(`/api/quote-request?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch (err) {
      console.error("Failed to delete from API:", err)
    }

    setDeleteConfirmId(null)
    loadAll()
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const customer = `${item.request.customer.companyName} ${item.request.customer.name} ${item.request.customer.email}`.toLowerCase()
      return item.id.toLowerCase().includes(q) || customer.includes(q)
    })
  }, [items, query])

  return (
    <div className="space-y-4">
      <OrderProgress currentStep="request-for-quotation" />
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Delete Request?"
        description={`Are you sure you want to delete request ${deleteConfirmId}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="truncate text-lg font-semibold text-foreground">Request for quotation</h1>
          <p className="text-sm text-muted-foreground">
            Requests submitted from customers via the public quotation page.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAll()}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by request ID, name, company, email..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No requests yet. Submit one via{" "}
          <Link className="underline" href="/portal/quotation/webpage-live">
            Webpage live
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="bg-secondary/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Request ID</th>
                  <th className="px-4 py-3 font-medium">Request Date</th>
                  <th className="px-4 py-3 font-medium">Request Time</th>
                  <th className="px-4 py-3 font-medium">Company name</th>
                  <th className="px-4 py-3 font-medium">Event Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => {
                  const created = new Date(item.createdAt)
                  const createdOk = !Number.isNaN(created.getTime())
                  const rDate = createdOk ? created.toLocaleDateString() : "-"
                  const rTime = createdOk ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"
                  const company = item.request.customer.companyName || "-"
                  const eventDate = item.request.event.eventDate || "-"
                  return (
                    <tr key={item.id} className="text-sm hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/quotation/request-for-quotation/${encodeURIComponent(item.id)}`}
                          className="font-mono text-xs text-foreground underline-offset-4 hover:underline"
                        >
                          {item.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{rDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rTime}</td>
                      <td className="px-4 py-3 text-muted-foreground">{company}</td>
                      <td className="px-4 py-3 text-muted-foreground">{eventDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/portal/quotation/request-for-quotation/${encodeURIComponent(item.id)}`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link href="/portal/quotation/webpage-live">Go to Webpage live</Link>
        </Button>
      </div>
    </div>
  )
}

