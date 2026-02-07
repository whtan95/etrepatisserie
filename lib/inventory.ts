export type InventoryItem = {
  id: string
  sku: string
  name: string
  category: string
  normalSizePrice: number
  petitSizePrice: number
  unitType: string
  defaultMoq: number
  status: string
  seasonal: boolean
  notes: string
  defaultSst: boolean
}

export type InventoryDb = {
  version: 3
  items: InventoryItem[]
  updatedAt: string
}

export const DEFAULT_INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "ETR-VIE-CRO-BUT",
    sku: "ETR-VIE-CRO-BUT",
    category: "Viennoiserie",
    name: "Butter Croissant",
    normalSizePrice: 11,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-CRO-CHC",
    sku: "ETR-VIE-CRO-CHC",
    category: "Viennoiserie",
    name: "Pain au Chocolat",
    normalSizePrice: 11.5,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-KAM-ORG",
    sku: "ETR-VIE-KAM-ORG",
    category: "Viennoiserie",
    name: "Kouign-Amann",
    normalSizePrice: 10,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-CIN-ROL",
    sku: "ETR-VIE-CIN-ROL",
    category: "Viennoiserie",
    name: "Cinnamon Roll",
    normalSizePrice: 10,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-PAB-BRW",
    sku: "ETR-VIE-PAB-BRW",
    category: "Viennoiserie",
    name: "Pain au Brownie",
    normalSizePrice: 13,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-CRO-PNM",
    sku: "ETR-VIE-CRO-PNM",
    category: "Viennoiserie",
    name: "Peanut & Mochi Croissant",
    normalSizePrice: 17,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-CRO-HAM",
    sku: "ETR-VIE-CRO-HAM",
    category: "Viennoiserie",
    name: "Chicken Ham & Cheese Croissant",
    normalSizePrice: 17,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-TRF-BAR",
    sku: "ETR-VIE-TRF-BAR",
    category: "Viennoiserie",
    name: "Truffle Bar",
    normalSizePrice: 17,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-FCH-CHS",
    sku: "ETR-VIE-FCH-CHS",
    category: "Viennoiserie",
    name: "Four Cheese",
    normalSizePrice: 13,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 30,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-CNT",
    sku: "ETR-VIE-BRD-CNT",
    category: "Bread",
    name: "Country Sourdough",
    normalSizePrice: 23.5,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-BWK",
    sku: "ETR-VIE-BRD-BWK",
    category: "Bread",
    name: "Buckwheat Sourdough",
    normalSizePrice: 24.5,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-CRM",
    sku: "ETR-VIE-BRD-CRM",
    category: "Bread",
    name: "Cranberry Multigrain Sourdough",
    normalSizePrice: 24.9,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-FGP",
    sku: "ETR-VIE-BRD-FGP",
    category: "Bread",
    name: "Fig & Pecan Sourdough",
    normalSizePrice: 25.9,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-RWR",
    sku: "ETR-VIE-BRD-RWR",
    category: "Bread",
    name: "Rosemary Walnut Raisin Sourdough",
    normalSizePrice: 24.9,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-VIE-BRD-QNB",
    sku: "ETR-VIE-BRD-QNB",
    category: "Bread",
    name: "Queen's Bread",
    normalSizePrice: 28,
    petitSizePrice: 0,
    unitType: "loaf",
    defaultMoq: 10,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-SAV-SND-EGG",
    sku: "ETR-SAV-SND-EGG",
    category: "Savoury",
    name: "Japanese Egg Mayo Sando",
    normalSizePrice: 21,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 20,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-SAV-SND-HAM",
    sku: "ETR-SAV-SND-HAM",
    category: "Savoury",
    name: "Chicken Ham & Cheese Sando",
    normalSizePrice: 19,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 20,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-SAV-QCH-DCK",
    sku: "ETR-SAV-QCH-DCK",
    category: "Savoury",
    name: "Smoked Duck Quiche",
    normalSizePrice: 18,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 20,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-SAV-QCH-MSH",
    sku: "ETR-SAV-QCH-MSH",
    category: "Savoury",
    name: "Mushroom Quiche",
    normalSizePrice: 17,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 20,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-SAK-CHS",
    sku: "ETR-PGT-SAK-CHS",
    category: "Petit Gateaux",
    name: "Sakura Cheesecake",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-GUA-CHC",
    sku: "ETR-PGT-GUA-CHC",
    category: "Petit Gateaux",
    name: "Guanaja",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-STR-SHT",
    sku: "ETR-PGT-STR-SHT",
    category: "Petit Gateaux",
    name: "Strawberry Shortcake",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-MUS-SHT",
    sku: "ETR-PGT-MUS-SHT",
    category: "Petit Gateaux",
    name: "Muscat Grape Shortcake",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-MNG-MSS",
    sku: "ETR-PGT-MNG-MSS",
    category: "Petit Gateaux",
    name: "Mango",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-PGT-PCG-GVA",
    sku: "ETR-PGT-PCG-GVA",
    category: "Petit Gateaux",
    name: "Peach & Pink Guava",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-TRT-BKF-CHY",
    sku: "ETR-TRT-BKF-CHY",
    category: "Tart",
    name: "Black Forest Tart",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-TRT-LMN-CLD",
    sku: "ETR-TRT-LMN-CLD",
    category: "Tart",
    name: "Lemon Tart",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-TRT-VAN-EGT",
    sku: "ETR-TRT-VAN-EGT",
    category: "Tart",
    name: "French Vanilla Egg Tart",
    normalSizePrice: 13,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 24,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-CHK-BNT-BSC",
    sku: "ETR-CHK-BNT-BSC",
    category: "Cheesecake",
    name: "Burnt Cheesecake",
    normalSizePrice: 22,
    petitSizePrice: 0,
    unitType: "piece",
    defaultMoq: 20,
    status: "Active",
    seasonal: false,
    notes: "",
    defaultSst: false,
  },
  {
    id: "ETR-SET-GDR-KNG",
    sku: "ETR-SET-GDR-KNG",
    category: "Seasonal",
    name: "King's Pie (Galette des Rois)",
    normalSizePrice: 118,
    petitSizePrice: 0,
    unitType: "set",
    defaultMoq: 1,
    status: "Active (Seasonal)",
    seasonal: true,
    notes: "Limited period",
    defaultSst: false,
  },
  {
    id: "ETR-SET-CNY-PST",
    sku: "ETR-SET-CNY-PST",
    category: "Seasonal",
    name: "Chinese New Year Pastry Set",
    normalSizePrice: 68,
    petitSizePrice: 0,
    unitType: "set",
    defaultMoq: 10,
    status: "Active (Seasonal)",
    seasonal: true,
    notes: "Festive only",
    defaultSst: false,
  },
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
  const sku = asString(raw.sku, asString(raw.id, "")).toUpperCase()
  const id = asString(raw.id, sku).toUpperCase()
  const name = asString(raw.name, "")
  const category = asString(raw.category, "Others")
  if (!id || !name) return null
  const normalizedSeasonal = asBoolean(raw.seasonal, false)
  const normalizedStatus = asString(raw.status, "Active")
  const finalSeasonal =
    normalizedStatus === "Active (Seasonal)"
      ? true
      : normalizedSeasonal

  const finalStatus =
    finalSeasonal
      ? "Active (Seasonal)"
      : (normalizedStatus === "Active (Seasonal)" ? "Active" : normalizedStatus)
  return {
    id,
    sku,
    name,
    category,
    normalSizePrice: asNumber(raw.normalSizePrice, asNumber(raw.defaultPrice, 0)),
    petitSizePrice: asNumber(raw.petitSizePrice, 0),
    unitType: asString(raw.unitType, "piece"),
    defaultMoq: asNumber(raw.defaultMoq, 0),
    status: finalStatus,
    seasonal: finalSeasonal,
    notes: asString(raw.notes, ""),
    defaultSst: asBoolean(raw.defaultSst, true),
  }
}

export function normalizeInventoryDb(value: unknown): InventoryDb {
  const raw = (value && typeof value === "object") ? (value as any) : {}
  const version = typeof raw.version === "number" ? raw.version : 1
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

  const items =
    version === 3
      ? (itemsRaw as unknown[])
          .map(normalizeItem)
          .filter((it): it is InventoryItem => Boolean(it))
          .filter((item) => {
            if (item.category === "Fees") return false
            if (item.id.startsWith("fee-")) return false
            if (SYSTEM_FEE_NAMES.has(item.name)) return false
            return true
          })
      : []

  // Ensure stable defaults if empty/corrupted/legacy
  const finalItems = items.length ? items : DEFAULT_INVENTORY_ITEMS

  // Ensure unique ids (keep first occurrence)
  const seen = new Set<string>()
  const deduped = finalItems.filter((it) => {
    if (seen.has(it.id)) return false
    seen.add(it.id)
    return true
  })

  return {
    version: 3,
    items: deduped,
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
  }
}
