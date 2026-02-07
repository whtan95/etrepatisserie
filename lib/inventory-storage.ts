"use client"

import { DEFAULT_INVENTORY_ITEMS, normalizeInventoryDb, type InventoryDb, type InventoryItem } from "@/lib/inventory"

const STORAGE_KEY = "etre_inventory_db"

export function hasInventoryDbInLocalStorage(): boolean {
  if (typeof window === "undefined") return false
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

export function getInventoryDbFromLocalStorage(): InventoryDb {
  if (typeof window === "undefined") {
    return { version: 3, items: DEFAULT_INVENTORY_ITEMS, updatedAt: new Date().toISOString() }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 3, items: DEFAULT_INVENTORY_ITEMS, updatedAt: new Date().toISOString() }
    return normalizeInventoryDb(JSON.parse(raw))
  } catch {
    return { version: 3, items: DEFAULT_INVENTORY_ITEMS, updatedAt: new Date().toISOString() }
  }
}

export function saveInventoryDbToLocalStorage(items: InventoryItem[]): InventoryDb {
  const db = normalizeInventoryDb({
    version: 3,
    items,
    updatedAt: new Date().toISOString(),
  })

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  }
  return db
}
