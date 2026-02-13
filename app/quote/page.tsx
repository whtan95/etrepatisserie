"use client"

import type { Dispatch, SetStateAction } from "react"
import { useEffect, useMemo, useState } from "react"

import { Header } from "@/components/quote-webpage/header"
import { EventDetails } from "@/components/quote-webpage/event-details"
import { BrandingAndMenu } from "@/components/quote-webpage/branding-and-menu"
import { CustomerForm } from "@/components/quote-webpage/customer-form"
import { HowItWorks } from "@/components/quote-webpage/how-it-works"
import { AIAssistant } from "@/components/quote-webpage/ai-assistant"
import type { EventData, BrandingData, MenuSelectionData, CustomerData, QuoteRequestData } from "@/lib/quote-webpage/quote-types"

const STORAGE_KEY = "etre_quoteRequest_v2"
const MENU_ITEM_PIECES_PER_UNIT = 30

const emptyRequest: QuoteRequestData = {
  event: {
    eventName: "",
    eventDate: "",
    eventType: "",
    otherEventType: "",
    estimatedGuests: 0,
    takeOutSetupDate: "",
    takeOutDismantleDate: "",
    budgetPerPersonFromRm: "",
    budgetPerPersonToRm: "",
    eventLocation: "etre-cafe-kl",
    otherAreaName: "",
    otherVenueType: "",
  },
  branding: {
    includeBrandLogo: false,
    matchBrandColours: false,
    logoOnDessert: false,
    logoOnPackaging: false,
    logoOnOthers: false,
    logoOnOthersText: "",
    colourOnDessert: false,
    colourOnPackaging: false,
    colourOnOthers: false,
    colourOnOthersText: "",
  },
  menu: {
    customisationLevel: "",
    customisationNotes: "",
    referenceImage1Name: "",
    referenceImage1DataUrl: "",
    referenceImage2Name: "",
    referenceImage2DataUrl: "",
    preferredDesignStyle: "",
    colourDirection: "",
    colourDirectionClientSpecifiedText: "",
    preferredFlavour: "",
    preferredFlavourClientSpecifiedText: "",
    categories: [],
    itemQuantities: {},
    dessertSize: "",
    drinks: [],
    drinksOtherText: "",
    packaging: "",
  },
  customer: {
    companyName: "",
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  },
}

