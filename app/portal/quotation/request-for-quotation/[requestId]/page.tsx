"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getRequestForQuotationById,
  updateRequestForQuotation,
  type RequestForQuotation,
} from "@/lib/request-for-quotation-storage"
import { addOfficialQuotation, createOfficialQuotationFromWebRequest } from "@/lib/official-quotation-storage"
import { ArrowLeft, FileText, Forward, Image as ImageIcon, RefreshCw } from "lucide-react"
import { OrderProgress } from "@/components/portal/order-progress"

function yesNo(v: boolean) {
  return v ? "Yes" : "No"
}

function formatIsoDate(iso: string) {
  if (!iso) return "-"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
}

export default function RequestForQuotationDetailPage() {
  const params = useParams<{ requestId: string }>()
  const router = useRouter()
  const requestId = typeof params?.requestId === "string" ? decodeURIComponent(params.requestId) : ""
  const [confirmProceedOpen, setConfirmProceedOpen] = useState(false)
  const [item, setItem] = useState<RequestForQuotation | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadItem = useCallback(async () => {
    if (!requestId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      // First try localStorage
      const localItem = getRequestForQuotationById(requestId)
      if (localItem) {
        setItem(localItem)
        setIsLoading(false)
        return
      }

      // If not in localStorage, fetch from API
      const res = await fetch("/api/quote-request")
      if (res.ok) {
        const data = await res.json()
        const requests = (data.requests ?? []) as RequestForQuotation[]
        const found = requests.find((r) => r.id === requestId)
        if (found) {
          setItem(found)
        }
      }
    } catch (err) {
      console.error("Failed to load request:", err)
    } finally {
      setIsLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    loadItem()
  }, [loadItem])

  const proceedToOfficialQuotation = () => {
    if (!item) return
    const official = createOfficialQuotationFromWebRequest({
      request: item.request,
      createdBy: `From ${item.id}`,
    })
    addOfficialQuotation({ ...official, linkedRequestForQuotationId: item.id })

    updateRequestForQuotation(item.id, (prev) => ({
      ...prev,
      status: "converted",
      linkedOfficialQuotationId: official.id,
    }))

    setConfirmProceedOpen(false)
    router.push(`/portal/quotation/official-quotation/${encodeURIComponent(official.id)}`)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <OrderProgress currentStep="request-for-quotation" />
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href="/portal/quotation/request-for-quotation">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Request not found.
        </div>
      </div>
    )
  }

  const { event, customer, branding, menu } = item.request
  const categories = (menu.categories || []).join(", ") || "-"
  const drinks = (menu.drinks || []).join(", ") || "-"
  const itemLines = Object.entries(menu.itemQuantities || {})
    .filter(([, qty]) => typeof qty === "number" && qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-4">
      <OrderProgress currentStep="request-for-quotation" />
      <ConfirmDialog
        open={confirmProceedOpen}
        title="Proceed to Official Quotation?"
        description="This creates a new Official quotation from this request."
        confirmText="Proceed"
        cancelText="Cancel"
        onConfirm={proceedToOfficialQuotation}
        onCancel={() => setConfirmProceedOpen(false)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" asChild>
            <Link href="/portal/quotation/request-for-quotation">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground">{item.id}</h1>
            <p className="text-sm text-muted-foreground">
              Submitted: {formatIsoDate(item.createdAt)} • Status: {item.status}
            </p>
          </div>
        </div>

      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" />
            Event
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div><span className="text-foreground font-medium">Event name:</span> {event.eventName || "-"}</div>
            <div><span className="text-foreground font-medium">Event date:</span> {event.eventDate || "-"}</div>
            <div><span className="text-foreground font-medium">Event type:</span> {event.eventType || "-"}{event.otherEventType ? ` (${event.otherEventType})` : ""}</div>
            <div><span className="text-foreground font-medium">Estimated guests:</span> {event.estimatedGuests || "-"}</div>
            <div><span className="text-foreground font-medium">Location:</span> {event.eventLocation || "-"}</div>
            {event.otherAreaName && <div><span className="text-foreground font-medium">Other area:</span> {event.otherAreaName}</div>}
            {event.otherVenueType && <div><span className="text-foreground font-medium">Venue type:</span> {event.otherVenueType}</div>}
            {event.takeOutSetupDate && <div><span className="text-foreground font-medium">Setup date:</span> {event.takeOutSetupDate}</div>}
            {event.takeOutDismantleDate && <div><span className="text-foreground font-medium">Dismantle date:</span> {event.takeOutDismantleDate}</div>}
            {(event.budgetPerPersonFromRm || event.budgetPerPersonToRm) && (
              <div><span className="text-foreground font-medium">Budget per person:</span> RM {event.budgetPerPersonFromRm || "?"} - {event.budgetPerPersonToRm || "?"}</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" />
            Customer
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div><span className="text-foreground font-medium">Company:</span> {customer.companyName || "-"}</div>
            <div><span className="text-foreground font-medium">Name:</span> {customer.name || "-"}</div>
            <div><span className="text-foreground font-medium">Phone:</span> {customer.phone || "-"}</div>
            <div><span className="text-foreground font-medium">Email:</span> {customer.email || "-"}</div>
            <div><span className="text-foreground font-medium">Address:</span> {customer.address || "-"}</div>
            <div><span className="text-foreground font-medium">Notes:</span> {customer.notes || "-"}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" />
            Branding
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div><span className="text-foreground font-medium">Include brand logo:</span> {yesNo(!!branding.includeBrandLogo)}</div>
            <div><span className="text-foreground font-medium">Match brand colours:</span> {yesNo(!!branding.matchBrandColours)}</div>
            <div><span className="text-foreground font-medium">Logo on dessert:</span> {yesNo(!!branding.logoOnDessert)}</div>
            <div><span className="text-foreground font-medium">Logo on packaging:</span> {yesNo(!!branding.logoOnPackaging)}</div>
            <div><span className="text-foreground font-medium">Logo on others:</span> {yesNo(!!branding.logoOnOthers)}{branding.logoOnOthersText ? ` (${branding.logoOnOthersText})` : ""}</div>
            <div><span className="text-foreground font-medium">Colour on dessert:</span> {yesNo(!!branding.colourOnDessert)}</div>
            <div><span className="text-foreground font-medium">Colour on packaging:</span> {yesNo(!!branding.colourOnPackaging)}</div>
            <div><span className="text-foreground font-medium">Colour on others:</span> {yesNo(!!branding.colourOnOthers)}{branding.colourOnOthersText ? ` (${branding.colourOnOthersText})` : ""}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4" />
            Menu
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div><span className="text-foreground font-medium">Customisation level:</span> {menu.customisationLevel || "-"}</div>
            <div><span className="text-foreground font-medium">Customisation notes:</span> {menu.customisationNotes || "-"}</div>
            {menu.preferredDesignStyle && <div><span className="text-foreground font-medium">Design style:</span> {menu.preferredDesignStyle}</div>}
            {menu.colourDirection && <div><span className="text-foreground font-medium">Colour direction:</span> {menu.colourDirection}{menu.colourDirectionClientSpecifiedText ? ` (${menu.colourDirectionClientSpecifiedText})` : ""}</div>}
            {menu.preferredFlavour && <div><span className="text-foreground font-medium">Preferred flavour:</span> {menu.preferredFlavour}{menu.preferredFlavourClientSpecifiedText ? ` (${menu.preferredFlavourClientSpecifiedText})` : ""}</div>}
            <div><span className="text-foreground font-medium">Dessert size:</span> {menu.dessertSize || "-"}</div>
            <div><span className="text-foreground font-medium">Packaging:</span> {menu.packaging || "-"}</div>
            <div><span className="text-foreground font-medium">Categories:</span> {categories}</div>
            <div><span className="text-foreground font-medium">Drinks:</span> {drinks}{menu.drinksOtherText ? ` (${menu.drinksOtherText})` : ""}</div>
          </div>
          {itemLines.length ? (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold text-foreground mb-2">Requested items</div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                {itemLines.map(([id, qty]) => (
                  <div key={id} className="flex items-center justify-between gap-3">
                    <span className="font-mono">{id}</span>
                    <span className="text-foreground font-medium">{qty}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No item quantities selected.</div>
          )}

          {(menu.referenceImage1DataUrl || menu.referenceImage2DataUrl) ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ImageIcon className="h-4 w-4" />
                Reference images
              </div>
              <div className="flex flex-wrap gap-2">
                {menu.referenceImage1DataUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={menu.referenceImage1Name || "Reference image 1"}
                    src={menu.referenceImage1DataUrl}
                    className="max-h-[200px] w-auto rounded-md border border-border bg-background"
                  />
                )}
                {menu.referenceImage2DataUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    alt={menu.referenceImage2Name || "Reference image 2"}
                    src={menu.referenceImage2DataUrl}
                    className="max-h-[200px] w-auto rounded-md border border-border bg-background"
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        {item.linkedOfficialQuotationId ? (
          <Button asChild className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
            <Link href={`/portal/quotation/official-quotation/${encodeURIComponent(item.linkedOfficialQuotationId)}`}>
              <Forward className="h-4 w-4" />
              Proceed to Official quotation
            </Link>
          </Button>
        ) : (
          <Button
            onClick={() => setConfirmProceedOpen(true)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Forward className="h-4 w-4" />
            Proceed to Official quotation
          </Button>
        )}
      </div>
    </div>
  )
}
