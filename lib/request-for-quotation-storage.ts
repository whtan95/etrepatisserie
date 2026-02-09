import type { QuoteRequestData } from "@/lib/quote-webpage/quote-types"

export type RequestForQuotationStatus = "new" | "converted" | "archived"

export interface RequestForQuotation {
  id: string
  createdAt: string
  createdBy: string
  status: RequestForQuotationStatus
  request: QuoteRequestData
  linkedOfficialQuotationId?: string
}

const STORAGE_KEY = "etre_request_for_quotation_v1"
export const REQUEST_FOR_QUOTATION_UPDATED_EVENT = "etre_request_for_quotation_updated"

const safeParse = (raw: string | null): RequestForQuotation[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as RequestForQuotation[]) : []
  } catch {
    return []
  }
}

export function generateRequestForQuotationId(now = new Date()): string {
  const yyyy = now.getFullYear().toString()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `RFQ-${yyyy}${mm}${dd}-${rand}`
}

export function getRequestForQuotations(): RequestForQuotation[] {
  if (typeof window === "undefined") return []
  return safeParse(localStorage.getItem(STORAGE_KEY))
}

export function saveRequestForQuotations(next: RequestForQuotation[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(REQUEST_FOR_QUOTATION_UPDATED_EVENT))
}

export function addRequestForQuotation(entry: RequestForQuotation) {
  const existing = getRequestForQuotations()
  const withoutDupes = existing.filter((q) => q.id !== entry.id)
  saveRequestForQuotations([entry, ...withoutDupes])
}

export function getRequestForQuotationById(id: string): RequestForQuotation | null {
  const list = getRequestForQuotations()
  return list.find((q) => q.id === id) ?? null
}

export function updateRequestForQuotation(
  id: string,
  updater: (prev: RequestForQuotation) => RequestForQuotation,
) {
  const existing = getRequestForQuotations()
  const next = existing.map((q) => (q.id === id ? updater(q) : q))
  saveRequestForQuotations(next)
}

export function deleteRequestForQuotation(id: string): boolean {
  const existing = getRequestForQuotations()
  const next = existing.filter((q) => q.id !== id)
  if (next.length === existing.length) return false
  saveRequestForQuotations(next)
  return true
}

export function createRequestForQuotationFromWebRequest(input: {
  request: QuoteRequestData
  createdBy?: string
  now?: Date
}): RequestForQuotation {
  const now = input.now ?? new Date()
  return {
    id: generateRequestForQuotationId(now),
    createdAt: now.toISOString(),
    createdBy: input.createdBy ?? "Web form",
    status: "new",
    request: input.request,
  }
}