export default function QuoteRequestPage() {
  const [request, setRequest] = useState<QuoteRequestData>(emptyRequest)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const submitDisabledReason = useMemo(() => {
    if (request.menu.customisationLevel !== "full") return ""
    if (!request.menu.referenceImage1DataUrl || !request.menu.referenceImage2DataUrl) {
      return "Fully customise requires 2 reference photos (Step 1)."
    }
    return ""
  }, [request.menu.customisationLevel, request.menu.referenceImage1DataUrl, request.menu.referenceImage2DataUrl])

  const setEventData: Dispatch<SetStateAction<EventData>> = (updater) => {
    setRequest((prev) => ({ ...prev, event: typeof updater === "function" ? updater(prev.event) : updater }))
  }

  const setBranding: Dispatch<SetStateAction<BrandingData>> = (updater) => {
    setRequest((prev) => ({ ...prev, branding: typeof updater === "function" ? updater(prev.branding) : updater }))
  }

  const setMenu: Dispatch<SetStateAction<MenuSelectionData>> = (updater) => {
    setRequest((prev) => ({ ...prev, menu: typeof updater === "function" ? updater(prev.menu) : updater }))
  }

  const setCustomerData: Dispatch<SetStateAction<CustomerData>> = (updater) => {
    setRequest((prev) => ({ ...prev, customer: typeof updater === "function" ? updater(prev.customer) : updater }))
  }

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<QuoteRequestData>
        const brandingRaw = { ...emptyRequest.branding, ...(parsed.branding ?? {}) } as any
        // Backward-compat: older saves used `branding.requirement` ("none" | "brand-logo" | "brand-colour").
        if (typeof brandingRaw.requirement === "string") {
          if (brandingRaw.requirement === "brand-logo") {
            brandingRaw.includeBrandLogo = true
            brandingRaw.matchBrandColours = false
          } else if (brandingRaw.requirement === "brand-colour") {
            brandingRaw.includeBrandLogo = false
            brandingRaw.matchBrandColours = true
          } else {
            brandingRaw.includeBrandLogo = false
            brandingRaw.matchBrandColours = false
          }
          delete brandingRaw.requirement
        }

        const menuRaw = { ...emptyRequest.menu, ...(parsed.menu ?? {}) } as any
        // Backward-compat: older saves stored a single reference image fields (referenceImageName/referenceImageDataUrl).
        if (typeof menuRaw.referenceImageDataUrl === "string" && menuRaw.referenceImageDataUrl.trim()) {
          menuRaw.referenceImage1DataUrl = menuRaw.referenceImage1DataUrl || menuRaw.referenceImageDataUrl
          menuRaw.referenceImage1Name = menuRaw.referenceImage1Name || menuRaw.referenceImageName || ""
        }
        if (typeof menuRaw.referenceImageName === "string" || typeof menuRaw.referenceImageDataUrl === "string") {
          delete menuRaw.referenceImageName
          delete menuRaw.referenceImageDataUrl
        }
        // Backward-compat: older saves stored menu.itemQuantities as pieces. New UX uses units where 1 unit = 30 pcs.
        // Heuristic: if values look like pieces (e.g., 30/60/90), convert to units.
        if (menuRaw?.itemQuantities && typeof menuRaw.itemQuantities === "object") {
          const next: Record<string, number> = {}
          for (const [k, v] of Object.entries(menuRaw.itemQuantities as Record<string, unknown>)) {
            const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10)
            if (!Number.isFinite(n) || n <= 0) continue

            let units: number
            if (n <= 10) {
              units = Math.floor(n)
            } else if (n % MENU_ITEM_PIECES_PER_UNIT === 0) {
              units = Math.floor(n / MENU_ITEM_PIECES_PER_UNIT)
            } else {
              units = Math.max(1, Math.round(n / MENU_ITEM_PIECES_PER_UNIT))
            }

            if (units > 0) next[k] = units
          }
          menuRaw.itemQuantities = next
        }
        setRequest({
          event: (() => {
            const raw = { ...emptyRequest.event, ...(parsed.event ?? {}) } as any
            const old = String(raw.eventType ?? "")
            if (old && !["internal-corporate", "client-facing-corporate", "vip-pr", "private", "others"].includes(old)) {
              if (old === "Private Event") raw.eventType = "private"
              else if (old === "Corporate") raw.eventType = "client-facing-corporate"
              else if (old === "Others") raw.eventType = "others"
              else {
                raw.eventType = "others"
                raw.otherEventType = raw.otherEventType || old
              }
            }
            return raw
          })(),
          branding: brandingRaw,
          menu: menuRaw,
          customer: { ...emptyRequest.customer, ...(parsed.customer ?? {}) },
        })
      } catch {
        // ignore
      }
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(request))
  }, [request, isLoaded])

  const footerYear = useMemo(() => new Date().getFullYear(), [])

  const submit = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit")
      }

      setIsSubmitted(true)
      localStorage.setItem(`${STORAGE_KEY}_submittedAt`, new Date().toISOString())
      localStorage.setItem(`${STORAGE_KEY}_lastRequestId`, data.id)
    } catch (err) {
      console.error("Submit error:", err)
      setSubmitError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Custom Dessert Catering for your event
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Share your event details and we will send you a personalised quote.
          </p>
        </div>

        <div className="space-y-8">
          <EventDetails eventData={request.event} setEventData={setEventData} />

          <BrandingAndMenu
            branding={request.branding}
            setBranding={setBranding}
            menu={request.menu}
            setMenu={setMenu}
            estimatedGuests={request.event.estimatedGuests}
          />

          <HowItWorks />

          <CustomerForm
            customerData={request.customer}
            setCustomerData={setCustomerData}
            onSubmit={submit}
            isSubmitted={isSubmitted}
            isSubmitting={isSubmitting}
            submitDisabled={Boolean(submitDisabledReason)}
            submitDisabledReason={submitError || submitDisabledReason}
          />
        </div>
      </main>

      <footer className="mt-16 border-t border-border bg-secondary py-8">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm text-muted-foreground">{footerYear} Être Patisserie. All rights reserved.</p>
        </div>
      </footer>

      <AIAssistant />
    </div>
  )
}
