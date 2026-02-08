"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  getOfficialQuotations,
  deleteOfficialQuotation,
  OFFICIAL_QUOTATIONS_UPDATED_EVENT,
  type OfficialQuotation,
} from "@/lib/official-quotation-storage"
import { ExternalLink, Search, Eye, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OrderProgress } from "@/components/portal/order-progress"

export default function OfficialQuotationListPage() {
  const [items, setItems] = useState<OfficialQuotation[]>([])
  const [query, setQuery] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    const load = () => setItems(getOfficialQuotations())
    load()
    window.addEventListener(OFFICIAL_QUOTATIONS_UPDATED_EVENT, load as EventListener)
    return () => window.removeEventListener(OFFICIAL_QUOTATIONS_UPDATED_EVENT, load as EventListener)
  }, [])

  const handleDelete = (id: string) => {
    deleteOfficialQuotation(id)
    setDeleteConfirmId(null)
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
      <OrderProgress currentStep="quotation" quotationPath="/portal/quotation/official-quotation" />
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Delete Quotation?"
        description={`Are you sure you want to delete quotation ${deleteConfirmId}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">Official quotation</h1>
          <p className="text-sm text-muted-foreground">
            Web form submissions (from the "Webpage live" quotation page).
          </p>
        </div>

        <a
          href="/etre-patisserie-quotation-page"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
          title="Open quotation webpage in new tab"
        >
          <ExternalLink className="h-4 w-4" />
          Open webpage
        </a>
      </div>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by quotation ID, name, company, email..."
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No official quotations yet. Submit one via{" "}
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
                  <th className="px-4 py-3 font-medium">Quotation ID</th>
                  <th className="px-4 py-3 font-medium">Quotation Date</th>
                  <th className="px-4 py-3 font-medium">Quotation Time</th>
                  <th className="px-4 py-3 font-medium">PIC</th>
                  <th className="px-4 py-3 font-medium">Company name</th>
                  <th className="px-4 py-3 font-medium">Event Date</th>
                  <th className="px-4 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => {
                  const created = new Date(item.createdAt)
                  const createdOk = !Number.isNaN(created.getTime())
                  const qDate = item.generatedData?.quotationDate || (createdOk ? created.toLocaleDateString() : "-")
                  const qTime =
                    item.generatedData?.quotationTime ||
                    (createdOk ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-")
                  const company = item.request.customer.companyName || "-"
                  const eventDate = item.request.event.eventDate || "-"
                  const pic = item.generatedData?.madeBy || item.createdBy || "-"
                  return (
                    <tr key={item.id} className="text-sm hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/quotation/official-quotation/${encodeURIComponent(item.id)}`}
                          className="font-mono text-xs text-foreground underline-offset-4 hover:underline"
                        >
                          {item.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{qDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{qTime}</td>
                      <td className="px-4 py-3 text-muted-foreground">{pic}</td>
                      <td className="px-4 py-3 text-muted-foreground">{company}</td>
                      <td className="px-4 py-3 text-muted-foreground">{eventDate}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/portal/quotation/official-quotation/${encodeURIComponent(item.id)}`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title="View / Edit"
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
