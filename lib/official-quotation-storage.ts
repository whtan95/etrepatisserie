import type { QuoteRequestData } from "@/lib/quote-webpage/quote-types"
import type { OrderItem } from "@/lib/types"

export type OfficialQuotationStatus = "new" | "generated" | "archived"

export type OfficialQuotationSource = "webpage" | "manual"

function createEmptyQuoteRequestData(): QuoteRequestData {
  return {
    event: {
      eventName: "",
      eventDate: "",
      eventType: "",
      estimatedGuests: 0,
      takeOutSetupDate: "",
      takeOutDismantleDate: "",
      returningRequired: true,
      budgetPerPersonFromRm: "",
      budgetPerPersonToRm: "",
      eventLocation: "",
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
}

export interface OfficialQuotationGeneratedData {
  quotationDate: string
  quotationTime: string
  madeBy: string
  internalNotes: string
  customerData: {
    customerName: string
    companyName: string
    phone: string
    email: string
    billingBuildingName: string
    billingAddressGate: string
    billingAddress1: string
    billingAddress2: string
    billingCity: string
    billingPostCode: string
    billingState: string
    deliveryBuildingName: string
    deliveryAddressGate: string
    deliveryAddress1: string
    deliveryAddress2: string
    deliveryCity: string
    deliveryPostCode: string
    deliveryState: string
    specialRequest: string
  }
  items: OrderItem[]
  discount: number
  discountType: "amount" | "percentage"
  discountAppliesTo: "subtotal" | "total"
}

export interface OfficialQuotation {
  id: string
  createdAt: string
  source: OfficialQuotationSource
  createdBy: string
  status: OfficialQuotationStatus
  request: QuoteRequestData
  generatedData?: OfficialQuotationGeneratedData
  linkedOrderNumber?: string
  linkedRequestForQuotationId?: string
}

const STORAGE_KEY = "etre_official_quotations_v1"
export const OFFICIAL_QUOTATIONS_UPDATED_EVENT = "etre_official_quotations_updated"

const safeParse = (raw: string | null): OfficialQuotation[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as OfficialQuotation[]) : []
  } catch {
    return []
  }
}

export function generateOfficialQuotationId(now = new Date()): string {
  const yyyy = now.getFullYear().toString()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `OQ-${yyyy}${mm}${dd}-${rand}`
}

export function getOfficialQuotations(): OfficialQuotation[] {
  if (typeof window === "undefined") return []
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

export function saveOfficialQuotations(next: OfficialQuotation[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(OFFICIAL_QUOTATIONS_UPDATED_EVENT))
}

export function addOfficialQuotation(entry: OfficialQuotation) {
  const existing = getOfficialQuotations()
  const withoutDupes = existing.filter((q) => q.id !== entry.id)
  saveOfficialQuotations([entry, ...withoutDupes])
}

export function getOfficialQuotationById(id: string): OfficialQuotation | null {
  const list = getOfficialQuotations()
  return list.find((q) => q.id === id) ?? null
}

export function updateOfficialQuotation(
  id: string,
  updater: (prev: OfficialQuotation) => OfficialQuotation,
) {
  const existing = getOfficialQuotations()
  const next = existing.map((q) => (q.id === id ? updater(q) : q))
  saveOfficialQuotations(next)
}

export function deleteOfficialQuotation(id: string): boolean {
  const existing = getOfficialQuotations()
  const next = existing.filter((q) => q.id !== id)
  if (next.length === existing.length) return false
  saveOfficialQuotations(next)
  return true
}

export function createOfficialQuotationFromWebRequest(input: {
  request: QuoteRequestData
  createdBy?: string
  now?: Date
}): OfficialQuotation {
  const now = input.now ?? new Date()
  return {
    id: generateOfficialQuotationId(now),
    createdAt: now.toISOString(),
    source: "webpage",
    createdBy: input.createdBy ?? "Web form",
    status: "new",
    request: input.request,
  }
}

export function createOfficialQuotationManual(input?: { createdBy?: string; now?: Date }): OfficialQuotation {
  const now = input?.now ?? new Date()
  return {
    id: generateOfficialQuotationId(now),
    createdAt: now.toISOString(),
    source: "manual",
    createdBy: input?.createdBy ?? "Manual",
    status: "new",
    request: createEmptyQuoteRequestData(),
  }
}
