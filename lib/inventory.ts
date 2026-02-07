export type InventoryItem = {
  id: string
  name: string
  category: string
  defaultPrice: number
  defaultSst: boolean
}

export type InventoryDb = {
  version: 1
  items: InventoryItem[]
  updatedAt: string
}

export const DEFAULT_INVENTORY_ITEMS: InventoryItem[] = [
  { id: "tent-10x10", category: "Tents", name: "Arabian Tent (10x10 ft)", defaultPrice: 220, defaultSst: true },
  { id: "tent-20x20", category: "Tents", name: "Arabian Tent (20x20 ft)", defaultPrice: 250, defaultSst: true },
  { id: "tent-20x30", category: "Tents", name: "Arabian Tent (20x30 ft)", defaultPrice: 300, defaultSst: true },

  { id: "table-set", category: "Tables & Chairs", name: "Table Set", defaultPrice: 100, defaultSst: true },
  { id: "long-table", category: "Tables & Chairs", name: "Long Table (3x6 ft)", defaultPrice: 15, defaultSst: true },
  { id: "long-table-skirting", category: "Tables & Chairs", name: "Long Table with Skirting (3x6 ft)", defaultPrice: 30, defaultSst: true },
  { id: "extra-chair", category: "Tables & Chairs", name: "Extra Plastic Chair", defaultPrice: 5, defaultSst: true },

  { id: "cooler-fan", category: "Equipment", name: "Cooler Fan", defaultPrice: 200, defaultSst: false },
]

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback

function normalizeItem(value: unknown): InventoryItem | null {
  if (!value || typeof value !== "object") return null
  const raw = value as any
  const id = asString(raw.id, "")
  const name = asString(raw.name, "")
  const category = asString(raw.category, "Others")
  if (!id || !name) return null
  return {
    id,
    name,
    category,
    defaultPrice: asNumber(raw.defaultPrice, 0),
    defaultSst: asBoolean(raw.defaultSst, true),
  }
}

export function normalizeInventoryDb(value: unknown): InventoryDb {
  const raw = (value && typeof value === "object") ? (value as any) : {}
  const itemsRaw = Array.isArray(raw.items) ? raw.items : []

  // System fees are configured under Settings > Application Settings (Systematic Pricing),
  // and should not be treated as inventory items.
  const SYSTEM_FEE_NAMES = new Set([
    "MBI Permit Fee",
    "MBI Runner Fee",
    "MBI Parking Lots",
    "Sunday OT Fee",
    "Duration Extension Fee",
  ])

  const items = (itemsRaw as unknown[])
    .map(normalizeItem)
    .filter((it): it is InventoryItem => Boolean(it))
    .filter((item) => {
      if (item.category === "Fees") return false
      if (item.id.startsWith("fee-")) return false
      if (SYSTEM_FEE_NAMES.has(item.name)) return false
      return true
    })

  // Ensure stable defaults if empty/corrupted
  const finalItems = items.length ? items : DEFAULT_INVENTORY_ITEMS

  // Ensure unique ids (keep first occurrence)
  const seen = new Set<string>()
  const deduped = finalItems.filter((it) => {
    if (seen.has(it.id)) return false
    seen.add(it.id)
    return true
  })

  return {
    version: 1,
    items: deduped,
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
  }
}
