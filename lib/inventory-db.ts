import fs from "node:fs/promises"
import path from "node:path"
import { DEFAULT_INVENTORY_ITEMS, normalizeInventoryDb, type InventoryDb, type InventoryItem } from "@/lib/inventory"

const DB_DIR = path.join(process.cwd(), "data")
const DB_PATH = path.join(DB_DIR, "inventory-db.json")

async function ensureDir() {
  await fs.mkdir(DB_DIR, { recursive: true })
}

async function readJsonFile(): Promise<InventoryDb | null> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8")
    const parsed = JSON.parse(raw)
    const version = typeof parsed?.version === "number" ? parsed.version : 1
    if (version !== 3) return null
    return normalizeInventoryDb(parsed)
  } catch {
    return null
  }
}

async function writeJsonFile(db: InventoryDb) {
  await ensureDir()
  const tmp = DB_PATH + ".tmp"
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8")
  await fs.rename(tmp, DB_PATH)
}

export async function getInventoryDb(): Promise<InventoryDb> {
  const existing = await readJsonFile()
  if (existing && existing.version === 3) return existing

  const fresh: InventoryDb = existing && existing.items?.length
    ? { ...existing, version: 3, updatedAt: new Date().toISOString() }
    : { version: 3, items: DEFAULT_INVENTORY_ITEMS, updatedAt: new Date().toISOString() }
  await writeJsonFile(fresh)
  return fresh
}

export async function updateInventoryDb(items: InventoryItem[]): Promise<InventoryDb> {
  const merged = normalizeInventoryDb({
    version: 3,
    items,
    updatedAt: new Date().toISOString(),
  })
  await writeJsonFile(merged)
  return merged
}
