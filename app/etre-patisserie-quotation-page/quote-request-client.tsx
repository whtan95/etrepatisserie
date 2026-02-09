"use client"

import type { Dispatch, SetStateAction } from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { Header } from "@/components/quote-webpage/header"
import { EventDetails } from "@/components/quote-webpage/event-details"
import { BrandingAndMenu } from "@/components/quote-webpage/branding-and-menu"
import { CustomerForm } from "@/components/quote-webpage/customer-form"
import { HowItWorks } from "@/components/quote-webpage/how-it-works"
import { AIAssistant } from "@/components/quote-webpage/ai-assistant"
import type {
  EventData,
  BrandingData,
  MenuSelectionData,
  CustomerData,
  QuoteRequestData,
} from "@/lib/quote-webpage/quote-types"
import { addRequestForQuotation, createRequestForQuotationFromWebRequest } from "@/lib/request-for-quotation-storage"
import { MENU_CATALOG } from "@/lib/quote-webpage/menu-catalog"

const STORAGE_KEY = "etre_quoteRequest_v2"

const emptyRequest: QuoteRequestData = {
  event: {
    eventName: "",
    eventDate: "",
    eventType: "",
    estimatedGuests: 0,
    takeOutSetupDate: "",
    takeOutDismantleDate: "",
    returningRequired: false,
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
    referenceImageName: "",
    referenceImageDataUrl: "",
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

function createSeededRng(seed: string) {
  // Deterministic RNG (mulberry32) seeded by a string hash.
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let t = h >>> 0
  return () => {
    t += 0x6D2B79F5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function buildDemoRequest(seed: string): QuoteRequestData {
  const rng = createSeededRng(seed)
  const daysAhead = 7 + Math.floor(rng() * 45)
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  const iso = date.toISOString().slice(0, 10)

  const eventNames = [
    "Demo: Corporate Dessert Table",
    "Demo: Product Launch Catering",
    "Demo: Office Appreciation Day",
    "Demo: Client Tea Break",
    "Demo: Mini Dessert Bar",
  ]
  const eventTypes = ["Corporate", "Private", "Wedding", "Birthday", "Launch"]

  const includeLogo = rng() > 0.5
  const matchColours = !includeLogo ? rng() > 0.5 : rng() > 0.7

  const categories = ["gateaux", "tart", "viennoiserie", "savoury"] as const
  const selectedCategories = Array.from(new Set([pick(rng, [...categories]), pick(rng, [...categories])]))

  const itemQuantities: Record<string, number> = {}
  for (const cat of selectedCategories) {
    const list = MENU_CATALOG[cat]
    if (!list?.length) continue
    const howMany = 1 + Math.floor(rng() * Math.min(3, list.length))
    const shuffled = list.slice().sort(() => rng() - 0.5).slice(0, howMany)
    for (const it of shuffled) {
      itemQuantities[it.id] = 10 + Math.floor(rng() * 40)
    }
  }

  const drinksOptions = ["coffee", "tea", "fizzy"] as const
  const drinks = Array.from(new Set([pick(rng, [...drinksOptions]), pick(rng, [...drinksOptions])]))

  const company = pick(rng, ["Demo Company Sdn Bhd", "Acme Demo Co", "Blue Ocean Demo", "Demo Ventures"])
  const name = pick(rng, ["Alicia Tan", "Jason Lim", "Nur Aisyah", "Daniel Wong", "Mei Ling"])
  const phone = pick(rng, ["012-345 6789", "013-888 2233", "017-555 0909"])

  return {
    event: {
      eventName: pick(rng, eventNames),
      eventDate: iso,
      eventType: pick(rng, eventTypes),
      estimatedGuests: 30 + Math.floor(rng() * 170),
      takeOutSetupDate: iso,
      takeOutDismantleDate: iso,
      returningRequired: rng() > 0.6,
      budgetPerPersonFromRm: String(20 + Math.floor(rng() * 21)),
      budgetPerPersonToRm: String(35 + Math.floor(rng() * 31)),
      eventLocation: pick(rng, ["etre-cafe-kl", "etre-cafe-ipoh", "others"]),
      otherAreaName: "",
      otherVenueType: pick(rng, ["indoor", "outdoor", ""]),
    },
    branding: {
      includeBrandLogo: includeLogo,
      matchBrandColours: matchColours,
      logoOnDessert: includeLogo ? rng() > 0.3 : false,
      logoOnPackaging: includeLogo ? rng() > 0.3 : false,
      logoOnOthers: includeLogo ? rng() > 0.85 : false,
      logoOnOthersText: "",
      colourOnDessert: matchColours ? rng() > 0.3 : false,
      colourOnPackaging: matchColours ? rng() > 0.3 : false,
      colourOnOthers: matchColours ? rng() > 0.85 : false,
      colourOnOthersText: "",
    },
    menu: {
      customisationLevel: pick(rng, ["current", "partial", "full"]),
      customisationNotes: pick(rng, [
        "Please include a mix of mini desserts. Prefer less sweet.",
        "Need halal-friendly options. No alcohol.",
        "Prefer fruity flavours. Avoid nuts if possible.",
        "Include signature items + seasonal selection.",
      ]),
      referenceImageName: "",
      referenceImageDataUrl: "",
      categories: selectedCategories as any,
      itemQuantities,
      dessertSize: pick(rng, ["normal", "mini"]),
      drinks: drinks as any,
      drinksOtherText: "",
      packaging: pick(rng, ["etre-existing", "premium", "customer-own"]),
    },
    customer: {
      companyName: company,
      name,
      phone,
      email: `demo+${Math.floor(rng() * 9999)}@etre.example`,
      address: pick(rng, ["Demo address, Kuala Lumpur", "Demo address, Ipoh"]),
      notes: pick(rng, ["Delivery around 10am if possible.", "Please call upon arrival.", "Need invoice after event."]),
    },
  }
}

export default function QuoteRequestClient() {
  const [request, setRequest] = useState<QuoteRequestData>(emptyRequest)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const searchParams = useSearchParams()
  const isDemo = searchParams.get("demo") === "1"
  const [seedFallback] = useState(() => String(Date.now()))
  const demoSeed = isDemo ? (searchParams.get("demoAt") || seedFallback) : seedFallback

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
    if (isDemo) {
      setRequest(buildDemoRequest(demoSeed))
      setIsLoaded(true)
      return
    }

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
        setRequest({
          event: { ...emptyRequest.event, ...(parsed.event ?? {}) },
          branding: brandingRaw,
          menu: { ...emptyRequest.menu, ...(parsed.menu ?? {}) },
          customer: { ...emptyRequest.customer, ...(parsed.customer ?? {}) },
        })
      } catch {
        // ignore
      }
    }
    setIsLoaded(true)
  }, [isDemo, demoSeed])

  useEffect(() => {
    if (!isLoaded) return
    if (isDemo) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(request))
  }, [request, isLoaded, isDemo])

  const footerYear = useMemo(() => new Date().getFullYear(), [])

  const submit = () => {
    const rfq = createRequestForQuotationFromWebRequest({ request })
    addRequestForQuotation(rfq)

    setIsSubmitted(true)
    localStorage.setItem(`${STORAGE_KEY}_submittedAt`, new Date().toISOString())
    localStorage.setItem(`${STORAGE_KEY}_lastRequestForQuotationId`, rfq.id)
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
          />

          <HowItWorks />

          <CustomerForm
            customerData={request.customer}
            setCustomerData={setCustomerData}
            onSubmit={submit}
            isSubmitted={isSubmitted}
          />
        </div>
      </main>

      <footer className="mt-16 border-t border-border bg-secondary py-8">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm text-muted-foreground">{footerYear} ÃŠtre Patisserie. All rights reserved.</p>
        </div>
      </footer>

      <AIAssistant />
    </div>
  )
}
